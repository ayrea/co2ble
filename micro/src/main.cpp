#include <Arduino.h>
#include <Wire.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define SDA 21 // Data
#define SCL 22 // Clock

#define SENSOR_I2C_ADDR 0x62
#define CMD_START_PERIODIC_MSB 0x21
#define CMD_START_PERIODIC_LSB 0xb1
#define MEASUREMENT_BYTES 9

#define SCD4X_RAW_SCALE 65536.0f
#define SCD4X_TEMP_OFFSET -45.0f
#define SCD4X_TEMP_SCALE 175.0f
#define SCD4X_HUM_SCALE 100.0f

#define CRC8_POLYNOMIAL 0x31
#define CRC8_INIT 0xFF

#define ESS_SERVICE_UUID "0000181a-0000-1000-8000-00805f9b34fb"
#define CO2_CHAR_UUID "00002b8c-0000-1000-8000-00805f9b34fb"
#define TEMP_CHAR_UUID "00002a6e-0000-1000-8000-00805f9b34fb"
#define HUM_CHAR_UUID "00002a6f-0000-1000-8000-00805f9b34fb"
#define AGE_CHAR_UUID "b5a2e7f0-3c4d-4f5e-8a1b-9c0d1e2f3a4b"
#define DEVICE_NAME "CO2 Sensor"
#define READ_INTERVAL 10000

uint16_t temperature;
uint16_t humidity;
uint16_t co2;

BLECharacteristic *pCo2Char, *pTempChar, *pHumChar, *pAgeChar;
unsigned long lastReadMillis = 0;

class AgeReadCallback : public BLECharacteristicCallbacks
{
  void onRead(BLECharacteristic *pChar) override
  {
    uint32_t age = (uint32_t)(millis() - lastReadMillis);
    pChar->setValue(age);
  }
};

class ServerCallbacks : public BLEServerCallbacks
{
  void onConnect(BLEServer *pServer, esp_ble_gatts_cb_param_t *param) override
  {
    Serial.print("[BLE] Client connected: ");
    if (param && param->connect.remote_bda)
    {
      for (int i = 0; i < 6; i++)
      {
        if (i > 0)
          Serial.print(":");
        Serial.printf("%02x", param->connect.remote_bda[i]);
      }
      Serial.println();
    }
    else
    {
      Serial.println("(no param)");
    }
  }
  void onDisconnect(BLEServer *pServer) override
  {
    Serial.println("[BLE] Client disconnected — restarting advertising");
    BLEDevice::startAdvertising();
  }
};

byte Compute_CRC8(const uint8_t *data, uint16_t count, uint16_t offset = 0)
{
  uint16_t current_byte;
  uint8_t crc = CRC8_INIT;
  uint8_t crc_bit;
  /* calculates 8-Bit checksum with given polynomial */
  for (uint16_t current_byte = offset; current_byte < count + offset; ++current_byte)
  {
    crc ^= (data[current_byte]);
    for (crc_bit = 8; crc_bit > 0; --crc_bit)
    {
      if (crc & 0x80)
        crc = (crc << 1) ^ CRC8_POLYNOMIAL;
      else
        crc = (crc << 1);
    }
  }
  return crc;
}

bool ValidCRC(byte buffer[])
{
  byte crc = Compute_CRC8(buffer, 2, 0);
  if (crc != buffer[2])
    return false;

  crc = Compute_CRC8(buffer, 2, 3);
  if (crc != buffer[5])
    return false;

  crc = Compute_CRC8(buffer, 2, 6);
  if (crc != buffer[8])
    return false;

  return true;
}

void setup()
{
  Serial.begin(115200);
  delay(2000);
  Serial.println("[BOOT] Starting CO2 Sensor firmware");

  Wire.begin(SDA, SCL);
  Serial.println("[I2C] Bus initialised on SDA=21 SCL=22");
  delay(1000);

  // Start periodic measurement (SCD4x 0x21 0xb1)
  Wire.beginTransmission(SENSOR_I2C_ADDR);
  Wire.write(byte(CMD_START_PERIODIC_MSB));
  Wire.write(byte(CMD_START_PERIODIC_LSB));
  uint8_t err = Wire.endTransmission();
  if (err != 0)
  {
    Serial.print("[I2C] Sensor not found (I2C error ");
    Serial.print(err);
    Serial.println(")");
  }
  else
  {
    Serial.println("[I2C] Setup wire — periodic measurement started");
  }
  delay(5000);

  BLEDevice::init(DEVICE_NAME);
  Serial.println("[BLE] Device name set: CO2 Sensor");

  BLEServer *pServer = BLEDevice::createServer();
  Serial.println("[BLE] Server created");
  pServer->setCallbacks(new ServerCallbacks());

  BLEService *pService = pServer->createService(ESS_SERVICE_UUID);
  Serial.println("[BLE] Service created: " ESS_SERVICE_UUID);

  pCo2Char = pService->createCharacteristic(CO2_CHAR_UUID,
                                            BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  Serial.println("[BLE] Characteristic created: CO2 " CO2_CHAR_UUID " (READ|NOTIFY)");
  pTempChar = pService->createCharacteristic(TEMP_CHAR_UUID,
                                             BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  Serial.println("[BLE] Characteristic created: Temp " TEMP_CHAR_UUID " (READ|NOTIFY)");
  pHumChar = pService->createCharacteristic(HUM_CHAR_UUID,
                                            BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  Serial.println("[BLE] Characteristic created: Hum " HUM_CHAR_UUID " (READ|NOTIFY)");
  pAgeChar = pService->createCharacteristic(AGE_CHAR_UUID,
                                            BLECharacteristic::PROPERTY_READ);
  Serial.println("[BLE] Characteristic created: Age " AGE_CHAR_UUID " (READ)");

  pCo2Char->addDescriptor(new BLE2902());
  pTempChar->addDescriptor(new BLE2902());
  pHumChar->addDescriptor(new BLE2902());

  pAgeChar->setCallbacks(new AgeReadCallback());

  pService->start();
  Serial.println("[BLE] Service started");

  BLEAdvertising *pAdv = BLEDevice::getAdvertising();
  pAdv->addServiceUUID(ESS_SERVICE_UUID);
  pAdv->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.println("[BLE] Advertising started — ready for connections");
}

void loop()
{
  if (lastReadMillis != 0)
  {
    unsigned long elapsed = millis() - lastReadMillis;
    if (elapsed < READ_INTERVAL)
    {
      static unsigned long lastLog = 0;
      if (millis() - lastLog >= 1000)
      {
        Serial.printf("[LOOP] Waiting... %lums until next read\n", READ_INTERVAL - elapsed);
        lastLog = millis();
      }
      return;
    }
  }

  bool validRead = false;
  byte buffer[MEASUREMENT_BYTES];
  size_t received = Wire.requestFrom((uint8_t)SENSOR_I2C_ADDR, (size_t)sizeof(buffer));

  Serial.printf("[I2C] requestFrom: received=%u expected=%u\n", (unsigned)received, (unsigned)sizeof(buffer));

  if (received != sizeof(buffer))
  {
    co2 = 0;
    temperature = 0;
    humidity = 0;
    Serial.println("[I2C] Read failed (wrong byte count)");
  }
  else
  {
    for (size_t i = 0; i < sizeof(buffer); i++)
    {
      buffer[i] = Wire.read();
    }

    if (ValidCRC(buffer))
    {
      co2 = buffer[0] * 256 + buffer[1];

      float temp = ((float)buffer[3] * 256.0f + (float)buffer[4]) / SCD4X_RAW_SCALE;
      float temp1 = SCD4X_TEMP_OFFSET + (SCD4X_TEMP_SCALE * temp);
      temperature = (uint16_t)(temp1 * 100.0f);

      float hum = (((float)buffer[6] * 256.0f + (float)buffer[7]) / SCD4X_RAW_SCALE) * SCD4X_HUM_SCALE;
      humidity = (uint16_t)(hum * 100.0f);
      validRead = true;
      Serial.printf("[I2C] Valid read — raw co2=%u temp_raw=%u hum_raw=%u -> co2=%u temp=%u hum=%u\n",
                    (unsigned)(buffer[0] * 256 + buffer[1]),
                    (unsigned)(buffer[3] * 256 + buffer[4]),
                    (unsigned)(buffer[6] * 256 + buffer[7]),
                    (unsigned)co2, (unsigned)temperature, (unsigned)humidity);
    }
    else
    {
      co2 = 0;
      temperature = 0;
      humidity = 0;
      Serial.print("[I2C] CRC failed — raw bytes: ");
      for (size_t i = 0; i < sizeof(buffer); i++)
      {
        Serial.printf("%02x", buffer[i]);
        if (i < sizeof(buffer) - 1)
          Serial.print(" ");
      }
      Serial.println();
    }
  }

  if (validRead)
  {
    lastReadMillis = millis();
    pCo2Char->setValue(co2);
    pTempChar->setValue(temperature);
    pHumChar->setValue(humidity);
    pCo2Char->notify();
    pTempChar->notify();
    pHumChar->notify();
    Serial.println("[BLE] Notifications sent for CO2/Temp/Hum");
  }

  Serial.print("[SENSOR] CO2: ");
  Serial.println(co2);

  float ftemp = (float)temperature / 100.0f;
  Serial.print("[SENSOR] Temperature: ");
  Serial.println(String(ftemp, 1));

  float fhum = (float)humidity / 100.0f;
  Serial.print("[SENSOR] Humidity: ");
  Serial.println(String(fhum, 0));

  Serial.println("[LOOP] Waiting 10s before the next round...");
}
