import { useCallback, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { handlePlanCanvasPointerMove } from './handlePlanCanvasPointerMove.js'
import { handlePlanCanvasPointerDown } from './handlePlanCanvasPointerDown.js'
import { handlePlanCanvasPointerUp } from './handlePlanCanvasPointerUp.js'

type PointerMoveOptions = Omit<Parameters<typeof handlePlanCanvasPointerMove>[0], 'event' | 'canvas'>
type PointerDownArgs = Parameters<typeof handlePlanCanvasPointerDown>[0]
type PointerDownOptions = Omit<PointerDownArgs, 'event' | 'canvas' | 'navigation'> & {
  navigation: Omit<PointerDownArgs['navigation'], 'setPointerCapture'>
}
type PointerUpOptions = Omit<Parameters<typeof handlePlanCanvasPointerUp>[0], 'event' | 'canvas'>

interface UsePlanCanvasPointerHandlersOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>
  pointerMove: PointerMoveOptions
  pointerDown: PointerDownOptions
  pointerUp: PointerUpOptions
}

/** Keeps canvas event binding and DOM pointer capture at the interaction boundary. */
export function usePlanCanvasPointerHandlers({
  canvasRef,
  pointerMove,
  pointerDown,
  pointerUp,
}: UsePlanCanvasPointerHandlersOptions) {
  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    handlePlanCanvasPointerMove({ event, canvas: canvasRef.current, ...pointerMove })
  }, [canvasRef, pointerMove])

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    handlePlanCanvasPointerDown({
      event,
      canvas: canvasRef.current,
      ...pointerDown,
      navigation: {
        ...pointerDown.navigation,
        setPointerCapture: pointerId => canvasRef.current?.setPointerCapture(pointerId),
      },
    })
  }, [canvasRef, pointerDown])

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    handlePlanCanvasPointerUp({ event, canvas: canvasRef.current, ...pointerUp })
  }, [canvasRef, pointerUp])

  return { handlePointerMove, handlePointerDown, handlePointerUp }
}
