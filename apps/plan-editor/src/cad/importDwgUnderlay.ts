import { importDwgSvgUnderlay } from './importDwgUnderlay.mjs'

export interface DwgDrawingCandidate {
  id: string
  name: string
  kind: 'model_space' | 'paper_space'
  svg: string
  entityCount: number
  unsupportedEntities: number
  layers?: string[]
  insertionUnits?: number
  prepared?: {
    dataUrl: string
    origin_mm: [number, number]
    scale_mm_per_px: number
    width_px: number
    height_px: number
    drawing_units: string
    imported_entities: number
    skipped_entities: number
  }
}

export interface DwgUnderlayImport {
  dataUrl: string
  origin_mm: [number, number]
  scale_mm_per_px: number
  width_px: number
  height_px: number
  drawing_units: string
  imported_entities: number
  skipped_entities: number
  source_layout?: string
  source_space?: 'model_space' | 'paper_space'
  source_region?: [number, number, number, number]
}

/** Parses DWG bytes off the UI thread and returns an editable-scale SVG underlay. */
export async function importDwgUnderlayCandidates(file: File): Promise<DwgDrawingCandidate[]> {
  if (file.size <= 0) throw new Error('ไฟล์ว่างเปล่า')
  if (file.size > 100 * 1024 * 1024) throw new Error('ไฟล์มีขนาดเกิน 100 MB')
  if (file.name.toLowerCase().endsWith('.dxf')) {
    const source = await file.text()
    const { importDxfDrawingCandidates } = await import('./importDxfUnderlay.mjs')
    return importDxfDrawingCandidates(source) as DwgDrawingCandidate[]
  }
  const buffer = await file.arrayBuffer()
  const worker = new Worker(new URL('./libreDwgParser.worker.ts', import.meta.url), { type: 'module' })
  return new Promise((resolve, reject) => {
    worker.onmessage = event => {
      worker.terminate()
      const response = event.data as { ok: true; result: { drawings: Array<Omit<DwgDrawingCandidate, 'insertionUnits'>>; insertionUnits: number } } | { ok: false; error: string }
      if (!response.ok) { reject(new Error(response.error)); return }
      try {
        const drawings = response.result.drawings
          .filter(drawing => typeof drawing.svg === 'string' && drawing.svg.includes('<svg'))
          .map(drawing => ({ ...drawing, insertionUnits: response.result.insertionUnits }))
        if (!drawings.length) throw new Error('ไม่พบ Model Space หรือ Layout ที่มีแบบ 2D ให้เลือก')
        resolve(drawings)
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

/** Parses a selected drawing region into the persisted underlay representation. */
export function materializeDwgUnderlay(candidate: DwgDrawingCandidate, normalizedRegion?: [number, number, number, number]): DwgUnderlayImport {
  const root = candidate.svg.match(/<svg\b[^>]*>/i)?.[0]
  const viewBoxValue = root?.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1]
  const viewBox = viewBoxValue?.trim().split(/[\s,]+/).map(Number)
  if (!viewBox || viewBox.length !== 4 || !viewBox.every(Number.isFinite)) throw new Error('ไม่สามารถอ่านขอบเขตแบบจากไฟล์ DWG ได้')
  if (!root) throw new Error('ไม่พบ SVG root สำหรับตัดขอบเขตแปลน')
  const [x, y, width, height] = viewBox
  const normalized = normalizedRegion ?? [0, 0, 1, 1]
  const left = Math.max(0, Math.min(normalized[0], normalized[0] + normalized[2]))
  const top = Math.max(0, Math.min(normalized[1], normalized[1] + normalized[3]))
  const right = Math.min(1, Math.max(normalized[0], normalized[0] + normalized[2]))
  const bottom = Math.min(1, Math.max(normalized[1], normalized[1] + normalized[3]))
  if (right - left < 0.02 || bottom - top < 0.02) throw new Error('กรอบแปลนเล็กเกินไป กรุณาลากเลือกพื้นที่ใหม่')
  const region = [x + width * left, y + height * top, width * (right - left), height * (bottom - top)] as [number, number, number, number]
  const croppedSvg = normalizedRegion
    ? candidate.svg.replace(root, root.replace(/\bviewBox\s*=\s*(["'])[^"']+\1/i, `viewBox="${region.join(' ')}"`))
    : candidate.svg
  if (candidate.prepared) {
    const base = candidate.prepared
    const cropped = !!normalizedRegion
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(croppedSvg)}`
    return {
      ...base,
      dataUrl,
      origin_mm: cropped ? [base.origin_mm[0] + base.scale_mm_per_px * region[0], base.origin_mm[1] - base.scale_mm_per_px * region[1]] as [number, number] : base.origin_mm,
      width_px: cropped ? region[2] : base.width_px,
      height_px: cropped ? region[3] : base.height_px,
      source_space: candidate.kind,
      source_layout: candidate.kind === 'paper_space' ? candidate.name : undefined,
      source_region: cropped ? region : undefined,
    }
  }
  return {
    ...importDwgSvgUnderlay(croppedSvg, {
      insertionUnits: candidate.insertionUnits,
      entityCount: candidate.entityCount,
      unsupportedEntities: candidate.unsupportedEntities,
    }),
    source_layout: candidate.kind === 'paper_space' ? candidate.name : undefined,
    source_space: candidate.kind,
    source_region: normalizedRegion ? region : undefined,
  }
}

/** Backward-compatible single-underlay helper for callers that do not expose a picker. */
export async function importDwgUnderlay(file: File): Promise<DwgUnderlayImport> {
  const candidates = await importDwgUnderlayCandidates(file)
  return materializeDwgUnderlay(candidates[0])
}
