import React, { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type DragDimensionField = 'x' | 'y' | 'width' | 'height' | 'length' | 'offset'
export type DragDimensionMode = 'move' | 'axis-x' | 'axis-y' | 'rectangle' | 'opening-width' | 'line-length' | 'stair-width' | 'stair-run' | 'stair-landing' | 'stair-first-flight' | 'stair-second-flight' | 'edge-offset'

export interface PlanCanvasDragDimensionsProps {
  mode: DragDimensionMode
  displayUnit: string
  values: Record<DragDimensionField, string>
  style: React.CSSProperties
  showDimensions?: boolean
  readout?: string | null
  onChange: (field: DragDimensionField, value: string) => void
  onCommit: () => void
  onCancel: () => void
}

export const PlanCanvasDragDimensions: React.FC<PlanCanvasDragDimensionsProps> = ({
  mode, displayUnit, values, style, showDimensions = true, readout, onChange, onCommit, onCancel,
}) => {
  const [keypadField, setKeypadField] = useState<DragDimensionField | null>(null)
  const [keypadHasStarted, setKeypadHasStarted] = useState(false)
  const [keypadPosition, setKeypadPosition] = useState<{ left: number; top: number } | null>(null)
  const [keypadDragging, setKeypadDragging] = useState(false)
  const keypadDragRef = useRef<{ pointerId: number; startX: number; startY: number; left: number; top: number; width: number; height: number } | null>(null)
  const touchInput = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  const touchControls = typeof window !== 'undefined' && window.matchMedia('(any-pointer: coarse)').matches
  const relativeHint = mode === 'move'
    ? 'ΔX/ΔY วัดจากตำแหน่งเดิมของวัตถุ (+/−)'
    : mode === 'axis-x' || mode === 'axis-y' ? 'Δ วัดจากตำแหน่งเดิมของกริด (+/−)' : ''
  const editHint = touchInput ? 'แตะช่องระยะเพื่อแก้ค่า · กดยืนยันเพื่อบันทึก' : 'Tab เพื่อเปลี่ยนช่อง · Enter ยืนยัน · Esc ยกเลิก'
  const fields: Array<{ key: DragDimensionField; shortLabel: string; accessibleLabel: string }> = mode === 'axis-x' || mode === 'axis-y'
    ? [{ key: mode === 'axis-x' ? 'x' : 'y', shortLabel: mode === 'axis-x' ? 'ΔX' : 'ΔY', accessibleLabel: `ระยะย้ายแกน ${mode === 'axis-x' ? 'X' : 'Y'} (${displayUnit})` }]
    : mode === 'rectangle'
    ? [
        { key: 'width', shortLabel: 'W', accessibleLabel: `ขนาดเป้าหมาย W (${displayUnit})` },
        { key: 'height', shortLabel: 'H', accessibleLabel: `ขนาดเป้าหมาย H (${displayUnit})` },
      ]
      : mode === 'stair-width'
        ? [{ key: 'width', shortLabel: 'W', accessibleLabel: `ความกว้างเป้าหมายบันได (${displayUnit})` }]
        : mode === 'stair-run'
          ? [{ key: 'length', shortLabel: 'R', accessibleLabel: `ความยาวช่วงบันไดเป้าหมาย (${displayUnit})` }]
          : mode === 'stair-landing'
            ? [{ key: 'length', shortLabel: 'L', accessibleLabel: `ความลึกชานพักเป้าหมาย (${displayUnit})` }]
            : mode === 'stair-first-flight'
              ? [{ key: 'length', shortLabel: '1', accessibleLabel: `ความยาวเที่ยวแรกเป้าหมาย (${displayUnit})` }]
              : mode === 'stair-second-flight'
                ? [{ key: 'length', shortLabel: '2', accessibleLabel: `ความยาวเที่ยวกลับเป้าหมาย (${displayUnit})` }]
          : mode === 'edge-offset'
            ? [{ key: 'offset', shortLabel: 'Δ', accessibleLabel: `ระยะเยื้องขอบพื้น (${displayUnit})` }]
          : mode === 'opening-width'
      ? [{ key: 'width', shortLabel: 'W', accessibleLabel: `ความกว้างเป้าหมายช่องเปิด (${displayUnit})` }]
      : mode === 'line-length'
        ? [{ key: 'length', shortLabel: 'L', accessibleLabel: `ความยาวเป้าหมาย (${displayUnit})` }]
        : [
            { key: 'x', shortLabel: 'ΔX', accessibleLabel: `ระยะย้ายแกน X (${displayUnit})` },
            { key: 'y', shortLabel: 'ΔY', accessibleLabel: `ระยะย้ายแกน Y (${displayUnit})` },
          ]

  const keypadValue = keypadField ? values[keypadField] : ''
  const keypadReadout = keypadHasStarted ? keypadValue : keypadValue || '0'
  const canToggleSign = keypadField === 'x' || keypadField === 'y' || keypadField === 'offset'
  const openKeypad = (field: DragDimensionField) => {
    if (!touchInput) return
    setKeypadField(field)
    setKeypadHasStarted(false)
  }
  const startKeypadDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button'))) return
    const panel = event.currentTarget.parentElement
    if (!panel) return
    const bounds = panel.getBoundingClientRect()
    keypadDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    }
    setKeypadPosition({ left: bounds.left, top: bounds.top })
    setKeypadDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  const moveKeypadDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = keypadDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const left = drag.left + event.clientX - drag.startX
    const top = drag.top + event.clientY - drag.startY
    setKeypadPosition({
      left: Math.max(8, Math.min(window.innerWidth - drag.width - 8, left)),
      top: Math.max(8, Math.min(window.innerHeight - drag.height - 8, top)),
    })
    event.preventDefault()
  }
  const finishKeypadDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (keypadDragRef.current?.pointerId !== event.pointerId) return
    keypadDragRef.current = null
    setKeypadDragging(false)
  }
  const appendKey = (key: string) => {
    if (!keypadField) return
    const current = keypadHasStarted ? keypadValue : keypadValue || ''
    if (key === '⌫') {
      onChange(keypadField, current.slice(0, -1))
      setKeypadHasStarted(true)
      return
    }
    if (key === 'C') {
      onChange(keypadField, '')
      setKeypadHasStarted(true)
      return
    }
    if (key === '±') {
      if (!canToggleSign) return
      const signed = current || '0'
      onChange(keypadField, signed.startsWith('-') ? signed.slice(1) : `-${signed}`)
      setKeypadHasStarted(true)
      return
    }
    if (key === '.') {
      if (!current.includes('.')) onChange(keypadField, `${current || '0'}.`)
      setKeypadHasStarted(true)
      return
    }
    onChange(keypadField, `${keypadHasStarted ? keypadValue : ''}${key}`)
    setKeypadHasStarted(true)
  }

  const manipulationPanel = (showDimensions || touchControls) ? <div
    className={`cf-manipulation-dimensions${touchControls ? ' is-touch-dock' : ''}${!showDimensions ? ' is-actions-only' : ''}`}
    role="group"
    aria-label={showDimensions ? 'มิติและปุ่มยืนยันการแก้ไขวัตถุ' : 'ยืนยันการแก้ไขวัตถุ'}
    onPointerDown={event => event.stopPropagation()}
    style={style}
  >
      {showDimensions && fields.map(field => <label key={field.key}>{field.shortLabel} <input
        aria-label={field.accessibleLabel}
        type="text"
        inputMode={touchInput ? 'none' : 'decimal'}
        readOnly={touchInput}
        value={values[field.key]}
        onFocus={event => { event.currentTarget.select(); openKeypad(field.key) }}
        onClick={() => openKeypad(field.key)}
        onChange={event => onChange(field.key, event.target.value)}
        onKeyDown={event => {
          event.stopPropagation()
          if (event.key === 'Enter') { event.preventDefault(); onCommit() }
          else if (event.key === 'Escape') { event.preventDefault(); onCancel() }
        }}
      /></label>)}
      {showDimensions && readout && <span className="cf-manipulation-dimensions__readout">{readout}</span>}
      {showDimensions && <span className="cf-manipulation-dimensions__hint">{[relativeHint, editHint].filter(Boolean).join(' · ')}</span>}
      {!showDimensions && <strong className="cf-manipulation-dimensions__prompt">ยืนยันการแก้ไขวัตถุ</strong>}
      {touchControls && <div className="cf-manipulation-actions">
        <button type="button" className="is-cancel" onClick={onCancel}>ยกเลิก</button>
        <button type="button" className="is-confirm" onClick={onCommit}>ยืนยัน</button>
      </div>}
  </div> : null

  return <>
    {manipulationPanel && (touchControls && typeof document !== 'undefined'
      ? createPortal(manipulationPanel, document.body)
      : manipulationPanel)}
    {keypadField && touchInput && typeof document !== 'undefined' && createPortal(
      <div className="cf-plan-numeric-keypad" role="dialog" aria-label={`ป้อน${fields.find(field => field.key === keypadField)?.accessibleLabel ?? 'ระยะ'}ด้วยแป้นตัวเลข`} onPointerDown={event => event.stopPropagation()}
        style={keypadPosition ? { left: keypadPosition.left, top: keypadPosition.top, right: 'auto', bottom: 'auto' } : undefined}>
        <div className={`cf-plan-numeric-keypad__heading${keypadDragging ? ' is-dragging' : ''}`} title="ลากหัวแป้นเพื่อย้ายตำแหน่ง"
          onPointerDown={startKeypadDrag} onPointerMove={moveKeypadDrag} onPointerUp={finishKeypadDrag} onPointerCancel={finishKeypadDrag}>
          <strong>กำหนด {fields.find(field => field.key === keypadField)?.shortLabel ?? 'ระยะ'}</strong>
          <button type="button" aria-label="ซ่อนแป้นตัวเลข" onPointerDown={event => event.preventDefault()} onClick={() => setKeypadField(null)}>×</button>
        </div>
        <div className="cf-plan-numeric-keypad__readout"><span>{keypadReadout}</span><small>{displayUnit}</small></div>
        <div className="cf-plan-numeric-keypad__keys">
          {['7', '8', '9', '⌫', '4', '5', '6', '±', '1', '2', '3', 'C', '0', '.', '00'].map(key => <button type="button" key={key}
            disabled={key === '±' && !canToggleSign}
            className={key === '⌫' || key === 'C' || key === '±' ? 'is-function' : ''}
            aria-label={key === '⌫' ? 'ลบตัวเลขล่าสุด' : key === 'C' ? 'ล้างค่า' : key === '±' ? 'สลับเครื่องหมาย' : key === '.' ? 'จุดทศนิยม' : `เลข ${key}`}
            onPointerDown={event => event.preventDefault()} onClick={() => appendKey(key)}>{key}</button>)}
        </div>
        <div className="cf-plan-numeric-keypad__actions">
          <button type="button" className="is-cancel" onPointerDown={event => event.preventDefault()} onClick={onCancel}>ยกเลิก</button>
          <button type="button" className="is-confirm" aria-label="เสร็จสิ้นการป้อนตัวเลข" onPointerDown={event => event.preventDefault()} onClick={() => setKeypadField(null)}>เสร็จ</button>
        </div>
        <small className="cf-plan-numeric-keypad__hint">ลากหัวแป้นเพื่อย้าย · เสร็จเพื่อปิดแป้น · กดยืนยันด้านล่างเพื่อบันทึก</small>
      </div>, document.body,
    )}
  </>
}
