import assert from 'node:assert/strict'
import test from 'node:test'
import { makeSlidingWindowPlanSymbol, resolveOpeningPlanSymbolX, resolveOpeningPlanSymbolY, validateOpeningPlanSymbolLines } from '../dist/index.js'

test('sliding window plan symbol starter is editable and spans each jamb and meeting stile', () => {
  const lines = makeSlidingWindowPlanSymbol()
  validateOpeningPlanSymbolLines(lines)
  assert.ok(lines.length >= 8)
  assert.ok(lines.some(line => line.start.x_anchor === 'left' && line.start.x_offset_mm === 0 && line.end.x_offset_mm === 0))
  assert.ok(lines.some(line => line.start.x_anchor === 'left' && line.start.x_offset_mm === 50 && line.end.x_offset_mm === 50))
  assert.ok(lines.some(line => line.start.x_anchor === 'right' && line.start.x_offset_mm === -50 && line.end.x_offset_mm === -50))
  assert.ok(lines.some(line => line.start.x_anchor === 'right' && line.start.x_offset_mm === 0 && line.end.x_offset_mm === 0))
})

test('opening anchored geometry keeps a 50 mm frame when clear width changes', () => {
  const rightInner = { x_anchor: 'right', x_offset_mm: -50, y_mm: 0 }
  assert.equal(resolveOpeningPlanSymbolX(rightInner, 1200), 1150)
  assert.equal(resolveOpeningPlanSymbolX(rightInner, 1800), 1750)
  assert.equal(resolveOpeningPlanSymbolX({ x_anchor: 'center', x_offset_mm: 25, y_mm: 0 }, 1800), 925)
})

test('elevation line anchors follow opening height while preserving real frame offsets', () => {
  const topFrame = { x_anchor: 'left', x_offset_mm: 50, y_anchor: 'top', y_mm: -50 }
  assert.equal(resolveOpeningPlanSymbolY(topFrame, 1200), 550)
  assert.equal(resolveOpeningPlanSymbolY(topFrame, 1800), 850)
  const transom = { x_anchor: 'left', x_offset_mm: 0, y_anchor: 'ratio', y_ratio: 0.75, y_mm: 0 }
  assert.equal(resolveOpeningPlanSymbolY(transom, 1200), 300)
  assert.equal(resolveOpeningPlanSymbolY(transom, 1800), 450)
})

test('opening plan symbol validation rejects malformed and excessive geometry', () => {
  assert.throws(() => validateOpeningPlanSymbolLines([{ id: 'bad', start: { x_anchor: 'ratio', x_ratio: 2, x_offset_mm: 0, y_mm: 0 }, end: { x_anchor: 'left', x_offset_mm: 0, y_mm: 0 } }]))
  assert.throws(() => validateOpeningPlanSymbolLines([{ id: 'bad', start: { x_anchor: 'left', x_offset_mm: 0, y_mm: 2000 }, end: { x_anchor: 'left', x_offset_mm: 0, y_mm: 0 } }]))
  assert.throws(() => validateOpeningPlanSymbolLines(Array.from({ length: 121 }, (_, i) => ({ id: String(i), start: { x_anchor: 'left', x_offset_mm: 0, y_mm: 0 }, end: { x_anchor: 'right', x_offset_mm: 0, y_mm: 0 } }))))
})
