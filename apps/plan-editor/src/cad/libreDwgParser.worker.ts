import { dwgDatabaseToDxf } from './dwgDatabaseToDxf.mjs'
import { createModule, Dwg_File_Type, LibreDwg } from '@mlightcad/libredwg-web'
import wasmUrl from '../../node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm?url'

type DwgRequest = { buffer: ArrayBuffer; editable?: boolean }
type DwgDrawing = { id: string; name: string; kind: 'model_space' | 'paper_space'; svg: string; entityCount: number; unsupportedEntities: number; layers: string[] }
type DwgResponse = { drawings: DwgDrawing[]; insertionUnits: number; entityCount: number; unsupportedEntities: number; dxf?: string }

let libreDwgPromise: Promise<Awaited<ReturnType<typeof LibreDwg.create>>> | null = null

self.addEventListener('message', event => {
  const request = event.data as DwgRequest
  void parseDwg(request).then(result => self.postMessage({ ok: true, result } as { ok: true; result: DwgResponse }))
    .catch(error => self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) }))
})

async function parseDwg({ buffer, editable }: DwgRequest): Promise<DwgResponse> {
  libreDwgPromise ??= fetch(wasmUrl).then(response => {
    if (!response.ok) throw new Error(`โหลด LibreDWG WebAssembly ไม่สำเร็จ (${response.status})`)
    return response.arrayBuffer()
  }).then(wasmBinary => createModule({ wasmBinary })).then(wasmInstance => LibreDwg.createByWasmInstance(wasmInstance))
  const parser = await libreDwgPromise
  const data = parser.dwg_read_data(buffer, Dwg_File_Type.DWG)
  if (!data) throw new Error('ไม่สามารถถอดรหัสไฟล์ DWG ได้')
  try {
    const { database, stats } = parser.convertEx(data)
    const native = editable ? dwgDatabaseToDxf(database) : undefined
    const modelBlock = database.tables.BLOCK_RECORD.entries.find(block => block.name.toUpperCase() === '*MODEL_SPACE')
    const drawings: DwgDrawing[] = []
    if (modelBlock) {
      drawings.push({
        id: 'model-space',
        name: 'Model Space',
        kind: 'model_space',
        svg: parser.dwg_to_svg(database),
        entityCount: modelBlock.entities.length,
        unsupportedEntities: stats.unknownEntityCount,
        layers: [...new Set(modelBlock.entities.map(entity => entity.layer).filter(Boolean))].sort(),
      })
    }
    const paperLayouts = [...database.objects.LAYOUT]
      .filter(layout => layout.layoutName && layout.layoutName.toLowerCase() !== 'model')
      .sort((a, b) => a.tabOrder - b.tabOrder)
    for (const layout of paperLayouts) {
      const paperBlock = database.tables.BLOCK_RECORD.entries.find(block =>
        block.handle === layout.paperSpaceTableId || block.layout === layout.handle)
      if (!paperBlock?.entities?.length) continue
      const isolated = {
        ...database,
        entities: paperBlock.entities,
        tables: {
          ...database.tables,
          BLOCK_RECORD: {
            entries: database.tables.BLOCK_RECORD.entries
              .filter(block => block !== modelBlock && block !== paperBlock)
              .concat({ ...paperBlock, name: '*MODEL_SPACE' }),
          },
        },
      }
      try {
        drawings.push({
          id: `layout:${layout.handle}`,
          name: layout.layoutName,
          kind: 'paper_space',
          svg: parser.dwg_to_svg(isolated),
          entityCount: paperBlock.entities.length,
          unsupportedEntities: 0,
          layers: [...new Set(paperBlock.entities.map(entity => entity.layer).filter(Boolean))].sort(),
        })
      } catch { /* A malformed layout should not prevent importing the remaining drawing spaces. */ }
    }
    return {
      drawings,
      ...(native ? { dxf: native.dxf } : {}),
      insertionUnits: Number(database.header.INSUNITS ?? 0),
      entityCount: database.entities.length,
      unsupportedEntities: stats.unknownEntityCount + (native?.skipped ?? 0),
    }
  } finally {
    parser.dwg_free(data)
  }
}

export {}
