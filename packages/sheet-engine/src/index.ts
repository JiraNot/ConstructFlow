import { getDisplayPhase, isMasonryWallPlanHatch, resolveCatalogType, type ProjectDocument } from '@constructflow/project-model'
import { wallMasonryHatchSegments } from '@constructflow/geometry-kernel'
export * from './permit.js'
/** Load font shaping and PDF libraries only when PDF export is requested. */
export async function compilePermitPdf(...args: Parameters<typeof import('./pdf.js').compilePermitPdf>) {
  return (await import('./pdf.js')).compilePermitPdf(...args)
}

export type SheetId = 'A-02' | 'S-01' | 'A-08'
export interface CompiledSheet { id: SheetId; title: string; scale: string; svg: string }
export interface CompiledDrawingSet { project_id: string; sheets: CompiledSheet[]; warnings: string[] }
type Data = Record<string, any>

const PAGE_W = 420
const PAGE_H = 297
const colors = { existing: '#94a3b8', demolition: '#ef4444', new_construction: '#0f172a' }
const escapeXml = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

function objectsAtLevel(project: ProjectDocument, levelId: string) {
  const objects = Object.values(project.objects)
  const byId = project.objects
  const levelFor = (object: ProjectDocument['objects'][string], seen = new Set<string>()): string | undefined => {
    if (seen.has(object.id)) return undefined
    seen.add(object.id)
    const data = object.module_data as Data
    if (typeof data.level_id === 'string') return data.level_id
    if (typeof data.base_level_id === 'string') return data.base_level_id
    const explicit = object.level_refs.find(ref => ref.role === 'base_level' || ref.role === 'host_level')?.level_id
    if (explicit) return explicit
    const hostId = object.host_refs[0] ?? data.supported_column_id
    if (typeof hostId === 'string' && hostId && byId[hostId]) return levelFor(byId[hostId], seen)
    return undefined
  }
  return objects.filter(object => levelFor(object) === levelId)
}

function groundLevelId(project: ProjectDocument): string {
  return [...project.levels].sort((a, b) => a.elevation_mm - b.elevation_mm)[0]?.id ?? project.project.active_level_id
}

function pageFrame(project: ProjectDocument, id: SheetId, title: string, scale: string, content: string, notes: string, scope: string): CompiledSheet {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="297mm" viewBox="0 0 420 297">
  <defs><pattern id="demo-hatch" width="3" height="3" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><path d="M0 0V3" stroke="#ef4444" stroke-width="0.35"/></pattern><marker id="dim-arrow" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto-start-reverse"><path d="M4 0L0 2L4 4" fill="none" stroke="#334155" stroke-width="0.55"/></marker></defs>
  <rect width="420" height="297" fill="white"/><rect x="7" y="7" width="406" height="283" fill="none" stroke="#111827" stroke-width="0.35"/>
  <text x="14" y="15" font-family="Arial,sans-serif" font-size="3.2" font-weight="700">CONSTRUCTFLOW · ${escapeXml(project.project.name)}</text>
  <text x="14" y="21" font-family="Arial,sans-serif" font-size="2.4" fill="#475569">${escapeXml(project.project.id)} · SCOPE ${escapeXml(scope)} · GENERATED FROM PROJECT MODEL</text>
  ${content}
  <rect x="275" y="254" width="138" height="36" fill="none" stroke="#111827" stroke-width="0.35"/>
  <path d="M275 267H413 M275 278H413 M374 254V290" fill="none" stroke="#111827" stroke-width="0.25"/>
  <text x="279" y="261" font-family="Arial,sans-serif" font-size="3.3" font-weight="700">${escapeXml(title)}</text>
  <text x="279" y="274" font-family="Arial,sans-serif" font-size="2.7">SCALE ${escapeXml(scale)} · A3 LANDSCAPE</text>
  <text x="279" y="285" font-family="Arial,sans-serif" font-size="2.2">${escapeXml(project.project.name)} · ${escapeXml(project.project.id)}</text>
  <text x="379" y="263" font-family="Arial,sans-serif" font-size="5" font-weight="700">${id}</text>
  <text x="379" y="285" font-family="Arial,sans-serif" font-size="2.5">CF · v2</text>
  ${notes}
  </svg>`
  return { id, title, scale, svg }
}

function planTransform(project: ProjectDocument, view: { x: number; y: number; width: number; height: number }, sourceObjects = Object.values(project.objects)) {
  const points: [number, number][] = []
  for (const object of sourceObjects) {
    const data = object.module_data as Data
    if (Array.isArray(data.start_point_mm) && Array.isArray(data.end_point_mm)) {
      points.push([data.start_point_mm[0], data.start_point_mm[1]], [data.end_point_mm[0], data.end_point_mm[1]])
    } else if (Array.isArray(data.location_mm)) {
      const [w, d] = data.section_mm ?? [200, 200]
      points.push([data.location_mm[0] - w / 2, data.location_mm[1] - d / 2], [data.location_mm[0] + w / 2, data.location_mm[1] + d / 2])
    } else if (Array.isArray(data.center_mm)) {
      const [w, d] = data.size_mm ?? [200, 200]
      points.push([data.center_mm[0] - w / 2, data.center_mm[1] - d / 2], [data.center_mm[0] + w / 2, data.center_mm[1] + d / 2])
    }
  }
  if (!points.length) points.push([0, 0], [4000, 2500])
  const minX = Math.min(...points.map(point => point[0])), maxX = Math.max(...points.map(point => point[0]))
  const minY = Math.min(...points.map(point => point[1])), maxY = Math.max(...points.map(point => point[1]))
  const extentX = Math.max(maxX - minX, 1000), extentY = Math.max(maxY - minY, 1000)
  // A-02 and S-01 are contractually fixed at 1:100. Warn instead of silently
  // changing scale; the model extents are still centered in the viewport.
  const scale = 0.01
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2
  return {
    scale,
    map: (x: number, y: number): [number, number] => [view.x + view.width / 2 + (x - centerX) * scale, view.y + view.height / 2 - (y - centerY) * scale],
    extentX, extentY, minX, minY, maxX, maxY,
  }
}

function phaseStyle(phase: string): { color: string; dash: string; width: number; opacity: number } {
  return {
    color: colors[phase as keyof typeof colors] ?? colors.new_construction,
    dash: phase === 'demolition' ? ' stroke-dasharray="1.5,0.75"' : '',
    width: phase === 'demolition' ? 1.5 : phase === 'new_construction' ? 2 : 1,
    opacity: phase === 'existing' ? 0.6 : 1,
  }
}

function openingDimensions(project: ProjectDocument, object: ProjectDocument['objects'][string]) {
  return {
    width: Number(catalogValue(project, object, 'width_mm') ?? 0),
    height: Number(catalogValue(project, object, 'height_mm') ?? 0),
    sill: object.object_type === 'door_window.window' ? Number(catalogValue(project, object, 'sill_height_mm') ?? 0) : 0,
  }
}

function catalogValue(project: ProjectDocument, object: ProjectDocument['objects'][string], field: string): unknown {
  const data = object.module_data as Data
  const type = resolveCatalogType(project, object.object_type, data.type_id ?? data.mark)
  const parameters = type?.parameters ?? {}
  const overrides = data.instance_overrides ?? {}
  return overrides[field] ?? data[field] ?? parameters[field]
}

function compileArchitecturePlan(project: ProjectDocument, warnings: string[]): CompiledSheet {
  const view = { x: 15, y: 28, width: 258, height: 215 }
  const levelId = groundLevelId(project)
  const levelObjects = objectsAtLevel(project, levelId)
  const transform = planTransform(project, view, levelObjects)
  const walls = levelObjects.filter(object => object.object_type === 'architecture.wall')
  const openings = levelObjects.filter(object => object.object_type === 'door_window.door' || object.object_type === 'door_window.window')
  const dimensionBounds = walls.length ? planTransform(project, view, walls) : transform
  const elements: string[] = []
  elements.push(`<rect x="${view.x}" y="${view.y}" width="${view.width}" height="${view.height}" fill="none" stroke="#94a3b8" stroke-width="0.25"/>`)
  elements.push(`<text x="${view.x + 3}" y="${view.y + 7}" font-size="2.8" font-family="Arial,sans-serif" font-weight="700">GROUND FLOOR PLAN · ${escapeXml(levelId)}</text>`)
  for (const wall of walls) {
    const data = wall.module_data as Data
    const [x1, y1] = transform.map(data.start_point_mm[0], data.start_point_mm[1])
    const [x2, y2] = transform.map(data.end_point_mm[0], data.end_point_mm[1])
    const length = Math.hypot(x2 - x1, y2 - y1)
    const ux = (x2 - x1) / Math.max(length, 0.001), uy = (y2 - y1) / Math.max(length, 0.001)
    const displayPhase = getDisplayPhase(wall)
    const style = phaseStyle(displayPhase)
    const hosted = openings.filter(opening => (opening.module_data as Data).wall_id === wall.id)
      .map(opening => {
        const openingData = opening.module_data as Data
        const dimensions = openingDimensions(project, opening)
        return { object: opening, offset: Number(openingData.offset_along_wall_mm ?? 0) * transform.scale, width: dimensions.width * transform.scale }
      }).filter(opening => opening.width > 0)
    const intervals: [number, number][] = hosted.map(opening => [Math.max(0, opening.offset - opening.width / 2), Math.min(length, opening.offset + opening.width / 2)] as [number, number])
      .filter(interval => interval[1] > interval[0]).sort((a, b) => a[0] - b[0])
    const hasMasonryHatch = displayPhase === 'new_construction' && isMasonryWallPlanHatch(wall, project.types)
    let cursor = 0
    const drawSegment = (from: number, to: number) => {
      if (to <= from) return
      const wallWidth = Math.max(Number(data.thickness_mm ?? 100) * transform.scale, 0.65)
      const nx = -uy, ny = ux, half = wallWidth / 2
      const ax = x1 + ux * from, ay = y1 + uy * from, bx = x1 + ux * to, by = y1 + uy * to
      const path = `M${ax + nx * half},${ay + ny * half} L${bx + nx * half},${by + ny * half} L${bx - nx * half},${by - ny * half} L${ax - nx * half},${ay - ny * half} Z`
      const fill = displayPhase === 'demolition' ? 'url(#demo-hatch)' : displayPhase === 'existing' ? '#ffffff' : '#e2e8f0'
      elements.push(`<path d="${path}" fill="${fill}" stroke="${style.color}" stroke-opacity="${style.opacity}" stroke-width="${Math.max(style.width * 0.2, 0.18)}"${style.dash}/>`)
    }
    for (const [start, end] of intervals) { drawSegment(cursor, start); cursor = Math.max(cursor, end) }
    drawSegment(cursor, length)
    if (hasMasonryHatch) {
      const worldStart = data.start_point_mm as [number, number, number]
      const worldEnd = data.end_point_mm as [number, number, number]
      const hatch = wallMasonryHatchSegments(
        [worldStart[0], worldStart[1]], [worldEnd[0], worldEnd[1]], Number(data.thickness_mm ?? 100),
        hosted.map(opening => [opening.offset / transform.scale - opening.width / transform.scale / 2,
          opening.offset / transform.scale + opening.width / transform.scale / 2]),
      )
      for (const [a, b] of hatch) {
        const [hx1, hy1] = transform.map(a[0], a[1]), [hx2, hy2] = transform.map(b[0], b[1])
        elements.push(`<path d="M${hx1},${hy1} L${hx2},${hy2}" fill="none" stroke="#9aa6b4" stroke-width="0.18"/>`)
      }
    }
    elements.push(`<text x="${(x1 + x2) / 2 + 1.2}" y="${(y1 + y2) / 2 - 1.2}" font-size="2.3" fill="${style.color}" font-family="Arial,sans-serif">${escapeXml(data.mark)}</text>`)
  }
  for (const object of levelObjects) {
    const data = object.module_data as Data
    const displayPhase = getDisplayPhase(object)
    const style = phaseStyle(displayPhase)
    if (object.object_type === 'structure.column') {
      const [x, y] = transform.map(data.location_mm[0], data.location_mm[1]); const size = Math.max(Number(data.section_mm?.[0] ?? 200) * transform.scale, 1.1)
      elements.push(`<rect x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" fill="${displayPhase === 'demolition' ? 'url(#demo-hatch)' : displayPhase === 'existing' ? style.color : 'white'}" fill-opacity="${displayPhase === 'existing' ? '0.4' : '1'}" stroke="${style.color}" stroke-opacity="${style.opacity}" stroke-width="${style.width * 0.35}"${style.dash}/>`)
      elements.push(`<text x="${x + size}" y="${y - size}" font-size="2.2" fill="${style.color}">${escapeXml(data.mark)}</text>`)
    } else if (object.object_type === 'door_window.door' || object.object_type === 'door_window.window') {
      const host = project.objects[data.wall_id]
      if (!host) { warnings.push(`${data.mark ?? object.id}: opening host wall is missing`); continue }
      const wallData = host.module_data as Data
      const [x1, y1] = transform.map(wallData.start_point_mm[0], wallData.start_point_mm[1])
      const [x2, y2] = transform.map(wallData.end_point_mm[0], wallData.end_point_mm[1])
      const length = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / Math.max(length, 0.001), uy = (y2 - y1) / Math.max(length, 0.001)
      const center = Number(data.offset_along_wall_mm ?? 0) * transform.scale
      const half = openingDimensions(project, object).width * transform.scale / 2
      const px = x1 + ux * center, py = y1 + uy * center
      elements.push(`<path d="M${px - ux * half},${py - uy * half} L${px + ux * half},${py + uy * half}" stroke="${style.color}" stroke-width="0.7"/>`)
      if (object.object_type === 'door_window.window') elements.push(`<path d="M${px - ux * half},${py - uy * half - 0.9} L${px + ux * half},${py + uy * half - 0.9}" stroke="${style.color}" stroke-width="0.35"/>`)
      elements.push(`<text x="${px + 1}" y="${py - 1}" font-size="2.1" fill="${style.color}">${escapeXml(data.mark)}</text>`)
    } else if (object.object_type === 'structure.beam') {
      const [x1, y1] = transform.map(data.start_point_mm[0], data.start_point_mm[1]); const [x2, y2] = transform.map(data.end_point_mm[0], data.end_point_mm[1])
      elements.push(`<path d="M${x1},${y1} L${x2},${y2}" stroke="${style.color}" stroke-opacity="${style.opacity}" stroke-width="${style.width * 0.35}"${style.dash}/>`)
    }
  }
  const widthText = `${(dimensionBounds.extentX / 1000).toFixed(2)} m`
  const depthText = `${(dimensionBounds.extentY / 1000).toFixed(2)} m`
  const [dimX1, dimY] = transform.map(dimensionBounds.minX, dimensionBounds.minY - 280)
  const [dimX2] = transform.map(dimensionBounds.maxX, dimensionBounds.minY - 280)
  const [dimVerticalX, dimY1] = transform.map(dimensionBounds.minX - 280, dimensionBounds.minY)
  const [, dimY2] = transform.map(dimensionBounds.minX - 280, dimensionBounds.maxY)
  const dimensionLabel = walls.length ? 'Envelope extents' : 'Model extents'
  elements.push(`<path d="M${dimX1},${dimY} L${dimX2},${dimY}" fill="none" stroke="#334155" stroke-width="0.25" marker-start="url(#dim-arrow)" marker-end="url(#dim-arrow)"/><text x="${(dimX1 + dimX2) / 2}" y="${dimY - 1.2}" text-anchor="middle" font-size="2.4" fill="#334155">${widthText}</text>`)
  elements.push(`<path d="M${dimVerticalX},${dimY1} L${dimVerticalX},${dimY2}" fill="none" stroke="#334155" stroke-width="0.25" marker-start="url(#dim-arrow)" marker-end="url(#dim-arrow)"/><text x="${dimVerticalX - 1.2}" y="${(dimY1 + dimY2) / 2}" text-anchor="end" font-size="2.4" fill="#334155" transform="rotate(-90 ${dimVerticalX - 1.2} ${(dimY1 + dimY2) / 2})">${depthText}</text>`)
  elements.push(`<text x="${view.x + 3}" y="${view.y + view.height - 4}" font-size="2.4" fill="#475569">${dimensionLabel} ${widthText} × ${depthText} · Phases: Existing / Demolition / New</text>`)
  const noteContent = `<text x="285" y="37" font-family="Arial,sans-serif" font-size="3" font-weight="700">GENERAL NOTES</text>
  <text x="285" y="44" font-family="Arial,sans-serif" font-size="2.5">A-02 · Architectural floor plan</text>
  <text x="285" y="50" font-family="Arial,sans-serif" font-size="2.4">Ground level: ${escapeXml(levelId)}</text>
  <text x="285" y="56" font-family="Arial,sans-serif" font-size="2.4">Wall objects: ${walls.length}</text>
  <text x="285" y="62" font-family="Arial,sans-serif" font-size="2.4">Hosted openings: ${openings.length}</text>
  <text x="285" y="74" font-family="Arial,sans-serif" font-size="2.5" fill="#64748b">Phase legend</text>
  <path d="M285 81h12" stroke="#94a3b8" stroke-width="0.35" stroke-opacity="0.6"/><text x="300" y="82" font-size="2.5">Existing · 1px · 40% fill</text>
  <path d="M285 88h12" stroke="#ef4444" stroke-width="0.525" stroke-dasharray="1.5,0.75"/><text x="300" y="89" font-size="2.5">Demolition · dashed / hatch</text>
  <path d="M285 95h12" stroke="#0f172a" stroke-width="0.7"/><text x="300" y="96" font-size="2.5">New · 2px</text>`
  if (transform.extentX > 21000 || transform.extentY > 16800) warnings.push('A-02 model extents exceed the 1:100 viewport; content may be clipped.')
  const levelName = project.levels.find(level => level.id === levelId)?.name
  return pageFrame(project, 'A-02', 'PHASED FLOOR PLAN', '1:100', elements.join(''), noteContent, levelName ? `${levelId} · ${levelName}` : levelId)
}

function compileFoundationPlan(project: ProjectDocument, warnings: string[]): CompiledSheet {
  const view = { x: 15, y: 28, width: 258, height: 215 }
  const levelId = groundLevelId(project)
  const levelObjects = objectsAtLevel(project, levelId)
  const transform = planTransform(project, view, levelObjects)
  const elements: string[] = [`<rect x="${view.x}" y="${view.y}" width="${view.width}" height="${view.height}" fill="none" stroke="#94a3b8" stroke-width="0.25"/>`]
  const grids = levelObjects.filter(object => object.object_type === 'structure.grid')
  for (const grid of grids) {
    const data = grid.module_data as Data
    if (Array.isArray(data.start_point_mm) && Array.isArray(data.end_point_mm)) {
      const [x1, y1] = transform.map(data.start_point_mm[0], data.start_point_mm[1])
      const [x2, y2] = transform.map(data.end_point_mm[0], data.end_point_mm[1])
      elements.push(`<path d="M${x1},${y1}L${x2},${y2}" stroke="#cbd5e1" stroke-width="0.25" stroke-dasharray="1,1"/><circle cx="${x1}" cy="${y1}" r="3" fill="white" stroke="#64748b" stroke-width="0.3"/><text x="${x1}" y="${y1 + 0.8}" text-anchor="middle" font-size="2.1">${escapeXml(data.tag)}</text>`)
    } else if (data.orientation === 'vertical') {
      const [x] = transform.map(data.position_mm, 0)
      elements.push(`<path d="M${x},${view.y + 12}V${view.y + view.height - 12}" stroke="#cbd5e1" stroke-width="0.25" stroke-dasharray="1,1"/><circle cx="${x}" cy="${view.y + 10}" r="3" fill="white" stroke="#64748b" stroke-width="0.3"/><text x="${x}" y="${view.y + 11}" text-anchor="middle" font-size="2.1">${escapeXml(data.tag)}</text>`)
    } else {
      const [, y] = transform.map(0, data.position_mm)
      elements.push(`<path d="M${view.x + 10},${y}H${view.x + view.width - 10}" stroke="#cbd5e1" stroke-width="0.25" stroke-dasharray="1,1"/><circle cx="${view.x + view.width - 8}" cy="${y}" r="3" fill="white" stroke="#64748b" stroke-width="0.3"/><text x="${view.x + view.width - 8}" y="${y + 0.8}" text-anchor="middle" font-size="2.1">${escapeXml(data.tag)}</text>`)
    }
  }
  let foundationCount = 0, columnCount = 0
  for (const object of levelObjects) {
    const data = object.module_data as Data; const displayPhase = getDisplayPhase(object); const style = phaseStyle(displayPhase)
    if (object.object_type === 'structure.foundation') {
      const foundationType = catalogValue(project, object, 'foundation_type')
      const pileOffsets = catalogValue(project, object, 'pile_offsets_mm')
      const pileType = catalogValue(project, object, 'pile_type')
      const pileLength = catalogValue(project, object, 'pile_length_mm')
      const [x, y] = transform.map(data.center_mm[0], data.center_mm[1]); const [w, d] = data.size_mm
      const width = Math.max(w * transform.scale, 2.3), height = Math.max(d * transform.scale, 2.3)
      const fill = displayPhase === 'demolition' ? 'url(#demo-hatch)' : displayPhase === 'existing' ? style.color : 'white'
      const fillOpacity = displayPhase === 'existing' ? '0.4' : '1'
      elements.push(`<rect x="${x - width / 2}" y="${y - height / 2}" width="${width}" height="${height}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${style.color}" stroke-opacity="${style.opacity}" stroke-width="${style.width * 0.35}"${style.dash}/>`)
      if (foundationType === 'pile_cap' && Array.isArray(pileOffsets) && typeof pileType === 'string') {
        const offsets = pileOffsets as [number, number][]
        offsets.forEach(([offsetX, offsetY]) => {
          const [pileX, pileY] = transform.map(data.center_mm[0] + offsetX, data.center_mm[1] + offsetY)
          elements.push(`<circle cx="${pileX}" cy="${pileY}" r="1.15" fill="white" stroke="${style.color}" stroke-width="0.45"/>`)
        })
        elements.push(`<text x="${x - width / 2}" y="${y + height / 2 + 2.7}" font-size="1.9" fill="${style.color}">${escapeXml(pileType)} × ${offsets.length}</text>`)
      }
      elements.push(`<text x="${x + width / 2 + 1}" y="${y}" font-size="2.3" fill="${style.color}">${escapeXml(data.mark)}</text>`); foundationCount++
    } else if (object.object_type === 'structure.column') {
      const [x, y] = transform.map(data.location_mm[0], data.location_mm[1]); const size = Math.max(Number(data.section_mm?.[0] ?? 200) * transform.scale, 1.1)
      const fill = displayPhase === 'demolition' ? 'url(#demo-hatch)' : displayPhase === 'existing' ? style.color : 'white'
      elements.push(`<rect x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" fill="${fill}" fill-opacity="${displayPhase === 'existing' ? '0.4' : '1'}" stroke="${style.color}" stroke-opacity="${style.opacity}" stroke-width="${style.width * 0.35}"${style.dash}/>`)
      elements.push(`<text x="${x + size}" y="${y + size + 1}" font-size="2.1" fill="${style.color}">${escapeXml(data.mark)}</text>`); columnCount++
    }
  }
  if (!foundationCount && !columnCount) warnings.push('S-01 contains no foundations or columns in this project.')
  const foundationObjects = levelObjects.filter(object => object.object_type === 'structure.foundation')
  if (foundationObjects.length > 10) warnings.push(`S-01 has ${foundationObjects.length} foundations; only the first 10 are listed in the note block.`)
  const notes = `<text x="285" y="37" font-family="Arial,sans-serif" font-size="3" font-weight="700">FOUNDATION PLAN</text>
  <text x="285" y="44" font-family="Arial,sans-serif" font-size="2.5">Foundations: ${foundationCount}</text>
  <text x="285" y="50" font-family="Arial,sans-serif" font-size="2.5">Columns: ${columnCount}</text>
  <text x="285" y="56" font-family="Arial,sans-serif" font-size="2.5">Grid lines: ${grids.length}</text>
  <text x="285" y="68" font-family="Arial,sans-serif" font-size="2.4" fill="#64748b">Foundation dimensions and levels</text>
  ${foundationObjects.slice(0, 10).map((object, index) => {
    const data = object.module_data as Data
    const offsets = catalogValue(project, object, 'pile_offsets_mm')
    const pileType = catalogValue(project, object, 'pile_type')
    const pileLength = catalogValue(project, object, 'pile_length_mm')
    const pileNote = catalogValue(project, object, 'foundation_type') === 'pile_cap' && Array.isArray(offsets) && typeof pileType === 'string'
      ? ` · ${escapeXml(pileType)} × ${offsets.length}${Number.isFinite(pileLength) ? ` × ${(Number(pileLength) / 1000).toFixed(2)} m` : ' · LENGTH TBD'}`
      : ''
    return `<text x="285" y="${75 + index * 5}" font-family="Arial,sans-serif" font-size="2.3">${escapeXml(data.mark)} · ${data.size_mm.slice(0, 2).map((v: number) => (v / 1000).toFixed(2)).join(' × ')} m${pileNote}</text>`
  }).join('')}`
  if (transform.extentX > 21000 || transform.extentY > 16800) warnings.push('S-01 model extents exceed the 1:100 viewport; content may be clipped.')
  for (const foundation of levelObjects.filter(item => item.object_type === 'structure.foundation')) {
    const data = foundation.module_data as Data
    const foundationType = catalogValue(project, foundation, 'foundation_type')
    const pileOffsets = catalogValue(project, foundation, 'pile_offsets_mm')
    const pileType = catalogValue(project, foundation, 'pile_type')
    const pileLength = catalogValue(project, foundation, 'pile_length_mm')
    if (!foundationType) warnings.push(`${data.mark}: foundation type is not classified.`)
    if (foundationType === 'pile_cap') {
      if (!Array.isArray(pileOffsets) || !pileOffsets.length || typeof pileType !== 'string') {
        warnings.push(`${data.mark}: pile layout/type is not modeled; S-01 shows pile cap footprint only.`)
      } else if (!Number.isFinite(pileLength) || Number(pileLength) <= 0) {
        warnings.push(`${data.mark}: ${pileType} pile length is not assigned; symbols are plan-only and require engineering input.`)
      }
    }
  }
  const levelName = project.levels.find(level => level.id === levelId)?.name
  return pageFrame(project, 'S-01', 'FOUNDATION & COLUMN PLAN', '1:100', elements.join(''), notes, levelName ? `${levelId} · ${levelName}` : levelId)
}

function compileOpeningSchedule(project: ProjectDocument, warnings: string[]): CompiledSheet {
  const openings = Object.values(project.objects).filter(object => object.object_type === 'door_window.door' || object.object_type === 'door_window.window')
  const grouped = new Map<string, { mark: string; type: string; family: string; width: number; height: number; sill: number; phase: string; count: number; hosts: string[] }>()
  for (const object of openings) {
    const data = object.module_data as Data
    const family = object.object_type
    const type = resolveCatalogType(project, family, data.type_id ?? data.mark)
    const { width, height, sill } = openingDimensions(project, object)
    const host = project.objects[data.wall_id]
    const hostMark = host ? String((host.module_data as Data).mark ?? '') : 'HOST MISSING'
    if (!host) warnings.push(`${data.mark ?? object.id}: opening host wall is missing`)
    if (width <= 0 || height <= 0) warnings.push(`${data.mark ?? object.id}: opening size is invalid`)
    const displayPhase = getDisplayPhase(object)
    const key = [family, data.type_id ?? data.mark, width, height, sill, displayPhase].join('|')
    const row = grouped.get(key) ?? { mark: String(data.mark ?? '?'), type: String(type?.name ?? data.mark ?? 'UNASSIGNED'), family, width, height, sill, phase: displayPhase, count: 0, hosts: [] }
    row.count++; if (!row.hosts.includes(hostMark)) row.hosts.push(hostMark)
    grouped.set(key, row)
  }
  const rows = [...grouped.values()].sort((a, b) => a.family.localeCompare(b.family) || a.mark.localeCompare(b.mark))
  const headerXs = [18, 48, 125, 170, 210, 248, 285, 332, 395]
  const catalogTypes = project.types.filter(type => type.object_type === 'door_window.door' || type.object_type === 'door_window.window')
    .sort((a, b) => a.object_type.localeCompare(b.object_type) || a.name.localeCompare(b.name))
  for (const family of ['door_window.door', 'door_window.window']) {
    if (!catalogTypes.some(type => type.object_type === family)) warnings.push(`A-08 has no ${family.endsWith('.door') ? 'door' : 'window'} types in the project catalog.`)
  }
  const headers = ['MARK', 'TYPE', 'FAMILY', 'WIDTH (m)', 'HEIGHT (m)', 'SILL (m)', 'PHASE', 'HOST', 'QTY']
  const content = [`<text x="18" y="36" font-family="Arial,sans-serif" font-size="3.3" font-weight="700">${escapeXml('DOOR & WINDOW SCHEDULE')}</text>`,
    `<rect x="15" y="42" width="390" height="10" fill="#e2e8f0"/>`,
    ...headers.map((header, i) => `<text x="${headerXs[i]}" y="48.5" text-anchor="${i === 8 ? 'end' : 'start'}" font-family="Arial,sans-serif" font-size="2.5" font-weight="700">${header}</text>`),
  ]
  rows.forEach((row, index) => {
    const y = 59 + index * 9
    if (index >= 12) return
    const values = [row.mark, row.type, row.family.endsWith('.door') ? 'DOOR' : 'WINDOW', `${(row.width / 1000).toFixed(2)}`, `${(row.height / 1000).toFixed(2)}`, row.sill ? `${(row.sill / 1000).toFixed(3)}` : '—', row.phase.toUpperCase(), row.hosts.join(', '), String(row.count)]
    content.push(`<path d="M15 ${y + 3}H405" stroke="#cbd5e1" stroke-width="0.25"/>`)
    values.forEach((value, i) => content.push(`<text x="${headerXs[i]}" y="${y}" text-anchor="${i === 8 ? 'end' : 'start'}" font-family="Arial,sans-serif" font-size="2.35">${escapeXml(value)}</text>`))
  })
  if (rows.length > 12) warnings.push(`A-08 has ${rows.length} instance groups; only the first 12 fit in the schedule band.`)
  const elevationTypes = catalogTypes
  const cellWidth = 61
  const elevationContent = elevationTypes.map((type, index) => {
    const family = type.object_type
    const p = type.parameters
    const w = Number(p.width_mm ?? 900), h = Number(p.height_mm ?? 2000)
    const x = 18 + (index % 6) * (cellWidth + 3), y = 176 + Math.floor(index / 6) * 51
    const scale = Math.min(0.022, 30 / Math.max(w, h, 1))
    const dw = Math.max(w * scale, 5), dh = Math.max(h * scale, 10)
    const left = x + (cellWidth - dw) / 2, top = y + 8
    const shape = family === 'door_window.door'
      ? `<rect x="${left}" y="${top}" width="${dw}" height="${dh}" fill="none" stroke="#0f172a" stroke-width="0.55"/><path d="M${left} ${top + dh}L${left + dw} ${top}" fill="none" stroke="#64748b" stroke-width="0.35"/>`
      : `<rect x="${left}" y="${top}" width="${dw}" height="${dh}" fill="#e0f2fe" stroke="#0f172a" stroke-width="0.55"/><path d="M${left + dw / 2} ${top}V${top + dh}M${left} ${top + dh / 2}H${left + dw}" stroke="#0f172a" stroke-width="0.35"/>`
    return `<rect x="${x}" y="${y}" width="${cellWidth}" height="47" fill="white" stroke="#cbd5e1" stroke-width="0.3"/><text x="${x + 3}" y="${y + 6}" font-family="Arial,sans-serif" font-size="2.5" font-weight="700">${escapeXml(type.name)} · ${family.endsWith('.door') ? 'DOOR' : 'WINDOW'}</text>${shape}<text x="${x + 3}" y="${y + 44}" font-family="Arial,sans-serif" font-size="2.2">${(w / 1000).toFixed(2)} × ${(h / 1000).toFixed(2)} m</text>`
  }).join('')
  const notes = `<text x="18" y="168" font-family="Arial,sans-serif" font-size="3" font-weight="700">TYPE ELEVATIONS · 1:50</text>
  ${elevationContent}
  <text x="18" y="280" font-family="Arial,sans-serif" font-size="2.4" fill="#475569">Dimensions in meters. Schedule resolves catalog type values and instance overrides; elevation symbols are schematic.</text>
  <text x="18" y="285" font-family="Arial,sans-serif" font-size="2.4" fill="#475569">Openings listed: ${openings.length} · Instance groups: ${rows.length} · Catalog types: ${catalogTypes.length}</text>`
  return pageFrame(project, 'A-08', 'DOOR & WINDOW SCHEDULE', '1:50', content.join(''), notes, 'ALL LEVELS')
}

/** Compile the first standalone A3 issue set from one semantic project document. */
export function compileInitialDrawingSet(project: ProjectDocument): CompiledDrawingSet {
  const warnings: string[] = []
  return { project_id: project.project.id, sheets: [compileArchitecturePlan(project, warnings), compileFoundationPlan(project, warnings), compileOpeningSchedule(project, warnings)], warnings: [...new Set(warnings)] }
}

/** Make a self-contained print-preview page; browser printing can save all sheets to one PDF. */
export function renderDrawingSetHtml(project: ProjectDocument): string {
  const drawingSet = compileInitialDrawingSet(project)
  const sections = drawingSet.sheets.map(sheet => `<section class="sheet">${sheet.svg}</section>`).join('')
  const warnings = drawingSet.warnings.length ? `<aside class="warnings"><b>Drawing notes:</b><ul>${drawingSet.warnings.map(warning => `<li>${escapeXml(warning)}</li>`).join('')}</ul></aside>` : ''
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeXml(project.project.id)} · A-02 S-01 A-08</title><style>
  @page{size:A3 landscape;margin:0}*{box-sizing:border-box}body{margin:0;background:#e2e8f0;font-family:Arial,sans-serif;color:#0f172a}.toolbar{position:sticky;top:0;padding:10px 16px;background:#0f172a;color:#fff;display:flex;justify-content:space-between;align-items:center;z-index:2}.toolbar button{border:0;border-radius:4px;background:#0284c7;color:white;padding:8px 16px;font-weight:700;cursor:pointer}.sheet{width:420mm;height:297mm;margin:14px auto;background:white;box-shadow:0 4px 20px #0f172a33;page-break-after:always;break-after:page}.sheet:last-child{page-break-after:auto;break-after:auto}.sheet svg{display:block;width:100%;height:100%}.warnings{margin:12px auto;width:min(900px,94vw);background:#fff7ed;border:1px solid #fb923c;padding:10px 16px;font-size:13px}@media print{body{background:#fff}.toolbar,.warnings{display:none}.sheet{margin:0;box-shadow:none}}
  </style></head><body><header class="toolbar"><span>ConstructFlow drawing set · ${escapeXml(project.project.name)} · A-02 / S-01 / A-08</span><button onclick="window.print()">Print / Save PDF</button></header>${warnings}${sections}</body></html>`
}
