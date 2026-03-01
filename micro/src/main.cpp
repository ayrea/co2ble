#include <Arduino.h>
#include <Wire.h>

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

uint16_t temperature;
uint16_t humidity;
uint16_t co2;

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
  Wire.begin(SDA, SCL);

  delay(1000);

  // Start periodic measurement (SCD4x 0x21 0xb1)
  Wire.beginTransmission(SENSOR_I2C_ADDR);
  Wire.write(byte(CMD_START_PERIODIC_MSB));
  Wire.write(byte(CMD_START_PERIODIC_LSB));
  uint8_t err = Wire.endTransmission();
  if (err != 0)
  {
    Serial.print("Sensor not found (I2C error ");
    Serial.print(err);
    Serial.println(")");
  }
  else
  {
    Serial.println("Setup wire");
  }
  delay(5000);
}

void loop()
{
  byte buffer[MEASUREMENT_BYTES];
  size_t received = Wire.requestFrom((uint8_t)SENSOR_I2C_ADDR, (size_t)sizeof(buffer));

  if (received != sizeof(buffer))
  {
    co2 = 0;
    temperature = 0;
    humidity = 0;
    Serial.println("I2C read failed (wrong byte count)");
  }
  else
  {
    for (size_t i = 0; i < sizeof(buffer); i++)
    {
      buffer[i] = Wire.read();
    }

    // Check CRCs
    if (ValidCRC(buffer))
    {
      // Get CO2 value
      co2 = buffer[0] * 256 + buffer[1];

      // Get temperature value
      float temp = ((float)buffer[3] * 256.0f + (float)buffer[4]) / SCD4X_RAW_SCALE;
      float temp1 = SCD4X_TEMP_OFFSET + (SCD4X_TEMP_SCALE * temp);
      temperature = (uint16_t)(temp1 * 100.0f);

      // Get humidity value
      float hum = (((float)buffer[6] * 256.0f + (float)buffer[7]) / SCD4X_RAW_SCALE) * SCD4X_HUM_SCALE;
      humidity = (uint16_t)(hum * 100.0f);
    }
    else
    {
      co2 = 0;
      temperature = 0;
      humidity = 0;
    }
  }

  Serial.print("CO2: ");
  Serial.println(co2);

  float ftemp = (float)temperature / 100.0f;
  Serial.print("Temperature: ");
  Serial.println(String(ftemp, 1));

  float fhum = (float)humidity / 100.0f;
  Serial.print("Humidity: ");
  Serial.println(String(fhum, 0));

  Serial.println("Waiting 10s before the next round...");
  delay(10000);
}
