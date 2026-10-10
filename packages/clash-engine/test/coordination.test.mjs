import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzeProjectSpatialBounds,
  buildCoordinationModel,
  classifySpatialInteractions,
  resolveRuleSet,
  runCoordination,
} from '../dist/index.js'

const close = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label ?? ''} expected ${expected} ± ${tolerance} but got ${actual}`)

const emptyProject = () => ({
  schema_version: 2,
  project: {
    id: 'project-test', name: 'Coordination test', units: 'mm', active_level_id: 'GF', active_phase: 'new_construction',
    created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
  },
  levels: [
    { id: 'GF', name: 'Ground', elevation_mm: 0, storey_index: 1, height_mm: 3000 },
    { id: 'L1', name: 'First Floor', elevation_mm: 3000, storey_index: 2, height_mm: 3000 },
  ],
  phases: [
    { id: 'existing', name: 'Existing', order: 1 },
    { id: 'demolition', name: 'Demolition', order: 2 },
    { id: 'new_construction', name: 'New Construction', order: 3 },
  ],
  types: [],
  objects: {},
  relationships: [],
})

const add = (project, id, object_type, module_data, extra = {}) => {
  project.objects[id] = {
    id,
    object_type,
    owner_module: extra.owner_module ?? 'constructflow.test',
    schema_version: 1,
    created_phase: extra.created_phase ?? 'new_construction',
    removed_phase: extra.removed_phase ?? null,
    level_refs: [{ role: 'host_level', level_id: module_data.level_id ?? 'GF' }],
    host_refs: extra.host_refs ?? [],
    connector_refs: [],
    status: 'active',
    module_data,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    revision_meta: { dirty_quantity: false, dirty_drawing: false },
  }
  return project.objects[id]
}

const beamAlongX = (project, id, { y = 0, section = [200, 400], extra = {} } = {}) =>
  add(project, id, 'structure.beam', {
    mark: id, level_id: 'GF', start_point_mm: [0, y, 0], end_point_mm: [4000, y, 0],
    section_mm: section, span_mm: 4000, base_offset_mm: 0, material: 'reinforced_concrete', engineering_status: 'preliminary',
  }, extra)

// Gravity routes take their centreline elevation from the invert levels, exactly as the
// drainage engine does when it builds the drawing and 3D representation.
const soilPipe = (project, id, nodes_mm, extra = {}, minimum_slope_ratio = 0.01) =>
  add(project, id, 'drainage.pipe_route', {
    mark: id, level_id: 'GF', system: 'soil', nodes_mm, diameter_mm: 100, material: 'PVC',
    start_invert_mm: nodes_mm[0][2], end_invert_mm: nodes_mm[nodes_mm.length - 1][2] - 40, minimum_slope_ratio,
  }, extra)

// Domestic water routes keep their surveyed elevations: no invert-level projection applies.
const waterPipe = (project, id, nodes_mm, extra = {}) =>
  add(project, id, 'plumbing.pipe_route', {
    mark: id, level_id: 'GF', system: 'cold_water', nodes_mm, diameter_mm: 100, material: 'PPR',
  }, extra)

const downlight = (project, id, location_mm) =>
  add(project, id, 'electrical.fixture', {
    mark: id, level_id: 'GF', location_mm, kind: 'light', watts: 9, controlled_ids: [], switch_ways: 1, grounded: true,
  })

const cabinet = (project, id, location_mm, { width = 1800, height = 2400, depth = 600, extra = {} } = {}) =>
  add(project, id, 'interior.cabinet_run', {
    mark: id, level_id: 'GF', location_mm, width_mm: width, height_mm: height, depth_mm: depth,
    board_mm: 18, back_mm: 9, plinth_mm: 100, rotation_deg: 0, modules_mm: [width / 3, width / 3, width / 3],
    shelves: 2, drawers: 0, front: 'solid', carcass_material: 'mdf', front_material: 'laminate',
    back_material: 'hdf', countertop_material: 'quartz', countertop_mm: 20,
  }, extra)

const wallAlongX = (project, id, { y = 0, thickness = 100, extra = {} } = {}) =>
  add(project, id, 'architecture.wall', {
    mark: id, level_id: 'GF', start_point_mm: [0, y, 0], end_point_mm: [4000, y, 0],
    thickness_mm: thickness, height_mm: 2800, length_mm: 4000, material: 'brick_masonry',
  }, extra)

const opening = (project, id, object_type, hostId, { offset = 1000, width = 900, height = 2000, sill = 0, extra = {} } = {}) =>
  add(project, id, object_type, {
    mark: id, level_id: 'GF', wall_id: hostId, location_mm: [offset, 0, sill], offset_along_wall_mm: offset,
    width_mm: width, height_mm: height, ...(object_type === 'door_window.window' ? { sill_height_mm: sill } : {}),
    handing: 'left_in', vertical_constraint: 'fixed_height',
  }, { host_refs: [hostId], ...extra })

const findingsFor = (report, ruleId) => report.findings.filter(finding => finding.rule_id === ruleId)

test('a pipe crossing a beam reports exact penetration, severity and a millimetre fix', () => {
  const project = emptyProject()
  beamAlongX(project, 'beam-1', { section: [200, 400] })
  project.objects['beam-1'].module_data.base_offset_mm = 2400
  // Water pipe runs across the beam at z ∈ [2570, 2670], well inside the beam's z ∈ [2400, 2800].
  waterPipe(project, 'pipe-1', [[2000, -1000, 2620], [2000, 1000, 2620]])

  const report = runCoordination(project, { now: '2026-10-11T00:00:00.000Z' })
  const findings = findingsFor(report, 'CF-CL-MEP-STR-001')
  assert.equal(findings.length, 1)
  const finding = findings[0]
  assert.equal(finding.severity, 'hard')
  assert.equal(finding.category, 'mep')
  // The shortest exit is to lift the pipe 230 mm so its underside clears the beam's top face.
  close(finding.interaction.penetration_mm, 230, 1, 'penetration')
  assert.ok(finding.interaction.penetration_range_mm[0] <= finding.interaction.penetration_mm + 1e-6)
  close(Math.abs(finding.interaction.direction_mm[2]), 1, 1e-6, 'vertical exit')
  assert.equal(finding.suggestion.exactness, 'exact')
  // 230 mm exit + 25 mm rule margin + 5 mm construction slack, rounded up to the 5 mm step.
  assert.equal(finding.suggestion.recommended_mm, 260)
  // Dropping the pipe instead would need 270 mm: too far apart to be an equally cheap option.
  assert.match(finding.suggestion.phrase_th, /(ยกขึ้น|ลดลง) 260/)
  assert.deepEqual(finding.suggestion.alternatives, [])
  assert.ok(Math.abs(finding.suggestion.delta_mm[2]) > 0)
  assert.equal(finding.requires_engineer_review, true)
  assert.deepEqual(finding.objects.map(object => object.mark), ['pipe-1', 'beam-1'])

  // Crossing the middle of the beam ties on both vertical exits; then both are offered.
  const centred = emptyProject()
  beamAlongX(centred, 'beam-1', { section: [200, 400] })
  centred.objects['beam-1'].module_data.base_offset_mm = 2400
  waterPipe(centred, 'pipe-1', [[2000, -1000, 2600], [2000, 1000, 2600]])
  const centredFinding = findingsFor(runCoordination(centred), 'CF-CL-MEP-STR-001')[0]
  // z ∈ [2550, 2650] inside z ∈ [2400, 2800]: lifting or lowering both need exactly 250 mm.
  close(centredFinding.interaction.penetration_mm, 250, 1, 'symmetric penetration')
  assert.equal(centredFinding.suggestion.recommended_mm, 280)
  assert.equal(centredFinding.suggestion.alternatives.length, 1)
  assert.equal(Math.sign(centredFinding.suggestion.alternatives[0].delta_mm[2]), -Math.sign(centredFinding.suggestion.delta_mm[2]))
  assert.match(centredFinding.suggestion.alternatives[0].phrase_th, /(ยกขึ้น|ลดลง) 280/)
  assert.deepEqual(finding.objects.map(object => object.subject), ['a', 'b'])
  assert.ok(finding.highlight.some(marker => marker.kind === 'box' && marker.tone === 'impact'))
  assert.ok(finding.highlight.some(marker => marker.kind === 'segment' && marker.tone === 'measure'))
  assert.equal(finding.source.standard.includes('วสท.'), true)
  assert.equal(report.rule_set.effective_date, '2026-10-01')
  assert.deepEqual(report.rule_set.jurisdiction, ['TH', 'BMA'])
})

test('a genuinely clear pair is never reported even though the AABB broad phase proposes it', () => {
  const project = emptyProject()
  const beam = beamAlongX(project, 'beam-1')
  // A 45° beam passes 112 mm clear of the straight beam's corner, but its axis-aligned envelope
  // still overlaps: the exact narrow phase must discard the candidate instead of inventing a clash.
  add(project, 'beam-2', 'structure.beam', {
    mark: 'beam-2', level_id: 'GF', start_point_mm: [3400, -1000, 0], end_point_mm: [5400, 1000, 0],
    section_mm: [200, 400], span_mm: 2828, base_offset_mm: 0, material: 'reinforced_concrete',
    engineering_status: 'preliminary',
  })

  const analysis = analyzeProjectSpatialBounds(project)
  const interactions = classifySpatialInteractions(analysis)
  assert.ok(interactions.some(interaction => interaction.kind === 'overlap_candidate'), 'the AABB broad phase still proposes this pair')

  const report = runCoordination(project)
  assert.deepEqual(findingsFor(report, 'CF-CL-MEP-STR-001'), [])
  assert.deepEqual(report.findings.filter(finding => finding.severity === 'hard'), [])
  assert.deepEqual(report.findings.filter(finding => finding.rule_id === 'CF-CL-GEN-999'), [])
  assert.ok(report.summary.pairs_narrow_phased >= 1, 'the pair was still narrow-phased')
  assert.equal(beam.object_type, 'structure.beam')
})

test('a downlight buried in a beam gets a lateral shift suggestion in whole millimetres', () => {
  const project = emptyProject()
  beamAlongX(project, 'beam-1')
  downlight(project, 'light-1', [2000, 0, 400])

  const report = runCoordination(project)
  const findings = findingsFor(report, 'CF-CL-LGT-STR-010')
  assert.equal(findings.length, 1)
  const finding = findings[0]
  assert.equal(finding.severity, 'clearance')
  // The luminaire disc spans z ∈ [375, 425]; the rule needs 50 mm clear of the beam face.
  close(finding.interaction.required_clearance_mm, 50, 1e-9)
  close(finding.interaction.clearance_shortfall_mm, 75, 1, 'shortfall')
  assert.equal(finding.suggestion.strategy, 'shift_primary_lateral')
  assert.equal(finding.suggestion.exactness, 'axis_constrained')
  assert.equal(finding.suggestion.recommended_mm, 255)
  assert.equal(Math.abs(finding.suggestion.delta_mm[2]), 0)
  close(Math.abs(finding.suggestion.delta_mm[1]), 255, 1, 'lateral delta')
  assert.match(finding.suggestion.phrase_th, /เลื่อนไปทาง [−+-]Y \d/)
})

test('a blocked door swing is reported while a clear swing is not', () => {
  const blocked = emptyProject()
  wallAlongX(blocked, 'wall-1')
  opening(blocked, 'door-1', 'door_window.door', 'wall-1', { offset: 1000, width: 900, height: 2000 })
  cabinet(blocked, 'cab-1', [1200, 1000, 0], { width: 600, height: 800, depth: 600 })

  const blockedReport = runCoordination(blocked)
  const findings = findingsFor(blockedReport, 'CF-CL-DOOR-SWN-004')
  assert.equal(findings.length, 1)
  assert.equal(findings[0].severity, 'hard')
  assert.ok(findings[0].interaction.penetration_mm > 50)
  assert.equal(findings[0].suggestion.strategy, 'flip_swing_handing')
  assert.match(findings[0].suggestion.phrase_th, /กลับทิศทางบานประตู/)

  const clear = emptyProject()
  wallAlongX(clear, 'wall-1')
  opening(clear, 'door-1', 'door_window.door', 'wall-1', { offset: 1000, width: 900, height: 2000 })
  cabinet(clear, 'cab-1', [3000, 1000, 0], { width: 600, height: 800, depth: 600 })
  assert.deepEqual(findingsFor(runCoordination(clear), 'CF-CL-DOOR-SWN-004'), [])
})

test('a cabinet crowding a window opening reports the exact clearance shortfall', () => {
  const project = emptyProject()
  wallAlongX(project, 'wall-1')
  opening(project, 'win-1', 'door_window.window', 'wall-1', { offset: 1000, width: 1200, height: 1200, sill: 900 })
  // Cabinet back face at y = 70: 20 mm from the opening face at y = 50.
  cabinet(project, 'cab-1', [0, 670, 0], { width: 1800, height: 2400, depth: 600 })

  const report = runCoordination(project)
  const findings = findingsFor(report, 'CF-CL-CAB-OPEN-007')
  assert.equal(findings.length, 1)
  assert.equal(findings[0].severity, 'clearance')
  close(findings[0].interaction.distance_mm, 20, 0.5, 'measured clearance')
  close(findings[0].interaction.clearance_shortfall_mm, 30, 0.5, 'shortfall')
  assert.equal(findings[0].suggestion.recommended_mm, 60)
})

test('demolished hosts flag their live dependents and stay quiet when phases agree', () => {
  const project = emptyProject()
  wallAlongX(project, 'wall-1', { extra: { created_phase: 'existing', removed_phase: 'demolition' } })
  add(project, 'socket-1', 'electrical.fixture', {
    mark: 'socket-1', level_id: 'GF', location_mm: [1200, 30, 300], kind: 'outlet', watts: 0,
    controlled_ids: [], switch_ways: 1, grounded: true,
  }, { host_refs: ['wall-1'] })

  const report = runCoordination(project)
  const findings = findingsFor(report, 'CF-CL-DEM-HOST-013')
  assert.equal(findings.length, 1)
  assert.equal(findings[0].interaction.kind, 'host_conflict')
  assert.deepEqual(findings[0].objects.map(object => object.object_id), ['wall-1', 'socket-1'])
  assert.match(findings[0].suggestion.phrase_th, /ถูกกำหนดเป็นงานรื้อถอน/)
  assert.equal(findings[0].phase_context.coexistence, 'sequential')

  const aligned = emptyProject()
  wallAlongX(aligned, 'wall-1', { extra: { created_phase: 'existing', removed_phase: 'demolition' } })
  add(aligned, 'socket-1', 'electrical.fixture', {
    mark: 'socket-1', level_id: 'GF', location_mm: [1200, 30, 300], kind: 'outlet', watts: 0,
    controlled_ids: [], switch_ways: 1, grounded: true,
  }, { host_refs: ['wall-1'], removed_phase: 'demolition' })
  assert.deepEqual(findingsFor(runCoordination(aligned), 'CF-CL-DEM-HOST-013'), [])
})

test('hosted and connected pairs are never reported as clashes', () => {
  const project = emptyProject()
  wallAlongX(project, 'wall-1')
  opening(project, 'door-1', 'door_window.door', 'wall-1', { offset: 2000, width: 900, height: 2000 })
  add(project, 'col-1', 'structure.column', {
    mark: 'col-1', level_id: 'GF', location_mm: [0, 0, 0], section_mm: [200, 200], rotation_deg: 0,
    base_level_id: 'GF', base_offset_mm: 0, top_offset_mm: 0, material: 'reinforced_concrete', engineering_status: 'preliminary',
  })
  // Beam sits at the top of the storey (bottom +2400), i.e. above the 2000 mm door head.
  add(project, 'beam-2', 'structure.beam', {
    mark: 'beam-2', level_id: 'GF', start_point_mm: [0, 0, 0], end_point_mm: [4000, 0, 0], section_mm: [200, 400],
    span_mm: 4000, base_offset_mm: 2400, start_column_id: 'col-1', material: 'reinforced_concrete', engineering_status: 'preliminary',
  })

  const report = runCoordination(project)
  assert.deepEqual(report.findings, [])
  assert.ok(report.summary.suppressed_intentional >= 2)
})

test('sequential renovation work does not clash with what is already demolished', () => {
  const project = emptyProject()
  beamAlongX(project, 'beam-1', { extra: { created_phase: 'existing', removed_phase: 'demolition' } })
  soilPipe(project, 'pipe-1', [[2000, -1000, 200], [2000, 1000, 200]])

  const report = runCoordination(project)
  assert.deepEqual(findingsFor(report, 'CF-CL-MEP-STR-001'), [], 'they never coexist, so the structural clash rule does not apply')
  const sequencing = findingsFor(report, 'CF-CL-DEM-NEW-014')
  assert.equal(sequencing.length, 1)
  assert.equal(sequencing[0].severity, 'hard')
  assert.equal(sequencing[0].suggestion.exactness, 'review_only')
  assert.equal(sequencing[0].phase_context.coexistence, 'sequential')
})

test('two openings on one wall report their real overlap distance', () => {
  const project = emptyProject()
  wallAlongX(project, 'wall-1')
  opening(project, 'win-1', 'door_window.window', 'wall-1', { offset: 1000, width: 1200, height: 1200, sill: 900 })
  opening(project, 'win-2', 'door_window.window', 'wall-1', { offset: 1400, width: 1200, height: 1200, sill: 900 })

  const report = runCoordination(project)
  const findings = findingsFor(report, 'CF-CL-OPEN-OPEN-006')
  assert.equal(findings.length, 1)
  close(findings[0].interaction.distance_mm, 0, 1e-9)
  close(findings[0].interaction.penetration_mm, 800, 0.5, 'overlap along the wall')
  close(findings[0].interaction.clearance_shortfall_mm, 850, 0.5, 'shortfall')
  assert.equal(findings[0].suggestion.recommended_mm, 880)
  assert.match(findings[0].suggestion.phrase_th, /ขยับช่องเปิด win-2/)
})

test('project overrides re-tune a versioned rule without touching the engine', () => {
  const project = emptyProject()
  beamAlongX(project, 'beam-1')
  downlight(project, 'light-1', [2000, 400, 400]) // 225 mm clear of the beam face

  const defaultRun = runCoordination(project)
  assert.deepEqual(findingsFor(defaultRun, 'CF-CL-LGT-STR-010'), [])
  assert.deepEqual(defaultRun.rule_set.applied_overrides, [])

  const overridden = runCoordination(project, {
    settings: { overrides: [{ rule_id: 'CF-CL-LGT-STR-010', required_clearance_mm: 400, severity: 'hard', note: 'โครงการกำหนดระยะเผื่อเพิ่ม' }] },
  })
  const findings = findingsFor(overridden, 'CF-CL-LGT-STR-010')
  assert.equal(findings.length, 1)
  assert.equal(findings[0].severity, 'hard')
  close(findings[0].interaction.required_clearance_mm, 400, 1e-9)
  close(findings[0].interaction.clearance_shortfall_mm, 175, 1, 'shortfall against the project value')
  assert.deepEqual(overridden.rule_set.applied_overrides, ['CF-CL-LGT-STR-010'])
  assert.match(findings[0].requirement_th, /ปรับตามโครงการ: 400/)

  const resolved = resolveRuleSet(undefined, { overrides: [{ rule_id: 'CF-CL-GEN-999', enabled: false }] })
  assert.equal(resolved.rules.some(rule => rule.id === 'CF-CL-GEN-999'), false)
})

test('coordination is deterministic and reports its provenance', () => {
  const project = emptyProject()
  beamAlongX(project, 'beam-1')
  soilPipe(project, 'pipe-1', [[2000, -1000, 200], [2000, 1000, 200]])
  downlight(project, 'light-1', [2000, 0, 400])

  const first = runCoordination(project, { now: '2026-10-11T00:00:00.000Z' })
  const second = runCoordination(project, { now: '2026-10-11T00:00:00.000Z' })
  assert.deepEqual(first, second)
  assert.equal(first.findings.length, 2)
  assert.equal(first.summary.by_severity.hard, 1)
  assert.equal(first.summary.by_severity.clearance, 1)
  assert.equal(first.summary.by_rule['CF-CL-MEP-STR-001'], 1)
  assert.ok(first.summary.pairs_narrow_phased >= 2)
  assert.ok(Object.keys(first.summary.narrow_phase_methods).includes('gjk_epa'))
  assert.equal(first.summary.proxies_built, 3)
  assert.equal(first.rule_set.version, 1)
  assert.ok(first.notes.some(note => note.includes('cf-coordination-th v1')))
})

test('missing invert levels are reported instead of silently clearing the pipe', () => {
  const project = emptyProject()
  beamAlongX(project, 'beam-1')
  add(project, 'pipe-1', 'drainage.pipe_route', {
    mark: 'pipe-1', level_id: 'GF', system: 'soil', nodes_mm: [[2000, -1000, 200], [2000, 1000, 200]],
    diameter_mm: 100, material: 'PVC', start_invert_mm: null, end_invert_mm: null, minimum_slope_ratio: 0.01,
  })
  const model = buildCoordinationModel(project)
  assert.equal(model.routes[0].invert_known, false)
  assert.ok(model.warnings.some(warning => warning.includes('unknown invert level')))
  const report = runCoordination(project)
  assert.ok(report.warnings.some(warning => warning.includes('unknown invert level')))
  const pipe = report.findings.find(finding => finding.rule_id === 'CF-CL-MEP-STR-001')
  assert.equal(pipe.basis, 'engineering_default')
})

test('the generic sweep reports unclassified overlaps without flooding intentional contacts', () => {
  const project = emptyProject()
  wallAlongX(project, 'wall-1')
  cabinet(project, 'cab-1', [1000, 900, 0], { width: 600, height: 800, depth: 600 })
  // A stair mesh stand-in overlapping the cabinet footprint: no specific rule covers it.
  add(project, 'stair-1', 'architecture.stair', {
    mark: 'stair-1', level_id: 'GF', stair_type: 'straight', structure_type: 'rc_monolithic',
    start_point_mm: [800, 600, 0], total_rise_mm: 2600, width_mm: 1000, num_risers: 13,
    riser_height_mm: 200, tread_depth_mm: 250, has_handrail: true, handrail_height_mm: 900,
  })
  const report = runCoordination(project)
  assert.equal(report.findings.every(finding => finding.rule_id !== 'CF-CL-DEM-HOST-013'), true)
  const generic = findingsFor(report, 'CF-CL-GEN-999')
  assert.ok(generic.length >= 1)
  assert.equal(generic[0].suggestion.exactness, 'review_only')
})
