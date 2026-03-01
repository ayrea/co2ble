import { useCallback, useRef, useState } from 'react'

// Environmental Sensing Service — full 128-bit UUID (16-bit alias 0x181A)
const ESS_SERVICE_UUID = '0000181a-0000-1000-8000-00805f9b34fb'
const CO2_CHAR_UUID = '2b8c'
const TEMP_CHAR_UUID = '2a6e'
const HUM_CHAR_UUID = '2a6f'
const AGE_CHAR_UUID = 'b5a2e7f0-3c4d-4f5e-8a1b-9c0d1e2f3a4b'

// Web Bluetooth returns 128-bit UUIDs; match by suffix (16-bit alias)
const uuidMatch = (uuid: string, shortHex: string): boolean =>
  uuid.toLowerCase().replace(/-/g, '').endsWith(shortHex.toLowerCase())
const AGE_POLL_MS = 2000

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
    if (!navigator.bluetooth) {
      setStatus('error')
      setErrorMessage('Web Bluetooth is not supported in this browser.')
      return
    }

    setErrorMessage(null)
    setStatus('scanning')

    let device: BluetoothDevice
    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [{ name: 'CO2 Sensor' }],
        optionalServices: [ESS_SERVICE_UUID],
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to select device'
      setStatus('error')
      setErrorMessage(message)
      return
    }

    setStatus('connecting')
    deviceRef.current = device

    const cleanup = () => {
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect to device'
      setStatus('error')
      setErrorMessage(message)
      return
    }

    let service: BluetoothRemoteGATTService
    try {
      service = await server.getPrimaryService(ESS_SERVICE_UUID)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get service'
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
      co2Char = await service.getCharacteristic(CO2_CHAR_UUID)
      tempChar = await service.getCharacteristic(TEMP_CHAR_UUID)
      humChar = await service.getCharacteristic(HUM_CHAR_UUID)
      ageChar = await service.getCharacteristic(AGE_CHAR_UUID)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get characteristics'
      setStatus('error')
      setErrorMessage(message)
      server.disconnect()
      return
    }

    const decodeAge = (value: DataView): number => value.getUint32(0, true)

    const readAge = async () => {
      try {
        const value = await ageChar.readValue()
        setData((prev) => ({ ...prev, age: decodeAge(value) }))
      } catch {
        // ignore read errors (e.g. device disconnected)
      }
    }

    const onCharacteristicChanged = (event: Event) => {
      const char = event.target as BluetoothRemoteGATTCharacteristic
      const value = char.value!
      const uuid = char.uuid

      if (uuidMatch(uuid, CO2_CHAR_UUID)) {
        setData((prev) => ({ ...prev, co2: value.getUint16(0, true) }))
      } else if (uuidMatch(uuid, TEMP_CHAR_UUID)) {
        setData((prev) => ({ ...prev, temperature: value.getUint16(0, true) / 100 }))
      } else if (uuidMatch(uuid, HUM_CHAR_UUID)) {
        setData((prev) => ({ ...prev, humidity: value.getUint16(0, true) / 100 }))
      }
    }

    try {
      await co2Char.startNotifications()
      await tempChar.startNotifications()
      await humChar.startNotifications()
      co2Char.addEventListener('characteristicvaluechanged', onCharacteristicChanged)
      tempChar.addEventListener('characteristicvaluechanged', onCharacteristicChanged)
      humChar.addEventListener('characteristicvaluechanged', onCharacteristicChanged)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start notifications'
      setStatus('error')
      setErrorMessage(message)
      server.disconnect()
      return
    }

    await readAge()
    ageIntervalRef.current = setInterval(readAge, AGE_POLL_MS)
    setStatus('connected')
  }, [])

  return { status, errorMessage, data, connect, disconnect }
}
