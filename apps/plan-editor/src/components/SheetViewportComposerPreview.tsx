import React, { useRef, useState } from 'react'

type Point = [number, number]
interface DragStart {
  pointerId: number
  viewportIndex: number
  screen: Point
  centerMm: Point
  paperPixelsPerMm: number
  scaleDenominator: number
}
type PaperFrameMm = [number, number, number, number]
interface FrameDragStart {
  pointerId: number
  viewportIndex: number
  operation: 'move' | 'resize'
  screen: Point
  frameMm: PaperFrameMm
  paperPixelsPerMm: number
}

interface SheetViewportComposerPreviewProps {
  svg: string
  manualCenter: boolean
  centerMm: Point
  scaleDenominator: number
  onCommitCenter: (centerMm: Point) => boolean
  additionalViewports?: Array<{ frame: { x: number; y: number; width: number; height: number }; manualCenter: boolean; centerMm: Point; scaleDenominator: number }>
  onCommitAdditionalCenter?: (viewportIndex: number, centerMm: Point) => boolean
  editFrames?: boolean
  paperFrames?: PaperFrameMm[]
  onCommitPaperFrame?: (viewportIndex: number, frameMm: PaperFrameMm) => boolean
}

export function SheetViewportComposerPreview({
  svg,
  manualCenter,
  centerMm,
  scaleDenominator,
  onCommitCenter,
  additionalViewports = [],
  onCommitAdditionalCenter,
  editFrames = false,
  paperFrames = [],
  onCommitPaperFrame,
}: SheetViewportComposerPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragStart | null>(null)
  const frameDragRef = useRef<FrameDragStart | null>(null)
  const [dragCenter, setDragCenter] = useState<Point | null>(null)
  const [dragFrames, setDragFrames] = useState<PaperFrameMm[] | null>(null)
  const [dragging, setDragging] = useState(false)
  const [frameDragging, setFrameDragging] = useState(false)

  const getCenterAt = (event: React.PointerEvent<HTMLDivElement>, drag: DragStart): Point => {
    const dxPaperMm = (event.clientX - drag.screen[0]) / drag.paperPixelsPerMm
    const dyPaperMm = (event.clientY - drag.screen[1]) / drag.paperPixelsPerMm
    return [
      Math.round(drag.centerMm[0] - dxPaperMm * drag.scaleDenominator),
      Math.round(drag.centerMm[1] + dyPaperMm * drag.scaleDenominator),
    ]
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (editFrames && onCommitPaperFrame && event.button === 0) {
      const rect = paperRef.current?.getBoundingClientRect()
      if (!rect || rect.width < 1) return
      const paperX = (event.clientX - rect.left) / (rect.width / 420)
      const paperY = (event.clientY - rect.top) / (rect.width / 420)
      const activeFrames = dragFrames ?? paperFrames
      let viewportIndex = -1
      for (let index = activeFrames.length - 1; index >= 0; index -= 1) {
        const [x, y, width, height] = activeFrames[index]
        if (paperX >= x && paperX <= x + width && paperY >= y && paperY <= y + height) { viewportIndex = index; break }
      }
      if (viewportIndex >= 0) onFramePointerDown(event, viewportIndex)
      return
    }
    if (!manualCenter && !additionalViewports.some(viewport => viewport.manualCenter) || event.button !== 0) return
    const rect = previewRef.current?.getBoundingClientRect()
    if (!rect || rect.width < 1) return
    const paperPixelsPerMm = rect.width / 420
    const paperX = (event.clientX - rect.left) / paperPixelsPerMm
    const paperY = (event.clientY - rect.top) / paperPixelsPerMm
    const additionalIndex = additionalViewports.findIndex(viewport => viewport.manualCenter && paperX >= viewport.frame.x && paperX <= viewport.frame.x + viewport.frame.width && paperY >= viewport.frame.y && paperY <= viewport.frame.y + viewport.frame.height)
    const viewportIndex = additionalIndex >= 0 && onCommitAdditionalCenter ? additionalIndex + 1 : manualCenter ? 0 : -1
    if (viewportIndex < 0) return
    const additional = viewportIndex > 0 ? additionalViewports[viewportIndex - 1] : undefined
    dragRef.current = {
      pointerId: event.pointerId,
      viewportIndex,
      screen: [event.clientX, event.clientY],
      centerMm: additional?.centerMm ?? centerMm,
      paperPixelsPerMm,
      scaleDenominator: additional?.scaleDenominator ?? scaleDenominator,
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
      if (drag.viewportIndex > 0) onCommitAdditionalCenter?.(drag.viewportIndex - 1, nextCenter)
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

  const onFramePointerDown = (event: React.PointerEvent<HTMLElement>, viewportIndex: number) => {
    if (!editFrames || event.button !== 0 || !onCommitPaperFrame) return
    event.preventDefault()
    event.stopPropagation()
    const rect = paperRef.current?.getBoundingClientRect()
    const frame = paperFrames[viewportIndex]
    if (!rect || rect.width < 1 || !frame) return
    frameDragRef.current = {
      pointerId: event.pointerId,
      viewportIndex,
      operation: (event.target as HTMLElement).closest('[data-frame-resize-handle]') ? 'resize' : 'move',
      screen: [event.clientX, event.clientY],
      frameMm: [...frame],
      paperPixelsPerMm: rect.width / 420,
    }
    setFrameDragging(true)
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch {}
  }

  const onFramePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = frameDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = (event.clientX - drag.screen[0]) / drag.paperPixelsPerMm
    const dy = (event.clientY - drag.screen[1]) / drag.paperPixelsPerMm
    const [, , oldWidth, oldHeight] = drag.frameMm
    const minWidth = 40
    const minHeight = 30
    const frame: PaperFrameMm = drag.operation === 'move'
      ? [
          Math.round(Math.max(0, Math.min(420 - oldWidth, drag.frameMm[0] + dx))),
          Math.round(Math.max(0, Math.min(297 - oldHeight, drag.frameMm[1] + dy))),
          oldWidth,
          oldHeight,
        ]
      : [
          drag.frameMm[0],
          drag.frameMm[1],
          Math.round(Math.max(minWidth, Math.min(420 - drag.frameMm[0], oldWidth + dx))),
          Math.round(Math.max(minHeight, Math.min(297 - drag.frameMm[1], oldHeight + dy))),
        ]
    setDragFrames(current => {
      const next = [...(current ?? paperFrames)]
      next[drag.viewportIndex] = frame
      return next
    })
  }

  const onFramePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const drag = frameDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = (event.clientX - drag.screen[0]) / drag.paperPixelsPerMm
    const dy = (event.clientY - drag.screen[1]) / drag.paperPixelsPerMm
    const [, , width, height] = drag.frameMm
    const next: PaperFrameMm = drag.operation === 'move'
      ? [Math.round(Math.max(0, Math.min(420 - width, drag.frameMm[0] + dx))), Math.round(Math.max(0, Math.min(297 - height, drag.frameMm[1] + dy))), width, height]
      : [drag.frameMm[0], drag.frameMm[1], Math.round(Math.max(40, Math.min(420 - drag.frameMm[0], width + dx))), Math.round(Math.max(30, Math.min(297 - drag.frameMm[1], height + dy)))]
    if (Math.hypot(dx, dy) >= 0.5) onCommitPaperFrame?.(drag.viewportIndex, next)
    frameDragRef.current = null
    setDragFrames(null)
    setFrameDragging(false)
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
  }

  const onFramePointerCancel = (event: React.PointerEvent<HTMLElement>) => {
    if (frameDragRef.current?.pointerId !== event.pointerId) return
    frameDragRef.current = null
    setDragFrames(null)
    setFrameDragging(false)
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
  }

  if (!svg) return null
  return <div
    ref={previewRef}
    data-testid="sheet-composer-preview"
    data-manual-center={manualCenter}
    data-additional-manual-centers={additionalViewports.map(viewport => viewport.manualCenter).join(',')}
    data-paper-frames={JSON.stringify(dragFrames ?? paperFrames)}
    data-frame-dragging={frameDragging}
    data-dragging={dragging}
    aria-label={editFrames ? 'ตัวอย่างแผ่นแบบ ลากเพื่อจัดกรอบและปรับขนาด viewport' : 'ตัวอย่างแผ่นแบบ ลากเพื่อจัดกึ่งกลาง viewport'}
    onPointerDownCapture={onPointerDown}
    onPointerMoveCapture={event => frameDragRef.current ? onFramePointerMove(event) : onPointerMove(event)}
    onPointerUpCapture={event => frameDragRef.current ? onFramePointerUp(event) : onPointerUp(event)}
    onPointerCancelCapture={event => frameDragRef.current ? onFramePointerCancel(event) : cancelDrag(event)}
    style={{
      position: 'relative',
      background: 'white',
      marginTop: 16,
      cursor: manualCenter || additionalViewports.some(viewport => viewport.manualCenter) ? dragging ? 'grabbing' : 'grab' : 'default',
      touchAction: 'none',
      userSelect: 'none',
    }}
  >
    <div ref={paperRef} data-paper-surface style={{ position: 'relative', width: '100%', aspectRatio: '420 / 297' }}>
      <div style={{ position: 'absolute', inset: 0 }} dangerouslySetInnerHTML={{ __html: svg.replace('width="420mm" height="297mm"', 'style="width:100%;height:100%;display:block"') }} />
      {editFrames && (dragFrames ?? paperFrames).map(([x, y, width, height], index) => <div
        key={`paper-frame-${index}`}
        data-testid={`paper-frame-${index + 1}`}
        style={{
          position: 'absolute', left: `${x / 420 * 100}%`, top: `${y / 297 * 100}%`,
          width: `${width / 420 * 100}%`, height: `${height / 297 * 100}%`,
          boxSizing: 'border-box', border: '2px solid #0284c7', background: '#0284c714',
          cursor: frameDragRef.current ? 'grabbing' : 'move', touchAction: 'none',
        }}
      >
        <span style={{ position: 'absolute', left: 2, top: 2, background: '#0f172a', color: 'white', padding: '1px 4px', fontSize: 10 }}>Viewport {index + 1}</span>
        <button
          type="button"
          data-frame-resize-handle
          aria-label={`ปรับขนาดกรอบ viewport ${index + 1}`}
          style={{ position: 'absolute', width: 14, height: 14, right: -7, bottom: -7, padding: 0, border: '2px solid #0284c7', background: 'white', cursor: 'nwse-resize', touchAction: 'none' }}
        />
      </div>)}
    </div>
    {dragCenter && <span role="status" style={{ position: 'absolute', right: 8, top: 8, padding: '4px 8px', borderRadius: 3, background: '#0f172add', color: 'white', fontSize: 11 }}>
      {dragRef.current && dragRef.current.viewportIndex > 0 ? `Viewport ${dragRef.current.viewportIndex + 1} · ` : ''}ศูนย์กลาง {dragCenter[0].toFixed(0)}, {dragCenter[1].toFixed(0)} mm · ปล่อยเพื่อบันทึก
    </span>}
    {!manualCenter && !additionalViewports.some(viewport => viewport.manualCenter) && <span style={{ display: 'block', padding: 6, color: '#64748b', fontSize: 11 }}>
      เปิดการกำหนดจุดกึ่งกลางของ viewport แล้วลากกรอบบนแผ่นเพื่อจัดตำแหน่ง
    </span>}
  </div>
}
