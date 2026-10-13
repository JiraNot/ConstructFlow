import test from 'node:test'
import assert from 'node:assert/strict'
import { TOOL_INTERACTION_REGISTRY, isPolygonInteraction, isTwoPointInteraction, usesPlacementDimensions } from '../src/app/toolInteractionRegistry.mjs'
import { repeatToolSession, transitionToolSession } from '../src/app/toolSession.mjs'
import { hasPendingToolStep, resolveEscapeAction, resolveToolInteractionStatus } from '../src/app/toolInteractionStatus.mjs'

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

test('repeat last tool starts a fresh placement session even when it is already active', () => {
  assert.deepEqual(repeatToolSession({ activeTool: 'wall', activation: 3 }, 'wall'), { activeTool: 'wall', activation: 4 })
  assert.deepEqual(repeatToolSession({ activeTool: 'select', activation: 4 }, 'beam'), { activeTool: 'beam', activation: 5 })
})

test('placement status reports the current authoring step, constraints, and keyboard guidance', () => {
  const wallStart = resolveToolInteractionStatus('wall', { wallStartNode: null, lineConstraintLabel: 'ขนาน', placementReferenceLabel: 'ชิดซ้าย', snapCount: 4 })
  const wallEnd = resolveToolInteractionStatus('wall', { wallStartNode: { point_mm: [0, 0] }, lineConstraintLabel: 'ขนาน', placementReferenceLabel: 'ชิดซ้าย', snapCount: 4 })
  const beamEnd = resolveToolInteractionStatus('beam', { beamStartNode: { point_mm: [100, 200] }, lineConstraintLabel: 'อิสระ', placementReferenceLabel: 'กึ่งกลาง' })
  const door = resolveToolInteractionStatus('door')
  const point = resolveToolInteractionStatus('column', { snapCount: 2 })
  const polygon = resolveToolInteractionStatus('slab', { slabBoundary: [[0, 0], [4000, 0]] })

  assert.equal(wallStart.step, 'start-point')
  assert.equal(wallEnd.step, 'end-point')
  assert.match(wallEnd.instruction, /วาดช่วงและต่อแนว/)
  assert.equal(wallEnd.constraint, 'ขนาน · แนวอ้างอิงชิดซ้าย')
  assert.equal(beamEnd.step, 'end-point')
  assert.equal(beamEnd.constraint, 'อิสระ · แนวอ้างอิงกึ่งกลาง')
  assert.equal(door.step, 'host-and-position')
  assert.match(door.instruction, /วางบนผนัง/)
  assert.equal(point.step, 'position')
  assert.equal(point.constraint, 'Snap เปิด 2 ประเภท')
  assert.equal(polygon.step, 'add-vertex')
})

test('Escape cancels a pending step first, exits an idle tool, and clears selection consistently', () => {
  assert.equal(hasPendingToolStep({ wallStartNode: { point_mm: [0, 0] } }), true)
  assert.equal(hasPendingToolStep({ dimensionInputX: '  2.5 ' }), true)
  assert.equal(hasPendingToolStep({ dimensionInputX: '  ' }), false)
  assert.equal(resolveEscapeAction('wall', true), 'cancel-step')
  assert.equal(resolveEscapeAction('wall', false), 'exit-tool')
  assert.equal(resolveEscapeAction('select', false, true), 'clear-selection')
  assert.equal(resolveEscapeAction('select', false, false), 'noop')
})
