import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveCadLayerForSmartObject,
  resolveIfcEntityForSmartObject,
  resolveRevitCategoryForSmartObject,
  resolveSketchUpTagForSmartObject,
  resolvePsetPhase,
  canonicalUuidToIfcGuid,
  CANONICAL_FAMILY_MAPPINGS,
} from '../dist/index.js'

test('F02: canonical family mappings catalog covers all primary domains', () => {
  const expectedFamilies = [
    'column', 'beam', 'foundation', 'pile', 'slab', 'grid', 'rebar_set',
    'wall', 'door', 'window', 'roof', 'stair', 'railing', 'ceiling', 'moulding',
    'manhole', 'drain_pipe', 'septic_tank', 'water_pipe', 'pump_bypass', 'panelboard', 'luminaire'
  ]

  for (const family of expectedFamilies) {
    assert.ok(CANONICAL_FAMILY_MAPPINGS[family], `Missing mapping for family: ${family}`)
    assert.ok(CANONICAL_FAMILY_MAPPINGS[family].cadLayerPrefix)
    assert.ok(CANONICAL_FAMILY_MAPPINGS[family].ifcEntity)
    assert.ok(CANONICAL_FAMILY_MAPPINGS[family].revitCategory)
    assert.ok(CANONICAL_FAMILY_MAPPINGS[family].rubyDefinitionClass)
  }
})

test('F02: resolveCadLayerForSmartObject correctly maps disciplines and phases', () => {
  // New column
  assert.equal(
    resolveCadLayerForSmartObject({
      id: 'uuid-1',
      family: 'column',
      name: 'C1',
      created_phase: 'new_construction',
      status: 'active',
      module_data: {},
    }),
    'S-COLN-NEWW'
  )

  // Existing wall
  assert.equal(
    resolveCadLayerForSmartObject({
      id: 'uuid-2',
      family: 'wall',
      name: 'W1',
      created_phase: 'existing',
      status: 'active',
      module_data: {},
    }),
    'A-WALL-EXST'
  )

  // Demolition wall
  assert.equal(
    resolveCadLayerForSmartObject({
      id: 'uuid-3',
      family: 'wall',
      name: 'W1-Demolished',
      created_phase: 'existing',
      removed_phase: 'demolition',
      status: 'active',
      module_data: {},
    }),
    'A-WALL-DEMO'
  )

  // Drainage manhole
  assert.equal(
    resolveCadLayerForSmartObject({
      id: 'uuid-4',
      family: 'manhole',
      name: 'MH-1',
      created_phase: 'new_construction',
      status: 'active',
      module_data: {},
    }),
    'M-DRAN-NEWW'
  )
})

test('F02: resolveIfcEntity and resolveRevitCategory match buildingSMART and Autodesk standards', () => {
  const column = {
    id: 'c-1',
    family: 'column',
    name: 'C1',
    created_phase: 'new_construction',
    status: 'active',
    module_data: {},
  }
  assert.equal(resolveIfcEntityForSmartObject(column), 'IfcColumn')
  assert.equal(resolveRevitCategoryForSmartObject(column), 'OST_Columns')

  const wall = {
    id: 'w-1',
    family: 'wall',
    name: 'W1',
    created_phase: 'new_construction',
    status: 'active',
    module_data: {},
  }
  assert.equal(resolveIfcEntityForSmartObject(wall), 'IfcWallStandardCase')
  assert.equal(resolveRevitCategoryForSmartObject(wall), 'OST_Walls')

  const stair = {
    id: 's-1',
    family: 'stair',
    name: 'ST1',
    created_phase: 'new_construction',
    status: 'active',
    module_data: {},
  }
  assert.equal(resolveIfcEntityForSmartObject(stair), 'IfcStair')
  assert.equal(resolveRevitCategoryForSmartObject(stair), 'OST_Stairs')
})

test('F02: resolveSketchUpTag and resolvePsetPhase adhere to universal phasing paradigm', () => {
  const exWall = {
    id: 'w-1',
    family: 'wall',
    name: 'W1',
    created_phase: 'existing',
    status: 'active',
    module_data: {},
  }
  assert.equal(resolveSketchUpTagForSmartObject(exWall), 'Phase::Existing')
  assert.deepEqual(resolvePsetPhase(exWall), {
    PhaseCreated: 'Existing',
    PhaseDemolished: '',
  })

  const demoWall = {
    id: 'w-2',
    family: 'wall',
    name: 'W2',
    created_phase: 'existing',
    removed_phase: 'demolition',
    status: 'active',
    module_data: {},
  }
  assert.equal(resolveSketchUpTagForSmartObject(demoWall), 'Phase::Demolition')
  assert.deepEqual(resolvePsetPhase(demoWall), {
    PhaseCreated: 'Existing',
    PhaseDemolished: 'Demolition',
  })
})

test('F02: canonicalUuidToIfcGuid produces valid 22-character IFC Base64 GUID', () => {
  const uuid = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
  const ifcGuid = canonicalUuidToIfcGuid(uuid)
  assert.equal(ifcGuid.length, 22)
  assert.match(ifcGuid, /^[0-9A-Za-z_$]{22}$/)

  // Determinism
  assert.equal(canonicalUuidToIfcGuid(uuid), ifcGuid)
})
