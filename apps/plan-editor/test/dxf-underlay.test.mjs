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

test('DXF underlay expands block inserts with base point, nonuniform scale, and rotation', () => {
  const source = [
    '0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'BLOCKS',
    '0', 'BLOCK', '2', 'L_CORNER', '70', '0', '10', '1', '20', '2',
    '0', 'LINE', '10', '1', '20', '2', '11', '2', '21', '2',
    '0', 'LINE', '10', '1', '20', '2', '11', '1', '21', '3',
    '0', 'ENDBLK', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
    '0', 'INSERT', '2', 'L_CORNER', '10', '10', '20', '20', '41', '2', '42', '1', '50', '90',
    '0', 'ENDSEC', '0', 'EOF',
  ].join('\n')
  const result = importDxfUnderlay(source)

  assert.equal(result.imported_entities, 2)
  assert.equal(result.skipped_entities, 0)
  assert.equal(result.width_px, 2)
  assert.equal(result.height_px, 3)
  assert.deepEqual(result.origin_mm.map(Math.round), [9, 22])
})

test('DXF underlay renders closed HATCH polyline boundaries including bulged arcs', () => {
  const hatch = [
    '0', 'HATCH', '91', '1', '92', '2', '72', '1', '73', '1', '93', '3',
    '10', '0', '20', '0', '42', '1',
    '10', '100', '20', '0', '42', '0',
    '10', '100', '20', '100', '42', '0',
  ].join('\n')
  const result = importDxfUnderlay(dxf(4, hatch))
  const svg = decodeURIComponent(result.dataUrl)

  assert.equal(result.imported_entities, 1)
  assert.equal(result.skipped_entities, 0)
  assert.match(svg, /<path d="M[^\"]+ Z"/)
  assert.ok((svg.match(/L/g) ?? []).length > 10, 'bulged arc is approximated by enough line segments for a smooth underlay')
})

test('DXF underlay imports legacy 2D POLYLINE sequences from model space and inserted blocks', () => {
  const directPolyline = [
    '0', 'POLYLINE', '66', '1', '70', '1',
    '0', 'VERTEX', '10', '0', '20', '0', '42', '1',
    '0', 'VERTEX', '10', '100', '20', '0',
    '0', 'VERTEX', '10', '100', '20', '100',
    '0', 'SEQEND',
  ]
  const blockPolyline = [
    '0', 'POLYLINE', '66', '1', '70', '1',
    '0', 'VERTEX', '10', '0', '20', '0',
    '0', 'VERTEX', '10', '50', '20', '0',
    '0', 'VERTEX', '10', '50', '20', '50',
    '0', 'SEQEND',
  ]
  const source = [
    '0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '2', 'PANEL', '70', '0', '10', '0', '20', '0',
    ...blockPolyline, '0', 'ENDBLK', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES', ...directPolyline,
    '0', 'INSERT', '2', 'PANEL', '10', '200', '20', '200',
    '0', 'ENDSEC', '0', 'EOF',
  ].join('\n')

  const result = importDxfUnderlay(source)
  const svg = decodeURIComponent(result.dataUrl)

  assert.equal(result.imported_entities, 2)
  assert.equal(result.skipped_entities, 0)
  assert.equal((svg.match(/<path /g) ?? []).length, 2)
  assert.ok((svg.match(/L/g) ?? []).length > 20, 'legacy bulges are tessellated into smooth underlay paths')
  assert.equal((svg.match(/ Z/g) ?? []).length, 2)
})

test('DXF underlay approximates full and partial ELLIPSE entities and skips malformed axes', () => {
  const entities = [
    '0', 'ELLIPSE', '10', '0', '20', '0', '11', '100', '21', '0', '40', '0.5', '41', '0', '42', String(Math.PI * 2),
    '0', 'ELLIPSE', '10', '200', '20', '0', '11', '50', '21', '0', '40', '0.5', '41', '0', '42', String(Math.PI / 2),
    '0', 'ELLIPSE', '10', '0', '20', '0', '11', '0', '21', '0', '40', '0.5', '41', '0', '42', String(Math.PI * 2),
  ].join('\n')

  const result = importDxfUnderlay(dxf(4, entities))
  const svg = decodeURIComponent(result.dataUrl)
  const paths = svg.match(/<path d="[^"]+"\/>/g) ?? []

  assert.equal(result.imported_entities, 2)
  assert.equal(result.skipped_entities, 1)
  assert.equal(paths.length, 2)
  assert.equal(paths.filter(path => path.includes(' Z')).length, 1, 'only the full ellipse is closed')
  assert.ok((svg.match(/L/g) ?? []).length > 30, 'ellipse curves are approximated with sufficiently smooth segments')
  assert.ok(result.origin_mm[0] < -100)
  assert.ok(result.origin_mm[1] > 50)
})

test('DXF underlay samples rational SPLINE control points and rejects malformed or non-planar splines', () => {
  const cubic = ['0', 'SPLINE', '70', '0', '71', '3', '72', '8', '73', '4',
    '40', '0', '40', '0', '40', '0', '40', '0', '40', '1', '40', '1', '40', '1', '40', '1',
    '10', '0', '20', '0', '10', '0', '20', '100', '10', '100', '20', '100', '10', '100', '20', '0']
  const rational = ['0', 'SPLINE', '70', '5', '71', '2', '72', '6', '73', '3',
    '40', '0', '40', '0', '40', '0', '40', '1', '40', '1', '40', '1',
    '41', '1', '41', String(Math.SQRT1_2), '41', '1',
    '10', '200', '20', '0', '10', '200', '20', '100', '10', '100', '20', '100']
  const malformed = ['0', 'SPLINE', '71', '3', '73', '4', '40', '0', '10', '0', '20', '0']
  const nonPlanar = ['0', 'SPLINE', '71', '1', '72', '4', '73', '2',
    '40', '0', '40', '0', '40', '1', '40', '1',
    '10', '0', '20', '0', '30', '100', '10', '100', '20', '100', '30', '100']

  const result = importDxfUnderlay(dxf(4, [...cubic, ...rational, ...malformed, ...nonPlanar].join('\n')))
  const svg = decodeURIComponent(result.dataUrl)
  const paths = svg.match(/<path d="[^"]+"\/>/g) ?? []

  assert.equal(result.imported_entities, 2)
  assert.equal(result.skipped_entities, 2)
  assert.equal(paths.length, 2)
  assert.ok((svg.match(/L/g) ?? []).length >= 40, 'curves are sampled into smooth underlay polylines')
  assert.equal(paths.filter(path => path.includes(' Z')).length, 1, 'closed spline flag is retained for the rational spline')
})

test('DXF underlay import rejects documents without supported model-space geometry', () => {
  assert.throws(() => importDxfUnderlay(dxf(4, ['0', 'TEXT', '10', '0', '20', '0', '1', 'note'].join('\n'))), /ไม่พบ LINE/)
})
