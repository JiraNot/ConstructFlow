import { useCallback, type Dispatch, type KeyboardEvent, type RefObject, type SetStateAction } from 'react'
import type { ToolType } from './Toolbar.js'
import { resolvePlanCanvasNumericInputTarget } from './planCanvasPlacementConstraints.mjs'

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
  drawLengthMeters: string
  hasLineGeometryInput: boolean
  setDrawLengthMeters: Dispatch<SetStateAction<string>>
  showXDimension: boolean
  showYDimension: boolean
  dimensionInputXRef: RefObject<HTMLInputElement | null>
  dimensionInputYRef: RefObject<HTMLInputElement | null>
  drawLengthInputRef: RefObject<HTMLInputElement | null>
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
  dimensionAnchorY, dimensionReferences, dimensionInputX, dimensionInputY, drawLengthMeters, hasLineGeometryInput,
  setDrawLengthMeters, showXDimension, showYDimension, dimensionInputXRef, dimensionInputYRef,
  drawLengthInputRef, canvasRef, setDimensionKeyboardAxis, setDimensionAnchorX, setDimensionAnchorY,
  setDimensionInputX, setDimensionInputY, commitActivePlacement, cancelCurrentPlacement,
  toggleDimensionReferenceMode,
}: UsePlanCanvasPlacementKeyboardOptions) {
  const focusCanvas = () => canvasRef.current?.focus({ preventScroll: true })
  const focusAxis = (axis: Axis) => requestAnimationFrame(() => (axis === 'x' ? dimensionInputXRef : dimensionInputYRef).current?.focus())
  const focusDrawLength = () => requestAnimationFrame(() => {
    const input = drawLengthInputRef.current
    if (!input) return
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
  })

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
    if (!supportsPlacementDimensions && !['measure', 'fill', 'dimension', 'calibrate'].includes(activeTool)) return
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      commitActivePlacement()
      return
    }
    if (!supportsPlacementDimensions) return

    const inputTarget = resolvePlanCanvasNumericInputTarget({ hasLineGeometryInput, showXDimension, showYDimension })
    if (inputTarget === 'length') {
      if (event.key === 'Tab' && drawLengthInputRef.current) {
        event.preventDefault()
        focusDrawLength()
        return
      }
      const isDigit = event.key.length === 1 && event.key >= '0' && event.key <= '9'
      if (isDigit || event.key === '.' || event.key === 'Backspace') {
        event.preventDefault()
        event.stopPropagation()
        if (isDigit) setDrawLengthMeters(value => value + event.key)
        else if (event.key === '.' && !drawLengthMeters.includes('.')) setDrawLengthMeters(value => value + event.key)
        else if (event.key === 'Backspace') setDrawLengthMeters(value => value.slice(0, -1))
      }
      return
    }

    if (inputTarget !== 'axis') return
    const axis = dimensionHostAxis ?? dimensionKeyboardAxis
    const anchor = axis === 'x' ? dimensionAnchorX ?? dimensionReferences.refX : dimensionAnchorY ?? dimensionReferences.refY
    if (event.key === 'Tab') {
      event.preventDefault()
      if (event.shiftKey && showXDimension && showYDimension) {
        const nextAxis = axis === 'x' ? 'y' : 'x'
        setDimensionKeyboardAxis(nextAxis)
        focusAxis(nextAxis)
      } else toggleDimensionReferenceMode()
      return
    }
    const inputValue = axis === 'x' ? dimensionInputX : dimensionInputY
    const isDigit = event.key.length === 1 && event.key >= '0' && event.key <= '9'
    if (isDigit || (event.key === '.' && !inputValue.includes('.'))) {
      if (anchor === undefined) return
      event.preventDefault()
      event.stopPropagation()
      if (axis === 'x') {
        setDimensionAnchorX(anchor)
        setDimensionInputX(value => value + event.key)
      } else {
        setDimensionAnchorY(anchor)
        setDimensionInputY(value => value + event.key)
      }
    } else if (event.key === 'Backspace') {
      event.preventDefault()
      event.stopPropagation()
      if (anchor !== undefined) {
        if (axis === 'x') setDimensionInputX(value => value.slice(0, -1))
        else setDimensionInputY(value => value.slice(0, -1))
      }
    }
  }, [supportsPlacementDimensions, activeTool, dimensionHostAxis, dimensionKeyboardAxis, dimensionAnchorX, dimensionAnchorY,
    dimensionReferences, dimensionInputX, dimensionInputY, drawLengthMeters, hasLineGeometryInput, setDrawLengthMeters,
    showXDimension, showYDimension, dimensionInputXRef, dimensionInputYRef, drawLengthInputRef, setDimensionKeyboardAxis,
    setDimensionAnchorX, setDimensionAnchorY, setDimensionInputX, setDimensionInputY, commitActivePlacement,
    toggleDimensionReferenceMode])

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
