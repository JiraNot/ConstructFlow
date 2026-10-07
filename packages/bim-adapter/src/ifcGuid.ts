// IFC Globally Unique Identifier (GUID) RFC-4122 UUID Conversion
// Based on buildingSMART Standard 22-character Base64 character table:
// 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$

const IFC_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

/**
 * Converts a standard 36-char RFC-4122 UUID string to a 22-character IFC GUID.
 */
export function uuidToIfcGuid(uuid: string): string {
  const clean = uuid.replace(/-/g, "").toLowerCase();
  if (clean.length !== 32) {
    // If not standard 32 hex chars, pad or hash deterministically
    return fallbackIfcGuid(uuid);
  }

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16) || 0;
  }

  let result = "";
  let num = 0;
  let nBits = 0;

  for (let i = 0; i < 16; i++) {
    num = (num << 8) | bytes[i];
    nBits += 8;
    while (nBits >= 6) {
      nBits -= 6;
      const index = (num >> nBits) & 0x3f;
      result += IFC_CHARS[index];
    }
  }

  if (nBits > 0) {
    const index = (num << (6 - nBits)) & 0x3f;
    result += IFC_CHARS[index];
  }

  return result.slice(0, 22).padEnd(22, "0");
}

function fallbackIfcGuid(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  let out = "";
  for (let i = 0; i < 22; i++) {
    out += IFC_CHARS[Math.abs(hash + i * 31) % 64];
  }
  return out;
}
