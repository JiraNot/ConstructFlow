import React, { useRef } from 'react'

type ResizeOrientation = 'vertical' | 'horizontal'

interface MultiViewResizeHandleProps {
  orientation: ResizeOrientation
  value: number
  onChange: (value: number) => void
}

const clampPercent = (value: number) => Math.max(30, Math.min(70, Math.round(value)))

export const MultiViewResizeHandle: React.FC<MultiViewResizeHandleProps> = ({ orientation, value, onChange }) => {
  const activePointer = useRef<number | null>(null)

  const updateFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== event.pointerId) return
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!bounds) return
    const point = orientation === 'vertical'
      ? ((event.clientX - bounds.left) / bounds.width) * 100
      : ((event.clientY - bounds.top) / bounds.height) * 100
    onChange(clampPercent(point))
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const positive = orientation === 'vertical' ? event.key === 'ArrowRight' : event.key === 'ArrowDown'
    const negative = orientation === 'vertical' ? event.key === 'ArrowLeft' : event.key === 'ArrowUp'
    if (positive || negative) {
      event.preventDefault()
      onChange(clampPercent(value + (positive ? 2 : -2)))
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      onChange(event.key === 'Home' ? 30 : 70)
    }
  }

  return <div
    className={`cf-multiview-resize-handle is-${orientation}`}
    role="separator"
    aria-label="ปรับขนาดมุมมองหลัก"
    aria-orientation={orientation}
    aria-valuemin={30}
    aria-valuemax={70}
    aria-valuenow={value}
    tabIndex={0}
    onPointerDown={event => {
      event.preventDefault()
      activePointer.current = event.pointerId
      event.currentTarget.setPointerCapture(event.pointerId)
      updateFromPointer(event)
    }}
    onPointerMove={updateFromPointer}
    onPointerUp={event => {
      if (activePointer.current === event.pointerId) activePointer.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    }}
    onPointerCancel={() => { activePointer.current = null }}
    onKeyDown={onKeyDown}
    style={orientation === 'vertical'
      ? { left: `${value}%`, top: 0, height: '100%', transform: 'translateX(-50%)' }
      : { top: `${value}%`, left: 0, width: '100%', transform: 'translateY(-50%)' }}
  />
}
