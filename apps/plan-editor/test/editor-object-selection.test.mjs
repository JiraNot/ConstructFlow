import test from 'node:test'
import assert from 'node:assert/strict'
import { EMPTY_EDITOR_SELECTION, selectObjectSet, selectPrimaryObject } from '../src/app/editorObjectSelection.mjs'

test('selecting a primary object creates a one-object selection', () => {
  assert.deepEqual(selectPrimaryObject(EMPTY_EDITOR_SELECTION, 'wall-1'), {
    selectedId: 'wall-1',
    selectedIds: ['wall-1'],
  })
})

test('changing primary within a multi-selection preserves the selected object set', () => {
  const selection = { selectedId: 'wall-1', selectedIds: ['wall-1', 'wall-2'] }
  assert.deepEqual(selectPrimaryObject(selection, 'wall-2'), {
    selectedId: 'wall-2',
    selectedIds: ['wall-1', 'wall-2'],
  })
})

test('choosing an object outside the current set starts a new single selection', () => {
  const selection = { selectedId: 'wall-1', selectedIds: ['wall-1', 'wall-2'] }
  assert.deepEqual(selectPrimaryObject(selection, 'column-1'), {
    selectedId: 'column-1',
    selectedIds: ['column-1'],
  })
})

test('multi-selection removes duplicate and empty ids and keeps its primary when possible', () => {
  const selection = { selectedId: 'wall-2', selectedIds: ['wall-1', 'wall-2'] }
  assert.deepEqual(selectObjectSet(selection, ['wall-1', '', 'wall-2', 'wall-1']), {
    selectedId: 'wall-2',
    selectedIds: ['wall-1', 'wall-2'],
  })
})

test('multi-selection applies a view-provided primary id in the same transition', () => {
  const selection = { selectedId: 'wall-1', selectedIds: ['wall-1', 'wall-2'] }
  assert.deepEqual(selectObjectSet(selection, ['wall-1', 'wall-2'], 'wall-2'), {
    selectedId: 'wall-2',
    selectedIds: ['wall-1', 'wall-2'],
  })
})

test('multi-selection promotes the first remaining id and clears primary on an empty set', () => {
  assert.deepEqual(selectObjectSet({ selectedId: 'wall-2', selectedIds: ['wall-1', 'wall-2'] }, ['wall-3']), {
    selectedId: 'wall-3',
    selectedIds: ['wall-3'],
  })
  assert.deepEqual(selectObjectSet({ selectedId: 'wall-1', selectedIds: ['wall-1'] }, []), EMPTY_EDITOR_SELECTION)
  assert.deepEqual(selectPrimaryObject({ selectedId: 'wall-1', selectedIds: ['wall-1'] }, null), EMPTY_EDITOR_SELECTION)
})
