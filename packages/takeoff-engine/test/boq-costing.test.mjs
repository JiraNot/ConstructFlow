import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument } from '@constructflow/project-model'
import {
  calculateTakeoff,
  getStandardWasteFactor,
  THAI_STANDARD_WASTE_FACTORS,
  calculateFormwork,
  calculatePreliminaries,
  calculateFactorF,
  calculatePhasedBOQ,
} from '../dist/index.js'

test('Pillar 5.1: Thai standard material waste factors match Comptroller General and EIT guidelines', () => {
  // Tile: 7%
  assert.equal(getStandardWasteFactor('tile_ceramic'), 7)
  assert.equal(getStandardWasteFactor('กระเบื้องปูพื้น'), 7)
  assert.equal(getStandardWasteFactor('tile_granite'), 5)

  // Concrete & Mortar: 5%
  assert.equal(getStandardWasteFactor('concrete_240_ksc'), 5)
  assert.equal(getStandardWasteFactor('cement_plaster'), 5)
  assert.equal(getStandardWasteFactor('ปูนฉาบ'), 5)

  // Rebar diameters: 5% (round RB) to 11% (DB20+)
  assert.equal(getStandardWasteFactor('rebar_rb6'), 5)
  assert.equal(getStandardWasteFactor('rebar_rb9'), 5)
  assert.equal(getStandardWasteFactor('rebar_db12'), 7)
  assert.equal(getStandardWasteFactor('rebar_db16'), 9)
  assert.equal(getStandardWasteFactor('rebar_db20'), 11)
  assert.equal(getStandardWasteFactor('rebar_db25'), 11)
  assert.equal(getStandardWasteFactor('rebar_general'), 7)
  assert.equal(getStandardWasteFactor('wire_mesh'), 5)

  // Paint: 10%
  assert.equal(getStandardWasteFactor('paint'), 10)
  assert.equal(getStandardWasteFactor('สีทาอาคาร'), 10)

  // Masonry: 5%
  assert.equal(getStandardWasteFactor('aac_block'), 5)
  assert.equal(getStandardWasteFactor('brick'), 5)

  // Formwork plywood: 15%
  assert.equal(getStandardWasteFactor('plywood_formwork'), 15)

  // Item counts have 0 waste
  assert.equal(getStandardWasteFactor('door'), 0)
})

test('Pillar 5.1: calculateTakeoff populates waste_percent and gross_quantity on non-item lines', () => {
  const project = createEmptyProjectDocument('WASTE-TEST', 'Waste Factor Test')

  project.objects['col-1'] = {
    id: 'col-1',
    object_type: 'structure.column',
    owner_module: 'constructflow.structure',
    schema_version: 1,
    created_phase: 'new_construction',
    removed_phase: null,
    level_refs: [],
    host_refs: [],
    connector_refs: [],
    status: 'active',
    module_data: {
      mark: 'C1',
      section_mm: [200, 200],
      base_elevation_mm: 0,
      top_elevation_mm: 3000,
      material: 'concrete_240_ksc',
    },
    created_at: 0,
    updated_at: 0,
  }

  const report = calculateTakeoff(project)
  const colLine = report.lines.find(l => l.source_object_ids.includes('col-1'))
  assert.ok(colLine)
  assert.equal(colLine.quantity, 0.12) // 0.2 * 0.2 * 3.0 = 0.12 m3
  assert.equal(colLine.waste_percent, 5) // concrete waste 5%
  assert.equal(colLine.gross_quantity, 0.126) // 0.12 * 1.05 = 0.126 m3
})

test('Pillar 5.2: Formwork reuse engine computes contact area and storey depreciation factors', () => {
  const project = createEmptyProjectDocument('FORMWORK-TEST', 'Formwork Reuse Test')

  // Footing F1: 800x800x300 mm
  // 4 sides = 2 * (0.8 + 0.8) * 0.3 = 0.96 m2
  project.objects['f-1'] = {
    id: 'f-1',
    object_type: 'structure.foundation',
    owner_module: 'constructflow.structure',
    schema_version: 1,
    created_phase: 'new_construction',
    removed_phase: null,
    level_refs: [],
    host_refs: [],
    connector_refs: [],
    status: 'active',
    module_data: {
      mark: 'F1',
      size_mm: [800, 800, 300],
    },
    created_at: 0,
    updated_at: 0,
  }

  // Column C1: 200x200 mm, height 3000 mm (storey 1)
  // 4 sides = 2 * (0.2 + 0.2) * 3.0 = 2.40 m2
  project.objects['c-1'] = {
    id: 'c-1',
    object_type: 'structure.column',
    owner_module: 'constructflow.structure',
    schema_version: 1,
    created_phase: 'new_construction',
    removed_phase: null,
    level_refs: [],
    host_refs: [],
    connector_refs: [],
    status: 'active',
    module_data: {
      mark: 'C1',
      section_mm: [200, 200],
      base_elevation_mm: 0,
      top_elevation_mm: 3000,
    },
    created_at: 0,
    updated_at: 0,
  }

  // Beam B1: 200x400 mm, length 4000 mm (storey 1)
  // 2 sides + bottom = (2 * 0.4 + 0.2) * 4.0 = 4.00 m2
  project.objects['b-1'] = {
    id: 'b-1',
    object_type: 'structure.beam',
    owner_module: 'constructflow.structure',
    schema_version: 1,
    created_phase: 'new_construction',
    removed_phase: null,
    level_refs: [],
    host_refs: [],
    connector_refs: [],
    status: 'active',
    module_data: {
      mark: 'B1',
      section_mm: [200, 400],
      span_mm: 4000,
      start_point_mm: [0, 0, 0],
      end_point_mm: [4000, 0, 0],
    },
    created_at: 0,
    updated_at: 0,
  }

  // Beam RB1: 200x400 mm, length 4000 mm (storey 2 roof beam)
  // 2 sides + bottom = 4.00 m2 (storey 2 -> material factor 0.70)
  project.objects['b-2'] = {
    id: 'b-2',
    object_type: 'structure.beam',
    owner_module: 'constructflow.structure',
    schema_version: 1,
    created_phase: 'new_construction',
    removed_phase: null,
    level_refs: [],
    host_refs: [],
    connector_refs: [],
    status: 'active',
    module_data: {
      mark: 'RB1',
      section_mm: [200, 400],
      span_mm: 4000,
      start_point_mm: [0, 0, 3000],
      end_point_mm: [4000, 0, 3000],
    },
    created_at: 0,
    updated_at: 0,
  }

  const formwork = calculateFormwork(project)

  // Verify Footing: contact = 0.96 m2, material = 0.96 * 0.80 = 0.768 m2, labor = 0.96 m2
  const fEl = formwork.elements.find(e => e.object_id === 'f-1')
  assert.ok(fEl)
  assert.equal(fEl.contact_area_m2, 0.96)
  assert.equal(fEl.material_factor, 0.80)
  assert.equal(fEl.formwork_material_area_m2, 0.768)
  assert.equal(fEl.formwork_labor_area_m2, 0.96)

  // Verify Column: contact = 2.40 m2, material = 2.40 * 0.80 = 1.92 m2, labor = 2.40 m2
  const cEl = formwork.elements.find(e => e.object_id === 'c-1')
  assert.ok(cEl)
  assert.equal(cEl.contact_area_m2, 2.4)
  assert.equal(cEl.material_factor, 0.80)
  assert.equal(cEl.formwork_material_area_m2, 1.92)

  // Verify Storey 1 Beam B1: factor 0.80
  const b1El = formwork.elements.find(e => e.object_id === 'b-1')
  assert.ok(b1El)
  assert.equal(b1El.storey, 1)
  assert.equal(b1El.material_factor, 0.80)
  assert.equal(b1El.contact_area_m2, 4.0)
  assert.equal(b1El.formwork_material_area_m2, 3.2)

  // Verify Storey 2 Beam RB1: factor 0.70
  const rb1El = formwork.elements.find(e => e.object_id === 'b-2')
  assert.ok(rb1El)
  assert.equal(rb1El.storey, 2)
  assert.equal(rb1El.material_factor, 0.70)
  assert.equal(rb1El.contact_area_m2, 4.0)
  assert.equal(rb1El.formwork_material_area_m2, 2.8)

  // Totals
  assert.equal(formwork.total_contact_area_m2, 11.36) // 0.96 + 2.4 + 4.0 + 4.0 = 11.36
  assert.equal(formwork.total_material_area_m2, 8.688) // 0.768 + 1.92 + 3.2 + 2.8 = 8.688
  assert.equal(formwork.total_labor_area_m2, 11.36)
})

test('Pillar 5.3: Preliminaries engine calculates debris removal, shoring props, scaffolding, and site setup', () => {
  const project = createEmptyProjectDocument('PRELIM-TEST', 'Preliminaries Test')

  // Existing wall marked for demolition: 4.0m x 2.8m x 100mm = 1.12 m3
  project.objects['demolished-wall'] = {
    id: 'demolished-wall',
    object_type: 'architecture.wall',
    owner_module: 'constructflow.architecture',
    schema_version: 1,
    created_phase: 'existing',
    removed_phase: 'demolition',
    level_refs: [],
    host_refs: [],
    connector_refs: [],
    status: 'active',
    module_data: {
      mark: 'W_DEMO',
      thickness_mm: 100,
      height_mm: 2800,
      length_mm: 4000,
    },
    created_at: 0,
    updated_at: 0,
  }

  // New construction wall with height 3.0m (requires scaffolding >= 2.5m)
  project.objects['new-wall'] = {
    id: 'new-wall',
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
      thickness_mm: 100,
      height_mm: 3000,
      length_mm: 5000,
    },
    created_at: 0,
    updated_at: 0,
  }

  const prelim = calculatePreliminaries(project)

  // 1. Debris volume = 1.12 m3, bulked (x 1.4) = 1.568 m3, truckload = 1
  assert.equal(prelim.total_debris_volume_m3, 1.12)
  assert.equal(prelim.bulked_debris_volume_m3, 1.568)
  assert.equal(prelim.truckloads_count, 1)

  // 2. Scaffolding for new wall: 5.0m x (3.0 + 1.0) = 20.0 m2
  assert.equal(prelim.scaffolding_area_m2, 20.0)

  // 3. Dust screen canvas: 5.0m x 3.0m = 15.0 m2
  assert.equal(prelim.dust_canvas_area_m2, 15.0)

  // 4. Site utilities item exists
  assert.ok(prelim.items.some(i => i.code === 'PRE-05'))
  assert.ok(prelim.total_amount_thb > 0)
})

test('Pillar 5.4: Factor F and Phased BOQ report 3 cost centers, Factor F, and Grand Total THB', () => {
  // Test Factor F brackets
  const fSmall = calculateFactorF(300_000)
  assert.equal(fSmall.factor_f, 1.3056)
  assert.equal(fSmall.vat_rate, 0.07)
  assert.equal(fSmall.total_with_factor_f_thb, 391680)

  const fMedium = calculateFactorF(1_500_000)
  assert.equal(fMedium.factor_f, 1.2982)

  const fLarge = calculateFactorF(6_000_000)
  assert.equal(fLarge.factor_f, 1.2801)

  // Test Phased BOQ with a real project containing demolition, new work, and joint treatment
  const project = createEmptyProjectDocument('BOQ-PHASED-TEST', 'Phased BOQ Test')

  // Demolished wall
  project.objects['old-wall'] = {
    id: 'old-wall',
    object_type: 'architecture.wall',
    owner_module: 'constructflow.architecture',
    schema_version: 1,
    created_phase: 'existing',
    removed_phase: 'demolition',
    level_refs: [],
    host_refs: [],
    connector_refs: [],
    status: 'active',
    module_data: {
      mark: 'W_EXISTING',
      thickness_mm: 100,
      height_mm: 2800,
      length_mm: 3000,
      material: 'brick',
    },
    created_at: 0,
    updated_at: 0,
  }

  // New construction wall with chemical dowel interface treatment
  project.objects['new-wall'] = {
    id: 'new-wall',
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
      thickness_mm: 100,
      height_mm: 2800,
      length_mm: 4000,
      material: 'aac_block',
      interface_treatments: [
        {
          kind: 'chemical_dowel_epoxy',
          target_object_ids: ['new-wall'],
          material: 'chemical_dowel_epoxy',
        },
      ],
    },
    created_at: 0,
    updated_at: 0,
  }

  const boq = calculatePhasedBOQ(project)

  // Check 3 cost centers
  assert.ok(boq.cost_centers.demolition_site_prep.items.length > 0)
  assert.ok(boq.cost_centers.new_construction.items.length > 0)
  assert.ok(boq.cost_centers.remodeling_joint_treatment.items.length > 0)

  // Check cost center labels (Thai)
  assert.ok(boq.cost_centers.demolition_site_prep.cost_center_label_th.includes('รื้อถอน'))
  assert.ok(boq.cost_centers.new_construction.cost_center_label_th.includes('สร้างใหม่'))
  assert.ok(boq.cost_centers.remodeling_joint_treatment.cost_center_label_th.includes('รอยต่อ'))

  // Demolition material cost should be 0 (pure labor)
  assert.equal(boq.cost_centers.demolition_site_prep.total_material_thb, 0)
  assert.ok(boq.cost_centers.demolition_site_prep.total_labor_thb > 0)

  // Total direct costs and Factor F
  assert.ok(boq.total_direct_material_thb > 0)
  assert.ok(boq.total_direct_labor_thb > 0)
  assert.ok(boq.total_direct_cost_thb > 0)
  assert.ok(boq.preliminaries_cost_thb > 0)
  assert.ok(boq.factor_f.factor_f > 1.2)
  assert.ok(boq.grand_total_thb > boq.total_direct_with_preliminaries_thb)

  // Formwork and preliminaries reports attached
  assert.ok(boq.formwork)
  assert.ok(boq.preliminaries)
})
