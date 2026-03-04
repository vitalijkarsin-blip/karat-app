# ESP32 Pushup Counter

## Pins
- `GPIO18` -> `+1` button (limit switch), mode `INPUT_PULLUP`, pressed = `LOW`
- `GPIO19` -> `RESET` button, mode `INPUT_PULLUP`, pressed = `LOW`
- I2C default pins: `SDA = GPIO21`, `SCL = GPIO22`

## Power and Wiring
- OLED: SSD1306 128x64 I2C, address `0x3C`
- OLED `VCC` must be connected to `3V3` on ESP32 (not `5V`)
- Common `GND` between ESP32, buttons, and OLED

## Flash / Monitor
- Build: `pio run`
- Upload: `pio run -t upload`
- Serial monitor: `pio device monitor`

## BLE Check
- Device name: `PUSHUP-COUNTER`
- Service UUID: `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`
- Characteristic UUID (READ + NOTIFY): `6E400003-B5A3-F393-E0A9-E50E24DCCA9E`
- Value format: ASCII count, for example `42`
- On each count change and after reset, notification is sent.
