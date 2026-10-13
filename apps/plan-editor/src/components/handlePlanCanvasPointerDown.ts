import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ViewportState } from '../viewport/viewportTransform.js'
import { screenToWorld } from '../viewport/viewportTransform.js'
import type { ToolType } from './Toolbar.js'
import { handlePlanCanvasPointerDownNavigation } from './handlePlanCanvasPointerDownNavigation.js'
import { handlePlanCanvasSelectionPointerDown } from './handlePlanCanvasSelectionPointerDown.js'
import { handlePlanCanvasPlacementPointerDown } from './handlePlanCanvasPlacementPointerDown.js'
import type { SnapResult, WallHostSnapResult } from '@constructflow/snapping-engine'

type NavigationContext = Omit<Parameters<typeof handlePlanCanvasPointerDownNavigation>[0], 'event' | 'screenPoint' | 'activeTool' | 'viewport'>
type SelectionContext = Omit<Parameters<typeof handlePlanCanvasSelectionPointerDown>[0], 'event' | 'screenPoint' | 'rawWorld'>
type PlacementContext = Omit<Parameters<typeof handlePlanCanvasPlacementPointerDown>[0], 'event' | 'activeTool' | 'rawWorld' | 'snap'>
type SnapContext = {
  resolveSnap: (rawWorld: [number, number], ctrlKey: boolean, shiftKey: boolean) => { snap: SnapResult; wallSnap: WallHostSnapResult | null }
}

interface HandlePlanCanvasPointerDownOptions {
  event: ReactPointerEvent<HTMLCanvasElement>
  canvas: HTMLCanvasElement | null
  activeTool: ToolType
  viewport: ViewportState
  navigation: NavigationContext
  snapping: SnapContext
  selection: SelectionContext
  placement: PlacementContext
}

/** Routes one pointer-down gesture through navigation, selection, then placement. */
export function handlePlanCanvasPointerDown({
  event, canvas, activeTool, viewport, navigation, snapping, selection, placement,
}: HandlePlanCanvasPointerDownOptions) {
  const rect = canvas?.getBoundingClientRect()
  if (!rect) return
  const screenPoint: [number, number] = [event.clientX - rect.left, event.clientY - rect.top]
  if (handlePlanCanvasPointerDownNavigation({ event, screenPoint, activeTool, viewport, ...navigation })) return
  if (event.button !== 0) return

  navigation.setObjectContextMenu(null)
  const rawWorld = screenToWorld(screenPoint, viewport)
  if (activeTool === 'select') {
    handlePlanCanvasSelectionPointerDown({ event, screenPoint, rawWorld, ...selection })
  } else {
    const { snap, wallSnap } = snapping.resolveSnap(rawWorld, event.ctrlKey, event.shiftKey)
    handlePlanCanvasPlacementPointerDown({
      event,
      activeTool,
      rawWorld,
      snap,
      ...placement,
      placement: { ...placement.placement, activeWallSnap: wallSnap },
    })
  }
}
