import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { deserializeProject } from '@constructflow/project-model'
import { buildProjectRepresentations3D, getVisibleElevationMeshEdges } from '@constructflow/representation-engine'
import { getElevationMeshEdges, getElevationWallStyle, getVisibleElevationLevelRows, layoutElevationTags, packElevationLevelLabelCenters, panElevationView, resolveElevationWallFaceMark, sortElevationObjectsForDrawing, zoomElevationViewAtPoint, zoomElevationViewFromCenter } from '../src/elevationLabelLayout.mjs'

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

test('elevation labels omit datums that pan or zoom outside the viewport', () => {
  const levels = [
    { name: 'Below', elevation_mm: -3000 },
    { name: 'Ground', elevation_mm: 0 },
    { name: 'Upper', elevation_mm: 3000 },
    { name: 'Roof', elevation_mm: 6000 },
  ]
  const rows = getVisibleElevationLevelRows(levels, level => 300 - level.elevation_mm / 10, 600)
  assert.deepEqual(rows.map(({ level, y }) => [level.name, y]), [['Upper', 0], ['Ground', 300], ['Below', 600]])
  assert.deepEqual(getVisibleElevationLevelRows(levels, () => Number.NaN, 600), [])
  assert.deepEqual(getVisibleElevationLevelRows(levels, () => 100, 0), [])
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

test('elevation facade overlaps draw far walls first in all four directions', () => {
  const directions = [
    ['north', [0, 5000, 0], [0, 0, 0]],
    ['south', [0, 0, 0], [0, 5000, 0]],
    ['east', [5000, 0, 0], [0, 0, 0]],
    ['west', [0, 0, 0], [5000, 0, 0]],
  ]
  for (const [direction, nearStart, farStart] of directions) {
    const makeWall = (id, start) => ({
      id, object_type: 'architecture.wall',
      module_data: { start_point_mm: start, end_point_mm: direction === 'north' || direction === 'south' ? [start[0] + 4000, start[1], 0] : [start[0], start[1] + 4000, 0] },
    })
    const near = makeWall(`near-${direction}`, nearStart)
    const far = makeWall(`far-${direction}`, farStart)
    const opening = { id: `opening-${direction}`, object_type: 'door_window.window', module_data: {} }
    const sourceOrder = [near, far, opening]
    const ordered = sortElevationObjectsForDrawing(sourceOrder, direction)
    assert.deepEqual(ordered.map(item => item.id), [far.id, near.id, opening.id], `${direction} must paint the nearer wall last, regardless of file order`)
    assert.deepEqual(sourceOrder.map(item => item.id), [near.id, far.id, opening.id], 'sorting must not mutate project object order')
  }
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

test('elevation marks avoid one another, stay in the viewport, and retain leader anchors', () => {
  const tags = [
    { id: 'door', x: 160, y: 90, width: 34, height: 18 },
    { id: 'window', x: 160, y: 90, width: 38, height: 18 },
    { id: 'wall', x: 160, y: 90, width: 30, height: 18 },
    { id: 'edge', x: 8, y: 8, width: 26, height: 18 },
  ]
  const placed = layoutElevationTags(tags, 320, 180)
  assert.deepEqual(placed.map(tag => tag.id), tags.map(tag => tag.id), 'placement order stays tied to the input objects')
  assert.ok(placed.every(tag => tag.x - tag.width / 2 >= 2 && tag.x + tag.width / 2 <= 318 && tag.y - tag.height / 2 >= 2 && tag.y + tag.height / 2 <= 178))
  assert.equal(placed[0].displaced, false)
  assert.ok(placed.slice(1, 3).every(tag => tag.displaced && tag.anchorX === 160 && tag.anchorY === 90), 'displaced marks retain the source point for a leader')
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    const a = placed[i], b = placed[j]
    assert.ok(a.x - a.width / 2 >= b.x + b.width / 2 + 2 || a.x + a.width / 2 <= b.x - b.width / 2 - 2 || a.y - a.height / 2 >= b.y + b.height / 2 + 2 || a.y + a.height / 2 <= b.y - b.height / 2 - 2, `${a.id} must not overlap ${b.id}`)
  }
})

test('elevation roof edges omit coplanar tessellation seams and retain roof creases', () => {
  const flat = getElevationMeshEdges([
    [[0, 0, 0], [1000, 0, 0], [1000, 1000, 0]],
    [[0, 0, 0], [1000, 1000, 0], [0, 1000, 0]],
  ])
  assert.equal(flat.length, 4, 'the shared diagonal on one flat roof plane is not a drawing edge')

  const pitched = getElevationMeshEdges([
    [[0, 0, 0], [1000, 0, 1000], [0, 1000, 0]],
    [[1000, 0, 1000], [1000, 1000, 0], [0, 1000, 0]],
  ])
  assert.equal(pitched.length, 5, 'the shared ridge between non-coplanar roof planes remains visible')
  assert.ok(pitched.some(([a, b]) => (a[0] === 1000 && a[2] === 1000 && b[0] === 0 && b[2] === 0) || (b[0] === 1000 && b[2] === 1000 && a[0] === 0 && a[2] === 0)), 'the roof crease is retained as a semantic edge')
})

test('the real house-demo roof projects to usable edges in all four elevations', () => {
  const project = deserializeProject(readFileSync(new URL('../../../examples/constructflow-house-demo.cfproj', import.meta.url), 'utf8'))
  const roof = buildProjectRepresentations3D(project).objects.find(object => object.object_type === 'roof.system')
  assert.ok(roof?.shape.kind === 'triangle_mesh', 'the demo roof resolves to the shared model mesh')
  const edges = getElevationMeshEdges(roof.shape.triangles_mm)
  assert.ok(edges.length >= 8, 'the hip-roof perimeter and creases are present')
  assert.ok(Math.max(...roof.shape.triangles_mm.flat().map(point => point[2])) > 7000, 'fit bounds must include the raised roof ridge')
  let hiddenEdgesWereClipped = false
  for (const direction of ['north', 'south', 'east', 'west']) {
    const horizontalAxis = direction === 'east' || direction === 'west' ? 1 : 0
    const visibleEdges = getVisibleElevationMeshEdges(roof.shape.triangles_mm, direction, .1)
    hiddenEdgesWereClipped ||= visibleEdges.length < edges.length
    const projectedEdges = visibleEdges.filter(([a, b]) => Math.hypot(a[horizontalAxis] - b[horizontalAxis], a[2] - b[2]) > .5)
    assert.ok(projectedEdges.length >= 3, `${direction} roof retains its visible silhouette and hip lines`)
  }
  assert.ok(hiddenEdgesWereClipped, 'the house-demo hip roof must hide rear edges behind nearer roof planes')
})
