import React, { lazy, Suspense, type ComponentProps, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import type { SmartObject } from '@constructflow/project-model'
import type { SiteSurveyPoint } from '@constructflow/project-model'
import type { ViewportState } from '../viewport/viewportTransform.js'
import { planZoomPercent, zoomAtScreenPoint } from '../viewport/viewportTransform.js'
import { PlanCanvasInteractionOverlays } from './PlanCanvasInteractionOverlays.js'
import { PlanCanvasObjectContextMenu } from './PlanCanvasObjectContextMenu.js'
import type { PlanDimensionLayerProps } from './PlanDimensionLayer.js'
import type { PlanPhotoPinLayerProps } from './PlanPhotoPinLayer.js'
import type { PlanCommentPinLayerProps } from './PlanCommentPinLayer.js'
import type { ToolType } from './Toolbar.js'

type CanvasEvents = Pick<ComponentProps<'canvas'>,
  'onPointerMove' | 'onPointerDown' | 'onDoubleClick' | 'onContextMenu' | 'onPointerUp' | 'onWheel' | 'onKeyDown' | 'onPointerCancel'
>

const PlanDimensionLayer = lazy(() => import('./PlanDimensionLayer.js').then(module => ({ default: module.PlanDimensionLayer })))
const PlanPhotoPinLayer = lazy(() => import('./PlanPhotoPinLayer.js').then(module => ({ default: module.PlanPhotoPinLayer })))
const PlanCommentPinLayer = lazy(() => import('./PlanCommentPinLayer.js').then(module => ({ default: module.PlanCommentPinLayer })))

interface PlanCanvasSurfaceProps {
  containerRef: RefObject<HTMLDivElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  activeTool: ToolType
  cursor: string
  canvasEvents: CanvasEvents
  contextMenu: (Omit<ComponentProps<typeof PlanCanvasObjectContextMenu>, 'containerSize'> & { object: SmartObject }) | null
  containerSize: { width: number; height: number }
  overlays: ComponentProps<typeof PlanCanvasInteractionOverlays>
  dimensions: PlanDimensionLayerProps
  photoPins?: PlanPhotoPinLayerProps
  commentPins?: PlanCommentPinLayerProps
  viewport: ViewportState
  setViewport: Dispatch<SetStateAction<ViewportState>>
  fitView: () => void
  selectedSurveyPoint?: SiteSurveyPoint | null
  onDismissSurveyPoint?: () => void
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
  dimensions,
  photoPins,
  commentPins,
  viewport,
  setViewport,
  fitView,
  selectedSurveyPoint = null,
  onDismissSurveyPoint,
}: PlanCanvasSurfaceProps) {
  return <div
    ref={containerRef}
    className="cf-plan-canvas"
    data-active-tool={activeTool}
    data-viewport-pan-x={viewport.panX}
    data-viewport-pan-y={viewport.panY}
    data-viewport-zoom={viewport.zoom}
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
    {(activeTool === 'dimension' || (dimensions.project.drawing_settings?.plan_dimensions?.length ?? 0) > 0) && <Suspense fallback={null}>
      <PlanDimensionLayer {...dimensions} />
    </Suspense>}
    {photoPins?.sessions.length ? <Suspense fallback={null}><PlanPhotoPinLayer {...photoPins} /></Suspense> : null}
    {commentPins?.comments.length ? <Suspense fallback={null}><PlanCommentPinLayer {...commentPins} /></Suspense> : null}
    {contextMenu && <PlanCanvasObjectContextMenu {...contextMenu} containerSize={containerSize} />}
    <PlanCanvasInteractionOverlays {...overlays} />

    {selectedSurveyPoint && <aside aria-label="จุดสำรวจที่เลือก" role="region" style={{ position: 'absolute', zIndex: 20, right: 12, top: 12, width: 270, maxWidth: 'calc(100% - 24px)', padding: 12, background: 'rgba(255,255,255,.97)', border: `1px solid ${selectedSurveyPoint.source_status === 'measured' ? '#0284c7' : '#d97706'}`, borderRadius: 6, boxShadow: '0 6px 20px rgba(15,23,42,.16)', color: '#0f172a', fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start' }}>
        <strong>{selectedSurveyPoint.name} · {selectedSurveyPoint.source_status === 'measured' ? 'วัดจริง' : 'สมมติ'}</strong>
        <button type="button" aria-label="ปิดรายละเอียดจุดสำรวจ" onPointerDown={event => event.stopPropagation()} onClick={onDismissSurveyPoint}>×</button>
      </div>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 8px', margin: '8px 0 0' }}>
        <dt>พิกัด</dt><dd style={{ margin: 0 }}>{(selectedSurveyPoint.x_mm / 1000).toFixed(3)}, {(selectedSurveyPoint.y_mm / 1000).toFixed(3)} m</dd>
        <dt>ระดับ</dt><dd style={{ margin: 0 }}>{selectedSurveyPoint.elevation_mm === undefined ? 'ไม่มีข้อมูล' : `${(selectedSurveyPoint.elevation_mm / 1000).toFixed(3)} m`}</dd>
        <dt>แหล่งที่มา</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{selectedSurveyPoint.source_reference}</dd>
      </dl>
    </aside>}
    <div className="cf-canvas-zoom" aria-label="ควบคุมมุมมองแปลน">
      <button type="button" aria-label="ซูมออก" title="ซูมออก" onPointerDown={event => event.stopPropagation()} onClick={() => {
        const box = containerRef.current
        if (box) setViewport(current => zoomAtScreenPoint(current, [box.clientWidth / 2, box.clientHeight / 2], 0.8))
      }}><ZoomOut size={16} /></button>
      <span aria-live="polite">{planZoomPercent(viewport.zoom)}%</span>
      <button type="button" aria-label="ซูมเข้า" title="ซูมเข้า" onPointerDown={event => event.stopPropagation()} onClick={() => {
        const box = containerRef.current
        if (box) setViewport(current => zoomAtScreenPoint(current, [box.clientWidth / 2, box.clientHeight / 2], 1.25))
      }}><ZoomIn size={16} /></button>
      <button type="button" aria-label="จัดแปลนให้อยู่ในหน้าจอ" title="จัดแปลนให้อยู่ในหน้าจอ" onPointerDown={event => event.stopPropagation()} onClick={fitView}><Maximize2 size={15} /></button>
    </div>
  </div>
}
