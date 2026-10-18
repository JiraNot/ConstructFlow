export type LaserBenchmark = 'front' | 'rear'

export interface LaserMeasurementResult {
  /** Distance in canonical model millimeters */
  distance_mm: number
  /** Distance in meters formatted to 3 decimal places */
  distance_m: number
  /** Reference benchmark: front of laser or rear (base) */
  benchmark: LaserBenchmark
  /** Battery percentage if reported (0-100) */
  battery_percent?: number
  /** Timestamp when packet was received */
  timestamp: number
  /** Raw hexadecimal payload string */
  raw_hex: string
  /** Whether the measurement is stable and valid */
  is_valid: boolean
}

/**
 * Parses raw GATT notification bytes from Xiaomi / HOTO Smart Laser Measure (MJJGCJYD001QW).
 * The device transmits distance payloads either as:
 * 1. 4-byte little-endian IEEE-754 float in meters (e.g. [0x9A, 0x99, 0x59, 0x40] = 3.4m)
 * 2. 4-byte little-endian unsigned integer in millimeters (e.g. [0x48, 0x0D, 0x00, 0x00] = 3400mm)
 * 3. Structured MIOT frame: [Header, Cmd, BenchmarkFlag (0=Front, 1=Rear), DistByte0..3, Checksum]
 */
export function parseXiaomiLaserPacket(rawBytes: Uint8Array | DataView): LaserMeasurementResult {
  const bytes = rawBytes instanceof DataView 
    ? new Uint8Array(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength)
    : rawBytes

  const hexString = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ')

  if (bytes.length === 0) {
    return {
      distance_mm: 0,
      distance_m: 0,
      benchmark: 'rear',
      timestamp: Date.now(),
      raw_hex: '',
      is_valid: false,
    }
  }

  let distanceMm = 0
  let benchmark: LaserBenchmark = 'rear'

  // Pattern A: Structured MIOT Packet (>= 5 bytes)
  // Format: [0xAA / 0x55 / 0xA4, Flag/Benchmark, D0, D1, D2, D3, ...]
  if (bytes.length >= 6 && (bytes[0] === 0xAA || bytes[0] === 0xA4 || bytes[0] === 0x55)) {
    // Byte 1: benchmark flag (0 = front, 1 = rear)
    benchmark = (bytes[1] & 0x01) === 0x00 ? 'front' : 'rear'
    
    // Check if next 4 bytes are Float32 or Int32
    const view = new DataView(bytes.buffer, bytes.byteOffset + 2, 4)
    const possibleFloat = view.getFloat32(0, true) // little-endian float in meters
    const possibleInt = view.getUint32(0, true)    // little-endian int in mm

    if (possibleFloat > 0.04 && possibleFloat < 60.0 && !Number.isNaN(possibleFloat)) {
      distanceMm = Math.round(possibleFloat * 1000)
    } else if (possibleInt >= 40 && possibleInt <= 60000) {
      distanceMm = possibleInt
    }
  }
  // Pattern B: Raw 4-Byte Payload (Little-Endian Float32 or Int32)
  else if (bytes.length === 4) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, 4)
    const floatVal = view.getFloat32(0, true)
    const intVal = view.getUint32(0, true)

    if (floatVal > 0.04 && floatVal < 60.0 && !Number.isNaN(floatVal)) {
      distanceMm = Math.round(floatVal * 1000)
    } else if (intVal >= 40 && intVal <= 60000) {
      distanceMm = intVal
    }
  }
  // Pattern C: 2-Byte Payload (Centimeters or Decimeters)
  else if (bytes.length === 2) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, 2)
    const val = view.getUint16(0, true)
    // Could be mm or cm
    distanceMm = val > 1000 ? val : val * 10
  }

  const distanceM = Number((distanceMm / 1000).toFixed(3))
  const isValid = distanceMm >= 40 && distanceMm <= 45000 // 0.04m - 45m range

  return {
    distance_mm: distanceMm,
    distance_m: distanceM,
    benchmark,
    timestamp: Date.now(),
    raw_hex: hexString,
    is_valid: isValid,
  }
}

/**
 * Creates a simulated measurement packet for testing or demo purposes without hardware.
 */
export function createSimulatedLaserPacket(distanceM: number, benchmark: LaserBenchmark = 'rear'): Uint8Array {
  const buffer = new ArrayBuffer(7)
  const view = new DataView(buffer)
  view.setUint8(0, 0xAA) // Header
  view.setUint8(1, benchmark === 'front' ? 0x00 : 0x01)
  view.setFloat32(2, distanceM, true) // 4 bytes little endian float
  view.setUint8(6, 0xEE) // Checksum footer
  return new Uint8Array(buffer)
}
