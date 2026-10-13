import test from 'node:test'
import assert from 'node:assert/strict'
import { TOOL_INTERACTION_REGISTRY, isPolygonInteraction, isTwoPointInteraction, usesPlacementDimensions } from '../src/app/toolInteractionRegistry.mjs'
import { transitionToolSession } from '../src/app/toolSession.mjs'

const toolbarTools = [
  'select', 'column', 'foundation', 'beam', 'wall', 'door', 'window', 'slab', 'slabVoid', 'archFloor',
  'ceiling', 'roof', 'pipe', 'fixture', 'cabinet', 'moulding', 'roomSeparator', 'stair', 'grid',
  'gridSystem', 'gridCopy', 'measure', 'calibrate', 'erase',
]

test('interaction registry covers every toolbar tool and classifies drawing gestures', () => {
  assert.deepEqual(Object.keys(TOOL_INTERACTION_REGISTRY).sort(), [...toolbarTools].sort())
  for (const [tool, definition] of Object.entries(TOOL_INTERACTION_REGISTRY)) {
    assert.ok(definition.input)
    assert.equal(usesPlacementDimensions(tool), definition.dimensionPlacement)
  }
  for (const tool of ['slab', 'slabVoid', 'archFloor', 'ceiling', 'roof']) assert.equal(isPolygonInteraction(tool), true)
  for (const tool of ['beam', 'wall', 'pipe', 'cabinet', 'moulding', 'roomSeparator', 'stair', 'grid']) assert.equal(isTwoPointInteraction(tool), true)
})

test('tool session activation is stable for the current tool and increments on a tool change', () => {
  const initial = { activeTool: 'select', activation: 0 }
  assert.equal(transitionToolSession(initial, 'select'), initial)
  const drawing = transitionToolSession(initial, 'wall')
  assert.deepEqual(drawing, { activeTool: 'wall', activation: 1 })
  assert.deepEqual(transitionToolSession(drawing, 'select'), { activeTool: 'select', activation: 2 })
})
