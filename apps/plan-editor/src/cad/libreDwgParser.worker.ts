import { createModule, Dwg_File_Type, LibreDwg } from '@mlightcad/libredwg-web'
import wasmUrl from '../../node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm?url'

type DwgRequest = { buffer: ArrayBuffer }
type DwgResponse = { svg: string; insertionUnits: number; entityCount: number; unsupportedEntities: number }

let libreDwgPromise: Promise<Awaited<ReturnType<typeof LibreDwg.create>>> | null = null

self.addEventListener('message', event => {
  const request = event.data as DwgRequest
  void parseDwg(request).then(result => self.postMessage({ ok: true, result } as { ok: true; result: DwgResponse }))
    .catch(error => self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) }))
})

async function parseDwg({ buffer }: DwgRequest): Promise<DwgResponse> {
  libreDwgPromise ??= fetch(wasmUrl).then(response => {
    if (!response.ok) throw new Error(`โหลด LibreDWG WebAssembly ไม่สำเร็จ (${response.status})`)
    return response.arrayBuffer()
  }).then(wasmBinary => createModule({ wasmBinary })).then(wasmInstance => LibreDwg.createByWasmInstance(wasmInstance))
  const parser = await libreDwgPromise
  const data = parser.dwg_read_data(buffer, Dwg_File_Type.DWG)
  if (!data) throw new Error('ไม่สามารถถอดรหัสไฟล์ DWG ได้')
  try {
    const { database, stats } = parser.convertEx(data)
    const svg = parser.dwg_to_svg(database)
    return {
      svg,
      insertionUnits: Number(database.header.INSUNITS ?? 0),
      entityCount: database.entities.length,
      unsupportedEntities: stats.unknownEntityCount,
    }
  } finally {
    parser.dwg_free(data)
  }
}

export {}
