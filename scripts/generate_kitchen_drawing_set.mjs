import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileInitialDrawingSet } from '../packages/sheet-engine/dist/index.js'
import { deserializeProject } from '../packages/project-model/dist/index.js'

const projectUrl = new URL('../examples/kitchen-extension-proof.cfproj', import.meta.url)
const project = deserializeProject(await readFile(projectUrl, 'utf8'))
const drawingSet = compileInitialDrawingSet(project)
assert.deepEqual(drawingSet.sheets.map(sheet => sheet.id), ['A-02', 'S-01', 'A-08'])
assert.equal(drawingSet.warnings.length, 1, `Expected one grouped unassigned pile-length warning: ${drawingSet.warnings.join('; ')}`)
assert.ok(drawingSet.warnings.every(warning => warning.includes('pile length is not assigned')), 'Drawing warnings must identify the unassigned pile lengths')
for (const sheet of drawingSet.sheets) {
  assert.ok(sheet.svg.includes('width="420mm" height="297mm" viewBox="0 0 420 297"'), `${sheet.id} is not A3 landscape`)
}
const [a02, s01, a08] = drawingSet.sheets
assert.ok(a02.svg.includes('Envelope extents 4.00 m × 2.50 m'), 'A-02 must dimension the wall envelope, not foundation overhangs')
assert.ok(a02.svg.includes('D1') && a02.svg.includes('W1'), 'A-02 must show the hosted door and window')
assert.ok(s01.svg.includes('Foundations: 4') && s01.svg.includes('Columns: 4'), 'S-01 must show the four foundation/column pairs')
assert.equal((s01.svg.match(/micro_pile_i18 × 4/g) ?? []).length, 8, 'S-01 must label four preliminary I-18 pile groups on plan and in the note block')
assert.equal((s01.svg.match(/LENGTH TBD/g) ?? []).length, 4, 'S-01 must leave pile lengths visibly unassigned')
assert.ok(a08.svg.includes('ALL LEVELS') && a08.svg.includes('0.90') && a08.svg.includes('1.20'), 'A-08 must include the opening schedule and catalog dimensions')

const outputDirectory = fileURLToPath(new URL('../examples/kitchen-extension-drawings/', import.meta.url))
await mkdir(outputDirectory, { recursive: true })
for (const sheet of drawingSet.sheets) {
  await writeFile(join(outputDirectory, `${sheet.id}.svg`), `${sheet.svg}\n`, 'utf8')
}
const manifest = {
  source_file: 'kitchen-extension-proof.cfproj',
  project_id: drawingSet.project_id,
  sheets: drawingSet.sheets.map(({ id, title, scale }) => ({ id, file: `${id}.svg`, title, scale })),
  warnings: drawingSet.warnings,
}
await writeFile(join(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
process.stdout.write(`Wrote ${drawingSet.sheets.length} A3 SVG sheets from ${project.project.id} to ${outputDirectory}\n`)
