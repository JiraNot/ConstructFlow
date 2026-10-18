import React from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
import type { ToolType } from './Toolbar.js'
import type { ToolInteractionStatus } from '../app/toolInteractionStatus.mjs'
import { getObjectFamilyDisplayName } from './objectDisplayNames.js'

interface PlanCanvasInteractionHintsProps {
  activeTool: ToolType
  showSelectionHandleHint: boolean
  placementStatus: ToolInteractionStatus | null
  placementHint: string | null
  escapeLabel: string
  pickCandidates: string[]
  hoveredId: string | null
  project: ProjectDocument
  onCyclePick: (reverse?: boolean) => void
  onHoverChange: (id: string) => void
  onSelectionChange?: (ids: string[], primaryId: string | null) => void
  onSelectObject: (id: string | null) => void
  onCancel: () => void
  canFinishPolygon: boolean
  onFinishPolygon: () => void
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
  onCyclePick,
  onHoverChange,
  onSelectionChange,
  onSelectObject,
  onCancel,
  canFinishPolygon,
  onFinishPolygon,
}) => {
  const touchInstruction = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
    ? ({
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
    : placementHint
  return (
  <>
    {activeTool === 'select' && showSelectionHandleHint && <details className="cf-tape-measure-hint cf-guided-hint cf-selection-handle-help" aria-live="polite">
      <summary>วิธีใช้จุดจับ</summary><div><span>น้ำเงิน: ปรับขนาด หรือยืดปลายเส้น</span><span>ส้ม: ปรับขอบหรือกึ่งกลางช่องเปิด</span><span>ม่วง: หมุนบิลท์อิน · ⇄: กลับด้านประตู</span><small>กริด ท่อ และแนวบัวพิมพ์ระยะเป้าหมายได้หลังเริ่มลาก · W/R ใช้ปรับช่วงบันได · ขอบเสาใช้ BIM Snap</small></div>
    </details>}
    {placementHint && <div className="cf-tape-measure-hint cf-guided-hint" aria-live="polite" data-tool-step={placementStatus?.step}>
      <strong className="cf-guided-hint-step">{placementStatus?.stepLabel ?? 'คำแนะนำ'}</strong>
      <span className="cf-guided-hint-action">{touchInstruction}</span>
      {placementStatus?.constraint && <small>ข้อกำหนด · {placementStatus.constraint}</small>}
      {placementStatus?.snapFeedback && <small>จุดช่วยจับ · {placementStatus.snapFeedback}</small>}
      <div className="cf-guided-hint-actions" onPointerDown={event => event.stopPropagation()}>
        {canFinishPolygon && <button type="button" onClick={onFinishPolygon} title="ปิดรูปและสร้างวัตถุ (Enter)">ปิดรูป</button>}
        {escapeLabel && <button type="button" onClick={onCancel} title={escapeLabel}>{escapeLabel.replace(/^Esc\s*/, '')}</button>}
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
