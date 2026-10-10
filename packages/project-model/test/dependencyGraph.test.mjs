import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  analyzeDependencyImpact,
  buildDependencyGraph,
  cascadeDeletionSet,
  deserializeProject,
  resolveReferenceIds,
  withConflictEdges,
} from '../dist/index.js'

const fixtureUrl = new URL('../../../examples/kitchen-extension-proof.cfproj', import.meta.url)
const fixture = deserializeProject(await readFile(fixtureUrl, 'utf8'))

const baseProject = () => {
  const project = structuredClone(fixture)
  project.levels = [
    { id: 'GF', name: 'Ground', elevation_mm: 0, storey_index: 1, height_mm: 3000 },
    { id: 'L1', name: 'First Floor', elevation_mm: 3000, storey_index: 2, height_mm: 3000 },
  ]
  project.project.active_level_id = 'GF'
  project.objects = {}
  project.relationships = []
  return project
}

const addObject = (project, id, object_type, module_data, extra = {}) => {
  project.objects[id] = {
    id,
    object_type,
    owner_module: 'test',
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

test('resolveReferenceIds reads scalar, id-array and nested id-array fields', () => {
  const data = {
    wall_id: 'wall-1',
    controlled_ids: ['light-1', 'light-2', 7, null],
    interface_treatments: [{ target_object_ids: ['wall-2'] }, { target_object_ids: ['wall-3', 'wall-4'] }],
  }
  assert.deepEqual(resolveReferenceIds(data, 'wall_id'), ['wall-1'])
  assert.deepEqual(resolveReferenceIds(data, 'controlled_ids[]'), ['light-1', 'light-2'])
  assert.deepEqual(resolveReferenceIds(data, 'interface_treatments[].target_object_ids[]'), ['wall-2', 'wall-3', 'wall-4'])
  assert.deepEqual(resolveReferenceIds(data, 'missing_field'), [])
})

test('graph records host, support, control and level edges with cascade policy', () => {
  const project = baseProject()
  addObject(project, 'wall-a', 'architecture.wall', { mark: 'W1', level_id: 'GF' })
  addObject(project, 'door-a', 'door_window.door', { mark: 'D1', wall_id: 'wall-a', level_id: 'GF' })
  addObject(project, 'col-a', 'structure.column', { mark: 'C1', level_id: 'GF' })
  addObject(project, 'beam-a', 'structure.beam', { mark: 'B1', level_id: 'GF', start_column_id: 'col-a' })
  addObject(project, 'switch-a', 'electrical.fixture', { mark: 'S1', level_id: 'GF', kind: 'switch', controlled_ids: ['light-a'] })
  addObject(project, 'light-a', 'electrical.fixture', { mark: 'L1', level_id: 'GF', kind: 'light' })

  const graph = buildDependencyGraph(project)
  const doorEdge = graph.edges.find(edge => edge.source_id === 'door-a' && edge.kind === 'hosted_on')
  assert.equal(doorEdge.kind, 'hosted_on')
  assert.equal(doorEdge.cascade, 'delete')
  assert.equal(doorEdge.basis, 'wall_id')
  const beamEdge = graph.edges.find(edge => edge.source_id === 'beam-a' && edge.target_id === 'col-a')
  assert.equal(beamEdge.kind, 'supported_by')
  assert.equal(beamEdge.cascade, 'rehost')
  const switchEdge = graph.edges.find(edge => edge.source_id === 'switch-a' && edge.kind === 'controls')
  assert.equal(switchEdge.kind, 'controls')
  assert.equal(switchEdge.cascade, 'prune')
  assert.ok(graph.edges.some(edge => edge.kind === 'references_level' && edge.source_id === 'wall-a'))
  assert.equal(graph.summary.object_count, 6)
  assert.equal(graph.summary.level_count, 2)
  assert.equal(graph.warnings.length, 0)
})

test('dangling references are reported instead of silently dropped', () => {
  const project = baseProject()
  addObject(project, 'door-a', 'door_window.door', { mark: 'D1', wall_id: 'missing-wall', level_id: 'GF' })
  const graph = buildDependencyGraph(project)
  assert.deepEqual(graph.edges.filter(edge => edge.kind === 'hosted_on'), [])
  assert.match(graph.warnings[0], /references missing object missing-wall/)
})

test('deleting a host wall cascades openings and reports rehost/block dependents', () => {
  const project = baseProject()
  addObject(project, 'wall-a', 'architecture.wall', { mark: 'W1', level_id: 'GF' })
  addObject(project, 'door-a', 'door_window.door', { mark: 'D1', wall_id: 'wall-a', level_id: 'GF' })
  addObject(project, 'shelf-a', 'decorative.panel_layout', { mark: 'P1', host_id: 'wall-a', level_id: 'GF' })
  const graph = buildDependencyGraph(project)
  const impact = analyzeDependencyImpact(graph, ['wall-a'], 'delete')

  assert.deepEqual(impact.entries.map(entry => [entry.object_id, entry.disposition]).sort(), [
    ['door-a', 'cascade_delete'],
    ['shelf-a', 'cascade_delete'],
  ].sort())
  assert.deepEqual(impact.messages, ['ลบตามวัตถุต้นทาง 2 ชิ้น'])
  assert.deepEqual(cascadeDeletionSet(graph, ['wall-a']), ['door-a', 'shelf-a', 'wall-a'])
  assert.equal(impact.entries[0].path.join('>'), 'wall-a>door-a')
})

test('cascade follows transitively through hosted chains', () => {
  const project = baseProject()
  addObject(project, 'wall-a', 'architecture.wall', { mark: 'W1', level_id: 'GF' })
  addObject(project, 'door-a', 'door_window.door', { mark: 'D1', wall_id: 'wall-a', level_id: 'GF' })
  addObject(project, 'led-a', 'electrical.led_run', { mark: 'LED1', host_id: 'door-a', level_id: 'GF' })
  const graph = buildDependencyGraph(project)
  const impact = analyzeDependencyImpact(graph, ['wall-a'], 'delete')
  assert.deepEqual(cascadeDeletionSet(graph, ['wall-a']), ['door-a', 'led-a', 'wall-a'])
  const led = impact.entries.find(entry => entry.object_id === 'led-a')
  assert.equal(led.depth, 2)
  assert.deepEqual(led.path, ['wall-a', 'door-a', 'led-a'])
})

test('demolishing a wall keeps hosted devices alive but flags them for review', () => {
  const project = baseProject()
  addObject(project, 'wall-a', 'architecture.wall', { mark: 'W1', level_id: 'GF', }, { created_phase: 'existing' })
  addObject(project, 'socket-a', 'electrical.fixture', { mark: 'O1', level_id: 'GF', kind: 'outlet' }, { host_refs: ['wall-a'] })
  addObject(project, 'door-a', 'door_window.door', { mark: 'D1', wall_id: 'wall-a', level_id: 'GF' })
  const graph = buildDependencyGraph(project)
  const impact = analyzeDependencyImpact(graph, ['wall-a'], 'demolish')

  assert.equal(impact.entries.every(entry => entry.disposition === 'needs_rehost'), true)
  assert.equal(impact.summary.needs_rehost, 2)
  assert.deepEqual(impact.messages, ['ต้องหา host/ที่ยึดใหม่ 2 ชิ้น'])
})

test('moving a wall reports followers without deleting them', () => {
  const project = baseProject()
  addObject(project, 'wall-a', 'architecture.wall', { mark: 'W1', level_id: 'GF' })
  addObject(project, 'window-a', 'door_window.window', { mark: 'W1', wall_id: 'wall-a', level_id: 'GF' })
  const graph = buildDependencyGraph(project)
  const impact = analyzeDependencyImpact(graph, ['wall-a'], 'move')
  assert.deepEqual(impact.entries.map(entry => entry.disposition), ['follows_target'])
  assert.equal(impact.summary.cascade_delete, 0)
})

test('prune dependents keep existing but drop the reference', () => {
  const project = baseProject()
  addObject(project, 'light-a', 'electrical.fixture', { mark: 'L1', level_id: 'GF', kind: 'light' })
  addObject(project, 'switch-a', 'electrical.fixture', { mark: 'S1', level_id: 'GF', kind: 'switch', controlled_ids: ['light-a'] })
  const graph = buildDependencyGraph(project)
  const impact = analyzeDependencyImpact(graph, ['light-a'], 'delete')
  assert.deepEqual(impact.entries.map(entry => [entry.object_id, entry.disposition, entry.basis]), [
    ['switch-a', 'prune_reference', 'controlled_ids[]'],
  ])
  assert.equal(impact.summary.cascade_delete, 0)
})

test('level nodes expose every dependent of a storey datum', () => {
  const project = baseProject()
  addObject(project, 'wall-a', 'architecture.wall', { mark: 'W1', level_id: 'GF' })
  addObject(project, 'roof-a', 'roof.system', { mark: 'R1', level_id: 'L1' })
  const graph = buildDependencyGraph(project)
  const levelNode = graph.nodes.GF
  assert.equal(levelNode.node_kind, 'level')
  assert.equal(levelNode.mark, 'Ground')
  const impact = analyzeDependencyImpact(graph, ['GF'], 'move')
  assert.deepEqual(impact.entries.map(entry => entry.object_id), ['wall-a'])
  assert.equal(impact.entries[0].basis, 'level_id')
  assert.ok(graph.nodes.GF.incoming.some(edge => edge.basis === 'level_refs.host_level'))
})

test('clash findings join the graph as conflicts_with edges', () => {
  const project = baseProject()
  addObject(project, 'beam-a', 'structure.beam', { mark: 'B1', level_id: 'GF' })
  addObject(project, 'pipe-a', 'drainage.pipe_route', { mark: 'P1', level_id: 'GF', system: 'soil', diameter_mm: 100 })
  const graph = withConflictEdges(buildDependencyGraph(project), [
    { rule_id: 'CF-CL-MEP-STR-001', severity: 'hard', object_ids: ['beam-a', 'pipe-a'] },
  ])
  const conflict = graph.edges.find(edge => edge.kind === 'conflicts_with')
  assert.equal(conflict.origin, 'conflict')
  assert.equal(conflict.cascade, 'inform')
  assert.equal(conflict.meta.rule_id, 'CF-CL-MEP-STR-001')
  assert.equal(graph.summary.by_kind.conflicts_with, 1)
})

test('impact analysis is deterministic and stable across runs', () => {
  const project = baseProject()
  addObject(project, 'wall-a', 'architecture.wall', { mark: 'W1', level_id: 'GF' })
  addObject(project, 'door-a', 'door_window.door', { mark: 'D1', wall_id: 'wall-a', level_id: 'GF' })
  addObject(project, 'window-a', 'door_window.window', { mark: 'W2', wall_id: 'wall-a', level_id: 'GF' })
  const first = analyzeDependencyImpact(buildDependencyGraph(project), ['wall-a'], 'delete')
  const second = analyzeDependencyImpact(buildDependencyGraph(project), ['wall-a'], 'delete')
  assert.deepEqual(first, second)
  assert.deepEqual(first.entries.map(entry => entry.object_id), ['door-a', 'window-a'])
})

test('unknown seeds resolve to a warning instead of a crash', () => {
  const graph = buildDependencyGraph(baseProject())
  const impact = analyzeDependencyImpact(graph, ['missing'], 'delete')
  assert.deepEqual(impact.entries, [])
  assert.match(impact.warnings[0], /ไม่พบวัตถุ missing/)
  assert.deepEqual(impact.messages, ['ไม่พบวัตถุอื่นที่ผูกกับรายการนี้'])
})

test('a declared support field outranks the host_refs fallback for the same pair', () => {
  const project = baseProject()
  addObject(project, 'col-a', 'structure.column', { mark: 'C1', level_id: 'GF', location_mm: [0, 0, 0], section_mm: [200, 200] })
  addObject(project, 'col-b', 'structure.column', { mark: 'C2', level_id: 'GF', location_mm: [4000, 0, 0], section_mm: [200, 200] })
  addObject(project, 'beam-a', 'structure.beam', {
    mark: 'B1', level_id: 'GF', start_point_mm: [0, 0, 0], end_point_mm: [4000, 0, 0],
    section_mm: [200, 400], start_column_id: 'col-a', end_column_id: 'col-b',
  }, { host_refs: ['col-a', 'col-b'] })

  const graph = buildDependencyGraph(project)
  const beamEdges = graph.nodes['beam-a'].outgoing.filter(edge => edge.target_id === 'col-a')
  // `start_column_id` describes the support; the beam must survive losing it (rehost), while a
  // door losing its wall (`wall_id`) is deleted with it.
  assert.deepEqual(beamEdges.map(edge => [edge.kind, edge.cascade]), [['supported_by', 'rehost']])
  const impact = analyzeDependencyImpact(graph, ['col-a'], 'delete')
  assert.equal(impact.entries.filter(entry => entry.object_id === 'beam-a').length, 1)
  assert.equal(impact.entries.find(entry => entry.object_id === 'beam-a').disposition, 'needs_rehost')
  assert.deepEqual(cascadeDeletionSet(graph, ['col-a']), ['col-a'])

  addObject(project, 'wall-a', 'architecture.wall', { mark: 'W1', level_id: 'GF', start_point_mm: [0, 0, 0], end_point_mm: [4000, 0, 0], thickness_mm: 100, height_mm: 2800 })
  addObject(project, 'door-a', 'door_window.door', { mark: 'D1', level_id: 'GF', wall_id: 'wall-a' }, { host_refs: ['wall-a'] })
  const wallImpact = analyzeDependencyImpact(buildDependencyGraph(project), ['wall-a'], 'delete')
  const doorEntry = wallImpact.entries.find(entry => entry.object_id === 'door-a')
  assert.equal(doorEntry.disposition, 'cascade_delete')
  assert.equal(doorEntry.via, 'hosted_on')
})

test('the strongest policy wins when a pair carries several edges', () => {
  const project = baseProject()
  addObject(project, 'wall-a', 'architecture.wall', { mark: 'W1', level_id: 'GF', start_point_mm: [0, 0, 0], end_point_mm: [4000, 0, 0], thickness_mm: 100, height_mm: 2800 })
  addObject(project, 'socket-a', 'electrical.fixture', { mark: 'S1', level_id: 'GF', kind: 'outlet', location_mm: [1000, 40, 300] }, { host_refs: ['wall-a'] })
  // A second, weaker relationship must not downgrade the delete cascade.
  project.relationships.push({ kind: 'connects_to', source_id: 'socket-a', target_id: 'wall-a' })
  const impact = analyzeDependencyImpact(buildDependencyGraph(project), ['wall-a'], 'delete')
  const entry = impact.entries.find(candidate => candidate.object_id === 'socket-a')
  assert.equal(entry.disposition, 'cascade_delete')
  assert.equal(entry.via, 'hosted_on')
})
