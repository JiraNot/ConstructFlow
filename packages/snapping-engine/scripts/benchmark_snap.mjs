import assert from 'node:assert/strict'
import { cpus } from 'node:os'
import { performance } from 'node:perf_hooks'
import { SnapSpatialIndex, snapPoint } from '../dist/index.js'

const point = [500, 2]
const viewport = { zoom: 1 }
const modes = new Set(['endpoint', 'centerline', 'intersection'])
const makeProject = count => ({
  objects: Object.fromEntries(Array.from({ length: count }, (_, index) => {
    const x = index === 0 ? 0 : 100_000 + index * 3000
    const y = index === 0 ? 0 : 100_000 + (index % 7) * 3000
    const id = `wall-${index.toString().padStart(5, '0')}`
    return [id, {
      id,
      object_type: 'architecture.wall',
      module_data: {
        mark: id,
        start_point_mm: [x, y],
        end_point_mm: [x + 1000, y],
        thickness_mm: 100,
      },
    }]
  })),
})

const elapsed = action => {
  const started = performance.now()
  const value = action()
  return { milliseconds: Number((performance.now() - started).toFixed(3)), value }
}
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

const results = []
for (const objectCount of [500, 1000, 5000]) {
  const project = makeProject(objectCount)
  const indexBuild = elapsed(() => new SnapSpatialIndex(project))
  const index = indexBuild.value
  const candidateIds = index.candidateObjectIds(point, 16)
  const candidateQuerySamples = Array.from({ length: 11 }, () => elapsed(() => index.candidateObjectIds(point, 16)).milliseconds)
  let fullResult
  let indexedResult
  const fullSamples = []
  const indexedSamples = []
  for (let sample = 0; sample < 7; sample++) {
    const full = elapsed(() => snapPoint(point, project, viewport, 16, modes))
    const indexed = elapsed(() => snapPoint(point, project, viewport, 16, modes, undefined, candidateIds))
    fullResult = full.value
    indexedResult = indexed.value
    fullSamples.push(full.milliseconds)
    indexedSamples.push(indexed.milliseconds)
  }
  assert.deepEqual(indexedResult, fullResult, `indexed result differs at ${objectCount} objects`)
  results.push({
    object_count: objectCount,
    index_build_ms: indexBuild.milliseconds,
    candidate_query_median_ms: median(candidateQuerySamples),
    indexed_candidates: candidateIds.length,
    full_snap_median_ms: median(fullSamples),
    indexed_snap_median_ms: median(indexedSamples),
    samples: 7,
    equivalent_snap_result: true,
  })
}

console.log(JSON.stringify({
  benchmark: 'snapping-engine point snap broad phase',
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  cpu: cpus()[0]?.model ?? 'unknown',
  deterministic_fixture: 'parallel residential wall runs, one local candidate, 16 screen-pixel tolerance at zoom 1',
  results,
}, null, 2))
