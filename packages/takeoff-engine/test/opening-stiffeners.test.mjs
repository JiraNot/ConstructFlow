import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument } from '@constructflow/project-model'
import { calculateTakeoff } from '../dist/index.js'

test('new construction doors and windows generate RC lintel, stiffener and sill takeoff rows', () => {
  const project = createEmptyProjectDocument('TEST-STIFFENERS', 'Lintel & Stiffener Test')

  // Wall: 100mm thickness, 4m long
  project.objects['wall-1'] = {
    id: 'wall-1',
    object_type: 'architecture.wall',
    owner_module: 'constructflow.architecture',
    schema_version: 1,
    created_phase: 'new_construction',
    removed_phase: null,
    level_refs: [],
    host_refs: [],
    connector_refs: [],
    status: 'active',
    module_data: {
      mark: 'W1',
      start_point_mm: [0, 0, 0],
      end_point_mm: [4000, 0, 0],
      thickness_mm: 100,
      height_mm: 2800,
    },
    created_at: 0,
    updated_at: 0,
  }

  // Door: W=0.9m, H=2.0m (door has no elevated sill)
  project.objects['door-1'] = {
    id: 'door-1',
    object_type: 'door_window.door',
    owner_module: 'constructflow.architecture',
    schema_version: 1,
    created_phase: 'new_construction',
    removed_phase: null,
    level_refs: [],
    host_refs: ['wall-1'],
    connector_refs: [],
    status: 'active',
    module_data: {
      mark: 'D1',
      wall_id: 'wall-1',
      width_mm: 900,
      height_mm: 2000,
    },
    created_at: 0,
    updated_at: 0,
  }

  // Window: W=1.2m, H=1.2m, sill=0.9m (window has elevated sill bed)
  project.objects['window-1'] = {
    id: 'window-1',
    object_type: 'door_window.window',
    owner_module: 'constructflow.architecture',
    schema_version: 1,
    created_phase: 'new_construction',
    removed_phase: null,
    level_refs: [],
    host_refs: ['wall-1'],
    connector_refs: [],
    status: 'active',
    module_data: {
      mark: 'W1',
      wall_id: 'wall-1',
      width_mm: 1200,
      height_mm: 1200,
      sill_height_mm: 900,
    },
    created_at: 0,
    updated_at: 0,
  }

  const report = calculateTakeoff(project)

  // Verify masonry stiffener lines exist
  const stiffenerLines = report.lines.filter(l => l.object_type === 'architecture.masonry_stiffener')
  assert.ok(stiffenerLines.length >= 4, 'must have all 4 stiffener material lines')

  // Check 1) Concrete m3
  const concrete = stiffenerLines.find(l => l.unit === 'm3' && l.material === 'concrete_240_ksc')
  assert.ok(concrete, 'must report concrete m3')
  assert.ok(concrete.quantity > 0)
  assert.equal(concrete.cost_center, 'new_construction')

  // Check 2) Formwork m2
  const formwork = stiffenerLines.find(l => l.unit === 'm2' && l.material === 'plywood_formwork')
  assert.ok(formwork, 'must report formwork m2')
  assert.ok(formwork.quantity > 0)

  // Check 3) Main rebar kg (2-RB9)
  const mainRebar = stiffenerLines.find(l => l.unit === 'kg' && l.material === 'rebar_rb9')
  assert.ok(mainRebar, 'must report main rebar kg')
  assert.ok(mainRebar.quantity > 0)

  // Check 4) Stirrup rebar kg (RB6@0.20m)
  const stirrup = stiffenerLines.find(l => l.unit === 'kg' && l.material === 'rebar_rb6')
  assert.ok(stirrup, 'must report stirrup rebar kg')
  assert.ok(stirrup.quantity > 0)

  // Verify exact door stiffener lengths:
  // Door: stiffener = 2*2.0 = 4.0m, lintel = 0.9 + 0.4 = 1.3m, sill = 0 => Total = 5.3m
  // Window: stiffener = 2*1.2 = 2.4m, lintel = 1.2 + 0.4 = 1.6m, sill = 1.2 + 0.4 = 1.6m => Total = 5.6m
  // Grand Total length = 5.3 + 5.6 = 10.9m
  // Expected concrete = 10.9 * 0.10 * 0.10 = 0.109 m3
  assert.ok(Math.abs(concrete.quantity - 0.109) < 0.005, `expected ~0.109 m3 concrete, got ${concrete.quantity}`)
})
