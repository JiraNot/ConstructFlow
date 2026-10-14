const UNIT_TO_MM = new Map([
  [0, ['unitless', 1]], [1, ['inches', 25.4]], [2, ['feet', 304.8]], [3, ['miles', 1_609_344]],
  [4, ['millimeters', 1]], [5, ['centimeters', 10]], [6, ['meters', 1000]], [7, ['kilometers', 1_000_000]],
  [8, ['microinches', 0.0000254]], [9, ['mils', 0.0254]], [10, ['yards', 914.4]], [11, ['angstroms', 1e-7]],
  [12, ['nanometers', 1e-6]], [13, ['microns', 0.001]], [14, ['decimeters', 100]], [15, ['dekameters', 10_000]],
  [16, ['hectometers', 100_000]], [17, ['gigameters', 1e12]], [18, ['astronomical_units', 149_597_870_700]],
  [19, ['light_years', 9.4607304725808e18]], [20, ['parsecs', 3.085677581491367e19]], [21, ['us_survey_feet', 1200 / 3.937]],
  [22, ['us_survey_inches', 100 / 3.937]], [23, ['us_survey_yards', 3600 / 3.937]], [24, ['us_survey_miles', 6336000 / 3.937]],
])

/** Converts the SVG produced by LibreDWG into a bounded, calibrated editor underlay. */
export function importDwgSvgUnderlay(svg, {
  insertionUnits = 0,
  entityCount = 0,
  unsupportedEntities = 0,
  maxImageDimension = 4096,
} = {}) {
  if (typeof svg !== 'string' || svg.length > 50_000_000) throw new Error('ไฟล์ DWG สร้างภาพอ้างอิงไม่ได้หรือมีขนาดใหญ่เกินไป')
  const rootMatch = svg.match(/<svg\b[^>]*>/i)
  const viewBoxValue = rootMatch?.[0].match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1]
  const viewBox = viewBoxValue?.trim().split(/[\s,]+/).map(Number)
  if (!rootMatch || !viewBox || viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) {
    throw new Error('ไม่พบเรขาคณิต 2D ในไฟล์ DWG ที่ใช้เป็น underlay ได้')
  }
  if (!Number.isFinite(maxImageDimension) || maxImageDimension < 1) throw new Error('ขนาดภาพอ้างอิงไม่ถูกต้อง')

  const [minX, minY, rawWidth, rawHeight] = viewBox
  const margin = Math.max(rawWidth, rawHeight, 1) * 0.015
  const left = minX - margin
  const top = minY - margin
  const widthUnits = rawWidth + margin * 2
  const heightUnits = rawHeight + margin * 2
  const pixelsPerUnit = Math.min(1, maxImageDimension / Math.max(widthUnits, heightUnits))
  const width = Math.max(1, Math.ceil(widthUnits * pixelsPerUnit))
  const height = Math.max(1, Math.ceil(heightUnits * pixelsPerUnit))
  const [unitName, millimetersPerUnit] = UNIT_TO_MM.get(Number(insertionUnits)) ?? UNIT_TO_MM.get(0)
  const svgRoot = rootMatch[0]
    .replace(/\s+(?:width|height|viewBox)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    .replace(/\s*\/?>$/, ` width="${width}px" height="${height}px" viewBox="${left} ${top} ${widthUnits} ${heightUnits}">`)
  const normalizedSvg = svg.replace(rootMatch[0], svgRoot)
  return {
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(normalizedSvg)}`,
    origin_mm: [left * millimetersPerUnit, (-minY + margin) * millimetersPerUnit],
    scale_mm_per_px: millimetersPerUnit / pixelsPerUnit,
    width_px: width,
    height_px: height,
    drawing_units: unitName,
    imported_entities: Math.max(0, Math.floor(entityCount)),
    skipped_entities: Math.max(0, Math.floor(unsupportedEntities)),
  }
}
