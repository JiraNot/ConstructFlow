import { useEffect } from 'react'
import type { LinearReference, SnapResult } from '@constructflow/snapping-engine'
import { isPolygonInteraction, isTwoPointInteraction } from '../app/toolInteractionRegistry.mjs'
import type { ToolType } from './Toolbar.js'
import type { usePlanCanvasPlacementSession } from './usePlanCanvasPlacementSession.js'

interface UsePlanCanvasLineConstraintOptions {
  activeTool: ToolType
  placement: ReturnType<typeof usePlanCanvasPlacementSession>
  constrainLineSnap: (snap: SnapResult, pointerPoint: [number, number], start: [number, number], lockAxis: boolean, reference?: LinearReference) => SnapResult
}

/** Reapplies the current line constraint when dimensions or the construction start point changes. */
export function usePlanCanvasLineConstraint({ activeTool, placement, constrainLineSnap }: UsePlanCanvasLineConstraintOptions) {
  const { activeSnap, setActiveSnap, wallStartNode, beamStartNode, stairStartPoint, gridStartPoint,
    roomSeparatorStart, slabBoundary, drawLengthMeters, drawAngleDegrees } = placement

  useEffect(() => {
    if (!activeSnap) return
    const isPolygonTool = isPolygonInteraction(activeTool)
    const isTwoPointTool = isTwoPointInteraction(activeTool)
    const start = activeTool === 'wall' ? wallStartNode : activeTool === 'beam' ? beamStartNode
      : activeTool === 'stair' && stairStartPoint ? { point_mm: stairStartPoint }
        : activeTool === 'grid' && gridStartPoint ? { point_mm: gridStartPoint }
          : isTwoPointTool && roomSeparatorStart ? { point_mm: roomSeparatorStart }
            : isPolygonTool && slabBoundary.length ? { point_mm: slabBoundary[slabBoundary.length - 1] } : null
    if (!start) return

    const constrained = constrainLineSnap(activeSnap, activeSnap.point_mm, start.point_mm, false,
      'reference' in start ? start.reference : undefined)
    if (constrained.point_mm[0] !== activeSnap.point_mm[0] || constrained.point_mm[1] !== activeSnap.point_mm[1]) {
      setActiveSnap(constrained)
    }
  }, [activeTool, activeSnap, wallStartNode, beamStartNode, stairStartPoint, gridStartPoint, roomSeparatorStart,
    slabBoundary, drawLengthMeters, drawAngleDegrees, constrainLineSnap, setActiveSnap])
}
