import type { PointerEvent } from 'react'
import { handlePlanCanvasAuthoringPointerMove } from './handlePlanCanvasAuthoringPointerMove.js'
import { handlePlanCanvasNavigationPointerMove } from './handlePlanCanvasNavigationPointerMove.js'

type NavigationContext = Parameters<typeof handlePlanCanvasNavigationPointerMove>[0]
type AuthoringContext = Omit<Parameters<typeof handlePlanCanvasAuthoringPointerMove>[0], 'event' | 'screenPoint' | 'canvas'>

interface HandlePlanCanvasPointerMoveOptions {
  event: PointerEvent<HTMLCanvasElement>
  canvas: HTMLCanvasElement | null
  navigation: NavigationContext
  authoring: AuthoringContext
}

export function handlePlanCanvasPointerMove({ event, canvas, navigation, authoring }: HandlePlanCanvasPointerMoveOptions) {
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const screenPoint: [number, number] = [event.clientX - rect.left, event.clientY - rect.top]
  if (handlePlanCanvasNavigationPointerMove(navigation, event.pointerId, event.pointerType, screenPoint)) return
  handlePlanCanvasAuthoringPointerMove({ event, screenPoint, canvas, ...authoring })
}
