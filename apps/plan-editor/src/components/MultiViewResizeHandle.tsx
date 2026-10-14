import React, { useEffect, useRef } from 'react'

type ResizeOrientation = 'vertical' | 'horizontal'

interface MultiViewResizeHandleProps {
  orientation: ResizeOrientation
  value: number
  min: number
  max: number
  label: string
  onChange: (value: number) => void
}

export const MultiViewResizeHandle: React.FC<MultiViewResizeHandleProps> = ({ orientation, value, min, max, label, onChange }) => {
  const activePointer = useRef<number | null>(null)
  const handleRef = useRef<HTMLDivElement>(null)
  const propsRef = useRef({ orientation, min, max, onChange })
  const cleanupRef = useRef<(() => void) | null>(null)
  propsRef.current = { orientation, min, max, onChange }
  const clampPosition = (position: number) => Math.max(min, Math.min(max, Math.round(position)))

  useEffect(() => () => cleanupRef.current?.(), [])

  const updateFromPointer = (event: PointerEvent) => {
    if (activePointer.current !== event.pointerId) return
    const bounds = handleRef.current?.parentElement?.getBoundingClientRect()
    if (!bounds) return
    const { orientation: activeOrientation, min: activeMin, max: activeMax, onChange: activeOnChange } = propsRef.current
    const point = activeOrientation === 'vertical'
      ? ((event.clientX - bounds.left) / bounds.width) * 100
      : ((event.clientY - bounds.top) / bounds.height) * 100
    activeOnChange(Math.max(activeMin, Math.min(activeMax, Math.round(point))))
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const positive = orientation === 'vertical' ? event.key === 'ArrowRight' : event.key === 'ArrowDown'
    const negative = orientation === 'vertical' ? event.key === 'ArrowLeft' : event.key === 'ArrowUp'
    if (positive || negative) {
      event.preventDefault()
      onChange(clampPosition(value + (positive ? 2 : -2)))
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      onChange(event.key === 'Home' ? min : max)
    }
  }

  return <div
    className={`cf-multiview-resize-handle is-${orientation}`}
    role="separator"
    aria-label={label}
    aria-orientation={orientation}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    tabIndex={0}
    ref={handleRef}
    onPointerDown={event => {
      event.preventDefault()
      activePointer.current = event.pointerId
      event.currentTarget.setPointerCapture(event.pointerId)
      cleanupRef.current?.()
      const pointerId = event.pointerId
      const move = (pointerEvent: PointerEvent) => updateFromPointer(pointerEvent)
      const finish = (pointerEvent: PointerEvent) => {
        if (pointerEvent.pointerId !== pointerId) return
        activePointer.current = null
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', finish)
        window.removeEventListener('pointercancel', finish)
        cleanupRef.current = null
        const handle = handleRef.current
        if (handle?.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', finish)
      window.addEventListener('pointercancel', finish)
      cleanupRef.current = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', finish)
        window.removeEventListener('pointercancel', finish)
      }
      updateFromPointer(event.nativeEvent)
    }}
    onKeyDown={onKeyDown}
    style={orientation === 'vertical'
      ? { left: `${value}%`, top: 52, height: 'calc(100% - 52px)', transform: 'translateX(-50%)' }
      : { top: `${value}%`, left: 0, width: '100%', transform: 'translateY(-50%)' }}
  />
}
