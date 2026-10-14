import fs from 'node:fs'
import { performance } from 'node:perf_hooks'
import { countProjectObjects } from '../apps/plan-editor/src/app/projectStatistics.mjs'
import { createKitchenProofProject } from '../packages/extension-engine/dist/index.js'
import { getPlanViewProject, getPlanVisibleObjects } from '../packages/representation-engine/dist/index.js'
import { SnapSpatialIndex } from '../packages/snapping-engine/dist/index.js'
import { runCoordination } from '../packages/clash-engine/dist/index.js'
import { calculateTakeoff, calculatePhasedBOQ } from '../packages/takeoff-engine/dist/index.js'
import { compileInitialDrawingSet } from '../packages/sheet-engine/dist/index.js'
import { createRenovationIntegrationProject } from './fixtures/renovationIntegrationProject.mjs'
import { findPlanHitObject } from '../apps/plan-editor/src/components/planHitTesting.mjs'

const iterations = Number(process.env.CONSTRUCTFLOW_BENCH_ITERATIONS ?? 12)
const warmups = Math.min(3, Math.max(1, Math.floor(iterations / 4)))
if (!Number.isInteger(iterations) || iterations < 4) throw new Error('CONSTRUCTFLOW_BENCH_ITERATIONS must be an integer >= 4')

const kitchen = createKitchenProofProject('human')
if (kitchen.status !== 'success') throw new Error(kitchen.errors?.join('; ') ?? 'Kitchen proof generation failed')
const referenceHouse = JSON.parse(fs.readFileSync(new URL('../examples/constructflow-reference-house-2storey.cfproj', import.meta.url), 'utf8'))
const renovation = createRenovationIntegrationProject()
const makeStressFixture = (sourceProject, targetObjectCount) => {
  const sourceObjects = Object.values(sourceProject.objects)
  if (targetObjectCount % sourceObjects.length !== 0) throw new Error('Stress fixture size must be a multiple of the source object count')
  const columns = 5
  const tileSpacingMm = 50_000
  const coordinateKeys = new Set(['location_mm', 'center_mm', 'start_point_mm', 'end_point_mm', 'origin_mm', 'boundary_mm', 'vertices_mm', 'points_mm', 'outline_mm', 'path_mm', 'route_points_mm'])
  const objects = { ...sourceProject.objects }
  const remapAndTranslate = (value, key, ids, dx, dy) => {
    if (typeof value === 'string') return ids.get(value) ?? value
    if (Array.isArray(value)) {
      if (coordinateKeys.has(key) && value.every(item => typeof item === 'number')) {
        return value.map((item, index) => index === 0 ? item + dx : index === 1 ? item + dy : item)
      }
      return value.map(item => remapAndTranslate(item, key, ids, dx, dy))
    }
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      remapAndTranslate(childValue, childKey, ids, dx, dy),
    ]))
  }
  const tileCount = targetObjectCount / sourceObjects.length
  for (let tile = 1; tile < tileCount; tile += 1) {
    const ids = new Map(sourceObjects.map(object => [object.id, crypto.randomUUID()]))
    const dx = (tile % columns) * tileSpacingMm
    const dy = Math.floor(tile / columns) * tileSpacingMm
    for (const object of sourceObjects) {
      const clone = remapAndTranslate(object, '', ids, dx, dy)
      clone.id = ids.get(object.id)
      objects[clone.id] = clone
    }
  }
  return { ...sourceProject, objects }
}
const fixtures = [
  { name: 'kitchen-proof', project: kitchen.updatedProject },
  { name: 'reference-house-2storey', project: referenceHouse },
  { name: 'renovation-house-plus-kitchen', project: renovation.project },
  { name: 'synthetic-house-478', project: makeStressFixture(referenceHouse, 478), stress: true },
  { name: 'synthetic-house-956', project: makeStressFixture(referenceHouse, 956), stress: true },
  { name: 'synthetic-house-4780', project: makeStressFixture(referenceHouse, 4780), stress: true },
]

const quantile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)]
const benchmark = (fn) => {
  for (let index = 0; index < warmups; index += 1) fn()
  const values = []
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now()
    fn()
    values.push(performance.now() - start)
  }
  return { p50_ms: Number(quantile(values, 0.5).toFixed(3)), p95_ms: Number(quantile(values, 0.95).toFixed(3)) }
}

const matrix = []
for (const { name, project, stress = false } of fixtures) {
  const objects = Object.values(project.objects)
  const ground = project.project.active_level_id
  const planObjects = getPlanVisibleObjects(project, 'architecture')
  const projectedPlan = getPlanViewProject(project, planObjects)
  const snapIndex = new SnapSpatialIndex(project)
  const samplePoint = (() => {
    const point = objects.find(object => Array.isArray(object.module_data.location_mm))?.module_data.location_mm
    return point ? [point[0], point[1]] : [0, 0]
  })()
  const tasks = {
    project_object_summary: () => countProjectObjects(project),
    plan_projection: () => getPlanViewProject(project, planObjects),
    plan_hit_test: () => findPlanHitObject(samplePoint, projectedPlan, project, 0.08),
    snap_index_build: () => new SnapSpatialIndex(project),
    snap_candidate_query: () => snapIndex.candidateObjectIds(samplePoint, 3000),
    ...(!stress ? {
      coordination: () => runCoordination(project),
      takeoff: () => calculateTakeoff(project),
      phased_boq: () => calculatePhasedBOQ(project),
      drawing_set_compile: () => compileInitialDrawingSet(project),
    } : {
      coordination: () => runCoordination(project),
    }),
  }
  for (const [task, execute] of Object.entries(tasks)) {
    matrix.push({ fixture: name, object_count: objects.length, task, ...benchmark(execute) })
  }
  if (typeof ground !== 'string') throw new Error(`${name} has no active level`)
}

const report = {
  generated_at: new Date().toISOString(),
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  method: { warmups, iterations, percentile: 'nearest-rank', units: 'ms', thresholds: 'informational; no pass/fail latency budget set' },
  matrix,
}
const output = new URL('../docs/performance/EDITOR-PERFORMANCE-MATRIX-2026-10.json', import.meta.url)
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
const taskLabels = {
  project_object_summary: 'Object summary', plan_projection: 'Plan projection', snap_index_build: 'Snap index build',
  plan_hit_test: 'Plan hit test',
  snap_candidate_query: 'Snap candidate query', coordination: 'Coordination', takeoff: 'Takeoff',
  phased_boq: 'Phased BOQ', drawing_set_compile: 'Drawing set compile',
}
const markdown = [
  '# Editor Engine Performance Matrix — 2026-10', '',
  `- **Generated:** ${report.generated_at}`,
  `- **Runtime:** ${report.runtime.node}, ${report.runtime.platform} ${report.runtime.arch}`,
  `- **Method:** ${warmups} warmups, ${iterations} measured runs per operation; nearest-rank p50/p95. All values are milliseconds.`, '',
  'These are synchronous Node engine timings for named project fixtures. They do not measure browser rendering, pointer-to-paint latency, React scheduling, or native CAD. Results are informational; no latency thresholds are defined.', '',
  '| Fixture | Objects | Operation | p50 ms | p95 ms |', '| --- | ---: | --- | ---: | ---: |',
  ...matrix.map(row => `| ${row.fixture} | ${row.object_count} | ${taskLabels[row.task] ?? row.task} | ${row.p50_ms.toFixed(3)} | ${row.p95_ms.toFixed(3)} |`), '',
  `Raw measurements: [EDITOR-PERFORMANCE-MATRIX-2026-10.json](./EDITOR-PERFORMANCE-MATRIX-2026-10.json).`,
  'This matrix covers 21-object kitchen, 239-object two-storey house, 260-object combined renovation fixture, and synthetic 478/956/4,780-object geometry tiles. Synthetic stress fixtures are not residential acceptance models. Stress rows measure object summary, plan projection/hit-testing, snap-index/query, and the coordination engine; takeoff, BOQ, and drawing compilation remain unmeasured at that scale. Browser frame time, marquee selection, undo/redo, load/schema validation, and serialization still require separate evidence.', '',
].join('\n')
fs.writeFileSync(new URL('../docs/performance/EDITOR-PERFORMANCE-MATRIX-2026-10.md', import.meta.url), markdown)
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
