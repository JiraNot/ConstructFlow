import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readProjectFile, writeProjectFile } from '../apps/plan-editor/src/projectFileIO.js'
import { serializeProject } from '../packages/project-model/dist/index.js'
import { calculateTakeoff } from '../packages/takeoff-engine/dist/index.js'
import { compileInitialDrawingSet } from '../packages/sheet-engine/dist/index.js'

const projectPath = new URL('../examples/kitchen-extension-proof.cfproj', import.meta.url)
const source = await readFile(projectPath, 'utf8')
const opened = await readProjectFile({
  name: 'kitchen-extension-proof.cfproj',
  text: async () => source,
})
assert.equal(serializeProject(opened.project), opened.serialized, 'open must return canonical project JSON')
const expectedTakeoff = calculateTakeoff(opened.project)
const expectedSheets = compileInitialDrawingSet(opened.project)
await assert.rejects(
  readProjectFile({ name: 'broken.cfproj', text: async () => '{"schema_version":2}' }),
  'an incomplete project document must fail before the editor can replace its current state',
)

const tempDirectory = await mkdtemp(join(tmpdir(), 'constructflow-file-io-'))
const diskPath = join(tempDirectory, 'roundtrip.cfproj')
try {
  await writeProjectFile({
    createWritable: async () => ({
      write: async contents => writeFile(diskPath, contents, 'utf8'),
      close: async () => {},
      abort: async () => rm(diskPath, { force: true }),
    }),
  }, opened.serialized)
  const diskOpened = await readProjectFile({
    name: 'roundtrip.cfproj',
    text: async () => readFile(diskPath, 'utf8'),
  })
  assert.equal(diskOpened.serialized, opened.serialized, 'local disk roundtrip must preserve canonical JSON')
  assert.deepEqual(
    Object.keys(diskOpened.project.objects).sort(),
    Object.keys(opened.project.objects).sort(),
    'local disk roundtrip must preserve persistent object UUIDs',
  )
  assert.deepEqual(calculateTakeoff(diskOpened.project), expectedTakeoff, 'reopened project must produce identical phased quantities')
  assert.deepEqual(
    compileInitialDrawingSet(diskOpened.project),
    expectedSheets,
    'reopened project must produce identical A-02, S-01 and A-08 sheets',
  )
} finally {
  await rm(tempDirectory, { recursive: true, force: true })
}

const events = []
let saved = ''
await writeProjectFile({
  createWritable: async () => ({
    write: async value => { events.push('write'); saved = value },
    close: async () => { events.push('close') },
  }),
}, opened.serialized)
assert.equal(saved, opened.serialized, 'save must write the opened project snapshot')
assert.deepEqual(events, ['write', 'close'], 'save must close only after the full snapshot is written')

let aborted = false
await assert.rejects(
  writeProjectFile({
    createWritable: async () => ({
      write: async () => { throw new Error('simulated write failure') },
      close: async () => {},
      abort: async () => { aborted = true },
    }),
  }, opened.serialized),
  /simulated write failure/,
)
assert.equal(aborted, true, 'failed local writes must abort the writable when supported')

let closeAborted = false
await assert.rejects(
  writeProjectFile({
    createWritable: async () => ({
      write: async () => {},
      close: async () => { throw new Error('simulated close failure') },
      abort: async () => { closeAborted = true },
    }),
  }, opened.serialized),
  /simulated close failure/,
)
assert.equal(closeAborted, true, 'a failed commit/close must also abort when supported')

process.stdout.write('Project file IO acceptance passed: canonical open, invalid-file rejection, local disk roundtrip, complete write/close, and write/close failure abort.\n')
