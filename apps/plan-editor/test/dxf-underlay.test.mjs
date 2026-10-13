import test from 'node:test'
import assert from 'node:assert/strict'
import { importDxfUnderlay } from '../src/cad/importDxfUnderlay.mjs'

const dxf = (units, entities) => [
  '0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', String(units), '0', 'ENDSEC',
  '0', 'SECTION', '2', 'ENTITIES', entities, '0', 'ENDSEC', '0', 'EOF',
].join('\n')

test('DXF underlay import keeps CAD bounds, declared units, and common vector entities', () => {
  const entities = [
    '0', 'LINE', '10', '100', '20', '200', '11', '1100', '21', '200',
    '0', 'LWPOLYLINE', '70', '1', '10', '100', '20', '200', '10', '1100', '20', '200', '10', '1100', '20', '900',
    '0', 'CIRCLE', '10', '600', '20', '500', '40', '100',
    '0', 'ARC', '10', '600', '20', '500', '40', '200', '50', '0', '51', '90',
    '0', 'TEXT', '10', '100', '20', '100', '1', 'ignored annotation',
  ].join('\n')
  const result = importDxfUnderlay(dxf(4, entities), { maxImageDimension: 1200 })

  assert.equal(result.drawing_units, 'millimeters')
  assert.equal(result.imported_entities, 4)
  assert.equal(result.skipped_entities, 1)
  assert.ok(result.origin_mm[0] < 100)
  assert.ok(result.origin_mm[1] > 900)
  assert.ok(result.width_px <= 1200)
  assert.ok(result.height_px <= 1200)
  assert.match(decodeURIComponent(result.dataUrl), /<svg[\s\S]*<path/)
  assert.ok(result.scale_mm_per_px > 0)
})

test('DXF underlay import converts declared feet to millimeter scale and assumes millimeters when unitless', () => {
  const line = ['0', 'LINE', '10', '0', '20', '0', '11', '10', '21', '0'].join('\n')
  const feet = importDxfUnderlay(dxf(2, line))
  const unitless = importDxfUnderlay(dxf(0, line))

  assert.equal(feet.drawing_units, 'feet')
  assert.ok(feet.scale_mm_per_px > unitless.scale_mm_per_px * 300)
  assert.equal(unitless.drawing_units, 'unitless')
})

test('DXF underlay import rejects documents without supported model-space geometry', () => {
  assert.throws(() => importDxfUnderlay(dxf(4, ['0', 'TEXT', '10', '0', '20', '0', '1', 'note'].join('\n'))), /ไม่พบ LINE/)
})
