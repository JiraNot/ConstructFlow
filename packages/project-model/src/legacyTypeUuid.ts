const V5_NAMESPACE = '6770dbfa-ff6e-47e6-b5e8-18c0581970c8'

/** Deterministic RFC-4122 UUID v5 using the ConstructFlow catalog namespace. */
export function legacyTypeUuid(objectType: string, legacyId: string, name: string): string {
  const namespace = V5_NAMESPACE.replaceAll('-', '').match(/.{2}/g)!.map(value => parseInt(value, 16))
  const nameBytes = [...new TextEncoder().encode(`constructflow/catalog/v1/${objectType}/${legacyId}/${name.trim().toLowerCase()}`)]
  const bytes = [...namespace, ...nameBytes]
  const bitLength = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  const high = Math.floor(bitLength / 0x100000000)
  const low = bitLength >>> 0
  for (const value of [high, low]) bytes.push(value >>> 24, value >>> 16 & 255, value >>> 8 & 255, value & 255)

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Uint32Array(80)
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4
      words[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0
    }
    for (let i = 16; i < 80; i++) {
      const value = words[i - 3] ^ words[i - 8] ^ words[i - 14] ^ words[i - 16]
      words[i] = ((value << 1) | (value >>> 31)) >>> 0
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4
    for (let i = 0; i < 80; i++) {
      let f: number, k: number
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999 }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1 }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc }
      else { f = b ^ c ^ d; k = 0xca62c1d6 }
      const rotated = ((a << 5) | (a >>> 27)) >>> 0
      const next = (rotated + f + e + k + words[i]) >>> 0
      e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = next
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0
  }
  const hash = [h0, h1, h2, h3, h4].flatMap(value => [value >>> 24, value >>> 16 & 255, value >>> 8 & 255, value & 255]).slice(0, 16)
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
