import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceDir = resolve(root, "apps/sketchup-extension");
const outputDir = resolve(root, "output");
const outputFile = resolve(outputDir, "constructflow.rbz");

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
    }
  }
  return ~crc >>> 0;
}

function getDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  return (dosDate << 16) | dosTime;
}

function collectFiles(dir) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

console.log("Packaging SketchUp Extension (.rbz)...");
const allFiles = collectFiles(sourceDir);
console.log(`Found ${allFiles.length} files in ${sourceDir}`);

const dosTime = getDosDateTime();
const localParts = [];
const centralParts = [];
let offset = 0;

for (const filePath of allFiles) {
  const relPath = relative(sourceDir, filePath).replaceAll("\\", "/");
  const filenameBuf = Buffer.from(relPath, "utf-8");
  const data = readFileSync(filePath);
  const dataCrc = crc32(data);
  const compressed = deflateRawSync(data);

  // Local file header (30 bytes + filename)
  const localHeader = Buffer.alloc(30 + filenameBuf.length);
  localHeader.writeUInt32LE(0x04034b50, 0); // signature
  localHeader.writeUInt16LE(20, 4); // version needed
  localHeader.writeUInt16LE(0, 6); // general purpose bit flag
  localHeader.writeUInt16LE(8, 8); // compression method (deflate)
  localHeader.writeUInt32LE(dosTime, 10); // last mod time & date
  localHeader.writeUInt32LE(dataCrc, 14); // crc-32
  localHeader.writeUInt32LE(compressed.length, 18); // compressed size
  localHeader.writeUInt32LE(data.length, 22); // uncompressed size
  localHeader.writeUInt16LE(filenameBuf.length, 26); // file name length
  localHeader.writeUInt16LE(0, 28); // extra field length
  filenameBuf.copy(localHeader, 30);

  localParts.push(localHeader, compressed);

  // Central directory entry (46 bytes + filename)
  const centralHeader = Buffer.alloc(46 + filenameBuf.length);
  centralHeader.writeUInt32LE(0x02014b50, 0); // signature
  centralHeader.writeUInt16LE(20, 4); // version made by
  centralHeader.writeUInt16LE(20, 6); // version needed
  centralHeader.writeUInt16LE(0, 8); // general purpose bit flag
  centralHeader.writeUInt16LE(8, 10); // compression method (deflate)
  centralHeader.writeUInt32LE(dosTime, 12); // last mod time & date
  centralHeader.writeUInt32LE(dataCrc, 16); // crc-32
  centralHeader.writeUInt32LE(compressed.length, 20); // compressed size
  centralHeader.writeUInt32LE(data.length, 24); // uncompressed size
  centralHeader.writeUInt16LE(filenameBuf.length, 28); // file name length
  centralHeader.writeUInt16LE(0, 30); // extra field length
  centralHeader.writeUInt16LE(0, 32); // file comment length
  centralHeader.writeUInt16LE(0, 34); // disk number start
  centralHeader.writeUInt16LE(0, 36); // internal file attributes
  centralHeader.writeUInt32LE(0, 38); // external file attributes
  centralHeader.writeUInt32LE(offset, 42); // relative offset of local header
  filenameBuf.copy(centralHeader, 46);

  centralParts.push(centralHeader);

  offset += localHeader.length + compressed.length;
}

const centralDirOffset = offset;
let centralDirSize = 0;
for (const c of centralParts) centralDirSize += c.length;

// End of central directory record (22 bytes)
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0); // signature
eocd.writeUInt16LE(0, 4); // number of this disk
eocd.writeUInt16LE(0, 6); // number of disk with start of central directory
eocd.writeUInt16LE(allFiles.length, 8); // total entries on this disk
eocd.writeUInt16LE(allFiles.length, 10); // total entries
eocd.writeUInt32LE(centralDirSize, 12); // size of central directory
eocd.writeUInt32LE(centralDirOffset, 16); // offset of start of central directory
eocd.writeUInt16LE(0, 20); // comment length

const finalBuffer = Buffer.concat([...localParts, ...centralParts, eocd]);
mkdirSync(outputDir, { recursive: true });
writeFileSync(outputFile, finalBuffer);

console.log(`Success! Created SketchUp extension bundle at: ${outputFile} (${(finalBuffer.length / 1024).toFixed(1)} KB)`);
