import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createKitchenProofProject } from '../packages/extension-engine/dist/index.js'
import { deserializeProject, serializeProject } from '../packages/project-model/dist/index.js'

const result = createKitchenProofProject('human')
if (result.status !== 'success') throw new Error(result.errors?.join('; ') || 'Kitchen Proof generation failed')

const outputUrl = new URL('../examples/kitchen-extension-proof.cfproj', import.meta.url)
await mkdir(dirname(fileURLToPath(outputUrl)), { recursive: true })
const serialized = serializeProject(result.updatedProject)
await writeFile(outputUrl, `${serialized}\n`, 'utf8')
const reopened = deserializeProject(await readFile(outputUrl, 'utf8'))
if (serializeProject(reopened) !== serialized) throw new Error('Kitchen Proof file roundtrip changed the serialized project')
process.stdout.write(`Wrote ${fileURLToPath(outputUrl)}\n`)
