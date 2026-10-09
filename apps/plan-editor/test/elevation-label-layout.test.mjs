import test from 'node:test'
import assert from 'node:assert/strict'
import { getElevationWallStyle, packElevationLevelLabelCenters, panElevationView, resolveElevationWallFaceMark, zoomElevationViewAtPoint, zoomElevationViewFromCenter } from '../src/elevationLabelLayout.mjs'

test('elevation level labels stay ordered and point to their datum when levels are tightly spaced', () => {
  const datums = [100, 104, 108, 400]
  const labels = packElevationLevelLabelCenters(datums, 600)

  assert.deepEqual(labels, [96, 115, 134, 396])
  assert.ok(labels.every((value, index) => index === 0 || value > labels[index - 1]))
  assert.ok(Math.abs(labels[0] - (datums[0] - 4)) < 2)
  assert.ok(Math.abs(labels[1] - (datums[1] - 4)) > 2, 'the displaced label needs a leader to its datum')
})

test('elevation level labels remain within a short viewport without cumulative overflow', () => {
  const datums = [0, 2, 4, 6, 8, 10]
  const labels = packElevationLevelLabelCenters(datums, 120)

  assert.equal(labels.length, datums.length)
  assert.ok(labels.every(value => value >= 10.5 && value <= 109.5))
  assert.ok(labels.every((value, index) => index === 0 || value > labels[index - 1]))
})

test('elevation wall face marks resolve the visible side from instance, wall, then catalog data', () => {
  const project = { types: [{ id: 'wall-type', object_type: 'architecture.wall', name: 'W1', parameters: { inside_finish_mark: 'W2', outside_finish_mark: 'W1' } }] }
  const wall = { object_type: 'architecture.wall', module_data: { mark: 'W1', type_id: 'wall-type', interior_side: 'left' } }

  assert.equal(resolveElevationWallFaceMark(project, wall, 'north'), 'W1')
  assert.equal(resolveElevationWallFaceMark(project, wall, 'south'), 'W2')
  assert.equal(resolveElevationWallFaceMark(project, wall, 'east'), 'W1')
  assert.equal(resolveElevationWallFaceMark(project, wall, 'west'), 'W2')
  assert.equal(resolveElevationWallFaceMark(project, { ...wall, module_data: { ...wall.module_data, outside_finish_mark: 'EXT' } }, 'north'), 'EXT')
  assert.equal(resolveElevationWallFaceMark(project, { ...wall, module_data: { ...wall.module_data, instance_overrides: { outside_finish_mark: 'CUSTOM' } } }, 'north'), 'CUSTOM')
})

test('elevation walls distinguish existing, new and demolition phases without using plan hatch', () => {
  assert.equal(getElevationWallStyle('existing').fill, '#ffffff')
  assert.deepEqual(getElevationWallStyle('demolition').dash, [6, 3])
  assert.equal(getElevationWallStyle('demolition').stroke, '#ef4444')
  assert.equal(getElevationWallStyle('new_construction').fill, '#e3e8ed')
  assert.equal(getElevationWallStyle('new_construction', true).stroke, '#087cf0')
})

test('elevation wheel zoom keeps the model point under the cursor fixed with inverted screen Y', () => {
  const view = { zoom: 1.4, panX: 25, panY: -18 }, width = 1000, height = 600, x = 740, y = 115
  const worldX = (x - width / 2 - view.panX) / view.zoom
  const worldZ = (y - height / 2 + view.panY) / view.zoom
  const next = zoomElevationViewAtPoint(view, 2.7, x, y, width, height)
  assert.ok(Math.abs(width / 2 + worldX * next.zoom + next.panX - x) < 1e-9)
  assert.ok(Math.abs(height / 2 + worldZ * next.zoom - next.panY - y) < 1e-9)
  assert.equal(next.zoom, 2.7)
})

test('elevation zoom controls keep canvas center fixed and clamp scale limits', () => {
  const next = zoomElevationViewFromCenter({ zoom: 1, panX: 40, panY: -20 }, 2)
  assert.deepEqual(next, { zoom: 2, panX: 80, panY: -40 })
  assert.equal(zoomElevationViewFromCenter(next, 99).zoom, 8)
  assert.equal(zoomElevationViewFromCenter(next, 0.01).zoom, 0.2)
})

test('elevation pan keeps the grabbed model point under the dragged screen point', () => {
  const view = { zoom: 1.4, panX: 25, panY: -18 }, width = 1000, height = 600
  const screenX = 740, screenY = 115, dx = 43, dy = -27
  const worldX = (screenX - width / 2 - view.panX) / view.zoom
  const worldZ = (screenY - height / 2 + view.panY) / view.zoom
  const next = panElevationView(view, dx, dy)

  assert.equal(width / 2 + worldX * next.zoom + next.panX, screenX + dx)
  assert.equal(height / 2 + worldZ * next.zoom - next.panY, screenY + dy)
  assert.equal(panElevationView(view, Number.NaN, dy), view, 'invalid drag deltas must not corrupt the view')
})
