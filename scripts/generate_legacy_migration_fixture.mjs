import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createKitchenProofProject } from '../packages/extension-engine/dist/index.js'
import { deserializeProject, serializeProject } from '../packages/project-model/dist/index.js'

const generated = createKitchenProofProject('human')
if (generated.status !== 'success') throw new Error(generated.errors?.join('; ') || 'Kitchen Proof generation failed')

const legacy = structuredClone(generated.updatedProject)
legacy.schema_version = 1
legacy.types = legacy.types.map(({ id, ...type }) => ({ ...type, id: type.name }))
for (const object of Object.values(legacy.objects)) {
  const data = object.module_data
  delete data.type_id
  delete data.instance_overrides
}

const fixtureUrl = new URL('../examples/kitchen-extension-proof-v1.cfproj', import.meta.url)
const fixturePath = fileURLToPath(fixtureUrl)
await mkdir(dirname(fixturePath), { recursive: true })
const sourceText = `${JSON.stringify(legacy, null, 2)}\n`
await writeFile(fixturePath, sourceText, 'utf8')

const firstLoad = deserializeProject(await readFile(fixturePath, 'utf8'))
const secondLoad = deserializeProject(sourceText)
const canonical = serializeProject(firstLoad)
assert.equal(serializeProject(secondLoad), canonical, 'v1 migration must be deterministic')
assert.equal(firstLoad.schema_version, 2, 'v1 fixture must migrate to schema v2')
assert.deepEqual(Object.keys(firstLoad.objects).sort(), Object.keys(generated.updatedProject.objects).sort(), 'migration must preserve Smart Object UUIDs')
assert.ok(firstLoad.types.every(type => /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(type.id)), 'legacy type marks must receive deterministic UUID v5 identities')

const retainedExistingWall = Object.values(firstLoad.objects).find(object =>
  object.object_type === 'architecture.wall' && object.created_phase === 'existing'
)
assert.equal(retainedExistingWall?.module_data.instance_overrides?.thickness_mm, 150, 'legacy wall instance dimensions must survive as a catalog override')

process.stdout.write(`Wrote ${fixturePath}\n`)
process.stdout.write(`Migrated ${Object.keys(firstLoad.objects).length} Smart Objects and ${firstLoad.types.length} type definitions to schema v2; UUIDs and a legacy wall override were preserved.\n`)
