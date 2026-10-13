import React, { useRef, useState } from 'react'

type Point = [number, number]
interface DragStart {
  pointerId: number
  target: 'primary' | 'secondary'
  screen: Point
  centerMm: Point
  paperPixelsPerMm: number
  scaleDenominator: number
}

interface SheetViewportComposerPreviewProps {
  svg: string
  manualCenter: boolean
  centerMm: Point
  scaleDenominator: number
  onCommitCenter: (centerMm: Point) => boolean
  secondaryFrame?: { x: number; y: number; width: number; height: number }
  secondaryManualCenter?: boolean
  secondaryCenterMm?: Point
  secondaryScaleDenominator?: number
  onCommitSecondaryCenter?: (centerMm: Point) => boolean
}

export function SheetViewportComposerPreview({
  svg,
  manualCenter,
  centerMm,
  scaleDenominator,
  onCommitCenter,
  secondaryFrame,
  secondaryManualCenter = false,
  secondaryCenterMm = [0, 0],
  secondaryScaleDenominator = scaleDenominator,
  onCommitSecondaryCenter,
}: SheetViewportComposerPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragStart | null>(null)
  const [dragCenter, setDragCenter] = useState<Point | null>(null)
  const [dragging, setDragging] = useState(false)

  const getCenterAt = (event: React.PointerEvent<HTMLDivElement>, drag: DragStart): Point => {
    const dxPaperMm = (event.clientX - drag.screen[0]) / drag.paperPixelsPerMm
    const dyPaperMm = (event.clientY - drag.screen[1]) / drag.paperPixelsPerMm
    return [
      Math.round(drag.centerMm[0] - dxPaperMm * drag.scaleDenominator),
      Math.round(drag.centerMm[1] + dyPaperMm * drag.scaleDenominator),
    ]
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((!manualCenter && !secondaryManualCenter) || event.button !== 0) return
    const rect = previewRef.current?.getBoundingClientRect()
    if (!rect || rect.width < 1) return
    const paperPixelsPerMm = rect.width / 420
    const paperX = (event.clientX - rect.left) / paperPixelsPerMm
    const paperY = (event.clientY - rect.top) / paperPixelsPerMm
    const hitSecondary = !!secondaryFrame && paperX >= secondaryFrame.x && paperX <= secondaryFrame.x + secondaryFrame.width && paperY >= secondaryFrame.y && paperY <= secondaryFrame.y + secondaryFrame.height
    const target = hitSecondary && secondaryManualCenter && onCommitSecondaryCenter ? 'secondary' : manualCenter ? 'primary' : null
    if (!target) return
    dragRef.current = {
      pointerId: event.pointerId,
      target,
      screen: [event.clientX, event.clientY],
      centerMm: target === 'secondary' ? secondaryCenterMm : centerMm,
      paperPixelsPerMm,
      scaleDenominator: target === 'secondary' ? secondaryScaleDenominator : scaleDenominator,
    }
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch {}
    setDragCenter(dragRef.current.centerMm)
    setDragging(true)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setDragCenter(getCenterAt(event, drag))
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const moved = Math.hypot(event.clientX - drag.screen[0], event.clientY - drag.screen[1])
    if (moved >= 3) {
      const nextCenter = getCenterAt(event, drag)
      if (drag.target === 'secondary') onCommitSecondaryCenter?.(nextCenter)
      else onCommitCenter(nextCenter)
    }
    dragRef.current = null
    setDragCenter(null)
    setDragging(false)
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
  }

  const cancelDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragCenter(null)
    setDragging(false)
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
  }

  if (!svg) return null
  return <div
    ref={previewRef}
    data-testid="sheet-composer-preview"
    data-manual-center={manualCenter}
    data-dragging={dragging}
    aria-label="ตัวอย่างแผ่นแบบ ลากเพื่อจัดกึ่งกลาง viewport"
    onPointerDownCapture={onPointerDown}
    onPointerMoveCapture={onPointerMove}
    onPointerUpCapture={onPointerUp}
    onPointerCancelCapture={cancelDrag}
    style={{
      position: 'relative',
      background: 'white',
      marginTop: 16,
      cursor: manualCenter || secondaryManualCenter ? dragging ? 'grabbing' : 'grab' : 'default',
      touchAction: 'none',
      userSelect: 'none',
    }}
  >
    <div dangerouslySetInnerHTML={{ __html: svg.replace('width="420mm" height="297mm"', 'style="width:100%;height:auto;display:block"') }} />
    {dragCenter && <span role="status" style={{ position: 'absolute', right: 8, top: 8, padding: '4px 8px', borderRadius: 3, background: '#0f172add', color: 'white', fontSize: 11 }}>
      {dragRef.current?.target === 'secondary' ? 'Viewport 2 · ' : ''}ศูนย์กลาง {dragCenter[0].toFixed(0)}, {dragCenter[1].toFixed(0)} mm · ปล่อยเพื่อบันทึก
    </span>}
    {!manualCenter && !secondaryManualCenter && <span style={{ display: 'block', padding: 6, color: '#64748b', fontSize: 11 }}>
      เปิดการกำหนดจุดกึ่งกลางของ viewport แล้วลากกรอบบนแผ่นเพื่อจัดตำแหน่ง
    </span>}
  </div>
}
