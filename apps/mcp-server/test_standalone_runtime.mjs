import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument, deserializeProject, serializeProject } from '../../packages/project-model/dist/index.js'
import { execute } from './standalone_runtime.mjs'

const emptyProject = () => createEmptyProjectDocument(crypto.randomUUID(), 'MCP Runtime Test')
const wall = (id, changes = {}) => ({
  name: 'CreateWall',
  input: {
    id,
    mark: 'W1',
    level_id: 'L1',
    start_point_mm: [0, 0, 0],
    end_point_mm: [4000, 0, 0],
    thickness_mm: 100,
    height_mm: 2800,
    ...changes,
  },
})

test('standalone MCP uses the editor CommandBus and returns the canonical changed project', () => {
  const source = emptyProject()
  const result = execute({ project_json: serializeProject(source), commands: [wall(crypto.randomUUID())] })
  assert.equal(result.status, 'success')
  assert.equal(result.committed, true)
  assert.equal(result.results[0].status, 'success')
  const reopened = deserializeProject(result.project_json)
  assert.equal(Object.values(reopened.objects).filter(object => object.object_type === 'architecture.wall').length, 1)
})

test('standalone MCP rejects a failed batch atomically and returns the original project', () => {
  const source = emptyProject()
  const projectJson = serializeProject(source)
  const result = execute({
    project_json: projectJson,
    commands: [wall(crypto.randomUUID()), { name: 'NoSuchCommand', input: {} }],
  })
  assert.equal(result.status, 'rejected')
  assert.equal(result.committed, false)
  assert.equal(result.failed_command_index, 1)
  assert.equal(result.project_json, projectJson)
  assert.deepEqual(deserializeProject(result.project_json).objects, {})
})

test('standalone MCP bounds batch size and requires canonical project JSON', () => {
  assert.throws(() => execute({ project_json: '{}', commands: [] }), /between 1 and 100/)
  assert.throws(() => execute({ project_json: '{}', commands: [wall(crypto.randomUUID())] }), /Unsupported schema_version/)
})

test('standalone MCP query supports phase/category filters and safe result limits', () => {
  const source = emptyProject()
  const created = execute({ project_json: serializeProject(source), commands: [wall(crypto.randomUUID())] })
  const result = execute({
    operation: 'query', project_json: created.project_json,
    filters: { phase: 'new_construction', category: 'architecture' }, limit: 10,
  })
  assert.equal(result.status, 'success')
  assert.equal(result.total_objects, 1)
  assert.equal(result.objects[0].object_type, 'architecture.wall')
  assert.throws(() => execute({ operation: 'query', project_json: created.project_json, limit: 5001 }), /limit must be/)
})

test('standalone MCP exposes takeoff and coordination engine results', () => {
  const source = emptyProject()
  const created = execute({ project_json: serializeProject(source), commands: [wall(crypto.randomUUID())] })
  const takeoff = execute({ operation: 'takeoff', project_json: created.project_json })
  assert.equal(takeoff.status, 'success')
  assert.ok(takeoff.report.lines.some(line => line.object_type === 'architecture.wall'))
  const coordination = execute({ operation: 'coordination', project_json: created.project_json })
  assert.equal(coordination.status, 'success')
  assert.ok(Array.isArray(coordination.report.findings))
  assert.ok(coordination.report.rule_set.id)
})

test('standalone MCP exposes the unified Thai site and legal compliance audit', () => {
  const source = emptyProject()
  const result = execute({
    operation: 'legal_compliance',
    project_json: serializeProject(source),
    options: { road_width_m: 8, front_road_setback_m: 4 },
  })
  assert.equal(result.status, 'success')
  assert.equal(result.operation, 'legal_compliance')
  assert.ok(Array.isArray(result.report.all_findings))
  assert.ok(['pass', 'warning', 'fail'].includes(result.report.overall_status))
})

test('standalone MCP exports DXF, IFC and Revit transfer from the canonical project', () => {
  const source = emptyProject()
  const created = execute({ project_json: serializeProject(source), commands: [wall(crypto.randomUUID())] })
  const dxf = execute({ operation: 'export', format: 'dxf', project_json: created.project_json })
  assert.equal(dxf.status, 'success')
  assert.equal(dxf.format, 'dxf')
  assert.match(dxf.content, /AC1032/)
  assert.ok(dxf.layouts_count >= 20)

  const ifc = execute({ operation: 'export', format: 'ifc', project_json: created.project_json })
  assert.equal(ifc.status, 'success')
  assert.match(ifc.content, /FILE_SCHEMA\(\('IFC4X3_ADD2'\)\)/)
  assert.ok(ifc.byte_length > 0)

  const revit = execute({ operation: 'export', format: 'revit_transfer', project_json: created.project_json })
  assert.equal(revit.document.schema_version, 'constructflow.revit_transfer.v1')
  assert.equal(revit.document.elements.walls[0].cf_uuid, Object.values(deserializeProject(created.project_json).objects)[0].id)
  assert.throws(() => execute({ operation: 'export', format: 'dwg', project_json: created.project_json }), /format must be one of/)
})

test('standalone MCP roundtrips caller-held history through mutate, undo and redo', () => {
  const source = emptyProject(), originalJson = serializeProject(source), id = crypto.randomUUID()
  const mutated = execute({ project_json: originalJson, commands: [wall(id)] })
  assert.equal(mutated.can_undo, true)
  assert.equal(mutated.can_redo, false)
  assert.equal(mutated.history.past.length, 1)

  const undone = execute({ operation: 'undo', project_json: mutated.project_json, history: mutated.history })
  assert.equal(undone.project_json, originalJson)
  assert.equal(undone.can_undo, false)
  assert.equal(undone.can_redo, true)

  const redone = execute({ operation: 'redo', project_json: undone.project_json, history: undone.history })
  assert.equal(deserializeProject(redone.project_json).objects[id].id, id)
  assert.equal(redone.can_undo, true)
  assert.equal(redone.can_redo, false)

  const failed = execute({ operation: 'undo', project_json: redone.project_json, history: redone.history })
  assert.equal(failed.project_json, originalJson)
  assert.equal(failed.can_redo, true)
})

test('standalone MCP validates history bounds, schemas and project identity', () => {
  const project = emptyProject(), projectJson = serializeProject(project)
  assert.throws(() => execute({ operation: 'undo', project_json: projectJson, history: { past: ['{}'], future: [] } }), /Unsupported schema_version/)
  assert.throws(() => execute({ operation: 'redo', project_json: projectJson, history: { past: [serializeProject(emptyProject())], future: [] } }), /different project/)
  assert.throws(() => execute({ operation: 'undo', project_json: projectJson, history: { past: Array(101).fill(projectJson), future: [] } }), /limited to 100/)
})
