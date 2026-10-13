import React, { type ComponentProps, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import type { SmartObject } from '@constructflow/project-model'
import type { ViewportState } from '../viewport/viewportTransform.js'
import { zoomAtScreenPoint } from '../viewport/viewportTransform.js'
import { PlanCanvasInteractionOverlays } from './PlanCanvasInteractionOverlays.js'
import { PlanCanvasObjectContextMenu } from './PlanCanvasObjectContextMenu.js'
import type { ToolType } from './Toolbar.js'

type CanvasEvents = Pick<ComponentProps<'canvas'>,
  'onPointerMove' | 'onPointerDown' | 'onDoubleClick' | 'onContextMenu' | 'onPointerUp' | 'onWheel' | 'onKeyDown' | 'onPointerCancel'
>

interface PlanCanvasSurfaceProps {
  containerRef: RefObject<HTMLDivElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  activeTool: ToolType
  cursor: string
  canvasEvents: CanvasEvents
  contextMenu: (Omit<ComponentProps<typeof PlanCanvasObjectContextMenu>, 'containerSize'> & { object: SmartObject }) | null
  containerSize: { width: number; height: number }
  overlays: ComponentProps<typeof PlanCanvasInteractionOverlays>
  viewport: ViewportState
  setViewport: Dispatch<SetStateAction<ViewportState>>
  fitView: () => void
}

export function PlanCanvasSurface({
  containerRef,
  canvasRef,
  activeTool,
  cursor,
  canvasEvents,
  contextMenu,
  containerSize,
  overlays,
  viewport,
  setViewport,
  fitView,
}: PlanCanvasSurfaceProps) {
  return <div
    ref={containerRef}
    className="cf-plan-canvas"
    data-active-tool={activeTool}
    style={{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      background: '#fbfdff',
      cursor,
    }}
  >
    <canvas
      ref={canvasRef}
      tabIndex={0}
      aria-label="แปลน: คลิกขวาหรือแตะค้างบนวัตถุเพื่อเปิดเมนูแก้ไขและลบ; กด Tab เพื่อสลับวัตถุที่ซ้อนกัน"
      {...canvasEvents}
      style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
    />
    {contextMenu && <PlanCanvasObjectContextMenu {...contextMenu} containerSize={containerSize} />}
    <PlanCanvasInteractionOverlays {...overlays} />
    <div className="cf-canvas-zoom" aria-label="ควบคุมมุมมองแปลน">
      <button type="button" aria-label="ซูมออก" title="ซูมออก" onPointerDown={event => event.stopPropagation()} onClick={() => {
        const box = containerRef.current
        if (box) setViewport(current => zoomAtScreenPoint(current, [box.clientWidth / 2, box.clientHeight / 2], 0.8))
      }}><ZoomOut size={16} /></button>
      <span aria-live="polite">{Math.round((viewport.zoom / 0.08) * 100)}%</span>
      <button type="button" aria-label="ซูมเข้า" title="ซูมเข้า" onPointerDown={event => event.stopPropagation()} onClick={() => {
        const box = containerRef.current
        if (box) setViewport(current => zoomAtScreenPoint(current, [box.clientWidth / 2, box.clientHeight / 2], 1.25))
      }}><ZoomIn size={16} /></button>
      <button type="button" aria-label="จัดแปลนให้อยู่ในหน้าจอ" title="จัดแปลนให้อยู่ในหน้าจอ" onPointerDown={event => event.stopPropagation()} onClick={fitView}><Maximize2 size={15} /></button>
    </div>
  </div>
}
