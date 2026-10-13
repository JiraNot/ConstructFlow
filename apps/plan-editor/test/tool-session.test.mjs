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
  const doorOnWall = resolveToolInteractionStatus('door', { activeWallSnap: { wall_id: 'wall-1', offset_mm: 200 } })
  const point = resolveToolInteractionStatus('column', { snapCount: 2 })
  const snappedPoint = resolveToolInteractionStatus('column', {
    snapCount: 2,
    activeSnap: { kind: 'wall_endpoint', description: 'ปลายผนัง W1' },
  })
  const polygon = resolveToolInteractionStatus('slab', { slabBoundary: [[0, 0], [4000, 0]] })

  assert.equal(wallStart.step, 'start-point')
  assert.equal(wallEnd.step, 'end-point')
  assert.match(wallEnd.instruction, /วาดช่วงและต่อแนว/)
  assert.equal(wallEnd.constraint, 'ขนาน · แนวอ้างอิงชิดซ้าย')
  assert.equal(beamEnd.step, 'end-point')
  assert.equal(beamEnd.constraint, 'อิสระ · แนวอ้างอิงกึ่งกลาง')
  assert.equal(door.step, 'find-host-wall')
  assert.match(door.instruction, /เลื่อนหาแนวผนัง/)
  assert.equal(doorOnWall.step, 'position-on-host')
  assert.match(doorOnWall.instruction, /กำหนดตำแหน่งบนผนัง/)
  assert.equal(point.step, 'position')
  assert.equal(point.constraint, 'Snap เปิด 2 ประเภท')
  assert.equal(point.snapFeedback, null)
  assert.equal(snappedPoint.snapFeedback, 'ปลายผนัง W1')
  assert.equal(polygon.step, 'add-vertex')
})

test('Escape cancels a pending step first, exits an idle tool, and clears selection consistently', () => {
  assert.equal(hasPendingToolStep({ wallStartNode: { point_mm: [0, 0] } }), true)
  assert.equal(hasPendingToolStep({ dimensionInputX: '  2.5 ' }), true)
  assert.equal(hasPendingToolStep({ dimensionInputX: '  ' }), false)
  assert.equal(hasPendingToolStep({ gridCopySourceId: 'grid-uuid' }), true)
  assert.equal(resolveToolInteractionStatus('gridCopy', { gridCopySourceId: 'grid-uuid' }).step, 'place-copy')
  assert.equal(resolveToolInteractionStatus('gridCopy', {}).step, 'select-source')
  assert.equal(resolveEscapeAction('wall', true), 'cancel-step')
  assert.equal(resolveEscapeAction('gridCopy', hasPendingToolStep({ gridCopySourceId: 'grid-uuid' })), 'cancel-step')
  assert.equal(resolveEscapeAction('wall', false), 'exit-tool')
  assert.equal(resolveEscapeAction('select', false, true), 'clear-selection')
  assert.equal(resolveEscapeAction('select', false, false), 'noop')
})

test('step feedback stays aligned with state across two-point, polygon, measurement, and reference tools', () => {
  for (const tool of ['wall', 'beam', 'grid', 'roomSeparator', 'pipe', 'cabinet', 'moulding', 'stair']) {
    const state = tool === 'wall' ? { wallStartNode: { point_mm: [0, 0] } }
      : tool === 'beam' ? { beamStartNode: { point_mm: [0, 0] } }
        : tool === 'grid' ? { gridStartPoint: [0, 0] }
          : tool === 'stair' ? { stairStartPoint: [0, 0] }
            : { roomSeparatorStart: [0, 0] }
    const status = resolveToolInteractionStatus(tool, state)
    assert.equal(status.step, 'end-point', `${tool} should report its pending end point`)
    assert.equal(hasPendingToolStep(state), true, `${tool} should be cancelable as a pending step`)
    assert.equal(resolveEscapeAction(tool, true), 'cancel-step')
  }

  for (const tool of ['slab', 'slabVoid', 'archFloor', 'ceiling', 'roof']) {
    const first = resolveToolInteractionStatus(tool)
    const next = resolveToolInteractionStatus(tool, { slabBoundary: [[0, 0], [4000, 0]] })
    assert.equal(first.step, 'first-vertex', `${tool} should prompt for the first vertex`)
    assert.equal(next.step, 'add-vertex', `${tool} should prompt for another vertex`)
    assert.equal(resolveEscapeAction(tool, hasPendingToolStep({ slabBoundary: [[0, 0]] })), 'cancel-step')
  }

  assert.equal(resolveToolInteractionStatus('measure').step, 'start-point')
  assert.equal(resolveToolInteractionStatus('measure', { tapeMeasure: { complete: false } }).step, 'end-point')
  assert.equal(resolveToolInteractionStatus('measure', { tapeMeasure: { complete: true } }).step, 'complete')
  assert.equal(resolveToolInteractionStatus('calibrate').step, 'first-reference')
  assert.equal(resolveToolInteractionStatus('calibrate', { calibrationP1: [0, 0] }).step, 'second-reference')
  assert.equal(resolveToolInteractionStatus('gridSystem', { gridSystemError: 'invalid' }).step, 'fix-intervals')
  assert.equal(resolveToolInteractionStatus('gridSystem').step, 'origin')
})
