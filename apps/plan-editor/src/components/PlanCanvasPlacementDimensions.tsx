import React, { useEffect, useState } from 'react'
import type { Dispatch, KeyboardEventHandler, RefObject, SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import type { DisplayLengthUnit } from '@constructflow/project-model'

type Axis = 'x' | 'y'
type NumericField = Axis | 'length' | 'angle'

export interface PlanCanvasPlacementDimensionsProps {
  position: [number, number] | null
  containerSize: { width: number; height: number }
  displayUnit: DisplayLengthUnit
  showX: boolean
  showY: boolean
  hasLineGeometryInput: boolean
  allowManualAngle?: boolean
  isHostedOpeningPlacement: boolean
  dimensionReferenceMode: 'center' | 'edge'
  dimensionReferences: { refX?: number; refY?: number }
  dimensionAnchorX: number | null
  dimensionAnchorY: number | null
  xDimensionDisplay: string
  yDimensionDisplay: string
  dimensionInputX: string
  dimensionInputY: string
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
  onCommitPlacement: () => void
  onToggleDimensionReference: () => void
}

export const PlanCanvasPlacementDimensions: React.FC<PlanCanvasPlacementDimensionsProps> = ({
  position,
  containerSize,
  displayUnit,
  showX,
  showY,
  hasLineGeometryInput,
  allowManualAngle = true,
  isHostedOpeningPlacement,
  dimensionReferenceMode,
  dimensionReferences,
  dimensionAnchorX,
  dimensionAnchorY,
  xDimensionDisplay,
  yDimensionDisplay,
  dimensionInputX,
  dimensionInputY,
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
  onCommitPlacement,
  onToggleDimensionReference,
}) => {
  const [keypadField, setKeypadField] = useState<NumericField | null>(null)
  const [keypadHasStarted, setKeypadHasStarted] = useState(false)
  const touchInput = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  if (!position || (!showX && !showY && !hasLineGeometryInput)) return null

  const [x, y] = position
  const width = hasLineGeometryInput ? 240 : 318
  const left = Math.max(8, Math.min(x > containerSize.width / 2 ? x - width - 12 : x + 18, containerSize.width - width - 8))
  const top = Math.max(8, Math.min(y > containerSize.height / 2 ? y - 94 : y + 22, Math.max(8, containerSize.height - 86)))
  const pointClass = hasLineGeometryInput ? 'is-drawing-segment' : 'is-position-dock'
  const initialKeypadValue = keypadField === 'x' ? xDimensionDisplay
    : keypadField === 'y' ? yDimensionDisplay
      : keypadField === 'angle' ? drawAngleDegrees : drawLengthMeters
  const rawKeypadValue = keypadField === 'x' ? dimensionInputX
    : keypadField === 'y' ? dimensionInputY
      : keypadField === 'angle' ? drawAngleDegrees : drawLengthMeters
  const keypadReadout = keypadHasStarted ? rawKeypadValue : initialKeypadValue || '0'
  const keypadUnit = keypadField === 'angle' ? '°' : displayUnit

  useEffect(() => {
    if (allowManualAngle) return
    if (keypadField === 'angle') setKeypadField(null)
    setDrawAngleDegrees('')
  }, [allowManualAngle, keypadField, setDrawAngleDegrees])

  const openKeypad = (field: NumericField) => {
    if (touchInput) {
      setKeypadField(field)
      setKeypadHasStarted(false)
    }
  }
  const focusXDimension = (event: React.FocusEvent<HTMLInputElement>) => {
    if (dimensionReferences.refX !== undefined) setDimensionAnchorX(dimensionAnchorX ?? dimensionReferences.refX)
    setDimensionKeyboardAxis('x')
    event.currentTarget.select()
    openKeypad('x')
  }
  const focusYDimension = (event: React.FocusEvent<HTMLInputElement>) => {
    if (dimensionReferences.refY !== undefined) setDimensionAnchorY(dimensionAnchorY ?? dimensionReferences.refY)
    setDimensionKeyboardAxis('y')
    event.currentTarget.select()
    openKeypad('y')
  }
  const changeXDimension = (value: string) => {
    setDimensionAnchorX(dimensionAnchorX ?? dimensionReferences.refX ?? null)
    setDimensionInputX(value)
  }
  const changeYDimension = (value: string) => {
    setDimensionAnchorY(dimensionAnchorY ?? dimensionReferences.refY ?? null)
    setDimensionInputY(value)
  }
  const setKeypadValue = (value: string) => {
    if (keypadField === 'x') {
      if (dimensionReferences.refX !== undefined) setDimensionAnchorX(dimensionAnchorX ?? dimensionReferences.refX)
      setDimensionInputX(value)
    } else if (keypadField === 'y') {
      if (dimensionReferences.refY !== undefined) setDimensionAnchorY(dimensionAnchorY ?? dimensionReferences.refY)
      setDimensionInputY(value)
    } else if (keypadField === 'angle') setDrawAngleDegrees(value)
    else setDrawLengthMeters(value)
  }
  const appendKey = (key: string) => {
    if (key === '⌫') {
      const current = keypadHasStarted ? rawKeypadValue : initialKeypadValue
      setKeypadHasStarted(true)
      return setKeypadValue(current.slice(0, -1))
    }
    if (key === 'C') {
      setKeypadHasStarted(true)
      return setKeypadValue('')
    }
    if (key === '±') {
      const current = keypadHasStarted ? rawKeypadValue : initialKeypadValue
      setKeypadHasStarted(true)
      return setKeypadValue(current.startsWith('-') ? current.slice(1) : `-${current}`)
    }
    if (key === '.') {
      const current = keypadHasStarted ? rawKeypadValue : ''
      if (!current.includes('.')) setKeypadValue(`${current || '0'}.`)
      setKeypadHasStarted(true)
      return
    }
    const current = keypadHasStarted ? rawKeypadValue : ''
    setKeypadValue(`${current}${key}`)
    setKeypadHasStarted(true)
  }

  return <>
    <div className={`cf-dynamic-dimensions ${pointClass}`} role="group" aria-label="ระยะและแนวระหว่างวางวัตถุ" onPointerDown={event => event.stopPropagation()} style={hasLineGeometryInput ? { left, top } : undefined}>
      {isHostedOpeningPlacement && <strong className="cf-position-dock-title">ตำแหน่งวาง</strong>}
      {showX && <label><span>X · {displayUnit}</span><input ref={dimensionInputXRef} aria-label={`ระยะจากแนวอ้างอิง X (${displayUnit})`} type="text" inputMode={touchInput ? 'none' : 'decimal'} readOnly={touchInput} value={xDimensionDisplay} onFocus={focusXDimension} onClick={() => openKeypad('x')} onChange={event => changeXDimension(event.target.value)} onKeyDown={onDimensionKeyDown} /></label>}
      {showY && <label><span>Y · {displayUnit}</span><input ref={dimensionInputYRef} aria-label={`ระยะจากแนวอ้างอิง Y (${displayUnit})`} type="text" inputMode={touchInput ? 'none' : 'decimal'} readOnly={touchInput} value={yDimensionDisplay} onFocus={focusYDimension} onClick={() => openKeypad('y')} onChange={event => changeYDimension(event.target.value)} onKeyDown={onDimensionKeyDown} /></label>}
      {hasLineGeometryInput && <>
        <label><span>ความยาว · {displayUnit}</span><input ref={drawLengthInputRef} aria-label={`ความยาวช่วงที่วาด (${displayUnit})`} type="text" inputMode={touchInput ? 'none' : 'decimal'} readOnly={touchInput} value={drawLengthMeters} placeholder={touchInput ? 'แตะเพื่อใส่ระยะ' : 'ตามเมาส์'} onFocus={event => { event.currentTarget.select(); openKeypad('length') }} onClick={() => openKeypad('length')} onChange={event => setDrawLengthMeters(event.target.value)} onKeyDown={onPlacementKeyDown} /></label>
        {allowManualAngle && <label className="cf-placement-angle"><span>องศา</span><input aria-label="องศาช่วงที่วาด (0 องศาขวา 90 องศาขึ้น)" type="text" inputMode={touchInput ? 'none' : 'decimal'} readOnly={touchInput} value={drawAngleDegrees} placeholder="ตามเมาส์" onFocus={event => { event.currentTarget.select(); openKeypad('angle') }} onClick={() => openKeypad('angle')} onChange={event => setDrawAngleDegrees(event.target.value)} onKeyDown={onPlacementKeyDown} /></label>}
      </>}
      {(showX || showY) && <button type="button" className="cf-dimension-reference-toggle" aria-label="สลับวัดจากกึ่งกลางหรือขอบวัตถุ" aria-pressed={dimensionReferenceMode === 'edge'} onClick={onToggleDimensionReference}>วัดจาก {dimensionReferenceMode === 'center' ? 'กึ่งกลาง' : 'ขอบ'}</button>}
      <small>{isHostedOpeningPlacement ? 'พิมพ์ระยะจากขอบช่อง · Tab สลับขอบ/กึ่งกลาง · Enter วาง' : hasLineGeometryInput ? 'แตะค่าระยะเพื่อป้อน · ✓ ยืนยัน · Esc ยกเลิก' : `พิมพ์ระยะ ${showX && showY ? '· Tab ขอบ/กลาง · Shift+Tab สลับ X/Y · ' : '· Tab/Shift+Tab ขอบ/กลาง · '}Enter วาง · Esc ยกเลิก`}</small>
    </div>
    {keypadField && touchInput && typeof document !== 'undefined' && createPortal(
      <div className="cf-plan-numeric-keypad" role="dialog" aria-label={`ป้อน${keypadField === 'angle' ? 'องศา' : 'ระยะ'}ด้วยแป้นตัวเลข`} onPointerDown={event => event.stopPropagation()}>
        <div className="cf-plan-numeric-keypad__heading"><strong>{keypadField === 'angle' ? 'กำหนดมุม' : 'กำหนดระยะ'}</strong><button type="button" aria-label="ปิดแป้นตัวเลข" onPointerDown={event => event.preventDefault()} onClick={() => setKeypadField(null)}>×</button></div>
        <div className="cf-plan-numeric-keypad__readout"><span>{keypadReadout}</span><small>{keypadUnit}</small></div>
        <div className="cf-plan-numeric-keypad__keys">
          {['7', '8', '9', '⌫', '4', '5', '6', '±', '1', '2', '3', 'C', '0', '.', '00'].map(key => <button type="button" key={key} disabled={key === '±' && keypadField !== 'angle'} className={key === '⌫' || key === 'C' || key === '±' ? 'is-function' : ''} aria-label={key === '⌫' ? 'ลบตัวเลขล่าสุด' : key === 'C' ? 'ล้างค่า' : key === '±' ? 'สลับเครื่องหมาย' : key === '.' ? 'จุดทศนิยม' : `เลข ${key}`} onPointerDown={event => event.preventDefault()} onClick={() => appendKey(key)}>{key}</button>)}
          <button type="button" className="is-confirm" aria-label="ยืนยันระยะและวาง" onPointerDown={event => event.preventDefault()} onClick={() => { setKeypadField(null); onCommitPlacement() }}>✓</button>
        </div>
        <small className="cf-plan-numeric-keypad__hint">แตะตัวเลขเพื่อกำหนดระยะ · ✓ เพื่อยืนยัน · × ปิดแป้น</small>
      </div>, document.body,
    )}
  </>
}
