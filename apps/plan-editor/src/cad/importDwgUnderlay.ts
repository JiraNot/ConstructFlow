import { importDwgSvgUnderlay } from './importDwgUnderlay.mjs'

export interface DwgUnderlayImport {
  dataUrl: string
  origin_mm: [number, number]
  scale_mm_per_px: number
  width_px: number
  height_px: number
  drawing_units: string
  imported_entities: number
  skipped_entities: number
}

/** Parses DWG bytes off the UI thread and returns an editable-scale SVG underlay. */
export async function importDwgUnderlay(file: File): Promise<DwgUnderlayImport> {
  if (file.size <= 0) throw new Error('ไฟล์ DWG ว่างเปล่า')
  if (file.size > 100 * 1024 * 1024) throw new Error('ไฟล์ DWG มีขนาดเกิน 100 MB')
  const buffer = await file.arrayBuffer()
  const worker = new Worker(new URL('./libreDwgParser.worker.ts', import.meta.url), { type: 'module' })
  return new Promise((resolve, reject) => {
    worker.onmessage = event => {
      worker.terminate()
      const response = event.data as { ok: true; result: { svg: string; insertionUnits: number; entityCount: number; unsupportedEntities: number } } | { ok: false; error: string }
      if (!response.ok) { reject(new Error(response.error)); return }
      try {
        resolve(importDwgSvgUnderlay(response.result.svg, {
          insertionUnits: response.result.insertionUnits,
          entityCount: response.result.entityCount,
          unsupportedEntities: response.result.unsupportedEntities,
        }) as DwgUnderlayImport)
      } catch (error) {
        reject(error)
      }
    }
    worker.onerror = event => {
      worker.terminate()
      reject(new Error(event.message || 'อ่านไฟล์ DWG ไม่สำเร็จ'))
    }
    worker.postMessage({ buffer }, [buffer])
  })
}
