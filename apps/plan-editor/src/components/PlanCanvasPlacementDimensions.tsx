import React from 'react'
import type { Dispatch, KeyboardEventHandler, RefObject, SetStateAction } from 'react'
import type { DisplayLengthUnit } from '@constructflow/project-model'

type Axis = 'x' | 'y'

export interface PlanCanvasPlacementDimensionsProps {
  position: [number, number] | null
  containerSize: { width: number; height: number }
  displayUnit: DisplayLengthUnit
  showX: boolean
  showY: boolean
  hasLineGeometryInput: boolean
  isHostedOpeningPlacement: boolean
  dimensionReferenceMode: 'center' | 'edge'
  dimensionReferences: { refX?: number; refY?: number }
  dimensionAnchorX: number | null
  dimensionAnchorY: number | null
  xDimensionDisplay: string
  yDimensionDisplay: string
  drawLengthMeters: string
  drawAngleDegrees: string
  dimensionInputXRef: RefObject<HTMLInputElement | null>
  dimensionInputYRef: RefObject<HTMLInputElement | null>
  drawLengthInputRef: RefObject<HTMLInputElement | null>
  setDimensionKeyboardAxis: Dispatch<SetStateAction<Axis>>
  setDimensionAnchorX: Dispatch<SetStateAction<number | null>>
  setDimensionAnchorY: Dispatch<SetStateAction<number | null>>
  setDimensionInputX: Dispatch<SetStateAction<string>>
  setDimensionInputY: Dispatch<SetStateAction<string>>
  setDrawLengthMeters: Dispatch<SetStateAction<string>>
  setDrawAngleDegrees: Dispatch<SetStateAction<string>>
  onDimensionKeyDown: KeyboardEventHandler<HTMLInputElement>
  onPlacementKeyDown: KeyboardEventHandler<HTMLInputElement>
  onToggleDimensionReference: () => void
}

export const PlanCanvasPlacementDimensions: React.FC<PlanCanvasPlacementDimensionsProps> = ({
  position,
  containerSize,
  displayUnit,
  showX,
  showY,
  hasLineGeometryInput,
  isHostedOpeningPlacement,
  dimensionReferenceMode,
  dimensionReferences,
  dimensionAnchorX,
  dimensionAnchorY,
  xDimensionDisplay,
  yDimensionDisplay,
  drawLengthMeters,
  drawAngleDegrees,
  dimensionInputXRef,
  dimensionInputYRef,
  drawLengthInputRef,
  setDimensionKeyboardAxis,
  setDimensionAnchorX,
  setDimensionAnchorY,
  setDimensionInputX,
  setDimensionInputY,
  setDrawLengthMeters,
  setDrawAngleDegrees,
  onDimensionKeyDown,
  onPlacementKeyDown,
  onToggleDimensionReference,
}) => {
  if (!position || (!showX && !showY && !hasLineGeometryInput)) return null
  const [x, y] = position
  const width = hasLineGeometryInput ? 240 : 318
  const left = Math.max(8, Math.min(x > containerSize.width / 2 ? x - width - 12 : x + 18, containerSize.width - width - 8))
  const top = Math.max(8, Math.min(y > containerSize.height / 2 ? y - 94 : y + 22, Math.max(8, containerSize.height - 86)))
  const pointClass = hasLineGeometryInput ? 'is-drawing-segment' : ''

  return <div className={`cf-dynamic-dimensions ${pointClass}`} role="group" aria-label="ระยะและแนวระหว่างวางวัตถุ" onPointerDown={event => event.stopPropagation()} style={{ left, top }}>
    {showX && <label><span>X · {displayUnit}</span><input ref={dimensionInputXRef} aria-label={`ระยะจากแนวอ้างอิง X (${displayUnit})`} type="text" inputMode="decimal" value={xDimensionDisplay} onFocus={event => { if (dimensionReferences.refX !== undefined) setDimensionAnchorX(dimensionAnchorX ?? dimensionReferences.refX); setDimensionKeyboardAxis('x'); event.currentTarget.select() }} onChange={event => { setDimensionAnchorX(dimensionAnchorX ?? dimensionReferences.refX ?? null); setDimensionInputX(event.target.value) }} onKeyDown={onDimensionKeyDown} /></label>}
    {showY && <label><span>Y · {displayUnit}</span><input ref={dimensionInputYRef} aria-label={`ระยะจากแนวอ้างอิง Y (${displayUnit})`} type="text" inputMode="decimal" value={yDimensionDisplay} onFocus={event => { if (dimensionReferences.refY !== undefined) setDimensionAnchorY(dimensionAnchorY ?? dimensionReferences.refY); setDimensionKeyboardAxis('y'); event.currentTarget.select() }} onChange={event => { setDimensionAnchorY(dimensionAnchorY ?? dimensionReferences.refY ?? null); setDimensionInputY(event.target.value) }} onKeyDown={onDimensionKeyDown} /></label>}
    {hasLineGeometryInput && <>
      <label><span>ความยาว · {displayUnit}</span><input ref={drawLengthInputRef} aria-label={`ความยาวช่วงที่วาด (${displayUnit})`} type="text" inputMode="decimal" value={drawLengthMeters} placeholder="ตามเมาส์" onFocus={event => event.currentTarget.select()} onChange={event => setDrawLengthMeters(event.target.value)} onKeyDown={onPlacementKeyDown} /></label>
      <label className="cf-placement-angle"><span>องศา</span><input aria-label="องศาช่วงที่วาด (0 องศาขวา 90 องศาขึ้น)" type="number" step="0.1" value={drawAngleDegrees} placeholder="ตามเมาส์" onFocus={event => event.currentTarget.select()} onChange={event => setDrawAngleDegrees(event.target.value)} onKeyDown={onPlacementKeyDown} /></label>
    </>}
    {(showX || showY) && <button type="button" className="cf-dimension-reference-toggle" aria-label="สลับวัดจากกึ่งกลางหรือขอบวัตถุ" aria-pressed={dimensionReferenceMode === 'edge'} onClick={onToggleDimensionReference}>วัดจาก {dimensionReferenceMode === 'center' ? 'กึ่งกลาง' : 'ขอบ'}</button>}
    <small>{isHostedOpeningPlacement ? 'พิมพ์ระยะจากขอบช่อง · Tab สลับขอบ/กึ่งกลาง · Enter วาง' : hasLineGeometryInput ? 'พิมพ์ความยาวช่วง · Enter ยืนยัน · คลิกหรือลากกำหนดทิศ · Esc ยกเลิก' : `พิมพ์ระยะ ${showX && showY ? '· Tab ขอบ/กลาง · Shift+Tab สลับ X/Y · ' : '· Tab/Shift+Tab ขอบ/กลาง · '}Enter วาง · Esc ยกเลิก`}</small>
  </div>
}
