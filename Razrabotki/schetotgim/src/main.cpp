#include <Arduino.h>
#include <Wire.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

static const uint8_t PIN_PLUS = 18;
static const uint8_t PIN_RESET = 19;

static const unsigned long DEBOUNCE_MS = 50;
static const unsigned long ANTI_MULTICLICK_MS = 250;
static const unsigned long RESET_HOLD_MS = 2000;

static const uint8_t SCREEN_WIDTH = 128;
static const uint8_t SCREEN_HEIGHT = 64;
static const uint8_t OLED_RESET = 255;
static const uint8_t OLED_ADDR = 0x3C;

static const char *BLE_DEVICE_NAME = "PUSHUP-COUNTER";
static const char *SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
static const char *CHAR_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";

struct ButtonState {
  uint8_t pin;
  bool stableLevel;
  bool lastSampledLevel;
  unsigned long lastSampleChangeMs;
  unsigned long pressedSinceMs;
  bool holdHandled;
};

Preferences prefs;
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
BLECharacteristic *countCharacteristic = nullptr;

uint32_t pushupCount = 0;
unsigned long lastCountAcceptedMs = 0;
bool oledReady = false;

ButtonState plusBtn = {PIN_PLUS, HIGH, HIGH, 0, 0, false};
ButtonState resetBtn = {PIN_RESET, HIGH, HIGH, 0, 0, false};

void loadCount() {
  prefs.begin("pushup", false);
  pushupCount = prefs.getULong("count", 0);
}

void saveCount() {
  prefs.putULong("count", pushupCount);
}

void notifyCountBle() {
  if (countCharacteristic == nullptr) {
    return;
  }
  String payload = String(pushupCount);
  countCharacteristic->setValue(payload.c_str());
  countCharacteristic->notify();
}

void drawDisplay() {
  if (!oledReady) {
    return;
  }

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("COUNT:");

  String countText = String(pushupCount);
  int16_t x1, y1;
  uint16_t w, h;
  display.setTextSize(4);
  display.getTextBounds(countText, 0, 0, &x1, &y1, &w, &h);
  int16_t x = (SCREEN_WIDTH - static_cast<int16_t>(w)) / 2;
  if (x < 0) {
    x = 0;
  }
  display.setCursor(x, 16);
  display.print(countText);

  display.setTextSize(1);
  display.setCursor(0, 56);
  display.print("BLE: ON");

  display.display();
}

void setupBle() {
  BLEDevice::init(BLE_DEVICE_NAME);
  BLEServer *server = BLEDevice::createServer();
  BLEService *service = server->createService(SERVICE_UUID);

  countCharacteristic = service->createCharacteristic(
      CHAR_UUID,
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  countCharacteristic->addDescriptor(new BLE2902());

  String initialValue = String(pushupCount);
  countCharacteristic->setValue(initialValue.c_str());

  service->start();
  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(false);
  advertising->start();
}

void initButton(ButtonState &btn, unsigned long nowMs) {
  bool level = digitalRead(btn.pin);
  btn.stableLevel = level;
  btn.lastSampledLevel = level;
  btn.lastSampleChangeMs = nowMs;
  btn.pressedSinceMs = (level == LOW) ? nowMs : 0;
  btn.holdHandled = false;
}

bool updateButtonPressedEdge(ButtonState &btn, unsigned long nowMs) {
  bool sampled = digitalRead(btn.pin);

  if (sampled != btn.lastSampledLevel) {
    btn.lastSampledLevel = sampled;
    btn.lastSampleChangeMs = nowMs;
  }

  bool pressedEdge = false;

  if ((nowMs - btn.lastSampleChangeMs) >= DEBOUNCE_MS && sampled != btn.stableLevel) {
    btn.stableLevel = sampled;
    if (btn.stableLevel == LOW) {
      pressedEdge = true;
      btn.pressedSinceMs = nowMs;
      btn.holdHandled = false;
    } else {
      btn.pressedSinceMs = 0;
      btn.holdHandled = false;
    }
  }

  return pressedEdge;
}

void applyCountChange() {
  saveCount();
  drawDisplay();
  notifyCountBle();
}

void setup() {
  Serial.begin(115200);

  pinMode(PIN_PLUS, INPUT_PULLUP);
  pinMode(PIN_RESET, INPUT_PULLUP);

  unsigned long nowMs = millis();
  initButton(plusBtn, nowMs);
  initButton(resetBtn, nowMs);

  loadCount();

  Wire.begin();
  oledReady = display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  if (!oledReady) {
    Serial.println("OLED init failed");
  }
  drawDisplay();

  setupBle();
}

void loop() {
  unsigned long nowMs = millis();

  bool plusPressed = updateButtonPressedEdge(plusBtn, nowMs);
  updateButtonPressedEdge(resetBtn, nowMs);

  if (plusPressed && (nowMs - lastCountAcceptedMs) >= ANTI_MULTICLICK_MS) {
    pushupCount++;
    lastCountAcceptedMs = nowMs;
    applyCountChange();
  }

  if (resetBtn.stableLevel == LOW && !resetBtn.holdHandled && resetBtn.pressedSinceMs != 0 &&
      (nowMs - resetBtn.pressedSinceMs) >= RESET_HOLD_MS) {
    pushupCount = 0;
    resetBtn.holdHandled = true;
    applyCountChange();
  }

  delay(5);
}
