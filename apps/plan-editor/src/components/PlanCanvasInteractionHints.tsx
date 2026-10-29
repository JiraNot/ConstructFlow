import React from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
import type { ToolType } from './Toolbar.js'
import type { ToolInteractionStatus } from '../app/toolInteractionStatus.mjs'
import { getObjectFamilyDisplayName } from './objectDisplayNames.js'
import type { MeasureMode, PlanSketchMode, WallDrawMode } from './planCanvasInteractionTypes.js'
import type { PlanFillStyle } from '@constructflow/project-model'
import type { PlanCanvasPreferences } from '../app/planCanvasPreferences.mjs'

export interface PlanCanvasInteractionHintsProps {
  activeTool: ToolType
  showSelectionHandleHint: boolean
  placementStatus: ToolInteractionStatus | null
  placementHint: string | null
  escapeLabel: string
  pickCandidates: string[]
  hoveredId: string | null
  project: ProjectDocument
  activeFamilyName?: string
  onCyclePick: (reverse?: boolean) => void
  onHoverChange: (id: string) => void
  onSelectionChange?: (ids: string[], primaryId: string | null) => void
  onSelectObject: (id: string | null) => void
  onCancel: () => void
  canFinishPolygon: boolean
  onFinishPolygon: () => void
  wallChainActive: boolean
  onFinishWall: () => void
  wallDrawMode: WallDrawMode
  onWallDrawModeChange: (mode: WallDrawMode) => void
  lineDrawingMode: PlanCanvasPreferences['lineDrawingMode']
  onLineDrawingModeChange: (mode: PlanCanvasPreferences['lineDrawingMode']) => void
  wallAngleSnapDeg: PlanCanvasPreferences['wallAngleSnapDeg']
  onWallAngleSnapChange: (value: PlanCanvasPreferences['wallAngleSnapDeg']) => void
  measureMode: MeasureMode
  measurePointCount: number
  measureComplete: boolean
  measureError: string
  onMeasureModeChange: (mode: MeasureMode) => void
  onFinishMeasure: () => void
  fillStyle: PlanFillStyle
  onFillStyleChange: (updater: (style: PlanFillStyle) => PlanFillStyle) => void
  sketchMode: PlanSketchMode
  onSketchModeChange: (mode: PlanSketchMode) => void
  sketchPointCount: number
  onFinishSketch: () => void
}

const wallModeLabels: Record<WallDrawMode, string> = {
  'continuous-lines': 'ลากผนังต่อเนื่อง',
  'continuous-lines-and-arcs': 'ลากผนังตรงและโค้ง',
  'line-arc': 'ลากผนังโค้ง',
  'room-rectangle': 'ห้องสี่เหลี่ยม · ลากกรอบ',
  'room-l-shape': 'ห้องรูปตัว L',
  'room-u-shape': 'ห้องรูปตัว U · ลากกรอบ',
}

const visibleWallDrawModes: WallDrawMode[] = [
  'continuous-lines', 'continuous-lines-and-arcs', 'line-arc', 'room-rectangle', 'room-u-shape',
]

const measureModeLabels: Record<MeasureMode, string> = {
  distance: 'ระยะ', angle: 'มุม', rectangle: 'สี่เหลี่ยม', polygon: 'รูปหลายเหลี่ยม',
  'area-pick': 'พื้นที่ · แตะด้านใน', 'area-boundary': 'พื้นที่ · วาดขอบเขต',
  'fill-pick': 'Fill · แตะพื้นที่ด้านใน', 'fill-boundary': 'Fill · วาดขอบเขต',
}

export const PlanCanvasInteractionHints: React.FC<PlanCanvasInteractionHintsProps> = ({
  activeTool,
  showSelectionHandleHint,
  placementStatus,
  placementHint,
  escapeLabel,
  pickCandidates,
  hoveredId,
  project,
  activeFamilyName,
  onCyclePick,
  onHoverChange,
  onSelectionChange,
  onSelectObject,
  onCancel,
  canFinishPolygon,
  onFinishPolygon,
  wallChainActive,
  onFinishWall,
  wallDrawMode,
  measureMode,
  measurePointCount,
  measureComplete,
  measureError,
  onFinishMeasure,
  sketchMode,
  onSketchModeChange,
  sketchPointCount,
  onFinishSketch,
}) => {
  const touchInput = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse), (any-pointer: coarse)').matches
  const tabletInput = touchInput && typeof window !== 'undefined' && window.matchMedia('(min-width: 700px)').matches
  const measureTouchInstruction = ({ distance: 'ลากจากจุดเริ่มไปจุดปลาย · ปล่อยเพื่อยืนยัน', angle: 'เลือกจุดเริ่ม · จุดยอด · จุดปลาย', rectangle: 'ลากจากมุมแรกไปมุมตรงข้าม · ปล่อยเพื่อยืนยัน', polygon: 'แตะมุมรอบพื้นที่ · แตะจุดเริ่มเพื่อปิด', 'area-pick': 'แตะด้านในพื้นหรือพื้นที่ปิด', 'area-boundary': 'แตะมุมรอบพื้นที่ · ปิดรูปเพื่อคำนวณ', 'fill-pick': 'แตะด้านในพื้นหรือห้องเพื่อเติมลาย', 'fill-boundary': 'แตะมุมรอบพื้นที่ · กดใช้ Fill เพื่อบันทึก' } as Record<MeasureMode, string>)[measureMode]
  const touchInstruction = activeTool === 'furniture' && activeFamilyName
    ? 'แตะตำแหน่งกึ่งกลางเพื่อวาง · แตะซ้ำเพื่อวางชิ้นถัดไป'
    : touchInput
    ? activeTool === 'wall'
      ? wallDrawMode.startsWith('room-')
        ? 'ลากทแยงเพื่อกำหนดขนาดห้อง · ปล่อยเพื่อสร้างแนวผนัง'
        : wallDrawMode === 'continuous-lines-and-arcs' || wallDrawMode === 'line-arc'
          ? 'ลากค้างนิ้วเดียวตามแนวผนัง · วาดโค้งต่อเนื่องโดยไม่ยกนิ้ว · ปล่อยเพื่อบันทึก'
          : 'ลากค้างนิ้วเดียวเพื่อวาดต่อเนื่อง · หักมุมเพื่อเปลี่ยนแนว · ปล่อยเพื่อบันทึก'
      : activeTool === 'measure' || activeTool === 'fill'
        ? `${measureTouchInstruction}${tabletInput ? ' · เลือกโหมดจากแถบขวา' : ''}`
      : activeTool === 'draw'
        ? sketchMode === 'freehand' ? 'ลากค้างเพื่อวาดเส้น · ปล่อยเพื่อบันทึก' : sketchMode === 'polyline' ? 'แตะเพิ่มจุด · แตะจุดเริ่มเพื่อปิด หรือกดจบเส้น' : 'แตะจุดเริ่มและจุดปลายเพื่อวาดเส้น'
      : ({
      'start-point': 'แตะจุดเริ่มบนแปลน',
      'end-point': 'แตะจุดปลายบนแปลน',
      'first-vertex': 'แตะมุมแรกบนแปลน',
      'add-vertex': 'แตะมุมถัดไป · เมื่อครบ 3 จุด กดปิดรูป',
      'find-host-wall': 'แตะตำแหน่งบนผนัง',
      'position-on-host': 'แตะตำแหน่งบนผนัง',
      'dimension-offset': 'แตะตำแหน่งเส้นบอกระยะ',
      'origin': 'แตะจุดกำเนิดบนแปลน',
      'position': 'แตะตำแหน่งที่ต้องการ',
    } as Record<string, string>)[placementStatus?.step ?? ''] ?? placementHint
    : placementHint ?? (activeTool === 'wall'
      ? 'ลากค้างเพื่อวาดแนวผนังต่อเนื่อง · ปล่อยเพื่อบันทึก'
      : activeTool === 'measure' ? 'ลากเพื่อวัด หรือเลือกโหมดด้านล่าง'
          : activeTool === 'fill' ? 'เลือกพื้นที่หรือวาดขอบเขตเพื่อเติมสีและ Hatch'
            : activeTool === 'draw' ? `วาดเส้น · ${sketchMode === 'freehand' ? 'ลากค้างแล้วปล่อยเพื่อบันทึก' : sketchMode === 'polyline' ? 'คลิกเพิ่มจุด · Enter หรือแตะจุดแรกเพื่อจบ' : 'เลือกจุดเริ่มและจุดปลาย'}`
          : undefined)
  const heading = activeTool === 'wall' ? `ผนัง · ${wallModeLabels[wallDrawMode]}` : activeTool === 'draw' ? `วาดเส้น · ${{ line: 'เส้นตรง', polyline: 'เส้นต่อเนื่อง', freehand: 'เส้นอิสระ', rectangle: 'สี่เหลี่ยม' }[sketchMode]}` : activeTool === 'fill' ? 'Fill / Hatch' : activeTool === 'measure' ? `วัด · ${measureModeLabels[measureMode]}` : activeTool === 'furniture' && activeFamilyName ? `Family · ${activeFamilyName}` : placementStatus?.stepLabel ?? 'คำแนะนำ'
  const showPlacementCard = Boolean(placementHint || ['wall', 'measure', 'fill', 'draw'].includes(activeTool))
  return (
  <>
    {activeTool === 'select' && showSelectionHandleHint && <details className="cf-tape-measure-hint cf-guided-hint cf-selection-handle-help" aria-live="polite">
      <summary>วิธีใช้จุดจับ</summary><div><span>น้ำเงิน: ปรับขนาด หรือยืดปลายเส้น</span><span>ส้ม: ปรับขอบหรือกึ่งกลางช่องเปิด</span><span>ม่วง: หมุนบิลท์อิน · ⇄: กลับด้านประตู</span><small>กริด ท่อ และแนวบัวพิมพ์ระยะเป้าหมายได้หลังเริ่มลาก · W/R ใช้ปรับช่วงบันได · ขอบเสาใช้ BIM Snap</small></div>
    </details>}
    {showPlacementCard && <div className="cf-tape-measure-hint cf-guided-hint" aria-live="polite" data-tool-step={placementStatus?.step}>
      <strong className="cf-guided-hint-step">{heading}</strong>
      <span className="cf-guided-hint-action">{touchInstruction}</span>
      {(activeTool === 'measure' || activeTool === 'fill') && measureError && <small role="alert" className="cf-measure-error">{measureError}</small>}
      <div className="cf-guided-hint-actions" onPointerDown={event => event.stopPropagation()}>
        {canFinishPolygon && <button type="button" onClick={onFinishPolygon} title="ปิดรูปและสร้างวัตถุ (Enter)">ปิดรูป</button>}
        {(activeTool === 'measure' || activeTool === 'fill') && !measureComplete && measurePointCount >= 3 && ['polygon', 'area-boundary', 'fill-boundary'].includes(measureMode) && <button type="button" onClick={onFinishMeasure} title={measureMode === 'fill-boundary' ? 'ปิดขอบเขตและบันทึก Fill' : 'ปิดขอบเขตเพื่อคำนวณพื้นที่'}>{measureMode === 'fill-boundary' ? 'ใช้ Fill' : 'ปิดพื้นที่'}</button>}
        {activeTool === 'wall' && wallChainActive && <button type="button" className="cf-wall-finish" onClick={onFinishWall} title="จบแนวผนังและกลับไปเลือก">จบแนว</button>}
        {activeTool === 'draw' && sketchMode === 'polyline' && sketchPointCount >= 2 && <button type="button" onClick={onFinishSketch} title="บันทึกเส้นต่อเนื่อง">จบเส้น</button>}
        {escapeLabel && <button type="button" onClick={onCancel} title={escapeLabel} aria-label={escapeLabel}>{escapeLabel.replace(/^Esc\s*/, '')}</button>}
      </div>
    </div>}
    {activeTool === 'select' && pickCandidates.length > 1 && <div className="cf-pick-stack" role="group" aria-label="วัตถุซ้อนกัน" onPointerDown={event => event.stopPropagation()}>
      <span>วัตถุซ้อนกัน {pickCandidates.length} ชิ้น</span>
      <button type="button" onClick={() => onCyclePick(true)} aria-label="เลือกวัตถุก่อนหน้า">‹</button>
      <select aria-label="เลือกวัตถุที่ซ้อนกัน" value={pickCandidates.includes(hoveredId ?? '') ? hoveredId! : pickCandidates[0]} onChange={event => {
        const id = event.target.value
        onHoverChange(id)
        onSelectionChange?.([id], id)
        onSelectObject(id)
      }}>
        {pickCandidates.map(id => {
          const object = project.objects[id]
          if (!object) return null
          const family = getObjectFamilyDisplayName(object.object_type)
          const data = object.module_data as unknown as Record<string, unknown>
          const mark = String(data.mark ?? data.type_mark ?? data.tag ?? '').trim()
          const duplicates = pickCandidates.filter(candidateId => {
            const candidate = project.objects[candidateId]
            const values = candidate?.module_data as Record<string, unknown> | undefined
            return candidate?.object_type === object.object_type && String(values?.mark ?? values?.type_mark ?? values?.tag ?? '').trim() === mark
          }).sort()
          const suffix = duplicates.length > 1 ? ` · ${duplicates.indexOf(id) + 1}` : ''
          return <option key={id} value={id} title={`${family} ${mark} · ${id}`}>{family}{mark ? ` ${mark}` : ''}{suffix}</option>
        })}
      </select>
      <button type="button" onClick={() => onCyclePick()} aria-label="เลือกวัตถุถัดไป">›</button>
      <small>Tab สลับ · Shift+Tab ย้อน · แตะรายการเพื่อเลือก</small>
    </div>}
  </>
  )
}

/** Icon-only drawing-mode controls for the tablet rail beside the category toolbar. */
export const PlanCanvasDrawingModeRail: React.FC<Pick<PlanCanvasInteractionHintsProps,
  'activeTool' | 'wallDrawMode' | 'onWallDrawModeChange' | 'lineDrawingMode' | 'onLineDrawingModeChange' | 'measureMode' | 'onMeasureModeChange' | 'sketchMode' | 'onSketchModeChange'
>> = ({ activeTool, wallDrawMode, onWallDrawModeChange, lineDrawingMode, onLineDrawingModeChange, measureMode, onMeasureModeChange, sketchMode, onSketchModeChange }) => {
  const lineModes = [
    {
      id: 'orthogonal', label: 'ตรงแกน · 0° / 90°', active: lineDrawingMode === 'orthogonal',
      onSelect: () => onLineDrawingModeChange('orthogonal'),
      icon: <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 18h9v-9h7" /><path d="M4 5v13" /></svg>,
    },
    {
      id: 'angled', label: 'วาดมุมเอียง', active: lineDrawingMode === 'angled',
      onSelect: () => onLineDrawingModeChange('angled'),
      icon: <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 18 20 6" /><path d="M4 13v5h5" /><path d="M9 18a5 5 0 0 1 1.5-3.5" /></svg>,
    },
  ]
  const modes: Array<{ id: string; label: string; active: boolean; icon: React.ReactNode; onSelect: () => void }> = activeTool === 'wall'
    ? visibleWallDrawModes.map(id => ({
      id, label: wallModeLabels[id], active: wallDrawMode === id, onSelect: () => onWallDrawModeChange(id),
      icon: <svg aria-hidden="true" viewBox="0 0 24 24">
        {id === 'continuous-lines' && <path d="M4 5h7v7h9" />}
        {id === 'continuous-lines-and-arcs' && <><path d="M4 6h6c0 9 4 12 10 12" /><path d="M14 6c3 0 5 2 6 5" /></>}
        {id === 'line-arc' && <><path d="M4 6h7" /><path d="M11 6c7 0 7 12 0 12" /></>}
        {id === 'room-rectangle' && <rect x="4" y="4" width="16" height="16" rx="1" />}
        {id === 'room-l-shape' && <path d="M5 4v15h14" />}
        {id === 'room-u-shape' && <path d="M5 4v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4" />}
      </svg>,
    }))
    : activeTool === 'measure'
      ? (['distance', 'angle', 'rectangle', 'polygon', 'area-pick', 'area-boundary'] as MeasureMode[]).map(id => ({
        id, label: measureModeLabels[id], active: measureMode === id, onSelect: () => onMeasureModeChange(id),
        icon: <svg aria-hidden="true" viewBox="0 0 24 24">
          {id === 'distance' && <><path d="M4 12h16" /><path d="m7 9-3 3 3 3M17 9l3 3-3 3" /></>}
          {id === 'angle' && <><path d="M5 18h14M5 18l8-12" /><path d="M10 18a5 5 0 0 0-1-3" /></>}
          {id === 'rectangle' && <rect x="4" y="5" width="16" height="14" rx="1" />}
          {id === 'polygon' && <path d="m12 3 8 6-3 10H7L4 9z" />}
          {id === 'area-pick' && <><path d="M4 5h16v14H4z" /><circle cx="12" cy="12" r="3" /></>}
          {id === 'area-boundary' && <><path d="m5 18 3-12 11 3-2 9z" /><path d="M5 18h3" /></>}
        </svg>,
      }))
      : activeTool === 'fill'
        ? (['fill-pick', 'fill-boundary'] as MeasureMode[]).map(id => ({
          id, label: measureModeLabels[id], active: measureMode === id, onSelect: () => onMeasureModeChange(id),
          icon: <svg aria-hidden="true" viewBox="0 0 24 24">
            {id === 'fill-pick' && <><path d="M4 5h16v14H4z" /><path d="m10 14 2-6 2 6M11 12h2" /></>}
            {id === 'fill-boundary' && <><path d="m4 18 3-12 13 2-2 11z" /><path d="m8 15 2-5m2 7 3-8" /></>}
          </svg>,
        }))
        : activeTool === 'draw'
          ? ([['line', 'เส้นตรง'], ['polyline', 'เส้นต่อเนื่อง'], ['freehand', 'เส้นอิสระ'], ['rectangle', 'สี่เหลี่ยม']] as [PlanSketchMode, string][]).map(([id, label]) => ({
            id, label, active: sketchMode === id, onSelect: () => onSketchModeChange(id),
            icon: <svg aria-hidden="true" viewBox="0 0 24 24">
              {id === 'line' && <path d="M5 19 19 5" />}
              {id === 'polyline' && <path d="M4 17h6V7h10" />}
              {id === 'freehand' && <path d="M4 15c3-9 5 6 8-1s4-9 8-5" />}
              {id === 'rectangle' && <rect x="4" y="5" width="16" height="14" rx="1" />}
            </svg>,
          }))
        : []

  if (activeTool === 'wall') modes.unshift(...lineModes)
  else if (activeTool === 'beam') modes.push(...lineModes)

  if (!modes.length) return null
  const groupLabel = activeTool === 'wall' ? 'โหมดแนวและรูปแบบผนัง' : activeTool === 'beam' ? 'โหมดแนวคาน' : activeTool === 'measure' ? 'รูปแบบการวัด' : activeTool === 'draw' ? 'รูปแบบเส้นร่าง' : 'รูปแบบ Fill'
  return <div className="cf-tool-draw-mode-list" role="toolbar" aria-label={groupLabel} onPointerDown={event => event.stopPropagation()}>
    {modes.map((mode, index) => <React.Fragment key={mode.id}>{activeTool === 'wall' && index === lineModes.length && <span className="cf-draw-mode-separator" aria-hidden="true" />}
      <button type="button" className={mode.active ? 'is-active' : ''} aria-label={mode.label} aria-pressed={mode.active} title={mode.label} onClick={mode.onSelect}>
      {mode.icon}<span className="cf-visually-hidden">{mode.label}</span>
      </button></React.Fragment>)}
  </div>
}
