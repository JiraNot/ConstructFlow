import test from 'node:test'
import assert from 'node:assert/strict'
import { electricalFixtureScreenSymbol, PLAN_GRID_BUBBLE_RADIUS_PX } from '../src/rendering/planAnnotationSymbols.mjs'
import { beginPlanLabels, flushPlanLabels, planLabelScale, queuePlanLabel } from '../src/rendering/planLabels.ts'
import { planZoomPercent, worldToScreen } from '../src/viewport/viewportTransform.ts'
import { PLAN_SYMBOL_TAG_MIN_ZOOM_PERCENT, shouldShowPlanSymbolTag } from '../src/rendering/planLabels.ts'

test('plan symbol tags declutter below the zoom shown by the canvas controls', () => {
  assert.equal(PLAN_SYMBOL_TAG_MIN_ZOOM_PERCENT, 70)
  assert.equal(planZoomPercent(0.08 * 0.69), 69)
  assert.equal(planZoomPercent(0.08 * 0.70), 70)
  assert.equal(shouldShowPlanSymbolTag(planZoomPercent(0.08 * 0.69)), false)
  assert.equal(shouldShowPlanSymbolTag(planZoomPercent(0.08 * 0.70)), true)
  assert.equal(shouldShowPlanSymbolTag(planZoomPercent(0.08 * 0.25), true, true), true)
  assert.equal(shouldShowPlanSymbolTag(planZoomPercent(0.08 * 0.25), true, false, true), true)
  assert.equal(shouldShowPlanSymbolTag(planZoomPercent(0.08 * 1), false, true, true), false)
})

test('screen annotations and grid bubble dimensions do not scale with model zoom', () => {
  assert.deepEqual([0.005, 0.08, 2].map(planLabelScale), [1, 1, 1])
  assert.equal(PLAN_GRID_BUBBLE_RADIUS_PX, 14)
})

test('electrical fixture symbols preserve kind-specific shapes at constant screen dimensions', () => {
  assert.deepEqual(electricalFixtureScreenSymbol('panel'), { shape: 'panel', halfWidth: 7, halfHeight: 9, detail: 'none' })
  assert.deepEqual(electricalFixtureScreenSymbol('switch'), { shape: 'circle', radius: 6, detail: 'switch' })
  assert.deepEqual(electricalFixtureScreenSymbol('outlet'), { shape: 'circle', radius: 6, detail: 'outlet' })
  assert.deepEqual(electricalFixtureScreenSymbol('light'), { shape: 'circle', radius: 7, detail: 'light' })
})

test('electrical fixture renderer draws fixed-size shapes at zoom-independent pixels', async () => {
  const { drawElectricalFixtureScreenSymbol } = await import('../src/rendering/planAnnotationSymbols.mjs')
  for (const zoom of [0.005, 0.08, 2]) {
    const calls = []
    const ctx = {
      save() {}, restore() {},
      beginPath() {}, rect(...args) { calls.push(['rect', ...args]) }, arc(...args) { calls.push(['arc', ...args]) },
      fill() {}, stroke() {}, moveTo() {}, lineTo() {},
      set strokeStyle(value) {}, set fillStyle(value) {}, set lineWidth(value) {},
    }
    const symbol = drawElectricalFixtureScreenSymbol(ctx, 20 * zoom, 30 * zoom, 'switch')
    assert.equal(symbol.radius, 6)
    assert.ok(calls.some(call => call[0] === 'arc' && call[3] === 6))
  }
})

test('wall, opening, beam and floor tags keep their CSS-pixel size at different zoom and DPR values', () => {
  const renderTagSizes = (zoom, dpr) => {
    const sizes = []
    const transforms = []
    const context = {
      font: '10px sans-serif',
      save() {}, restore() {}, setLineDash() {}, textAlign: '', textBaseline: '', strokeStyle: '', fillStyle: '', lineWidth: 1,
      getTransform: () => ({ a: dpr, b: 0, c: 0, d: dpr, e: 0, f: 0 }),
      setTransform(...matrix) { transforms.push(matrix) },
      measureText: () => ({ width: 18 }),
      translate() {}, rotate() {}, scale() { throw new Error('annotation must not scale its screen-space glyphs') },
      beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, stroke() {}, fill() {}, fillText() {},
      rect(_x, _y, width, height) { sizes.push([width, height]) },
      ellipse(_x, _y, radiusX, radiusY) { sizes.push([radiusX * 2, radiusY * 2]) },
    }
    beginPlanLabels(context, zoom)
    queuePlanLabel(context, 60, 50, 'W1', '#334155', '#94a3b8', 2, '#fff', false, 'triangle')
    queuePlanLabel(context, 130, 50, 'D1', '#334155', '#94a3b8', 2, '#fff', false, 'circle')
    queuePlanLabel(context, 200, 50, 'B1', '#334155', '#94a3b8', 2, '#fff', false, 'hexagon')
    queuePlanLabel(context, 270, 50, 'S1', '#334155', '#94a3b8', 2, '#fff', false, 'rect')
    flushPlanLabels(context, 400, 300)
    assert.ok(transforms.some(matrix => matrix[0] === dpr && matrix[3] === dpr))
    return sizes
  }

  const expected = renderTagSizes(0.005, 1)
  for (const [zoom, dpr] of [[0.005, 1], [0.08, 1.5], [2, 2]]) {
    assert.deepEqual(renderTagSizes(zoom, dpr), expected)
  }
})

test('symbol screen position follows the model point and viewport zoom', () => {
  const point = [2500, 1500]
  const close = worldToScreen(point, { panX: 100, panY: 50, zoom: 0.01 })
  const far = worldToScreen(point, { panX: 100, panY: 50, zoom: 0.5 })
  assert.deepEqual(close, [125, 65])
  assert.deepEqual(far, [1350, 800])
})
