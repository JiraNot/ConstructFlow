import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { brotliCompress, constants, gzip } from 'node:zlib'
import { promisify } from 'node:util'

const brotliCompressAsync = promisify(brotliCompress)
const gzipAsync = promisify(gzip)
const compressibleExtensions = new Set(['.css', '.js', '.json', '.svg', '.wasm'])
const root = process.argv[2]
let totalSourceBytes = 0
let totalBrotliBytes = 0
let totalWasmGzipBytes = 0
let compressedFileCount = 0

if (!root) throw new Error('Usage: node scripts/compress-static-assets.mjs <directory>')

async function compressDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      await compressDirectory(path)
      continue
    }

    if (!entry.isFile() || !compressibleExtensions.has(extname(entry.name))) continue
    const source = await readFile(path)
    const compressed = await brotliCompressAsync(source, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_LGWIN]: 22,
      },
    })
    await writeFile(`${path}.br`, compressed)
    totalSourceBytes += source.byteLength
    totalBrotliBytes += compressed.byteLength
    compressedFileCount += 1

    if (extname(entry.name) === '.wasm') {
      const gzipCompressed = await gzipAsync(source, { level: 9 })
      await writeFile(`${path}.gz`, gzipCompressed)
      totalWasmGzipBytes += gzipCompressed.byteLength
    }
  }
}

const rootInfo = await stat(root)
if (!rootInfo.isDirectory()) throw new Error(`Not a directory: ${root}`)
await compressDirectory(root)
console.log(`Brotli quality 11: ${compressedFileCount} files, ${totalSourceBytes} -> ${totalBrotliBytes} bytes`)
if (totalWasmGzipBytes) console.log(`WASM gzip fallback: ${totalWasmGzipBytes} bytes`)
