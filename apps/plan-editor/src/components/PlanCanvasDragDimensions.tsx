import React from 'react'

export type DragDimensionField = 'x' | 'y' | 'width' | 'height' | 'length'
export type DragDimensionMode = 'move' | 'rectangle' | 'opening-width' | 'line-length' | 'stair-width' | 'stair-run'

interface PlanCanvasDragDimensionsProps {
  mode: DragDimensionMode
  displayUnit: string
  values: Record<DragDimensionField, string>
  style: React.CSSProperties
  readout?: string | null
  onChange: (field: DragDimensionField, value: string) => void
  onCommit: () => void
  onCancel: () => void
}

export const PlanCanvasDragDimensions: React.FC<PlanCanvasDragDimensionsProps> = ({
  mode, displayUnit, values, style, readout, onChange, onCommit, onCancel,
}) => {
  const fields: Array<{ key: DragDimensionField; shortLabel: string; accessibleLabel: string }> = mode === 'rectangle'
    ? [
        { key: 'width', shortLabel: 'W', accessibleLabel: `ขนาดเป้าหมาย W (${displayUnit})` },
        { key: 'height', shortLabel: 'H', accessibleLabel: `ขนาดเป้าหมาย H (${displayUnit})` },
      ]
      : mode === 'stair-width'
        ? [{ key: 'width', shortLabel: 'W', accessibleLabel: `ความกว้างเป้าหมายบันได (${displayUnit})` }]
        : mode === 'stair-run'
          ? [{ key: 'length', shortLabel: 'R', accessibleLabel: `ความยาวช่วงบันไดเป้าหมาย (${displayUnit})` }]
          : mode === 'opening-width'
      ? [{ key: 'width', shortLabel: 'W', accessibleLabel: `ความกว้างเป้าหมายช่องเปิด (${displayUnit})` }]
      : mode === 'line-length'
        ? [{ key: 'length', shortLabel: 'L', accessibleLabel: `ความยาวเป้าหมาย (${displayUnit})` }]
        : [
            { key: 'x', shortLabel: 'ΔX', accessibleLabel: `ระยะย้ายแกน X (${displayUnit})` },
            { key: 'y', shortLabel: 'ΔY', accessibleLabel: `ระยะย้ายแกน Y (${displayUnit})` },
          ]

  return <div
    className="cf-manipulation-dimensions"
    role="status"
    aria-live="polite"
    aria-label="มิติชั่วคราวระหว่างแก้ไขวัตถุ"
    onPointerDown={event => event.stopPropagation()}
    style={style}
  >
    {fields.map(field => <label key={field.key}>{field.shortLabel} <input
      aria-label={field.accessibleLabel}
      type="text"
      inputMode="decimal"
      value={values[field.key]}
      onFocus={event => event.currentTarget.select()}
      onChange={event => onChange(field.key, event.target.value)}
      onKeyDown={event => {
        event.stopPropagation()
        if (event.key === 'Enter') { event.preventDefault(); onCommit() }
        else if (event.key === 'Escape') { event.preventDefault(); onCancel() }
      }}
    /></label>)}
    {readout && <span>{readout}</span>}
    <span>Tab เพื่อกรอกระยะ · Enter ยืนยัน · Esc ยกเลิกการลาก</span>
  </div>
}
