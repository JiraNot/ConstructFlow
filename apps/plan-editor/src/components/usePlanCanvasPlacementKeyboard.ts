import { useCallback, type Dispatch, type KeyboardEvent, type RefObject, type SetStateAction } from 'react'
import type { ToolType } from './Toolbar.js'

type Axis = 'x' | 'y'

interface UsePlanCanvasPlacementKeyboardOptions {
  activeTool: ToolType
  supportsPlacementDimensions: boolean
  dimensionHostAxis: Axis | null
  dimensionKeyboardAxis: Axis
  dimensionAnchorX: number | null
  dimensionAnchorY: number | null
  dimensionReferences: { refX?: number; refY?: number }
  dimensionInputX: string
  dimensionInputY: string
  showXDimension: boolean
  showYDimension: boolean
  dimensionInputXRef: RefObject<HTMLInputElement | null>
  dimensionInputYRef: RefObject<HTMLInputElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  setDimensionKeyboardAxis: Dispatch<SetStateAction<Axis>>
  setDimensionAnchorX: Dispatch<SetStateAction<number | null>>
  setDimensionAnchorY: Dispatch<SetStateAction<number | null>>
  setDimensionInputX: Dispatch<SetStateAction<string>>
  setDimensionInputY: Dispatch<SetStateAction<string>>
  commitActivePlacement: (fromInput?: boolean) => void
  cancelCurrentPlacement: () => void
  toggleDimensionReferenceMode: () => void
}

export function usePlanCanvasPlacementKeyboard({
  activeTool, supportsPlacementDimensions, dimensionHostAxis, dimensionKeyboardAxis, dimensionAnchorX,
  dimensionAnchorY, dimensionReferences, dimensionInputX, dimensionInputY, showXDimension, showYDimension,
  dimensionInputXRef, dimensionInputYRef, canvasRef, setDimensionKeyboardAxis, setDimensionAnchorX,
  setDimensionAnchorY, setDimensionInputX, setDimensionInputY, commitActivePlacement, cancelCurrentPlacement,
  toggleDimensionReferenceMode,
}: UsePlanCanvasPlacementKeyboardOptions) {
  const focusCanvas = () => canvasRef.current?.focus({ preventScroll: true })
  const focusAxis = (axis: Axis) => requestAnimationFrame(() => (axis === 'x' ? dimensionInputXRef : dimensionInputYRef).current?.focus())

  const handlePlacementInputKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.key === 'Enter') {
      event.preventDefault()
      commitActivePlacement(true)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelCurrentPlacement()
      focusCanvas()
    }
  }, [commitActivePlacement, cancelCurrentPlacement, canvasRef])

  const handleCanvasDimensionKeyDown = useCallback((event: KeyboardEvent<HTMLCanvasElement>) => {
    if (!supportsPlacementDimensions && activeTool !== 'measure' && activeTool !== 'calibrate') return
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      commitActivePlacement()
      return
    }
    if (!supportsPlacementDimensions) return
    const axis = dimensionHostAxis ?? dimensionKeyboardAxis
    const anchor = axis === 'x' ? dimensionAnchorX ?? dimensionReferences.refX : dimensionAnchorY ?? dimensionReferences.refY
    if (event.key === 'Tab' && (showXDimension || showYDimension)) {
      event.preventDefault()
      if (event.shiftKey && showXDimension && showYDimension) {
        const nextAxis = axis === 'x' ? 'y' : 'x'
        setDimensionKeyboardAxis(nextAxis)
        focusAxis(nextAxis)
      } else toggleDimensionReferenceMode()
      return
    }
    if (/^\d$/.test(event.key) || (event.key === '.' && !(axis === 'x' ? dimensionInputX : dimensionInputY).includes('.'))) {
      if (anchor === undefined) return
      event.preventDefault()
      event.stopPropagation()
      if (axis === 'x') { setDimensionAnchorX(anchor); setDimensionInputX(value => value + event.key) }
      else { setDimensionAnchorY(anchor); setDimensionInputY(value => value + event.key) }
    } else if (event.key === 'Backspace') {
      event.preventDefault()
      event.stopPropagation()
      if (anchor !== undefined) {
        if (axis === 'x') setDimensionInputX(value => value.slice(0, -1))
        else setDimensionInputY(value => value.slice(0, -1))
      }
    }
  }, [supportsPlacementDimensions, activeTool, dimensionHostAxis, dimensionKeyboardAxis, dimensionAnchorX, dimensionAnchorY,
    dimensionReferences, dimensionInputX, dimensionInputY, showXDimension, showYDimension, dimensionInputXRef,
    dimensionInputYRef, setDimensionKeyboardAxis, setDimensionAnchorX, setDimensionAnchorY, setDimensionInputX,
    setDimensionInputY, commitActivePlacement, toggleDimensionReferenceMode])

  const handleDimensionInputKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.key === 'Enter') {
      event.preventDefault()
      commitActivePlacement()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelCurrentPlacement()
      focusCanvas()
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      if (event.shiftKey && showXDimension && showYDimension) {
        const focusedAxis = event.currentTarget === dimensionInputXRef.current ? 'x' : 'y'
        const nextAxis = focusedAxis === 'x' ? 'y' : 'x'
        setDimensionKeyboardAxis(nextAxis)
        focusAxis(nextAxis)
      } else toggleDimensionReferenceMode()
    }
  }, [commitActivePlacement, cancelCurrentPlacement, canvasRef, showXDimension, showYDimension,
    dimensionInputXRef, dimensionInputYRef, setDimensionKeyboardAxis, toggleDimensionReferenceMode])

  return { handlePlacementInputKeyDown, handleCanvasDimensionKeyDown, handleDimensionInputKeyDown }
}
