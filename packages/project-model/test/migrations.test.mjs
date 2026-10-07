import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { deserializeProject, serializeProject } from '../dist/index.js'

const fixtureUrl = new URL('../../../examples/kitchen-extension-proof-v1.cfproj', import.meta.url)
const fixtureText = await readFile(fixtureUrl, 'utf8')
const currentFixtureText = await readFile(new URL('../../../examples/kitchen-extension-proof.cfproj', import.meta.url), 'utf8')
const fixture = JSON.parse(fixtureText)
const typeUuidV5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test('S0: v1 migration is deterministic and preserves object UUIDs and instance overrides', () => {
  const migrated = deserializeProject(fixtureText)
  const migratedAgain = deserializeProject(fixtureText)
  const existingWall = Object.values(migrated.objects).find(object =>
    object.object_type === 'architecture.wall' && object.created_phase === 'existing'
  )

  assert.equal(migrated.schema_version, 2)
  assert.equal(serializeProject(migratedAgain), serializeProject(migrated))
  assert.deepEqual(Object.keys(migrated.objects).sort(), Object.keys(fixture.objects).sort())
  assert.ok(migrated.types.every(type => typeUuidV5.test(type.id)))
  assert.equal(existingWall.module_data.instance_overrides?.thickness_mm, 150)
})

test('S0: uppercase UUID type references normalize before resolving', () => {
  const migratedBaseline = deserializeProject(fixtureText)
  const transitionalV1 = structuredClone(fixture)
  transitionalV1.types = transitionalV1.types.map(type => {
    const canonical = migratedBaseline.types.find(value =>
      value.object_type === type.object_type && value.name === type.name
    )
    return { ...type, id: canonical.id }
  })
  const existingWall = Object.values(transitionalV1.objects).find(object =>
    object.object_type === 'architecture.wall' && object.created_phase === 'existing'
  )
  const canonicalWallType = migratedBaseline.types.find(type =>
    type.object_type === 'architecture.wall' && type.name === existingWall.module_data.mark
  )
  existingWall.module_data.type_id = canonicalWallType.id.toUpperCase()
  existingWall.module_data.thickness_mm = canonicalWallType.parameters.thickness_mm

  const migrated = deserializeProject(JSON.stringify(transitionalV1))
  const normalizedWall = migrated.objects[existingWall.id]
  assert.equal(normalizedWall.module_data.type_id, canonicalWallType.id)
})

test('S0: ambiguous legacy type marks are rejected instead of guessed', () => {
  const ambiguousV1 = structuredClone(fixture)
  const wallType = ambiguousV1.types.find(type => type.object_type === 'architecture.wall')
  ambiguousV1.types.push({ ...structuredClone(wallType), id: `${wallType.id}-duplicate` })

  assert.throws(
    () => deserializeProject(JSON.stringify(ambiguousV1)),
    /Ambiguous v1 type mark/,
  )
})

test('S0: v2 import rejects catalog parameters outside their object family', () => {
  const invalidV2 = deserializeProject(fixtureText)
  const beamType = invalidV2.types.find(type => type.object_type === 'structure.beam')
  beamType.parameters.size_mm = [800, 800, 300]

  assert.throws(
    () => deserializeProject(JSON.stringify(invalidV2)),
    /size_mm outside its structure\.beam family/,
  )
})

test('S0: v2 import requires persistent Smart Object UUIDs and rejects case-variant duplicates', () => {
  const invalidId = deserializeProject(fixtureText)
  const [validId] = Object.keys(invalidId.objects)
  const invalidObject = invalidId.objects[validId]
  delete invalidId.objects[validId]
  invalidObject.id = 'column-1'
  invalidId.objects[invalidObject.id] = invalidObject
  assert.throws(
    () => deserializeProject(JSON.stringify(invalidId)),
    /malformed Smart Object column-1/,
  )

  const duplicateId = deserializeProject(fixtureText)
  const [existingId] = Object.keys(duplicateId.objects)
  const duplicate = structuredClone(duplicateId.objects[existingId])
  duplicate.id = existingId.toUpperCase()
  duplicateId.objects[duplicate.id] = duplicate
  assert.throws(
    () => deserializeProject(JSON.stringify(duplicateId)),
    /duplicate Smart Object UUID/,
  )
})

test('S0: v2 import rejects openings outside the host wall and invalid removal phases', () => {
  const invalidOpening = deserializeProject(fixtureText)
  const window = Object.values(invalidOpening.objects).find(object => object.object_type === 'door_window.window')
  window.module_data.offset_along_wall_mm = 3900
  assert.throws(
    () => deserializeProject(JSON.stringify(invalidOpening)),
    /does not fit within host wall/,
  )

  const invalidRemoval = deserializeProject(fixtureText)
  const existingWall = Object.values(invalidRemoval.objects).find(object =>
    object.object_type === 'architecture.wall' && object.created_phase === 'existing'
  )
  existingWall.removed_phase = 'new_construction'
  assert.throws(
    () => deserializeProject(JSON.stringify(invalidRemoval)),
    /has an unsupported removed phase/,
  )
})

test('S0/S1: v2 import rejects an interface treatment with a missing target wall UUID', () => {
  const invalidInterface = deserializeProject(currentFixtureText)
  const existingWall = Object.values(invalidInterface.objects).find(object =>
    object.object_type === 'architecture.wall' && object.created_phase === 'existing'
  )
  assert.ok(Array.isArray(existingWall.module_data.interface_treatments))
  existingWall.module_data.interface_treatments[0].target_object_ids[0] = 'b49c4c86-9586-4b9c-b651-d2cf165db43f'

  assert.throws(
    () => deserializeProject(JSON.stringify(invalidInterface)),
    /interface treatment references a missing or non-new wall/,
  )
})
