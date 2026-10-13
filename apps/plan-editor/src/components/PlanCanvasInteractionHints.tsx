import React from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
import type { ToolType } from './Toolbar.js'
import type { ToolInteractionStatus } from '../app/toolInteractionStatus.mjs'

interface PlanCanvasInteractionHintsProps {
  activeTool: ToolType
  tapeMeasure: { complete: boolean } | null
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
}

export const PlanCanvasInteractionHints: React.FC<PlanCanvasInteractionHintsProps> = ({
  activeTool,
  tapeMeasure,
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
}) => (
  <>
    {activeTool === 'measure' && <div className="cf-tape-measure-hint" aria-live="polite">
      ตลับเมตร · {tapeMeasure?.complete ? 'คลิกเพื่อเริ่มวัดเส้นใหม่' : tapeMeasure ? 'คลิกจุดปลาย' : 'คลิกจุดเริ่ม'} · Esc ออก
    </div>}
    {activeTool === 'select' && showSelectionHandleHint && <div className="cf-tape-measure-hint" aria-live="polite">
      จุดจับสีน้ำเงิน: ปรับขนาดเสา/ฐานราก หรือลากปลายผนัง คาน กริด เส้นแบ่งห้อง ท่อ และแนวบัว · กริด เส้นแบ่งห้อง แนวท่อ และแนวบัวระบุความยาวเป้าหมายได้หลังเริ่มลากจุดปลาย · จุด W/R บันไดระบุความกว้างหรือความยาวช่วงเป้าหมายได้ · จุดสีม่วง: หมุนบิลท์อินรอบจุดวาง · จุดสีส้ม: ลากขอบปรับความกว้าง หรือลากจุดกึ่งกลางปรับตำแหน่ง (BIM Snap ขอบเสา 100 มม.) · ปุ่ม ⇄: สลับด้านบานประตู
    </div>}
    {placementHint && <div className="cf-tape-measure-hint" aria-live="polite" data-tool-step={placementStatus?.step}>
      <strong>{placementStatus?.stepLabel}</strong> · {placementHint} · {placementStatus?.constraint}
      {placementStatus?.snapFeedback && <> · Snap: {placementStatus.snapFeedback}</>}
      {escapeLabel && ` · ${escapeLabel}`}
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
          const family = object.object_type === 'architecture.wall' ? 'ผนัง' : object.object_type === 'structure.beam' ? 'คาน' : object.object_type === 'structure.column' ? 'เสา' : object.object_type === 'structure.foundation' ? 'ฐานราก' : object.object_type === 'door_window.door' ? 'ประตู' : object.object_type === 'door_window.window' ? 'หน้าต่าง' : object.object_type
          const data = object.module_data as unknown as Record<string, unknown>
          return <option key={id} value={id}>{family} {String(data.mark ?? data.type_mark ?? 'ไม่มีรหัสแบบ')}</option>
        })}
      </select>
      <button type="button" onClick={() => onCyclePick()} aria-label="เลือกวัตถุถัดไป">›</button>
      <small>Tab / Shift+Tab · iPad แตะลูกศรหรือเลือกจากรายการ</small>
    </div>}
  </>
)
