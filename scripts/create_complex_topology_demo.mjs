import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createEmptyProjectDocument, serializeProject } from '../packages/project-model/dist/index.js'
import { CommandBus } from '../packages/command-runtime/dist/index.js'

const out = resolve('examples/complex-topology-stress-test.cfproj')
const project = createEmptyProjectDocument('CF-STRESS-TEST', 'Complex Topology Stress Test')
project.levels = [
  { id: 'GF', name: 'Ground Floor', elevation_mm: 0, storey_index: 1, height_mm: 3000 },
  { id: 'L1', name: 'First Floor', elevation_mm: 3000, storey_index: 2, height_mm: 3000 }
]
project.project.active_level_id = 'GF'

let model = project

function exec(name, input) {
    const id = input.id ?? crypto.randomUUID()
    const result = CommandBus.execute(model, name, { ...input, id })
    if (result.result.status !== 'success') {
        throw new Error(`Command ${name} failed: ${JSON.stringify(result.result)}`)
    }
    model = result.project
    return id
}

async function build() {
    // 1. Create walls forming an acute/concave boundary
    const w1 = exec('CreateWall', { type_id: 'W1', start_mm: [0, 0], end_mm: [5000, 0], level_id: 'GF' })
    const w2 = exec('CreateWall', { type_id: 'W1', start_mm: [5000, 0], end_mm: [5000, 5000], level_id: 'GF' })
    const w3 = exec('CreateWall', { type_id: 'W1', start_mm: [5000, 5000], end_mm: [2000, 5000], level_id: 'GF' })
    // Concave cut-in
    const w4 = exec('CreateWall', { type_id: 'W1', start_mm: [2000, 5000], end_mm: [2000, 2000], level_id: 'GF' })
    const w5 = exec('CreateWall', { type_id: 'W1', start_mm: [2000, 2000], end_mm: [0, 2000], level_id: 'GF' })
    const w6 = exec('CreateWall', { type_id: 'W1', start_mm: [0, 2000], end_mm: [0, 0], level_id: 'GF' })

    // Acute triangle
    const w7 = exec('CreateWall', { type_id: 'W1', start_mm: [5000, 0], end_mm: [8000, 2000], level_id: 'GF' })
    const w8 = exec('CreateWall', { type_id: 'W1', start_mm: [8000, 2000], end_mm: [5000, 5000], level_id: 'GF' })

    // A large multi-storey space with ceiling cutouts will go here

    const serialized = serializeProject(model)
    await writeFile(out, JSON.stringify(serialized, null, 2))
    console.log(`Generated ${out}`)
}

build().catch(console.error)
