const lineTools = new Set(['slab', 'slabVoid', 'archFloor', 'ceiling', 'roof', 'bundle'])
const spanTools = new Set(['roomSeparator', 'pipe', 'cabinet', 'furniture', 'moulding'])

export function resolvePlanCanvasLineSnap(snap, pointerPoint, shiftKey, tool, state, constrainLineSnap) {
  let start
  let reference
  if (tool === 'dimension' && state.dimensionPoints?.length === 1) start = state.dimensionPoints[0]
  if (tool === 'measure' && state.tapeMeasure && !state.tapeMeasure.complete) start = state.tapeMeasure.start
  if (tool === 'beam' && state.beamStartNode) {
    start = state.beamStartNode.point_mm
    reference = state.beamStartNode.reference
  } else if (tool === 'wall' && state.wallStartNode) {
    start = state.wallStartNode.point_mm
    reference = state.wallStartNode.reference
  } else if (tool === 'stair' && state.stairStartPoint) {
    start = state.stairStartPoint
  } else if (tool === 'bundle' && state.bundleStartPoint) {
    start = state.bundleStartPoint
  } else if (tool === 'grid' && state.gridStartPoint) {
    start = state.gridStartPoint
  } else if (spanTools.has(tool) && state.roomSeparatorStart) {
    start = state.roomSeparatorStart
  } else if (lineTools.has(tool) && state.slabBoundary?.length) {
    start = state.slabBoundary[state.slabBoundary.length - 1]
  }
  return start ? constrainLineSnap(snap, pointerPoint, start, shiftKey, reference) : snap
}
