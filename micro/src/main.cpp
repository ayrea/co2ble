#include <Arduino.h>
#include <Wire.h>

#define SDA = 21 // Data
#define SCL = 22 // Clock

#define CRC8_POLYNOMIAL 0x31
#define CRC8_INIT 0xFF

struct tm localTimeInfo;
uint32_t localTimeMs;

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
  Wire.begin();

  delay(1000);

  // Start start_periodic_measurement
  Wire.beginTransmission(0x62);
  Wire.write(byte(0x21));
  Wire.write(byte(0xb1));
  Wire.endTransmission();

  Serial.println("Setup wire");
  delay(5000);
}

void loop()
{
  byte buffer[9];
  Wire.requestFrom(0x62, sizeof(buffer));

  for (int i = 0; i < sizeof(buffer); i++)
  {
    buffer[i] = Wire.read();
  }

  // Check CRCs
  if (ValidCRC(buffer))
  {
    // Get CO2 value
    co2 = buffer[0] * 255 + buffer[1];

    // Get temperature value
    float temp = ((float)buffer[3] * (float)255 + (float)buffer[4]) / (float)65536;
    float temp1 = (float)-45 + ((float)175 * temp);
    temperature = temp1 * (float)100;

    // Get humidity value
    float hum = (((float)buffer[6] * (float)255 + (float)buffer[7]) / (float)65536) * 100;
    humidity = hum * (float)100;
  }
  else
  {
    co2 = 0;
    temperature = 0;
    humidity = 0;
  }

  Serial.print("CO2: ");
  Serial.println(co2);

  float ftemp = (float)temperature / (float)100;
  Serial.print("Temperature: ");
  Serial.println(String(ftemp, 1));

  float fhum = (float)humidity / (float)100;
  Serial.print("Humidity: ");
  Serial.println(String(fhum, 0));

  Serial.println("Waiting 10s before the next round...");
  delay(10000);
}
