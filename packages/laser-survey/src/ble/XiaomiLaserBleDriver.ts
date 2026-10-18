import { parseXiaomiLaserPacket, type LaserBenchmark, type LaserMeasurementResult } from './LaserPacketParser.js'
import { LaserTtsService } from './LaserTtsService.js'

export type BleConnectionStatus = 'disconnected' | 'scanning' | 'connecting' | 'connected' | 'error'

export interface LaserBleDriverEvents {
  onMeasurement?: (measurement: LaserMeasurementResult) => void
  onStatusChange?: (status: BleConnectionStatus, message?: string) => void
  onBatteryChange?: (batteryPercent: number) => void
}

// Xiaomi & Standard GATT UUID constants
const MI_SERVICE_UUID = '0000fe95-0000-1000-8000-00805f9b34fb'
const BATTERY_SERVICE_UUID = '0000180f-0000-1000-8000-00805f9b34fb'
const BATTERY_LEVEL_CHAR_UUID = '00002a19-0000-1000-8000-00805f9b34fb'

// Ambient Web Bluetooth interfaces for environments without @types/web-bluetooth
interface BluetoothDevice extends EventTarget {
  id: string
  name?: string
  gatt?: BluetoothRemoteGATTServer
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void
}

interface BluetoothRemoteGATTServer {
  connected: boolean
  connect(): Promise<BluetoothRemoteGATTServer>
  disconnect(): void
  getPrimaryServices(): Promise<BluetoothRemoteGATTService[]>
}

interface BluetoothRemoteGATTService {
  uuid: string
  getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>
  getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  uuid: string
  properties: {
    notify?: boolean
    indicate?: boolean
    read?: boolean
  }
  value?: DataView
  readValue(): Promise<DataView>
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void
}

declare global {
  interface Navigator {
    bluetooth?: {
      requestDevice(options: {
        filters?: Array<{ name?: string; namePrefix?: string; services?: string[] }>
        optionalServices?: string[]
      }): Promise<BluetoothDevice>
    }
  }
}

/**
 * Web Bluetooth Driver for Xiaomi Smart Laser Measure (MJJGCJYD001QW / HOTO).
 * Compatible with Chrome, Edge, Brave, Kiwi Browser on Huawei MatePad, Android, and Desktop.
 */
export class XiaomiLaserBleDriver {
  private device: BluetoothDevice | null = null
  private server: BluetoothRemoteGATTServer | null = null
  private dataChar: BluetoothRemoteGATTCharacteristic | null = null
  private status: BleConnectionStatus = 'disconnected'
  private lastMeasurement: LaserMeasurementResult | null = null
  private batteryPercent: number = 100
  private ttsService: LaserTtsService
  private events: LaserBleDriverEvents = {}
  private currentBenchmark: LaserBenchmark = 'rear'

  constructor(events: LaserBleDriverEvents = {}, ttsOptions?: { enabled?: boolean; language?: 'th' | 'en' }) {
    this.events = events
    this.ttsService = new LaserTtsService(ttsOptions)
  }

  public setEvents(events: LaserBleDriverEvents): void {
    this.events = { ...this.events, ...events }
  }

  public getStatus(): BleConnectionStatus {
    return this.status
  }

  public getLastMeasurement(): LaserMeasurementResult | null {
    return this.lastMeasurement
  }

  public getBatteryPercent(): number {
    return this.batteryPercent
  }

  public getBenchmark(): LaserBenchmark {
    return this.currentBenchmark
  }

  public setBenchmark(benchmark: LaserBenchmark): void {
    this.currentBenchmark = benchmark
  }

  public getTtsService(): LaserTtsService {
    return this.ttsService
  }

  public static isWebBluetoothSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator
  }

  /**
   * Triggers the browser's Bluetooth pairing dialog and connects to the Xiaomi Laser.
   */
  public async connect(): Promise<boolean> {
    if (!XiaomiLaserBleDriver.isWebBluetoothSupported()) {
      this.updateStatus('error', 'Web Bluetooth is not supported on this browser. Please use Chrome, Edge, or Kiwi Browser.')
      return false
    }

    try {
      this.updateStatus('scanning', 'Scanning for Xiaomi Smart Laser...')

      if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth is not available on this platform')
      }

      // Request device filter: Name prefix or Mi Service UUID
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'MJJGCJYD' },
          { namePrefix: 'Laser' },
          { namePrefix: 'HOTO' },
          { services: [MI_SERVICE_UUID] },
        ],
        optionalServices: [
          MI_SERVICE_UUID,
          BATTERY_SERVICE_UUID,
          '00000100-0065-6c62-2e74-6f696d2e696d', // MIOT Custom BLE UART
          '0000ffe0-0000-1000-8000-00805f9b34fb',
        ],
      })

      if (!this.device) {
        this.updateStatus('disconnected', 'Device selection canceled.')
        return false
      }

      this.device.addEventListener('gattserverdisconnected', this.handleDisconnected.bind(this))

      this.updateStatus('connecting', `Connecting to ${this.device.name ?? 'Xiaomi Laser'}...`)
      this.server = await this.device.gatt?.connect() ?? null

      if (!this.server) {
        throw new Error('GATT Server connection failed')
      }

      // Discover Services
      await this.discoverAndSubscribeCharacteristics(this.server)

      this.updateStatus('connected', `Connected to ${this.device.name ?? 'Xiaomi Laser'}`)
      return true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[XiaomiLaserBleDriver] Connection error:', err)
      this.updateStatus('error', `Bluetooth Error: ${msg}`)
      return false
    }
  }

  /**
   * Disconnects the active Bluetooth connection.
   */
  public disconnect(): void {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect()
    }
    this.handleDisconnected()
  }

  /**
   * Simulates a laser measurement reception (useful for desktop testing, demos, or offline mock).
   */
  public simulateMeasurement(distanceM: number, benchmark: LaserBenchmark = this.currentBenchmark): LaserMeasurementResult {
    const result: LaserMeasurementResult = {
      distance_mm: Math.round(distanceM * 1000),
      distance_m: Number(distanceM.toFixed(3)),
      benchmark,
      battery_percent: this.batteryPercent,
      timestamp: Date.now(),
      raw_hex: 'SIMULATED',
      is_valid: true,
    }

    this.lastMeasurement = result
    this.currentBenchmark = benchmark
    this.ttsService.speakDistance(result.distance_m)
    this.events.onMeasurement?.(result)
    return result
  }

  private async discoverAndSubscribeCharacteristics(server: BluetoothRemoteGATTServer): Promise<void> {
    const services = await server.getPrimaryServices()

    for (const service of services) {
      // 1. Check Battery Service
      if (service.uuid === BATTERY_SERVICE_UUID || service.uuid.includes('180f')) {
        try {
          const batteryChar = await service.getCharacteristic(BATTERY_LEVEL_CHAR_UUID)
          const value = await batteryChar.readValue()
          this.batteryPercent = value.getUint8(0)
          this.events.onBatteryChange?.(this.batteryPercent)
        } catch (e) {
          console.warn('[XiaomiLaserBleDriver] Failed to read battery level:', e)
        }
      }

      // 2. Discover Notify/Indicate Characteristic for Distance
      const characteristics = await service.getCharacteristics()
      for (const char of characteristics) {
        if (char.properties.notify || char.properties.indicate) {
          try {
            await char.startNotifications()
            char.addEventListener('characteristicvaluechanged', (event: Event) => {
              const target = event.target as BluetoothRemoteGATTCharacteristic
              if (target.value) {
                this.handleCharacteristicValueChanged(target.value)
              }
            })
            console.log(`[XiaomiLaserBleDriver] Subscribed notifications on: ${char.uuid}`)
            this.dataChar = char
          } catch (e) {
            console.warn(`[XiaomiLaserBleDriver] Could not start notifications on ${char.uuid}:`, e)
          }
        }
      }
    }
  }

  private handleCharacteristicValueChanged(value: DataView): void {
    const result = parseXiaomiLaserPacket(value)
    if (result.is_valid) {
      this.lastMeasurement = result
      this.currentBenchmark = result.benchmark
      
      // Announce via Thai/English TTS
      this.ttsService.speakDistance(result.distance_m)
      
      // Notify listeners
      this.events.onMeasurement?.(result)
    }
  }

  private handleDisconnected(): void {
    this.server = null
    this.dataChar = null
    this.updateStatus('disconnected', 'Xiaomi Laser disconnected')
  }

  private updateStatus(status: BleConnectionStatus, message?: string): void {
    this.status = status
    this.events.onStatusChange?.(status, message)
  }
}
