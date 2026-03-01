import { useCallback, useRef, useState } from 'react'

// Environmental Sensing Service — full 128-bit UUID (16-bit alias 0x181A)
const ESS_SERVICE_UUID = '0000181a-0000-1000-8000-00805f9b34fb';
const CO2_CHAR_UUID = '00002b8c-0000-1000-8000-00805f9b34fb';
const TEMP_CHAR_UUID = '00002a6e-0000-1000-8000-00805f9b34fb';
const HUM_CHAR_UUID = '00002a6f-0000-1000-8000-00805f9b34fb';
const AGE_CHAR_UUID = 'b5a2e7f0-3c4d-4f5e-8a1b-9c0d1e2f3a4b';

// Match characteristic UUID from event (may be full 128-bit or short 16-bit) to our full UUID.
const uuidMatch = (eventUuid: string, fullUuid: string): boolean => {
  const norm = (s: string) => s.toLowerCase().replace(/-/g, '')
  const eventNorm = norm(eventUuid)
  const fullNorm = norm(fullUuid)
  if (eventNorm === fullNorm) return true
  // Web Bluetooth may report standard GATT characteristics as short form (4 or 8 hex chars).
  // Standard base is 0000XXXX-0000-1000-8000-00805f9b34fb; 16-bit segment is at index 4–8.
  if (eventNorm.length === 4 || eventNorm.length === 8) {
    const shortPart = fullNorm.length >= 8 ? fullNorm.substring(4, 8) : ''
    const eventShort = eventNorm.length === 4 ? eventNorm : eventNorm.slice(-4)
    return shortPart === eventShort
  }
  return false
}
const AGE_POLL_MS = 2000

const valueToHex = (value: DataView): string =>
  Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ')

export type BleStatus =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'

export interface BleData {
  co2: number | null
  temperature: number | null
  humidity: number | null
  age: number | null
}

const initialData: BleData = {
  co2: null,
  temperature: null,
  humidity: null,
  age: null,
}

export function useBluetooth(): {
  status: BleStatus
  errorMessage: string | null
  data: BleData
  connect: () => Promise<void>
  disconnect: () => void
} {
  const [status, setStatus] = useState<BleStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [data, setData] = useState<BleData>(initialData)
  const deviceRef = useRef<BluetoothDevice | null>(null)
  const ageIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const disconnect = useCallback(() => {
    console.log('[BLE] disconnect() called')
    if (ageIntervalRef.current) {
      clearInterval(ageIntervalRef.current)
      ageIntervalRef.current = null
    }
    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect()
    }
    deviceRef.current = null
    setStatus('disconnected')
    setData(initialData)
    setErrorMessage(null)
  }, [])

  const connect = useCallback(async () => {
    console.log('[BLE] connect() called')
    if (!navigator.bluetooth) {
      console.log('[BLE] Web Bluetooth not supported')
      setStatus('error')
      setErrorMessage('Web Bluetooth is not supported in this browser.')
      return
    }

    setErrorMessage(null)
    setStatus('scanning')
    console.log('[BLE] Requesting device — filter: name=CO2 Sensor')

    let device: BluetoothDevice
    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [{ name: 'CO2 Sensor' }],
        optionalServices: [ESS_SERVICE_UUID],
      })
      console.log('[BLE] Device selected:', device.name ?? '(no name)', 'id:', device.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to select device'
      console.log('[BLE] Device selection failed:', err)
      setStatus('error')
      setErrorMessage(message)
      return
    }

    setStatus('connecting')
    deviceRef.current = device
    console.log('[BLE] Connecting to GATT server...')

    const cleanup = () => {
      console.log('[BLE] gattserverdisconnected event fired')
      if (ageIntervalRef.current) {
        clearInterval(ageIntervalRef.current)
        ageIntervalRef.current = null
      }
      deviceRef.current = null
      setStatus('disconnected')
      setData(initialData)
      setErrorMessage(null)
    }

    device.addEventListener('gattserverdisconnected', cleanup)

    let server: BluetoothRemoteGATTServer
    try {
      server = await device.gatt!.connect()
      console.log('[BLE] GATT server connected')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect to device'
      console.log('[BLE] GATT connect failed:', err)
      setStatus('error')
      setErrorMessage(message)
      return
    }

    console.log('[BLE] Getting primary service:', ESS_SERVICE_UUID)
    let service: BluetoothRemoteGATTService
    try {
      service = await server.getPrimaryService(ESS_SERVICE_UUID)
      console.log('[BLE] ESS service found')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get service'
      console.log('[BLE] Failed to get ESS service:', err)
      setStatus('error')
      setErrorMessage(message)
      server.disconnect()
      return
    }

    let co2Char: BluetoothRemoteGATTCharacteristic
    let tempChar: BluetoothRemoteGATTCharacteristic
    let humChar: BluetoothRemoteGATTCharacteristic
    let ageChar: BluetoothRemoteGATTCharacteristic
    try {
      console.log('[BLE] Getting characteristic:', CO2_CHAR_UUID)
      co2Char = await service.getCharacteristic(CO2_CHAR_UUID)
      console.log('[BLE] Characteristic found:', CO2_CHAR_UUID)
      console.log('[BLE] Getting characteristic:', TEMP_CHAR_UUID)
      tempChar = await service.getCharacteristic(TEMP_CHAR_UUID)
      console.log('[BLE] Characteristic found:', TEMP_CHAR_UUID)
      console.log('[BLE] Getting characteristic:', HUM_CHAR_UUID)
      humChar = await service.getCharacteristic(HUM_CHAR_UUID)
      console.log('[BLE] Characteristic found:', HUM_CHAR_UUID)
      console.log('[BLE] Getting characteristic:', AGE_CHAR_UUID)
      ageChar = await service.getCharacteristic(AGE_CHAR_UUID)
      console.log('[BLE] Characteristic found:', AGE_CHAR_UUID)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get characteristics'
      console.log('[BLE] Failed to get characteristic:', err)
      setStatus('error')
      setErrorMessage(message)
      server.disconnect()
      return
    }

    const decodeAge = (value: DataView): number => value.getUint32(0, true)

    const readAge = async () => {
      try {
        const value = await ageChar.readValue()
        const age = decodeAge(value)
        console.log('[BLE] Age read:', age, 'ms')
        setData((prev) => ({ ...prev, age }))
      } catch (err) {
        console.log('[BLE] Age read failed:', err)
        // ignore read errors (e.g. device disconnected)
      }
    }

    const onCharacteristicChanged = (event: Event) => {
      const char = event.target as BluetoothRemoteGATTCharacteristic
      const value = char.value!
      const uuid = char.uuid
      const rawHex = valueToHex(value)
      console.log('[BLE] Notification — uuid=', uuid, 'raw=', rawHex)

      if (uuidMatch(uuid, CO2_CHAR_UUID)) {
        const decoded = value.getUint16(0, true)
        console.log('[BLE] Notification received — uuid=', uuid, 'raw=', rawHex, 'decoded co2=', decoded)
        setData((prev) => ({ ...prev, co2: decoded }))
      } else if (uuidMatch(uuid, TEMP_CHAR_UUID)) {
        const decoded = value.getUint16(0, true) / 100
        console.log('[BLE] Notification received — uuid=', uuid, 'raw=', rawHex, 'decoded temperature=', decoded)
        setData((prev) => ({ ...prev, temperature: decoded }))
      } else if (uuidMatch(uuid, HUM_CHAR_UUID)) {
        const decoded = value.getUint16(0, true) / 100
        console.log('[BLE] Notification received — uuid=', uuid, 'raw=', rawHex, 'decoded humidity=', decoded)
        setData((prev) => ({ ...prev, humidity: decoded }))
      }
    }

    try {
      console.log('[BLE] Starting notifications for CO2, Temp, Hum')
      await co2Char.startNotifications()
      await tempChar.startNotifications()
      await humChar.startNotifications()
      console.log('[BLE] Notifications started')
      co2Char.addEventListener('characteristicvaluechanged', onCharacteristicChanged)
      tempChar.addEventListener('characteristicvaluechanged', onCharacteristicChanged)
      humChar.addEventListener('characteristicvaluechanged', onCharacteristicChanged)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start notifications'
      console.log('[BLE] Failed to start notifications:', err)
      setStatus('error')
      setErrorMessage(message)
      server.disconnect()
      return
    }

    await readAge()
    ageIntervalRef.current = setInterval(readAge, AGE_POLL_MS)
    setStatus('connected')
    console.log('[BLE] Fully connected and listening')
  }, [])

  return { status, errorMessage, data, connect, disconnect }
}
