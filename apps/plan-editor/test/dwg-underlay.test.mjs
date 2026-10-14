import test from 'node:test'
import assert from 'node:assert/strict'
import { importDwgSvgUnderlay } from '../src/cad/importDwgUnderlay.mjs'

const svg = (viewBox = '100 -500 1000 500') => `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="${viewBox}"><g transform="matrix(1,0,0,-1,0,0)"><path d="M100 0L1100 500"/></g></svg>`

test('DWG SVG underlay keeps drawing coordinates and applies declared millimeter units', () => {
  const result = importDwgSvgUnderlay(svg(), { insertionUnits: 4, entityCount: 18, unsupportedEntities: 2 })
  const normalized = decodeURIComponent(result.dataUrl)

  assert.deepEqual(result.origin_mm, [85, 515])
  assert.equal(result.scale_mm_per_px, 1)
  assert.equal(result.drawing_units, 'millimeters')
  assert.equal(result.imported_entities, 18)
  assert.equal(result.skipped_entities, 2)
  assert.match(normalized, /viewBox="85 -515 1030 530"/)
  assert.match(normalized, /width="1030px" height="530px"/)
})

test('DWG underlay maps inches and caps SVG pixel dimensions for large drawings', () => {
  const result = importDwgSvgUnderlay(svg('0 0 200000 100000'), { insertionUnits: 1, maxImageDimension: 1200 })

  assert.equal(result.drawing_units, 'inches')
  assert.ok(result.width_px <= 1200)
  assert.ok(result.height_px <= 1200)
  assert.ok(result.scale_mm_per_px > 25.4)
})

test('unitless and unknown DWG units retain a millimeter default for explicit calibration', () => {
  const unitless = importDwgSvgUnderlay(svg(), { insertionUnits: 0 })
  const unknown = importDwgSvgUnderlay(svg(), { insertionUnits: 999 })
  assert.equal(unitless.drawing_units, 'unitless')
  assert.equal(unknown.drawing_units, 'unitless')
  assert.equal(unitless.scale_mm_per_px, 1)
})

test('DWG underlay rejects missing, invalid, and oversized view boxes', () => {
  assert.throws(() => importDwgSvgUnderlay('<svg><path/></svg>'), /ไม่พบเรขาคณิต/)
  assert.throws(() => importDwgSvgUnderlay(svg('0 0 0 40')), /ไม่พบเรขาคณิต/)
  assert.throws(() => importDwgSvgUnderlay('<svg/>'.padEnd(50_000_001, ' ')), /ขนาดใหญ่เกินไป/)
})
