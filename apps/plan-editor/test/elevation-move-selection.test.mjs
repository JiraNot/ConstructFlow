import test from 'node:test'
import assert from 'node:assert/strict'
import { buildElevationGroupMoveCommands, resolveElevationMoveSelection } from '../src/elevationMoveSelection.mjs'

test('elevation group move de-duplicates ids and moves hosted openings with a selected host wall only once', () => {
  const project = { objects: {
    wall: { id: 'wall', object_type: 'architecture.wall', module_data: {} },
    door: { id: 'door', object_type: 'door_window.door', module_data: { wall_id: 'wall' } },
    window: { id: 'window', object_type: 'door_window.window', module_data: { wall_id: 'wall' } },
    column: { id: 'column', object_type: 'structure.column', module_data: {} },
  } }
  assert.deepEqual(resolveElevationMoveSelection(project, ['wall', 'door', 'window', 'column', 'door', 'missing']), ['wall', 'column'])
})

test('elevation group move keeps an opening when its host wall is not selected', () => {
  const project = { objects: {
    wall: { id: 'wall', object_type: 'architecture.wall', module_data: {} },
    door: { id: 'door', object_type: 'door_window.door', module_data: { wall_id: 'wall' } },
  } }
  assert.deepEqual(resolveElevationMoveSelection(project, ['door']), ['door'])
})

test('elevation group move flattens every selected object into one command batch', () => {
  const project = { objects: {
    wall: { id: 'wall', object_type: 'architecture.wall', module_data: {} },
    door: { id: 'door', object_type: 'door_window.door', module_data: { wall_id: 'wall' } },
    column: { id: 'column', object_type: 'structure.column', module_data: {} },
  } }
  const commands = buildElevationGroupMoveCommands(project, ['wall', 'door', 'column'], id => [{ name: 'Move', input: { object_id: id } }])
  assert.deepEqual(commands, [
    { name: 'Move', input: { object_id: 'wall' } },
    { name: 'Move', input: { object_id: 'column' } },
  ])
})
