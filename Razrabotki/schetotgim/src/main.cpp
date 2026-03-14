#include <Arduino.h>
#include <Wire.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <TM1637Display.h>

#include "web_ui.h"

static const uint8_t PIN_PLUS = 18;   // button/switch +1 -> GND
static const uint8_t PIN_RESET = 19;  // reset button -> GND

static const uint8_t OLED_SDA = 21;
static const uint8_t OLED_SCL = 22;
static const uint8_t OLED_ADDR_1 = 0x3C;
static const uint8_t OLED_ADDR_2 = 0x3D;

static const uint8_t TM_CLK = 16;
static const uint8_t TM_DIO = 17;

static const unsigned long DEBOUNCE_MS = 30;
static const unsigned long ANTI_MULTICLICK_MS = 150;
static const unsigned long HOLD_MS = 2000;

static const uint8_t SCREEN_WIDTH = 128;
static const uint8_t SCREEN_HEIGHT = 64;
static const int8_t OLED_RESET = -1;

static const char *WIFI_AP_SSID = "PUSHUP-COUNTER";
static const char *WIFI_AP_PASSWORD = "";
static const char *WIFI_AP_LABEL = "AP:PUSHUP";
static const IPAddress WIFI_AP_IP(192, 168, 4, 2);
static const IPAddress WIFI_AP_GATEWAY(192, 168, 4, 2);
static const IPAddress WIFI_AP_SUBNET(255, 255, 255, 0);

struct ButtonState {
  uint8_t pin;
  bool stableLevel;
  bool lastSampled;
  unsigned long lastChangeMs;
  unsigned long pressedSinceMs;
  bool holdHandled;
};

static Preferences prefs;
static WebServer server(80);
static uint32_t countValue = 0;
static unsigned long lastCountAcceptedMs = 0;

static ButtonState btnPlus { PIN_PLUS, true, true, 0, 0, false };

// Dedicated reset-button state.
static bool stableLevel = HIGH;  // INPUT_PULLUP: HIGH = released
static bool lastSampled = HIGH;
static unsigned long lastChangeMs = 0;
static unsigned long pressedSinceMs = 0;
static bool holdHandled = false;

static Adafruit_SSD1306 oled(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
static TM1637Display tm(TM_CLK, TM_DIO);
static bool oledReady = false;
static uint8_t oledAddrUsed = 0;
static String wifiIpText = "0.0.0.0";

static void applyCountAndSync();

static bool i2cDevicePresent(uint8_t addr) {
  Wire.beginTransmission(addr);
  return Wire.endTransmission() == 0;
}

static bool initOLEDAtAddress(uint8_t addr) {
  if (!i2cDevicePresent(addr)) {
    return false;
  }
  if (!oled.begin(SSD1306_SWITCHCAPVCC, addr)) {
    return false;
  }
  oledReady = true;
  oledAddrUsed = addr;
  return true;
}

static void drawOLED() {
  if (!oledReady) {
    return;
  }

  oled.clearDisplay();
  oled.setTextColor(SSD1306_WHITE);

  oled.setTextSize(1);
  oled.setCursor(0, 0);
  oled.print(WIFI_AP_LABEL);

  oled.setTextSize(3);
  oled.setCursor(0, 14);
  oled.print(countValue);

  oled.setTextSize(1);
  oled.setCursor(0, 52);
  oled.print(wifiIpText);

  oled.display();
}

static void drawTM() {
  uint16_t v = static_cast<uint16_t>(countValue % 10000);
  tm.showNumberDec(v, true);
}

static void renderDisplay() {
  drawTM();
  drawOLED();
}

static void initDisplays() {
  oledReady = false;
  oledAddrUsed = 0;

  Wire.begin(OLED_SDA, OLED_SCL);
  if (!initOLEDAtAddress(OLED_ADDR_1) && !initOLEDAtAddress(OLED_ADDR_2)) {
    Wire.begin();
    initOLEDAtAddress(OLED_ADDR_1) || initOLEDAtAddress(OLED_ADDR_2);
  }

  tm.setBrightness(7, true);
  tm.clear();

  if (oledReady) {
    Serial.printf("OLED: OK at 0x%02X\r\n", oledAddrUsed);
  } else {
    Serial.println("OLED: not found");
  }
  Serial.printf("TM1637: CLK=%u DIO=%u\r\n", TM_CLK, TM_DIO);
}

static void saveCount() {
  prefs.putULong("count", static_cast<unsigned long>(countValue));
}

static void applyCountAndSync() {
  saveCount();
  renderDisplay();
}

static void resetCountValue() {
  countValue = 0;
  applyCountAndSync();
}

static void incrementCountValue() {
  countValue++;
  applyCountAndSync();
}

static void setupResetButton() {
  pinMode(PIN_RESET, INPUT_PULLUP);
  bool s = digitalRead(PIN_RESET);
  stableLevel = s;
  lastSampled = s;
  lastChangeMs = millis();
}

static void tickResetButton(unsigned long now) {
  bool sampled = digitalRead(PIN_RESET);

  if (sampled != lastSampled) {
    lastSampled = sampled;
    lastChangeMs = now;
  }

  if ((now - lastChangeMs) >= DEBOUNCE_MS && stableLevel != lastSampled) {
    stableLevel = lastSampled;

    if (stableLevel == LOW) {
      pressedSinceMs = now;
      holdHandled = false;
    }
  }

  if (stableLevel == LOW && !holdHandled && (now - pressedSinceMs >= HOLD_MS)) {
    holdHandled = true;
    resetCountValue();
  }

  if (stableLevel == HIGH) {
    holdHandled = false;
  }
}

static bool updateButton(ButtonState &b) {
  bool sampled = (digitalRead(b.pin) != LOW);
  unsigned long now = millis();

  if (sampled != b.lastSampled) {
    b.lastSampled = sampled;
    b.lastChangeMs = now;
  }

  if ((now - b.lastChangeMs) >= DEBOUNCE_MS && b.stableLevel != b.lastSampled) {
    b.stableLevel = b.lastSampled;
    if (!b.stableLevel) {
      b.pressedSinceMs = now;
      b.holdHandled = false;
    }
    return true;
  }
  return false;
}

static bool isPressed(const ButtonState &b) {
  return b.stableLevel == false;
}

static void sendStateJson() {
  char json[160];
  snprintf(
    json,
    sizeof(json),
    "{\"count\":%lu,\"ssid\":\"%s\",\"ip\":\"%s\"}",
    static_cast<unsigned long>(countValue),
    WIFI_AP_SSID,
    wifiIpText.c_str()
  );

  server.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  server.send(200, "application/json; charset=utf-8", json);
}

static void setupHttpServer() {
  server.on("/", HTTP_GET, []() {
    server.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    server.send_P(200, "text/html; charset=utf-8", INDEX_HTML);
  });

  server.on("/api/state", HTTP_GET, []() {
    sendStateJson();
  });

  server.on("/api/inc", HTTP_POST, []() {
    incrementCountValue();
    sendStateJson();
  });

  server.on("/api/reset", HTTP_POST, []() {
    resetCountValue();
    sendStateJson();
  });

  server.on("/favicon.ico", HTTP_GET, []() {
    server.send(204);
  });

  server.onNotFound([]() {
    server.send(404, "text/plain; charset=utf-8", "Not found");
  });

  server.begin();
  Serial.println("HTTP: server started");
}

static void setupWiFi() {
  WiFi.mode(WIFI_AP);
  WiFi.setSleep(false);
  WiFi.softAPConfig(WIFI_AP_IP, WIFI_AP_GATEWAY, WIFI_AP_SUBNET);

  bool apOk = false;
  if (WIFI_AP_PASSWORD[0] == '\0') {
    apOk = WiFi.softAP(WIFI_AP_SSID);
  } else {
    apOk = WiFi.softAP(WIFI_AP_SSID, WIFI_AP_PASSWORD);
  }

  wifiIpText = WiFi.softAPIP().toString();
  Serial.printf("WiFi AP: %s\r\n", apOk ? "OK" : "FAIL");
  Serial.printf("SSID: %s\r\n", WIFI_AP_SSID);
  Serial.printf("Open: http://%s\r\n", wifiIpText.c_str());
}

void setup() {
  pinMode(PIN_PLUS, INPUT_PULLUP);

  Serial.begin(115200);
  delay(250);
  Serial.println("Boot...");

  prefs.begin("pushup", false);
  countValue = prefs.getULong("count", 0);

  btnPlus.stableLevel = (digitalRead(btnPlus.pin) != LOW);
  btnPlus.lastSampled = btnPlus.stableLevel;
  btnPlus.lastChangeMs = millis();
  btnPlus.pressedSinceMs = isPressed(btnPlus) ? millis() : 0;

  setupResetButton();
  setupWiFi();
  initDisplays();
  renderDisplay();
  setupHttpServer();
}

void loop() {
  unsigned long now = millis();

  server.handleClient();

  updateButton(btnPlus);
  tickResetButton(now);

  static bool plusWasPressed = false;
  if (isPressed(btnPlus)) {
    plusWasPressed = true;
  } else if (plusWasPressed) {
    plusWasPressed = false;
    if (now - lastCountAcceptedMs >= ANTI_MULTICLICK_MS) {
      lastCountAcceptedMs = now;
      incrementCountValue();
    }
  }

  delay(5);
}
