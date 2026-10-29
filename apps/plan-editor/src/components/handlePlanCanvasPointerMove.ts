import type { PointerEvent } from 'react'
import { screenToWorld } from '../viewport/viewportTransform.js'
import type { MutableRefObject } from 'react'
import type { PlanSketchGesture } from './planCanvasInteractionTypes.js'
import { handlePlanCanvasAuthoringPointerMove } from './handlePlanCanvasAuthoringPointerMove.js'
import { handlePlanCanvasNavigationPointerMove } from './handlePlanCanvasNavigationPointerMove.js'

type NavigationContext = Parameters<typeof handlePlanCanvasNavigationPointerMove>[0]
type AuthoringContext = Omit<Parameters<typeof handlePlanCanvasAuthoringPointerMove>[0], 'event' | 'screenPoint' | 'canvas'>

interface HandlePlanCanvasPointerMoveOptions {
  event: PointerEvent<HTMLCanvasElement>
  canvas: HTMLCanvasElement | null
  navigation: NavigationContext
  authoring: AuthoringContext
  sketch: {
    sketchGestureRef: MutableRefObject<PlanSketchGesture | null>
    setSketchPoints: (points: [number, number][]) => void
  }
}

export function handlePlanCanvasPointerMove({ event, canvas, navigation, authoring, sketch }: HandlePlanCanvasPointerMoveOptions) {
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const screenPoint: [number, number] = [event.clientX - rect.left, event.clientY - rect.top]
  if (handlePlanCanvasNavigationPointerMove(navigation, event.pointerId, event.pointerType, screenPoint)) {
    if (sketch.sketchGestureRef.current && event.pointerType === 'touch') {
      sketch.sketchGestureRef.current = null
      sketch.setSketchPoints([])
    }
    return
  }
  const gesture = sketch.sketchGestureRef.current
  if (gesture?.pointerId === event.pointerId) {
    if (Math.hypot(screenPoint[0] - gesture.lastScreenPx[0], screenPoint[1] - gesture.lastScreenPx[1]) >= 3) {
      const point = screenToWorld(screenPoint, navigation.viewport)
      const previous = gesture.points.at(-1)
      if (!previous || Math.hypot(point[0] - previous[0], point[1] - previous[1]) >= 15) gesture.points.push(point)
      gesture.lastScreenPx = screenPoint
      sketch.setSketchPoints([...gesture.points])
    }
    return
  }
  handlePlanCanvasAuthoringPointerMove({ event, screenPoint, canvas, ...authoring })
}
