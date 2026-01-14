#include <Arduino.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>

namespace {

const char *kApSsid = "MAKIWARA";
const char *kApPass = "12345678";

const int kAdcPin = 34;
const uint32_t kSampleIntervalUs = 100; // 10 kHz target
const uint32_t kTempoWindowMs = 10000;

const int kDefaultThreshold = 1200;
const int kDefaultLockoutMs = 120;
const int kDefaultSeriesGapMs = 600;
const int kDefaultSampleWindowMs = 8;

struct Config {
  int threshold;
  int lockoutMs;
  int seriesGapMs;
  int sampleWindowMs;
  bool simulate;
};

enum Mode {
  MODE_FREE,
  MODE_10,
  MODE_20,
  MODE_30,
  MODE_60
};

WebServer server(80);
Preferences prefs;
Config config;

bool running = false;
Mode currentMode = MODE_FREE;
uint32_t sessionStartMs = 0;
uint32_t sessionDurationMs = 0;
uint32_t sessionStopMs = 0;

uint32_t hits = 0;
uint32_t lastHitMs = 0;
uint32_t lockoutUntil = 0;
uint32_t series = 0;
uint32_t maxSeries = 0;
int lastPeak = 0;
int lastScore = 0;
int bestPeak = 0;
int bestScore = 0;

const uint8_t kHitHistoryMax = 64;
uint32_t hitTimes[kHitHistoryMax];
uint8_t hitIndex = 0;
uint8_t hitCount = 0;

uint32_t nextSimMs = 0;

const char kIndexHtml[] PROGMEM = R"HTML(
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>KickShield Counter</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: "Trebuchet MS", "Segoe UI", sans-serif; margin: 16px; background: #f2f0ea; color: #1d1b18; }
    h1 { margin: 0 0 12px; letter-spacing: 1px; }
    .panel { background: #fff; padding: 12px; border-radius: 8px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .row button { padding: 8px 12px; border: 0; border-radius: 6px; background: #2f4a6d; color: #fff; cursor: pointer; }
    .row button.secondary { background: #6d3b2f; }
    .row input { padding: 6px 8px; width: 110px; }
    .stat { display: inline-block; min-width: 110px; }
    .label { font-weight: 600; }
    @media (max-width: 640px) {
      .row { flex-direction: column; align-items: stretch; }
      .row button, .row input { width: 100%; }
    }
  </style>
</head>
<body>
  <h1>KickShield Counter</h1>

  <div class="panel">
    <div class="row">
      <button onclick="startMode('free')">Start Free</button>
      <button onclick="startMode('10')">Start 10s</button>
      <button onclick="startMode('20')">Start 20s</button>
      <button onclick="startMode('30')">Start 30s</button>
      <button onclick="startMode('60')">Start 60s</button>
      <button class="secondary" onclick="stopRun()">Stop</button>
    </div>
  </div>

  <div class="panel">
    <div class="row">
      <label class="label" for="threshold">Threshold</label>
      <input id="threshold" type="number" min="0" max="4095">
      <label class="label" for="lockout">Lockout ms</label>
      <input id="lockout" type="number" min="0" max="5000">
      <label class="label" for="seriesGap">Series gap ms</label>
      <input id="seriesGap" type="number" min="0" max="10000">
      <label class="label" for="sampleWindow">Window ms</label>
      <input id="sampleWindow" type="number" min="1" max="50">
      <label class="label" for="simulate">Simulate</label>
      <input id="simulate" type="checkbox">
      <button onclick="saveConfig()">Save</button>
    </div>
  </div>

  <div class="panel">
    <div class="row">
      <span class="stat"><span class="label">Running:</span> <span id="running">false</span></span>
      <span class="stat"><span class="label">Mode:</span> <span id="mode">FREE</span></span>
      <span class="stat"><span class="label">Time left:</span> <span id="timeLeft">0</span></span>
      <span class="stat"><span class="label">Hits:</span> <span id="hits">0</span></span>
      <span class="stat"><span class="label">Tempo:</span> <span id="tempo">0</span></span>
    </div>
    <div class="row">
      <span class="stat"><span class="label">Series:</span> <span id="series">0</span></span>
      <span class="stat"><span class="label">Max series:</span> <span id="maxSeries">0</span></span>
      <span class="stat"><span class="label">Last peak:</span> <span id="lastPeak">0</span></span>
      <span class="stat"><span class="label">Last score:</span> <span id="lastScore">0</span></span>
      <span class="stat"><span class="label">Best peak:</span> <span id="bestPeak">0</span></span>
      <span class="stat"><span class="label">Best score:</span> <span id="bestScore">0</span></span>
    </div>
  </div>

  <script>
    async function startMode(mode) {
      await fetch(`/api/start?mode=${mode}`, { method: 'POST' });
    }
    async function stopRun() {
      await fetch('/api/stop', { method: 'POST' });
    }
    async function saveConfig() {
      const params = new URLSearchParams();
      params.set('threshold', document.getElementById('threshold').value);
      params.set('lockout_ms', document.getElementById('lockout').value);
      params.set('series_gap_ms', document.getElementById('seriesGap').value);
      params.set('sample_window_ms', document.getElementById('sampleWindow').value);
      params.set('simulate', document.getElementById('simulate').checked ? '1' : '0');
      await fetch(`/api/config?${params.toString()}`, { method: 'POST' });
    }
    function updateStatus(data) {
      document.getElementById('running').textContent = data.running ? 'true' : 'false';
      document.getElementById('mode').textContent = data.mode || 'FREE';
      document.getElementById('timeLeft').textContent = Math.max(0, Math.floor(data.time_left_ms / 1000));
      document.getElementById('hits').textContent = data.hits || 0;
      document.getElementById('tempo').textContent = data.tempo_hpm || 0;
      document.getElementById('series').textContent = data.series || 0;
      document.getElementById('maxSeries').textContent = data.maxSeries || 0;
      document.getElementById('lastPeak').textContent = data.lastPeak || 0;
      document.getElementById('lastScore').textContent = data.lastScore || 0;
      document.getElementById('bestPeak').textContent = data.bestPeak || 0;
      document.getElementById('bestScore').textContent = data.bestScore || 0;
      if (data.threshold !== undefined) {
        document.getElementById('threshold').value = data.threshold;
        document.getElementById('lockout').value = data.lockout_ms;
        document.getElementById('seriesGap').value = data.series_gap_ms;
        document.getElementById('sampleWindow').value = data.sample_window_ms;
        document.getElementById('simulate').checked = data.simulate ? true : false;
      }
    }
    async function pollStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        updateStatus(data);
      } catch (e) {
        // ignore
      }
    }
    setInterval(pollStatus, 150);
    pollStatus();
  </script>
</body>
</html>
)HTML";

const char *modeToString(Mode mode) {
  switch (mode) {
    case MODE_10:
      return "10";
    case MODE_20:
      return "20";
    case MODE_30:
      return "30";
    case MODE_60:
      return "60";
    default:
      return "FREE";
  }
}

bool parseMode(const String &value, Mode &outMode, uint32_t &outDurationMs) {
  if (value == "free") {
    outMode = MODE_FREE;
    outDurationMs = 0;
    return true;
  }
  if (value == "10") {
    outMode = MODE_10;
    outDurationMs = 10000;
    return true;
  }
  if (value == "20") {
    outMode = MODE_20;
    outDurationMs = 20000;
    return true;
  }
  if (value == "30") {
    outMode = MODE_30;
    outDurationMs = 30000;
    return true;
  }
  if (value == "60") {
    outMode = MODE_60;
    outDurationMs = 60000;
    return true;
  }
  return false;
}

bool parseIntValue(const String &value, int &out) {
  if (value.length() == 0) {
    return false;
  }
  char *endptr = nullptr;
  long parsed = strtol(value.c_str(), &endptr, 10);
  if (endptr == value.c_str()) {
    return false;
  }
  out = static_cast<int>(parsed);
  return true;
}

bool extractJsonInt(const String &body, const char *key, int &out) {
  String pattern = String('"') + key + "\":";
  int idx = body.indexOf(pattern);
  if (idx < 0) {
    return false;
  }
  int start = idx + pattern.length();
  while (start < body.length() && (body[start] == ' ' || body[start] == '\t')) {
    start++;
  }
  int end = start;
  while (end < body.length() && (body[end] == '-' || (body[end] >= '0' && body[end] <= '9'))) {
    end++;
  }
  if (end == start) {
    return false;
  }
  out = body.substring(start, end).toInt();
  return true;
}

bool extractJsonBool(const String &body, const char *key, bool &out) {
  String pattern = String('"') + key + "\":";
  int idx = body.indexOf(pattern);
  if (idx < 0) {
    return false;
  }
  int start = idx + pattern.length();
  while (start < body.length() && (body[start] == ' ' || body[start] == '\t')) {
    start++;
  }
  if (body.startsWith("true", start)) {
    out = true;
    return true;
  }
  if (body.startsWith("false", start)) {
    out = false;
    return true;
  }
  int val = 0;
  int end = start;
  while (end < body.length() && (body[end] >= '0' && body[end] <= '9')) {
    end++;
  }
  if (end == start) {
    return false;
  }
  val = body.substring(start, end).toInt();
  out = (val != 0);
  return true;
}

int clampInt(int value, int minValue, int maxValue) {
  if (value < minValue) {
    return minValue;
  }
  if (value > maxValue) {
    return maxValue;
  }
  return value;
}

void saveConfig() {
  prefs.putInt("threshold", config.threshold);
  prefs.putInt("lockout_ms", config.lockoutMs);
  prefs.putInt("series_gap_ms", config.seriesGapMs);
  prefs.putInt("sample_window_ms", config.sampleWindowMs);
  prefs.putBool("simulate", config.simulate);
}

void loadConfig() {
  prefs.begin("kickshield", false);
  config.threshold = prefs.getInt("threshold", kDefaultThreshold);
  config.lockoutMs = prefs.getInt("lockout_ms", kDefaultLockoutMs);
  config.seriesGapMs = prefs.getInt("series_gap_ms", kDefaultSeriesGapMs);
  config.sampleWindowMs = prefs.getInt("sample_window_ms", kDefaultSampleWindowMs);
  config.simulate = prefs.getBool("simulate", false);
}

void resetSessionMetrics() {
  hits = 0;
  lastHitMs = 0;
  lockoutUntil = 0;
  series = 0;
  maxSeries = 0;
  lastPeak = 0;
  lastScore = 0;
  bestPeak = 0;
  bestScore = 0;
  hitIndex = 0;
  hitCount = 0;
  memset(hitTimes, 0, sizeof(hitTimes));
}

int scoreFromPeak(int peak) {
  if (peak <= config.threshold) {
    return 0;
  }
  int span = 4095 - config.threshold;
  if (span <= 0) {
    return 999;
  }
  long scaled = static_cast<long>(peak - config.threshold) * 999L / span;
  return clampInt(static_cast<int>(scaled), 0, 999);
}

uint32_t tempoHpm(uint32_t nowMs) {
  uint32_t elapsed = nowMs - sessionStartMs;
  uint32_t window = elapsed < kTempoWindowMs ? elapsed : kTempoWindowMs;
  if (window == 0) {
    return 0;
  }
  uint32_t since = nowMs - window;
  uint32_t count = 0;
  for (uint8_t i = 0; i < kHitHistoryMax; i++) {
    uint32_t t = hitTimes[i];
    if (t != 0 && t >= since) {
      count++;
    }
  }
  return (count * 60000UL) / window;
}

uint32_t tempoFromSession(uint32_t endMs) {
  if (hits == 0 || sessionStartMs == 0) {
    return 0;
  }
  uint32_t duration = (endMs > sessionStartMs) ? (endMs - sessionStartMs) : 0;
  if (duration == 0) {
    return 0;
  }
  return (hits * 60000UL) / duration;
}

int readPeak() {
  uint32_t startUs = micros();
  uint32_t windowUs = static_cast<uint32_t>(config.sampleWindowMs) * 1000UL;
  uint32_t lastSampleUs = startUs;
  int peak = 0;
  while (micros() - startUs < windowUs) {
    uint32_t nowUs = micros();
    if (nowUs - lastSampleUs >= kSampleIntervalUs) {
      lastSampleUs = nowUs;
      int value = analogRead(kAdcPin);
      if (value > peak) {
        peak = value;
      }
    }
  }
  return peak;
}

void recordHit(uint32_t nowMs, int peak, int score) {
  hits++;
  if (nowMs - lastHitMs <= static_cast<uint32_t>(config.seriesGapMs)) {
    series++;
  } else {
    series = 1;
  }
  if (series > maxSeries) {
    maxSeries = series;
  }
  lastHitMs = nowMs;
  lockoutUntil = nowMs + static_cast<uint32_t>(config.lockoutMs);
  lastPeak = peak;
  lastScore = score;
  if (peak > bestPeak) {
    bestPeak = peak;
  }
  if (score > bestScore) {
    bestScore = score;
  }
  hitTimes[hitIndex] = nowMs;
  hitIndex = (hitIndex + 1) % kHitHistoryMax;
  if (hitCount < kHitHistoryMax) {
    hitCount++;
  }
  Serial.printf("Hit peak=%d score=%d hits=%lu series=%lu\n",
                peak, score, static_cast<unsigned long>(hits),
                static_cast<unsigned long>(series));
}

void processSensor() {
  int peak = readPeak();
  uint32_t nowMs = millis();
  if (peak > config.threshold && nowMs > lockoutUntil) {
    int score = scoreFromPeak(peak);
    recordHit(nowMs, peak, score);
  }
}

void processSimulation() {
  uint32_t nowMs = millis();
  if (nowMs < nextSimMs) {
    return;
  }
  if (nowMs <= lockoutUntil) {
    nextSimMs = lockoutUntil + 1;
    return;
  }
  int maxPeak = clampInt(config.threshold + 800, 0, 4095);
  int peak = random(config.threshold + 50, maxPeak + 1);
  int score = scoreFromPeak(peak);
  recordHit(nowMs, peak, score);
  nextSimMs = nowMs + static_cast<uint32_t>(random(200, 600));
}

void startSession(Mode mode, uint32_t durationMs) {
  currentMode = mode;
  sessionDurationMs = durationMs;
  sessionStartMs = millis();
  sessionStopMs = 0;
  resetSessionMetrics();
  running = true;
  nextSimMs = sessionStartMs + 200;
  Serial.printf("Session start mode=%s\n", modeToString(mode));
}

void stopSession() {
  running = false;
  sessionStopMs = millis();
  Serial.println("Session stop");
}

void handleRoot() {
  server.send_P(200, "text/html", kIndexHtml);
}

void handleStatus() {
  uint32_t nowMs = millis();
  uint32_t timeLeft = 0;
  if (running && sessionDurationMs > 0) {
    uint32_t elapsed = nowMs - sessionStartMs;
    timeLeft = (elapsed >= sessionDurationMs) ? 0 : (sessionDurationMs - elapsed);
  }
  uint32_t tempo = running ? tempoHpm(nowMs) : tempoFromSession(sessionStopMs);
  String json = "{";
  json += "\"running\":" + String(running ? "true" : "false");
  json += ",\"mode\":\"" + String(modeToString(currentMode)) + "\"";
  json += ",\"time_left_ms\":" + String(timeLeft);
  json += ",\"hits\":" + String(hits);
  json += ",\"tempo_hpm\":" + String(tempo);
  json += ",\"series\":" + String(series);
  json += ",\"maxSeries\":" + String(maxSeries);
  json += ",\"lastPeak\":" + String(lastPeak);
  json += ",\"lastScore\":" + String(lastScore);
  json += ",\"bestPeak\":" + String(bestPeak);
  json += ",\"bestScore\":" + String(bestScore);
  json += ",\"threshold\":" + String(config.threshold);
  json += ",\"lockout_ms\":" + String(config.lockoutMs);
  json += ",\"series_gap_ms\":" + String(config.seriesGapMs);
  json += ",\"sample_window_ms\":" + String(config.sampleWindowMs);
  json += ",\"simulate\":" + String(config.simulate ? 1 : 0);
  json += "}";
  server.send(200, "application/json", json);
}

void handleStart() {
  String modeArg = server.arg("mode");
  Mode mode;
  uint32_t durationMs = 0;
  if (!parseMode(modeArg, mode, durationMs)) {
    server.send(400, "application/json", "{\"error\":\"invalid mode\"}");
    return;
  }
  startSession(mode, durationMs);
  server.send(200, "application/json", "{\"ok\":true}");
}

void handleStop() {
  stopSession();
  server.send(200, "application/json", "{\"ok\":true}");
}

void handleConfig() {
  bool changed = false;
  if (server.hasArg("threshold")) {
    int value = 0;
    if (parseIntValue(server.arg("threshold"), value)) {
      int next = clampInt(value, 0, 4095);
      if (next != config.threshold) {
        config.threshold = next;
        changed = true;
      }
    }
  }
  if (server.hasArg("lockout_ms")) {
    int value = 0;
    if (parseIntValue(server.arg("lockout_ms"), value)) {
      int next = clampInt(value, 0, 5000);
      if (next != config.lockoutMs) {
        config.lockoutMs = next;
        changed = true;
      }
    }
  }
  if (server.hasArg("series_gap_ms")) {
    int value = 0;
    if (parseIntValue(server.arg("series_gap_ms"), value)) {
      int next = clampInt(value, 0, 10000);
      if (next != config.seriesGapMs) {
        config.seriesGapMs = next;
        changed = true;
      }
    }
  }
  if (server.hasArg("sample_window_ms")) {
    int value = 0;
    if (parseIntValue(server.arg("sample_window_ms"), value)) {
      int next = clampInt(value, 1, 50);
      if (next != config.sampleWindowMs) {
        config.sampleWindowMs = next;
        changed = true;
      }
    }
  }
  if (server.hasArg("simulate")) {
    String value = server.arg("simulate");
    bool next = (value == "1" || value == "true");
    if (next != config.simulate) {
      config.simulate = next;
      changed = true;
    }
  }

  String body = server.arg("plain");
  if (body.length() > 0) {
    int value = 0;
    bool boolValue = false;
    if (extractJsonInt(body, "threshold", value)) {
      int next = clampInt(value, 0, 4095);
      if (next != config.threshold) {
        config.threshold = next;
        changed = true;
      }
    }
    if (extractJsonInt(body, "lockout_ms", value)) {
      int next = clampInt(value, 0, 5000);
      if (next != config.lockoutMs) {
        config.lockoutMs = next;
        changed = true;
      }
    }
    if (extractJsonInt(body, "series_gap_ms", value)) {
      int next = clampInt(value, 0, 10000);
      if (next != config.seriesGapMs) {
        config.seriesGapMs = next;
        changed = true;
      }
    }
    if (extractJsonInt(body, "sample_window_ms", value)) {
      int next = clampInt(value, 1, 50);
      if (next != config.sampleWindowMs) {
        config.sampleWindowMs = next;
        changed = true;
      }
    }
    if (extractJsonBool(body, "simulate", boolValue)) {
      if (boolValue != config.simulate) {
        config.simulate = boolValue;
        changed = true;
      }
    }
  }

  if (changed) {
    saveConfig();
    Serial.printf("Config updated: threshold=%d lockout=%d series_gap=%d window=%d simulate=%d\n",
                  config.threshold, config.lockoutMs, config.seriesGapMs,
                  config.sampleWindowMs, config.simulate ? 1 : 0);
  }

  server.send(200, "application/json", "{\"ok\":true}");
}

} // namespace

void setup() {
  Serial.begin(115200);
  delay(200);
  loadConfig();
  randomSeed(esp_random());

  analogReadResolution(12);
  analogSetPinAttenuation(kAdcPin, ADC_11db);

  WiFi.mode(WIFI_AP);
  WiFi.softAP(kApSsid, kApPass);
  IPAddress ip = WiFi.softAPIP();
  Serial.printf("AP started: %s IP=%s\n", kApSsid, ip.toString().c_str());

  server.on("/", HTTP_GET, handleRoot);
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/start", HTTP_POST, handleStart);
  server.on("/api/stop", HTTP_POST, handleStop);
  server.on("/api/config", HTTP_POST, handleConfig);
  server.begin();
}

void loop() {
  server.handleClient();

  if (running) {
    if (sessionDurationMs > 0) {
      uint32_t elapsed = millis() - sessionStartMs;
      if (elapsed >= sessionDurationMs) {
        stopSession();
        return;
      }
    }

    if (config.simulate) {
      processSimulation();
    } else {
      processSensor();
    }
  } else {
    delay(5);
  }
}
