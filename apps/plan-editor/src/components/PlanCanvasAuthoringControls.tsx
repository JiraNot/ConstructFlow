import React from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { StairPlacementOptions } from '@constructflow/architecture-engine'
import type { DisplayLengthUnit, ProjectDocument, StairModuleData } from '@constructflow/project-model'
import type { SnapMode } from '@constructflow/snapping-engine'
import { WorkbenchNumberInput } from './WorkbenchNumberInput.js'
import { TypePicker } from './TypePicker.js'
import type { ToolType } from './Toolbar.js'
import type { PlanCanvasPreferences } from '../app/planCanvasPreferences.mjs'

type PipeSystem = 'waste' | 'soil' | 'rainwater' | 'vent' | 'cold_water' | 'hot_water'
type FixtureKind = 'light' | 'switch' | 'outlet' | 'panel'
type GridSequenceStyle = 'auto' | 'alpha' | 'numeric'

interface PlanCanvasAuthoringControlsProps {
  project: ProjectDocument
  activeTool: ToolType
  displayUnit: DisplayLengthUnit
  preferences: PlanCanvasPreferences
  open: boolean
  pipeSystem: PipeSystem
  fixtureKind: FixtureKind
  roof: { shape: 'hip' | 'gable' | 'flat'; slopeDeg: number; thicknessMm: number; elevationOffsetMm: number; material: string }
  stairOptions: StairPlacementOptions
  stairError: string
  gridSequenceStyle: GridSequenceStyle
  gridStartPoint: [number, number] | null
  gridSystem: { xIntervals: string; yIntervals: string; xFirstTag: string; yFirstTag: string; error: string }
  lineReferenceDescription?: string
  activeTypeMarks: Partial<Record<ToolType, string>>
  onOpenChange: (open: boolean) => void
  onPipeSystemChange: (value: PipeSystem) => void
  onFixtureKindChange: (value: FixtureKind) => void
  onRoofChange: (updater: (current: PlanCanvasAuthoringControlsProps['roof']) => PlanCanvasAuthoringControlsProps['roof']) => void
  onStairOptionsChange: Dispatch<SetStateAction<StairPlacementOptions>>
  onGridSequenceStyleChange: (value: GridSequenceStyle) => void
  onGridIntervalsChange: (axis: 'x' | 'y', value: string) => void
  onGridFirstTagChange: (axis: 'x' | 'y', value: string) => void
  onPlacementReferenceChange: (value: PlanCanvasPreferences['placementReference']) => void
  onLineConstraintModeChange: (value: PlanCanvasPreferences['lineConstraintMode']) => void
  onSnapModeToggle: (mode: SnapMode) => void
  onPlacementKeyDown: React.KeyboardEventHandler<HTMLInputElement>
  onChangeActiveTypeMark: (value: string) => void
  onOpenTypeManager: () => void
}

const toolNames: Partial<Record<ToolType, string>> = {
  select: 'เลือกวัตถุ', erase: 'ลบวัตถุ', column: 'เสา', foundation: 'ฐานราก', beam: 'คาน', wall: 'ผนัง', door: 'ประตู',
  window: 'หน้าต่าง', slab: 'พื้นโครงสร้าง', slabVoid: 'ช่องเจาะพื้น/หลังคา', archFloor: 'พื้นสถาปัตย์', ceiling: 'ฝ้าเพดาน', roof: 'หลังคา',
  pipe: 'แนวท่อ', fixture: 'อุปกรณ์ไฟฟ้า', cabinet: 'บิลท์อิน', moulding: 'แนวบัว', roomSeparator: 'เส้นแบ่งห้อง',
  stair: 'บันได', grid: 'เส้นกริด', gridSystem: 'ระบบกริด', gridCopy: 'คัดลอกกริด', measure: 'ตลับเมตร', calibrate: 'ปรับสเกลภาพ',
}

const typeFamilyByTool: Partial<Record<ToolType, string>> = {
  column: 'structure.column', foundation: 'structure.foundation', beam: 'structure.beam', wall: 'architecture.wall',
  door: 'door_window.door', window: 'door_window.window', slab: 'structure.slab', roof: 'roof.system',
}

const typeLabelByTool: Partial<Record<ToolType, string>> = {
  column: 'เสา', foundation: 'ฐานราก', beam: 'คาน', wall: 'ผนัง', door: 'ประตู', window: 'หน้าต่าง', slab: 'พื้น', roof: 'ระบบหลังคา',
}

export const PlanCanvasAuthoringControls: React.FC<PlanCanvasAuthoringControlsProps> = props => {
  const { project, activeTool, displayUnit, preferences, open, pipeSystem, fixtureKind, roof, stairOptions, stairError,
    gridSequenceStyle, gridStartPoint, gridSystem, lineReferenceDescription, activeTypeMarks, onOpenChange,
    onPipeSystemChange, onFixtureKindChange, onRoofChange, onStairOptionsChange, onGridSequenceStyleChange,
    onGridIntervalsChange, onGridFirstTagChange, onPlacementReferenceChange, onLineConstraintModeChange,
    onSnapModeToggle, onPlacementKeyDown, onChangeActiveTypeMark, onOpenTypeManager } = props

  const baseLevelElevation = project.levels.find(level => level.id === project.project.active_level_id)?.elevation_mm ?? 0
  const roofUpdate = <K extends keyof typeof roof>(key: K, value: (typeof roof)[K]) => onRoofChange(current => ({ ...current, [key]: value }))
  const family = typeFamilyByTool[activeTool]
  const activeTypeMark = activeTypeMarks[activeTool]

  return <div className="cf-authoring-controls" onPointerDown={event => event.stopPropagation()}>
    <button type="button" className="cf-authoring-controls-toggle" aria-expanded={open} onClick={() => onOpenChange(!open)}>
      <span>ตัวเลือกการวาด · {toolNames[activeTool] ?? activeTool}</span>
      <span aria-hidden="true">{open ? 'ยุบ' : 'แสดง'}</span>
    </button>
    {open && <div className="cf-authoring-controls-content">
      {activeTool === 'pipe' && <label className="cf-reference-control">ระบบท่อ
        <select aria-label="ระบบของแนวท่อ" value={pipeSystem} onChange={event => onPipeSystemChange(event.target.value as PipeSystem)}>
          <option value="waste">น้ำทิ้ง</option><option value="soil">โสโครก</option><option value="rainwater">น้ำฝน</option>
          <option value="vent">อากาศ</option><option value="cold_water">น้ำดีเย็น</option><option value="hot_water">น้ำร้อน</option>
        </select>
        <small>น้ำทิ้ง/โสโครก/น้ำฝนสร้างระดับปลายให้ลาดลง 1:100 · ปรับขนาดและระดับต่อได้ในคุณสมบัติ</small>
      </label>}
      {activeTool === 'fixture' && <label className="cf-reference-control">อุปกรณ์ไฟฟ้า
        <select aria-label="ชนิดอุปกรณ์ไฟฟ้าที่จะวาง" value={fixtureKind} onChange={event => onFixtureKindChange(event.target.value as FixtureKind)}>
          <option value="light">ดวงโคม</option><option value="switch">สวิตช์</option><option value="outlet">เต้ารับ</option><option value="panel">ตู้ไฟ</option>
        </select>
      </label>}
      {activeTool === 'roof' && <div className="cf-grid-orientation-control" role="group" aria-label="ตั้งค่าหลังคาก่อนวาด">
        <label>ทรงหลังคา <select aria-label="ทรงหลังคาก่อนวาด" value={roof.shape} onChange={event => roofUpdate('shape', event.target.value as typeof roof.shape)}><option value="hip">ปั้นหยา</option><option value="gable">จั่ว · รูป 4 ด้าน</option><option value="flat">ดาดฟ้า</option></select></label>
        {roof.shape !== 'flat' && <label>ความลาด (องศ)<input aria-label="ความลาดหลังคาก่อนวาด (องศา)" type="number" min="0.5" max="88" step="0.5" value={roof.slopeDeg} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) roofUpdate('slopeDeg', Math.max(0.5, Math.min(88, value))) }} /></label>}
        <label>ยกจากระดับชั้น ({displayUnit}) <WorkbenchNumberInput ariaLabel={`ระยะยกหลังคาจากระดับชั้น (${displayUnit})`} value={roof.elevationOffsetMm} unit={displayUnit} onChange={value => roofUpdate('elevationOffsetMm', value)} style={{ width: 72 }} /></label>
        <label>หนา (มม.) <WorkbenchNumberInput ariaLabel="ความหนาหลังคาก่อนวาด (มม.)" value={roof.thicknessMm} onChange={value => roofUpdate('thicknessMm', Math.max(1, value))} style={{ width: 58 }} /></label>
        <label>วัสดุมุง <select aria-label="วัสดุมุงหลังคาก่อนวาด" value={roof.material} onChange={event => roofUpdate('material', event.target.value)}><option value="metal_sheet">เมทัลชีท</option><option value="pu_metal_sheet">เมทัลชีท PU</option><option value="concrete_tile">กระเบื้องคอนกรีต</option><option value="clay_tile">กระเบื้องดินเผา</option><option value="reinforced_concrete">คอนกรีตเสริมเหล็ก</option><option value="polycarbonate">โพลีคาร์บอเนต</option></select></label>
        <small>{roof.shape === 'gable' ? 'กำหนดความลาดสลับด้านที่ 1 และ 3 · ต้องวาดขอบเขต 4 จุด' : roof.shape === 'flat' ? 'สร้างผืนราบตามขอบเขต · ตั้งความหนาและวัสดุก่อนวาด' : 'สร้างความลาดเข้าหาสันปั้นหยา · ปรับความลาดรายด้านได้หลังวาง'}</small>
      </div>}
      {activeTool === 'stair' && <div role="group" aria-label="ตั้งค่าบันไดก่อนวาด" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: 650, alignItems: 'center' }}>
        <label>รูปแบบ <select aria-label="รูปแบบบันไดก่อนวาด" value={stairOptions.stair_type} onChange={event => onStairOptionsChange(options => ({ ...options, stair_type: event.target.value as StairModuleData['stair_type'] }))}><option value="straight">ตรง</option><option value="l_shape">L</option><option value="u_shape">U</option></select></label>
        <label>จบที่ <select aria-label="ระดับจบบันไดก่อนวาด" value={stairOptions.top_level_id} onChange={event => {
          const top = project.levels.find(level => level.id === event.target.value)
          onStairOptionsChange(options => ({ ...options, top_level_id: event.target.value, num_risers: top ? Math.ceil((top.elevation_mm - baseLevelElevation) / 190) : options.num_risers, first_flight_risers: undefined }))
        }}><option value="">เลือกระดับจบ</option>{project.levels.filter(level => level.elevation_mm > baseLevelElevation).map(level => <option key={level.id} value={level.id}>{level.name} +{(level.elevation_mm / 1000).toFixed(2)}</option>)}</select></label>
        <label>กว้าง ({displayUnit}) <WorkbenchNumberInput ariaLabel="ความกว้างบันไดก่อนวาด" value={stairOptions.width_mm} unit={displayUnit} onChange={value => onStairOptionsChange(options => ({ ...options, width_mm: value }))} style={{ width: 65 }} /></label>
        <label>ขั้นรวม <WorkbenchNumberInput ariaLabel="จำนวนลูกตั้งก่อนวาด" value={stairOptions.num_risers} onChange={value => onStairOptionsChange(options => ({ ...options, num_risers: value }))} style={{ width: 48 }} /></label>
        {stairOptions.stair_type !== 'straight' && <>
          <label>เที่ยวแรก <WorkbenchNumberInput ariaLabel="ลูกตั้งเที่ยวแรกก่อนวาด" value={stairOptions.first_flight_risers ?? Math.floor(stairOptions.num_risers / 2)} onChange={value => onStairOptionsChange(options => ({ ...options, first_flight_risers: value }))} style={{ width: 48 }} /></label>
          <label>ชานพัก ({displayUnit}) <WorkbenchNumberInput ariaLabel="ความลึกชานพักก่อนวาด" value={stairOptions.landing_depth_mm} unit={displayUnit} onChange={value => onStairOptionsChange(options => ({ ...options, landing_depth_mm: value }))} style={{ width: 65 }} /></label>
          <label>เลี้ยว <select aria-label="ทิศเลี้ยวบันไดก่อนวาด" value={stairOptions.turn_direction} onChange={event => onStairOptionsChange(options => ({ ...options, turn_direction: event.target.value as 'left' | 'right' }))}><option value="right">ขวา</option><option value="left">ซ้าย</option></select></label>
          {stairOptions.stair_type === 'u_shape' && <label>ช่องกลาง ({displayUnit}) <WorkbenchNumberInput ariaLabel="ช่องกลางบันไดก่อนวาด" value={stairOptions.flight_gap_mm ?? 100} unit={displayUnit} onChange={value => onStairOptionsChange(options => ({ ...options, flight_gap_mm: value }))} style={{ width: 65 }} /></label>}
        </>}
        <small>จุดเริ่ม → ปลายเที่ยวแรกกำหนดระยะวิ่งและทิศ · ลูกนอนคำนวณตามระยะจริง</small>
        {stairError && <span role="alert" style={{ color: '#b91c1c' }}>{stairError}</span>}
      </div>}
      {activeTool === 'grid' && <div className="cf-grid-orientation-control" role="group" aria-label="วาดเส้นกริดอ้างอิง">
        <strong>เส้นกริดอ้างอิง · เส้นเดี่ยว</strong>
        <label>ลำดับป้าย<select aria-label="ลำดับป้ายเส้นกริดอ้างอิง" value={gridSequenceStyle} onChange={event => onGridSequenceStyleChange(event.target.value as GridSequenceStyle)}><option value="auto">อัตโนมัติ (ตั้ง A / นอน 1)</option><option value="alpha">ตัวอักษร A, B, C</option><option value="numeric">ตัวเลข 1, 2, 3</option></select></label>
        <small>{gridStartPoint ? 'คลิกจุดปลายเพื่อกำหนดแนวและมุมเอียง · Esc ยกเลิก' : 'คลิกจุดเริ่มและจุดปลาย · ปรับย้าย คัดลอก และตั้ง bubble ได้ภายหลัง'}</small>
      </div>}
      {activeTool === 'gridSystem' && <div className="cf-grid-orientation-control" role="group" aria-label="สร้างระบบ Grid Line">
        <strong>ระบบ Grid Line · ระยะเป็นช่วงจากเส้นก่อนหน้า ({displayUnit})</strong>
        <div className="cf-grid-system-axis"><label>แนวตั้ง · ระยะ X<input aria-label={`ระยะช่วงแนวตั้งของระบบกริด (${displayUnit})`} value={gridSystem.xIntervals} onChange={event => onGridIntervalsChange('x', event.target.value)} onKeyDown={onPlacementKeyDown} placeholder={`3, 2.5, 3 ${displayUnit}`} /></label><label>ป้ายแรก<input aria-label="ป้ายเริ่มต้นแนวตั้ง" value={gridSystem.xFirstTag} onChange={event => onGridFirstTagChange('x', event.target.value)} /></label></div>
        <div className="cf-grid-system-axis"><label>แนวนอน · ระยะ Y<input aria-label={`ระยะช่วงแนวนอนของระบบกริด (${displayUnit})`} value={gridSystem.yIntervals} onChange={event => onGridIntervalsChange('y', event.target.value)} onKeyDown={onPlacementKeyDown} placeholder={`2.5, 3 ${displayUnit}`} /></label><label>ป้ายแรก<input aria-label="ป้ายเริ่มต้นแนวนอน" value={gridSystem.yFirstTag} onChange={event => onGridFirstTagChange('y', event.target.value)} /></label></div>
        <small>คั่นแต่ละช่วงด้วยจุลภาค · คลิกจุดกำเนิดหนึ่งครั้งเพื่อสร้างได้ทั้งสองแนว · ลบช่องระยะของแนวที่ไม่ใช้</small>
        {gridSystem.error && <small role="alert" style={{ color: '#b42332' }}>{gridSystem.error}</small>}
      </div>}
      {family && <TypePicker types={project.types.filter(type => type.object_type === family)} value={activeTypeMark ?? ''} label={typeLabelByTool[activeTool] ?? 'วัตถุ'} displayUnit={displayUnit} onChange={onChangeActiveTypeMark} onOpenCatalog={onOpenTypeManager} />}
      {(activeTool === 'wall' || activeTool === 'beam') && <label className="cf-reference-control">
        <span>แนวอ้างอิง</span><select aria-label="แนวอ้างอิงการวาง" value={preferences.placementReference} onChange={event => onPlacementReferenceChange(event.target.value as PlanCanvasPreferences['placementReference'])}><option value="centerline">กึ่งกลาง</option><option value="left_face">ริมซ้ายตามทิศลาก</option><option value="right_face">ริมขวาตามทิศลาก</option></select>
      </label>}
      {(activeTool === 'wall' || activeTool === 'beam') && <label className="cf-reference-control">
        <span>จัดแนวช่วงที่วาด</span><select aria-label="ข้อจำกัดแนวการวาด" value={preferences.lineConstraintMode} onChange={event => onLineConstraintModeChange(event.target.value as PlanCanvasPreferences['lineConstraintMode'])}><option value="auto">อัตโนมัติ: ขนาน/ตั้งฉาก</option><option value="none">อิสระ</option><option value="parallel">ขนานกับแนวใกล้จุดเริ่ม</option><option value="perpendicular">ตั้งฉากกับแนวใกล้จุดเริ่ม</option></select>
        {preferences.lineConstraintMode !== 'none' && <span className="cf-snap-hint">{lineReferenceDescription ? `อ้างอิง: ${lineReferenceDescription}` : 'เริ่มจากหรือใกล้แนวผนัง/คาน ภายใน 150 มม.'}</span>}
      </label>}
      <details className="cf-snap-details"><summary>Snap · {preferences.snapModes.length ? `เปิด ${preferences.snapModes.length} ประเภท` : 'วางอิสระ'} · ตั้งค่า</summary><div className="cf-snap-controls" role="group" aria-label="ประเภทจุด Snap">
        <span>Snap</span>
        {([['grid', 'กริด'], ['endpoint', 'ปลาย/มุม'], ['midpoint', 'กึ่งกลาง'], ['center', 'ศูนย์กลาง'], ['face', 'ขอบ'], ['centerline', 'แนว'], ['intersection', 'จุดตัด']] as [SnapMode, string][]).map(([mode, label]) => <button key={mode} type="button" aria-pressed={preferences.snapModes.includes(mode)} className={preferences.snapModes.includes(mode) ? 'is-enabled' : ''} title={`${preferences.snapModes.includes(mode) ? 'ปิด' : 'เปิด'} Snap ${label}`} onClick={() => onSnapModeToggle(mode)}>{label}</button>)}
        <span className="cf-snap-hint">Ctrl วางอิสระ · {activeTool === 'wall' || activeTool === 'beam' ? `Space เปลี่ยนแนวอ้างอิง (ขณะนี้: ${preferences.placementReference === 'centerline' ? 'กึ่งกลาง' : preferences.placementReference === 'left_face' ? 'ชิดซ้าย' : 'ชิดขวา'})` : 'เลื่อนเมาส์ให้เห็นสัญลักษณ์ก่อนคลิก'}</span>
      </div></details>
    </div>}
  </div>
}
