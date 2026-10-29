import React, { useEffect, useMemo, useRef, useState } from 'react'
import { alignedDimensionGeometry, alignedDimensionOffset } from '@constructflow/geometry-kernel'
import { formatLengthMm, type DisplayLengthUnit, type PlanDimension, type ProjectDocument } from '@constructflow/project-model'
import { SnapSpatialIndex, snapPoint, type SnapMode } from '@constructflow/snapping-engine'
import type { CommandRequest } from '@constructflow/command-schema'
import { screenToWorld, worldToScreen, type ViewportState } from '../viewport/viewportTransform.js'
import type { PlanCanvasProps } from './PlanCanvas.types.js'
import type { ToolType } from './Toolbar.js'

type Point = [number, number]
export interface PlanDimensionLayerProps {
  project: ProjectDocument
  planProject: ProjectDocument
  viewport: ViewportState
  displayUnit: DisplayLengthUnit
  lengthPrecision?: number
  activeTool: ToolType
  points: Point[]
  pointer: Point | null
  snapModes: SnapMode[]
  onCommit: PlanCanvasProps['onCommitManipulation']
  onPreview: PlanCanvasProps['onPreviewManipulation']
  onRejected?: PlanCanvasProps['onManipulationRejected']
  onClearObjectSelection: () => void
}

/** Drafting annotations have their own focus and gestures; all saves use project commands. */
export function PlanDimensionLayer({ project, planProject, viewport, displayUnit, lengthPrecision = 3, activeTool, points, pointer, snapModes, onCommit, onPreview, onRejected, onClearObjectSelection }: PlanDimensionLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ original: PlanDimension; kind: 'start' | 'end' | 'offset'; client: Point; offset: number } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PlanDimension | null>(null)
  const [valid, setValid] = useState(true)
  const index = useMemo(() => new SnapSpatialIndex(planProject), [planProject])
  const modes = useMemo(() => new Set(snapModes), [snapModes])
  const dimensions = (project.drawing_settings?.plan_dimensions ?? []).filter(dimension => dimension.level_id === project.project.active_level_id && (dimension.created_phase === 'existing' || dimension.created_phase === project.project.active_phase))
  const selected = dimensions.find(dimension => dimension.id === selectedId)
  const command = (dimension: PlanDimension): CommandRequest[] => [{ name: 'SavePlanDimension', input: { dimension } }]
  const cancel = () => { drag.current = null; setDraft(null); setValid(true) }
  useEffect(() => { cancel(); setSelectedId(null) }, [activeTool, project.project.active_level_id, project.project.id])
  useEffect(() => { cancel() }, [project])
  useEffect(() => {
    const clear = (event: PointerEvent) => { if (event.target instanceof HTMLCanvasElement) { cancel(); setSelectedId(null) } }
    document.addEventListener('pointerdown', clear)
    return () => document.removeEventListener('pointerdown', clear)
  }, [])

  const worldPoint = (event: React.PointerEvent<SVGSVGElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    return screenToWorld([event.clientX - rect.left, event.clientY - rect.top], viewport)
  }
  const draggedDimension = (event: React.PointerEvent<SVGSVGElement>) => {
    const state = drag.current
    if (!state) return null
    const raw = worldPoint(event)
    if (state.kind === 'offset') return { ...state.original, offset_mm: alignedDimensionOffset(state.original.start_mm, state.original.end_mm, raw) - state.offset }
    const point = event.ctrlKey ? raw : snapPoint(raw, planProject, viewport, 16, modes, undefined, index.candidateObjectIds(raw, 16 / viewport.zoom)).point_mm
    return { ...state.original, [state.kind === 'start' ? 'start_mm' : 'end_mm']: point }
  }
  const removeSelected = () => {
    if (!selected) return
    const result = onCommit([{ name: 'DeletePlanDimension', input: { dimension_id: selected.id } }])
    if (result.status === 'success') { cancel(); setSelectedId(null) }
    else onRejected?.(result.errors ?? ['ลบเส้นบอกระยะไม่สำเร็จ'])
  }
  const beginDrag = (event: React.PointerEvent<SVGGElement | SVGCircleElement | SVGLineElement>, dimension: PlanDimension, kind: 'start' | 'end' | 'offset') => {
    if (activeTool !== 'select' || event.button !== 0) return
    event.preventDefault(); event.stopPropagation()
    const svg = svgRef.current!
    const rect = svg.getBoundingClientRect()
    const raw = screenToWorld([event.clientX - rect.left, event.clientY - rect.top], viewport)
    drag.current = { original: dimension, kind, client: [event.clientX, event.clientY], offset: alignedDimensionOffset(dimension.start_mm, dimension.end_mm, raw) - dimension.offset_mm }
    setSelectedId(dimension.id); setDraft(null); setValid(true); onClearObjectSelection()
    svg.focus({ preventScroll: true }); svg.setPointerCapture(event.pointerId)
  }

  const renderDimension = (dimension: PlanDimension, preview = false) => {
    const shape = alignedDimensionGeometry(dimension.start_mm, dimension.end_mm, dimension.offset_mm)
    if (!shape) return null
    const a = worldToScreen(shape.start_mm, viewport), b = worldToScreen(shape.end_mm, viewport)
    const start = worldToScreen(dimension.start_mm, viewport), end = worldToScreen(dimension.end_mm, viewport)
    const center = worldToScreen(shape.label_mm, viewport)
    const isSelected = !preview && selectedId === dimension.id
    const color = isSelected ? (valid ? '#0284c7' : '#dc2626') : preview ? '#0284c7' : '#52677d'
    const label = `${formatLengthMm(shape.length_mm, displayUnit, lengthPrecision)} ${displayUnit}`
    const interactive = !preview && activeTool === 'select'
    return <g key={dimension.id} data-plan-dimension={preview ? 'preview' : dimension.id} aria-label={`เส้นบอกระยะ ${label}`}>
      <g fill="none" stroke={color} strokeWidth={isSelected ? 1.7 : 1.1} strokeDasharray={preview ? '5 3' : undefined}>
        <path d={`M${start} L${a} M${end} L${b} M${a} L${b}`} />
        {[a, b].map(([x, y], i) => <path key={i} d={`M${x - 4},${y + 4} l8,-8`} />)}
      </g>
      <rect x={center[0] - label.length * 3.5 - 4} y={center[1] - 10} width={label.length * 7 + 8} height={19} rx={3} fill="#fbfdff" />
      <text x={center[0]} y={center[1] + 4} textAnchor="middle" fill={color} fontSize={12} fontFamily="system-ui, sans-serif">{label}</text>
      {interactive && <g style={{ pointerEvents: 'auto', cursor: 'move', touchAction: 'none' }}>
        <title>ลากเส้นเพื่อย้ายแนวระยะ · เลือกแล้วลากจุดปลาย · Delete ลบ · Esc ยกเลิก</title>
        <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="transparent" strokeWidth={22} onPointerDown={event => beginDrag(event, dimension, 'offset')} />
        {isSelected && ([['start', start], ['end', end]] as const).map(([kind, [x, y]]) => <circle key={kind} cx={x} cy={y} r={7} fill="white" stroke={color} strokeWidth={2} onPointerDown={event => beginDrag(event, dimension, kind)} />)}
      </g>}
    </g>
  }

  const preview = activeTool === 'dimension' && points.length && pointer ? {
    id: 'preview', level_id: project.project.active_level_id, created_phase: project.project.active_phase,
    start_mm: points[0], end_mm: points[1] ?? pointer,
    offset_mm: points.length > 1 ? alignedDimensionOffset(points[0], points[1], pointer) : 18 / viewport.zoom,
  } satisfies PlanDimension : null

  return <>
    <svg ref={svgRef} tabIndex={-1} aria-label="เส้นบอกระยะบนแปลน" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden', outline: 'none' }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); setSelectedId(null) }
        if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); event.stopPropagation(); removeSelected() }
      }}
      onPointerMove={event => {
        if (!drag.current) return
        event.stopPropagation()
        const next = draggedDimension(event)
        if (next) { setDraft(next); setValid(onPreview(command(next)).valid) }
      }}
      onPointerUp={event => {
        const state = drag.current
        if (!state) return
        event.stopPropagation()
        const next = draggedDimension(event)
        if (next && Math.hypot(event.clientX - state.client[0], event.clientY - state.client[1]) >= 3) {
          const result = onCommit(command(next))
          if (result.status !== 'success') onRejected?.(result.errors ?? ['แก้ไขเส้นบอกระยะไม่สำเร็จ'])
        }
        cancel()
        try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
      }} onPointerCancel={cancel}>
      {dimensions.map(dimension => renderDimension(draft?.id === dimension.id ? draft : dimension))}
      {preview && renderDimension(preview, true)}
      {activeTool === 'dimension' && points.map((point, i) => { const [x, y] = worldToScreen(point, viewport); return <circle key={i} cx={x} cy={y} r={4} fill="white" stroke="#0284c7" strokeWidth={1.5} /> })}
    </svg>
    {selected && activeTool === 'select' && <div role="group" aria-label="แก้ไขเส้นบอกระยะ" style={{ position: 'absolute', top: 96, right: 12, zIndex: 10, padding: '6px 10px', background: 'white', border: '1px solid #bae6fd', borderRadius: 6, fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
      <span title="ลากแนวระยะหรือจุดปลายเพื่อแก้ไข">เส้นระยะ</span><button type="button" onClick={removeSelected}>ลบระยะ</button><button type="button" aria-label="ยกเลิกเลือกเส้นบอกระยะ" onClick={() => { cancel(); setSelectedId(null) }}>×</button>
    </div>}
  </>
}
