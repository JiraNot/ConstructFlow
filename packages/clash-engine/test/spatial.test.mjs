import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { analyzeProjectSpatialBounds, classifySpatialInteractions, intersects, RTree } from '../dist/index.js'
import { deserializeProject } from '../../project-model/dist/index.js'

const fixtureUrl = new URL('../../../examples/kitchen-extension-proof.cfproj', import.meta.url)
const project = deserializeProject(await readFile(fixtureUrl, 'utf8'))

test('S3: packed R-tree queries match exact AABB intersections across multiple levels', () => {
  const entries = Array.from({ length: 40 }, (_, index) => ({
    value: index,
    bounds: { min: [index * 10, 0, 0], max: [index * 10 + 2, 1, 1] },
  }))
  const tree = new RTree(entries, 4)

  assert.equal(tree.size, 40)
  assert.deepEqual(tree.search({ min: [35, 0, 0], max: [65, 1, 1] }).map(entry => entry.value), [4, 5, 6])
  assert.deepEqual(tree.search({ min: [42, 1, 1], max: [42, 1, 1] }).map(entry => entry.value), [4])
  assert.deepEqual(tree.search({ min: [43, 0, 0], max: [49, 1, 1] }), [])
  assert.throws(() => new RTree(entries, 3), /at least 4/)
  assert.throws(() => tree.search({ min: [0, 0, Number.NaN], max: [1, 1, 1] }), /finite 3D/)
})

test('S3: project candidate pairs equal brute-force AABB intersections and are stable', () => {
  const first = analyzeProjectSpatialBounds(project)
  const second = analyzeProjectSpatialBounds(project)
  const bruteForcePairs = []

  for (let left = 0; left < first.objects.length; left++) {
    for (let right = left + 1; right < first.objects.length; right++) {
      const a = first.objects[left]
      const b = first.objects[right]
      if (intersects(a.bounds, b.bounds)) {
        const [firstId, secondId] = [a.object_id, b.object_id].sort()
        bruteForcePairs.push(`${firstId}:${secondId}`)
      }
    }
  }

  const actualPairs = first.candidate_pairs.map(pair => `${pair.first.object_id}:${pair.second.object_id}`)
  assert.ok(first.objects.length >= 16)
  assert.deepEqual(actualPairs, [...bruteForcePairs].sort((a, b) => {
    const [aFirst, aSecond] = a.split(':')
    const [bFirst, bSecond] = b.split(':')
    return aFirst.localeCompare(bFirst) || aSecond.localeCompare(bSecond)
  }))
  assert.deepEqual(second.candidate_pairs.map(pair => `${pair.first.object_id}:${pair.second.object_id}`), actualPairs)
  assert.equal(new Set(actualPairs).size, actualPairs.length, 'each object pair must appear once')
  assert.deepEqual(first.warnings, [])
})

test('S3: bounds retain phase/host metadata and resolve instance section overrides', () => {
  const edited = structuredClone(project)
  const beam = Object.values(edited.objects).find(object => object.object_type === 'structure.beam')
  beam.module_data.instance_overrides = { section_mm: [200, 700] }
  const result = analyzeProjectSpatialBounds(edited)
  const beamBounds = result.objects.find(object => object.object_id === beam.id)
  const existingWall = Object.values(edited.objects).find(object =>
    object.object_type === 'architecture.wall' && object.created_phase === 'existing'
  )
  const wallBounds = result.objects.find(object => object.object_id === existingWall.id)

  assert.equal(beamBounds.bounds.max[2] - beamBounds.bounds.min[2], 700)
  assert.equal(wallBounds.created_phase, existingWall.created_phase)
  assert.equal(wallBounds.removed_phase, existingWall.removed_phase)
  assert.equal(wallBounds.level_id, existingWall.module_data.level_id)
  assert.deepEqual(wallBounds.host_refs, existingWall.host_refs)
})

test('column clash bounds use the same base/top level references and offsets as 3D', () => {
  const edited = structuredClone(project)
  edited.levels = [
    { id: 'GF', name: 'Ground', elevation_mm: 0, storey_index: 0, height_mm: 400 },
    { id: 'L1', name: 'First Floor', elevation_mm: 400, storey_index: 1, height_mm: 3000 },
    { id: 'EAVE', name: 'Eaves', elevation_mm: 3400, storey_index: 2, height_mm: 2000 },
  ]
  const column = Object.values(edited.objects).find(object => object.object_type === 'structure.column')
  column.module_data.base_level_id = 'GF'
  column.module_data.top_level_id = 'EAVE'
  column.module_data.base_offset_mm = 100
  column.module_data.top_offset_mm = -50
  const bounds = analyzeProjectSpatialBounds(edited).objects.find(object => object.object_id === column.id).bounds
  assert.equal(bounds.min[2], 100)
  assert.equal(bounds.max[2], 3350)
})

test('S3: broad-phase interactions separate linked connections, boundary contact and unresolved overlap', () => {
  const box = (object_id, min, max, host_refs = []) => ({
    object_id, object_type: 'test.object', created_phase: 'new_construction',
    removed_phase: null, host_refs, bounds: { min, max },
  })
  const first = box('first', [0, 0, 0], [10, 10, 10])
  const touching = box('touching', [10, 2, 2], [20, 8, 8])
  const overlapping = box('overlapping', [5, 2, 2], [15, 8, 8])
  const connected = box('connected', [5, 2, 2], [15, 8, 8], ['first'])
  const interactions = classifySpatialInteractions({
    objects: [first, touching, overlapping, connected],
    candidate_pairs: [
      { first, second: touching },
      { first, second: overlapping },
      { first, second: connected },
    ],
    warnings: [],
  })

  assert.deepEqual(interactions.map(({ kind, overlap_mm }) => ({ kind, overlap_mm })), [
    { kind: 'boundary_contact', overlap_mm: [0, 6, 6] },
    { kind: 'overlap_candidate', overlap_mm: [5, 6, 6] },
    { kind: 'intentional_connection', overlap_mm: [5, 6, 6] },
  ])
  assert.throws(() => classifySpatialInteractions({ objects: [], candidate_pairs: [], warnings: [] }, -1), /non-negative/)
  assert.throws(() => classifySpatialInteractions({ objects: [], candidate_pairs: [], warnings: [] }, Number.NaN), /non-negative/)
})

test('S3: kitchen overlap candidates are not mislabeled as final hard-clash verdicts', () => {
  const analysis = analyzeProjectSpatialBounds(project)
  const interactions = classifySpatialInteractions(analysis)
  const linked = interactions.filter(item => item.kind === 'intentional_connection')
  const unresolved = interactions.filter(item => item.kind === 'overlap_candidate')

  assert.ok(linked.length > 0, 'column/beam and column/foundation links remain identifiable')
  assert.ok(unresolved.length > 0, 'unlinked AABB overlaps remain available for exact-phase analysis')
  assert.ok(interactions.every(item => !['hard_clash', 'soft_clash'].includes(item.kind)))
})
