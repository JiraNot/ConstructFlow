import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { DEFAULT_TYPES, createEmptyProjectDocument, deserializeProject, serializeProject, validateDrawingSettings } from '../dist/index.js'

const fixtureUrl = new URL('../../../examples/kitchen-extension-proof-v1.cfproj', import.meta.url)
const fixtureText = await readFile(fixtureUrl, 'utf8')
const currentFixtureText = await readFile(new URL('../../../examples/kitchen-extension-proof.cfproj', import.meta.url), 'utf8')
const fixture = JSON.parse(fixtureText)
const typeUuidV5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test('drawing settings accept locked associative dimension placements and reject malformed offsets', () => {
  validateDrawingSettings({ viewports: { 'A-02': { scale_denominator: 100, dimension_overrides: { 'opening:uuid:width': { offset_mm: [12.5, -4], locked: true } } } } })
  validateDrawingSettings({ viewports: { 'A-02': { scale_denominator: 100 } } })
  assert.throws(() => validateDrawingSettings({ viewports: { 'A-02': { scale_denominator: 100, dimension_overrides: { x: { offset_mm: [Infinity, 0], locked: true } } } } }), /Invalid locked dimension placement/)
  assert.throws(() => validateDrawingSettings({ viewports: { 'A-02': { scale_denominator: 100, dimension_overrides: { x: { offset_mm: [0, 0], locked: false } } } } }), /Invalid locked dimension placement/)
})

test('door and window defaults include distinct opening styles for the 3D model', () => {
  const doors = DEFAULT_TYPES.filter(type => type.object_type === 'door_window.door')
  const windows = DEFAULT_TYPES.filter(type => type.object_type === 'door_window.window')

  assert.deepEqual(doors.map(type => type.name).sort(), ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'])
  assert.deepEqual(windows.map(type => type.name).sort(), ['W1', 'W10', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9'])
  assert.ok(doors.some(type => type.parameters.opening_operation === 'sliding' && type.parameters.panel_count === 3))
  assert.ok(doors.some(type => type.parameters.opening_operation === 'sliding' && type.parameters.transom_height_mm > 0))
  assert.ok(doors.some(type => type.parameters.opening_operation === 'louver'))
  assert.ok(windows.some(type => type.parameters.opening_operation === 'hinged' && type.parameters.muntin_rows > 1))
  assert.ok(windows.some(type => type.parameters.opening_operation === 'sliding' && type.parameters.transom_height_mm > 0 && type.parameters.bottom_light_height_mm > 0))
})

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

test('S0: opening families validate operation, panel count, glazing and placement references', () => {
  const valid = deserializeProject(currentFixtureText)
  const windowType = valid.types.find(type => type.object_type === 'door_window.window')
  windowType.parameters.opening_operation = 'sliding'
  windowType.parameters.panel_count = 2
  windowType.parameters.frame_depth_mm = 65
  windowType.parameters.glazing_material = 'clear_glass'
  windowType.parameters.glazing_transmission = 0.72
  const wall = Object.values(valid.objects).find(object => object.object_type === 'architecture.wall')
  wall.module_data.placement_reference = 'left_face'
  assert.doesNotThrow(() => deserializeProject(JSON.stringify(valid)))

  const invalidTransmission = structuredClone(valid)
  invalidTransmission.types.find(type => type.object_type === 'door_window.window').parameters.glazing_transmission = 1.2
  assert.throws(() => deserializeProject(JSON.stringify(invalidTransmission)), /glazing transmission must be between 0 and 1/)

  const invalidReference = structuredClone(valid)
  Object.values(invalidReference.objects).find(object => object.object_type === 'architecture.wall').module_data.placement_reference = 'inside-ish'
  assert.throws(() => deserializeProject(JSON.stringify(invalidReference)), /invalid placement reference/)
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

test('S0: v1 migration supplies canonical phases when the legacy phase list is absent', () => {
  const legacy = structuredClone(fixture)
  delete legacy.phases

  const migrated = deserializeProject(JSON.stringify(legacy))
  assert.deepEqual(migrated.phases.map(phase => phase.id), ['existing', 'demolition', 'new_construction'])
})

test('S0: v2 import validates canonical phase definitions and required Smart Object envelope fields', () => {
  const invalidPhase = deserializeProject(fixtureText)
  invalidPhase.phases[1].id = 'renovation'
  assert.throws(() => deserializeProject(JSON.stringify(invalidPhase)), /phase 2 is malformed/)

  const missingConnectorRefs = deserializeProject(fixtureText)
  const object = Object.values(missingConnectorRefs.objects)[0]
  delete object.connector_refs
  assert.throws(() => deserializeProject(JSON.stringify(missingConnectorRefs)), /malformed Smart Object/)

  const invalidStatus = deserializeProject(fixtureText)
  Object.values(invalidStatus.objects)[0].status = 'deleted'
  assert.throws(() => deserializeProject(JSON.stringify(invalidStatus)), /invalid status/)
})

test('S0: v2 import rejects case-variant catalog UUID duplicates and duplicate relationships or constraints', () => {
  const duplicateType = deserializeProject(fixtureText)
  duplicateType.types.push({ ...structuredClone(duplicateType.types[0]), id: duplicateType.types[0].id.toUpperCase() })
  assert.throws(() => deserializeProject(JSON.stringify(duplicateType)), /duplicate catalog type UUID/)

  const duplicateRelationship = deserializeProject(fixtureText)
  const [sourceId, targetId] = Object.keys(duplicateRelationship.objects)
  const relationship = { kind: 'connects_to', source_id: sourceId, target_id: targetId }
  duplicateRelationship.relationships = [relationship, structuredClone(relationship)]
  assert.throws(() => deserializeProject(JSON.stringify(duplicateRelationship)), /duplicate relationship/)

  const duplicateConstraint = deserializeProject(fixtureText)
  const entityId = Object.keys(duplicateConstraint.objects)[0]
  const constraint = { id: crypto.randomUUID(), kind: 'lock', entities: [{ id: entityId, property: 'location_mm' }] }
  duplicateConstraint.constraints = [constraint, structuredClone(constraint)]
  assert.throws(() => deserializeProject(JSON.stringify(duplicateConstraint)), /duplicate constraint 2 UUID/)
})

test('S0: persisted slab and roof geometry reject invalid systems, offsets and degenerate rings', () => {
  const base = createEmptyProjectDocument('SCHEMA-SURFACES', 'Schema surfaces')
  const object = (id, type, module_data) => ({
    id, object_type: type, owner_module: `constructflow.${type.split('.')[0]}`, schema_version: 1,
    created_phase: 'new_construction', removed_phase: null, level_refs: [], host_refs: [], connector_refs: [],
    status: 'active', module_data, created_at: 0, updated_at: 0,
  })
  const ring = [[0, 0], [4000, 0], [4000, 2500], [0, 2500]]
  const validSlab = {
    mark: 'SOG-120', level_id: 'L1', boundary_mm: ring, elevation_mm: 0, elevation_offset_mm: -120,
    thickness_mm: 120, topping_mm: 0, slab_system: 'slab_on_ground', material: 'concrete',
  }
  const validRoof = {
    mark: 'R1', level_id: 'L1', boundary_mm: ring, elevation_mm: 3000,
    edges: ring.map(() => ({ defines_slope: false, slope_deg: 0 })), thickness_mm: 25.4, material: 'metal_sheet',
  }
  const project = () => structuredClone(base)
  const roundTrip = (entities) => {
    const candidate = project()
    for (const entity of entities) candidate.objects[entity.id] = entity
    return () => serializeProject(candidate)
  }
  assert.doesNotThrow(roundTrip([object(crypto.randomUUID(), 'structure.slab', validSlab), object(crypto.randomUUID(), 'roof.system', validRoof)]))
  assert.throws(roundTrip([object(crypto.randomUUID(), 'structure.slab', { ...validSlab, slab_system: 'unknown' })]), /slab_system/)
  assert.throws(roundTrip([object(crypto.randomUUID(), 'structure.slab', { ...validSlab, elevation_offset_mm: NaN })]), /elevation_offset_mm/)
  assert.throws(roundTrip([object(crypto.randomUUID(), 'roof.system', { ...validRoof, boundary_mm: [[0, 0], [4000, 0], [0, 0], [0, 0]] })]), /boundary_mm/)
  assert.throws(roundTrip([object(crypto.randomUUID(), 'roof.system', { ...validRoof, voids_mm: [[[100, 100], [200, 200]]] })]), /voids_mm/)
  assert.throws(roundTrip([object(crypto.randomUUID(), 'structure.slab', { ...validSlab, voids_mm: [[[4100, 100], [4300, 100], [4300, 300], [4100, 300]]] })]), /voids_mm/)
  assert.throws(roundTrip([object(crypto.randomUUID(), 'roof.system', { ...validRoof, voids_mm: [
    [[500, 500], [1500, 500], [1500, 1500], [500, 1500]],
    [[1000, 1000], [2000, 1000], [2000, 2000], [1000, 2000]],
  ] })]), /voids_mm/)
})
