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

const iterations = Number(process.env.CONSTRUCTFLOW_BENCH_ITERATIONS ?? 12)
const warmups = Math.min(3, Math.max(1, Math.floor(iterations / 4)))
if (!Number.isInteger(iterations) || iterations < 4) throw new Error('CONSTRUCTFLOW_BENCH_ITERATIONS must be an integer >= 4')

const kitchen = createKitchenProofProject('human')
if (kitchen.status !== 'success') throw new Error(kitchen.errors?.join('; ') ?? 'Kitchen proof generation failed')
const referenceHouse = JSON.parse(fs.readFileSync(new URL('../examples/constructflow-reference-house-2storey.cfproj', import.meta.url), 'utf8'))
const renovation = createRenovationIntegrationProject()
const fixtures = [
  { name: 'kitchen-proof', project: kitchen.updatedProject },
  { name: 'reference-house-2storey', project: referenceHouse },
  { name: 'renovation-house-plus-kitchen', project: renovation.project },
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
for (const { name, project } of fixtures) {
  const objects = Object.values(project.objects)
  const ground = project.project.active_level_id
  const planObjects = getPlanVisibleObjects(project, 'architecture')
  const snapIndex = new SnapSpatialIndex(project)
  const samplePoint = (() => {
    const point = objects.find(object => Array.isArray(object.module_data.location_mm))?.module_data.location_mm
    return point ? [point[0], point[1]] : [0, 0]
  })()
  const tasks = {
    project_object_summary: () => countProjectObjects(project),
    plan_projection: () => getPlanViewProject(project, planObjects),
    snap_index_build: () => new SnapSpatialIndex(project),
    snap_candidate_query: () => snapIndex.candidateObjectIds(samplePoint, 3000),
    coordination: () => runCoordination(project),
    takeoff: () => calculateTakeoff(project),
    phased_boq: () => calculatePhasedBOQ(project),
    drawing_set_compile: () => compileInitialDrawingSet(project),
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
  snap_candidate_query: 'Snap candidate query', coordination: 'Coordination', takeoff: 'Takeoff',
  phased_boq: 'Phased BOQ', drawing_set_compile: 'Drawing set compile',
}
const markdown = [
  '# Editor Engine Performance Matrix — 2026-10', '',
  `**Generated:** ${report.generated_at}  `,
  `**Runtime:** ${report.runtime.node}, ${report.runtime.platform} ${report.runtime.arch}  `,
  `**Method:** ${warmups} warmups, ${iterations} measured runs per operation; nearest-rank p50/p95. All values are milliseconds.`, '',
  'These are synchronous Node engine timings for named project fixtures. They do not measure browser rendering, pointer-to-paint latency, React scheduling, or native CAD. Results are informational; no latency thresholds are defined.', '',
  '| Fixture | Objects | Operation | p50 ms | p95 ms |', '| --- | ---: | --- | ---: | ---: |',
  ...matrix.map(row => `| ${row.fixture} | ${row.object_count} | ${taskLabels[row.task] ?? row.task} | ${row.p50_ms.toFixed(3)} | ${row.p95_ms.toFixed(3)} |`), '',
  `Raw measurements: [EDITOR-PERFORMANCE-MATRIX-2026-10.json](./EDITOR-PERFORMANCE-MATRIX-2026-10.json).`,
  'This matrix covers 21-object kitchen, 239-object two-storey house, and 260-object combined renovation fixtures. It does not cover 500/1,000/5,000/20,000-object stress projects, load/schema validation, hit testing, marquee selection, undo/redo, serialization, or canvas frame time.', '',
].join('\n')
fs.writeFileSync(new URL('../docs/performance/EDITOR-PERFORMANCE-MATRIX-2026-10.md', import.meta.url), markdown)
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
