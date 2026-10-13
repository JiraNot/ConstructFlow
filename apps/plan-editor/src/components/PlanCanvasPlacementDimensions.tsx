import React from 'react'
import type { Dispatch, KeyboardEventHandler, RefObject, SetStateAction } from 'react'
import type { DisplayLengthUnit } from '@constructflow/project-model'

type Axis = 'x' | 'y'

interface PlanCanvasPlacementDimensionsProps {
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
  const left = Math.max(8, Math.min(x > containerSize.width / 2 ? x - 318 : x + 18, containerSize.width - 318))
  const top = Math.max(8, Math.min(y > containerSize.height / 2 ? y - 94 : y + 22, containerSize.height - 86))

  return <div className="cf-dynamic-dimensions" role="group" aria-label="ระยะและแนวระหว่างวางวัตถุ" onPointerDown={event => event.stopPropagation()} style={{ left, top }}>
    {showX && <label><span>X · {displayUnit}</span><input ref={dimensionInputXRef} aria-label={`ระยะจากแนวอ้างอิง X (${displayUnit})`} type="text" inputMode="decimal" value={xDimensionDisplay} onFocus={event => { if (dimensionReferences.refX !== undefined) setDimensionAnchorX(dimensionAnchorX ?? dimensionReferences.refX); setDimensionKeyboardAxis('x'); event.currentTarget.select() }} onChange={event => { setDimensionAnchorX(dimensionAnchorX ?? dimensionReferences.refX ?? null); setDimensionInputX(event.target.value) }} onKeyDown={onDimensionKeyDown} /></label>}
    {showY && <label><span>Y · {displayUnit}</span><input ref={dimensionInputYRef} aria-label={`ระยะจากแนวอ้างอิง Y (${displayUnit})`} type="text" inputMode="decimal" value={yDimensionDisplay} onFocus={event => { if (dimensionReferences.refY !== undefined) setDimensionAnchorY(dimensionAnchorY ?? dimensionReferences.refY); setDimensionKeyboardAxis('y'); event.currentTarget.select() }} onChange={event => { setDimensionAnchorY(dimensionAnchorY ?? dimensionReferences.refY ?? null); setDimensionInputY(event.target.value) }} onKeyDown={onDimensionKeyDown} /></label>}
    {hasLineGeometryInput && <>
      <label><span>ระยะ · {displayUnit}</span><input aria-label={`ความยาวช่วงที่วาด (${displayUnit})`} type="text" inputMode="decimal" value={drawLengthMeters} placeholder="ตามเมาส์" onFocus={event => event.currentTarget.select()} onChange={event => setDrawLengthMeters(event.target.value)} onKeyDown={onPlacementKeyDown} /></label>
      <label><span>องศ</span><input aria-label="องศาช่วงที่วาด (0 องศาขวา 90 องศาขึ้น)" type="number" step="0.1" value={drawAngleDegrees} placeholder="ตามเมาส์" onFocus={event => event.currentTarget.select()} onChange={event => setDrawAngleDegrees(event.target.value)} onKeyDown={onPlacementKeyDown} /></label>
    </>}
    {(showX || showY) && <button type="button" className="cf-dimension-reference-toggle" aria-label="สลับวัดจากกึ่งกลางหรือขอบวัตถุ" aria-pressed={dimensionReferenceMode === 'edge'} onClick={onToggleDimensionReference}>วัดจาก {dimensionReferenceMode === 'center' ? 'กึ่งกลาง' : 'ขอบ'}</button>}
    <small>{isHostedOpeningPlacement ? 'พิมพ์ระยะจากขอบช่อง · Tab/Shift+Tab สลับขอบ/กึ่งกลาง · Enter วาง' : hasLineGeometryInput ? `ระยะ/องศาคุมช่วงเส้น · Enter วาดช่วง${showX || showY ? ` · ${showX && showY ? 'Shift+Tab สลับ X/Y' : 'Tab ขอบ/กลาง'}` : ''}` : `พิมพ์ระยะ ${showX && showY ? '· Tab ขอบ/กลาง · Shift+Tab สลับ X/Y · ' : '· Tab/Shift+Tab ขอบ/กลาง · '}Enter วาง`} · Esc ยกเลิกขั้นตอน/ออกเมื่อว่าง</small>
  </div>
}
