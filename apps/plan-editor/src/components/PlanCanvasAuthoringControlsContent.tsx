import React from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { StairPlacementOptions } from '@constructflow/architecture-engine'
import type { DisplayLengthUnit, InteriorFurnitureKind, PlanFillStyle, ProjectDocument, StairModuleData } from '@constructflow/project-model'
import type { SnapMode } from '@constructflow/snapping-engine'
import { WorkbenchNumberInput } from './WorkbenchNumberInput.js'
import { TypePicker } from './TypePicker.js'
import type { ToolType } from './Toolbar.js'
import type { PlanCanvasPreferences } from '../app/planCanvasPreferences.mjs'
import { toolNames } from './planCanvasToolNames.js'

type PipeSystem = 'waste' | 'soil' | 'rainwater' | 'vent' | 'cold_water' | 'hot_water'
type FixtureKind = 'light' | 'switch' | 'outlet' | 'panel'
type GridSequenceStyle = 'auto' | 'alpha' | 'numeric'

export interface PlanCanvasAuthoringControlsProps {
  project: ProjectDocument
  activeTool: ToolType
  displayUnit: DisplayLengthUnit
  preferences: PlanCanvasPreferences
  lineDrawingMode: PlanCanvasPreferences['lineDrawingMode']
  wallAngleSnapDeg: PlanCanvasPreferences['wallAngleSnapDeg']
  fillStyle: PlanFillStyle
  open: boolean
  pipeSystem: PipeSystem
  fixtureKind: FixtureKind
  activeFamilyName?: string
  furnitureKind: InteriorFurnitureKind
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
  onFurnitureKindChange: (value: InteriorFurnitureKind) => void
  onRoofChange: (updater: (current: PlanCanvasAuthoringControlsProps['roof']) => PlanCanvasAuthoringControlsProps['roof']) => void
  onStairOptionsChange: Dispatch<SetStateAction<StairPlacementOptions>>
  onGridSequenceStyleChange: (value: GridSequenceStyle) => void
  onGridIntervalsChange: (axis: 'x' | 'y', value: string) => void
  onGridFirstTagChange: (axis: 'x' | 'y', value: string) => void
  onPlacementReferenceChange: (value: PlanCanvasPreferences['placementReference']) => void
  onLineConstraintModeChange: (value: PlanCanvasPreferences['lineConstraintMode']) => void
  onWallAngleSnapChange: (value: PlanCanvasPreferences['wallAngleSnapDeg']) => void
  onFillStyleChange: (updater: (style: PlanFillStyle) => PlanFillStyle) => void
  onSnapModeToggle: (mode: SnapMode) => void
  onPlacementKeyDown: React.KeyboardEventHandler<HTMLInputElement>
  onChangeActiveTypeMark: (value: string) => void
  onOpenTypeManager: () => void
}

const typeFamilyByTool: Partial<Record<ToolType, string>> = {
  column: 'structure.column', foundation: 'structure.foundation', beam: 'structure.beam', wall: 'architecture.wall',
  door: 'door_window.door', window: 'door_window.window', slab: 'structure.slab', roof: 'roof.system',
}

const typeLabelByTool: Partial<Record<ToolType, string>> = {
  column: 'เสา', foundation: 'ฐานราก', beam: 'คาน', wall: 'ผนัง', door: 'ประตู', window: 'หน้าต่าง', slab: 'พื้น', roof: 'ระบบหลังคา',
}

export const PlanCanvasAuthoringControlsContent: React.FC<PlanCanvasAuthoringControlsProps> = props => {
  const { project, activeTool, displayUnit, preferences, lineDrawingMode, wallAngleSnapDeg, fillStyle, open, pipeSystem, fixtureKind, furnitureKind, roof, stairOptions, stairError,
    gridSequenceStyle, gridStartPoint, gridSystem, lineReferenceDescription, activeTypeMarks,
    onPipeSystemChange, onFixtureKindChange, onFurnitureKindChange, onRoofChange, onStairOptionsChange, onGridSequenceStyleChange,
    onGridIntervalsChange, onGridFirstTagChange, onPlacementReferenceChange, onLineConstraintModeChange, onWallAngleSnapChange, onFillStyleChange,
    onSnapModeToggle, onPlacementKeyDown, onChangeActiveTypeMark, onOpenTypeManager } = props

  const baseLevelElevation = project.levels.find(level => level.id === project.project.active_level_id)?.elevation_mm ?? 0
  const roofUpdate = <K extends keyof typeof roof>(key: K, value: (typeof roof)[K]) => onRoofChange(current => ({ ...current, [key]: value }))
  const family = typeFamilyByTool[activeTool]
  const activeTypeMark = activeTypeMarks[activeTool]
  const isLinearTool = activeTool === 'wall' || activeTool === 'beam'
  const usesReferenceConstraint = preferences.lineConstraintMode === 'parallel' || preferences.lineConstraintMode === 'perpendicular'
  const showAngleStep = isLinearTool && lineDrawingMode === 'angled' && !usesReferenceConstraint

  return <div className="cf-authoring-controls-content">
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
      {activeTool === 'furniture' && props.activeFamilyName && <strong>Family · {props.activeFamilyName}</strong>}
      {activeTool === 'furniture' && !props.activeFamilyName && <label className="cf-reference-control">ชนิดเฟอร์นิเจอร์
        <select aria-label="ชนิดเฟอร์นิเจอร์ที่จะวาง" value={furnitureKind} onChange={event => onFurnitureKindChange(event.target.value as InteriorFurnitureKind)}>
          <option value="sofa">โซฟา</option><option value="chair">เก้าอี้</option><option value="dining_table">โต๊ะอาหาร</option>
          <option value="coffee_table">โต๊ะกลาง</option><option value="desk">โต๊ะทำงาน</option><option value="bed_single">เตียงเดี่ยว</option>
          <option value="bed_double">เตียงคู่</option><option value="toilet">โถสุขภัณฑ์</option><option value="washbasin">อ่างล้างหน้า</option><option value="bathtub">อ่างอาบน้ำ</option>
        </select>
        <small>ลากแนวหน้ากว้าง · ความลึกตั้งฉากกับแนว · ปรับขนาดและวัสดุได้หลังวาง</small>
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
      <details className="cf-snap-details"><summary title={`ตั้งค่าจุด Snap · เปิดอยู่ ${preferences.snapModes.length} ประเภท`} aria-label={`ตั้งค่าจุด Snap · เปิดอยู่ ${preferences.snapModes.length} ประเภท`}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 5h5M14 5h5M5 19h5M14 19h5M5 5v5M19 5v5M5 14v5M19 14v5" /><path d="M8 12h8M12 8v8" /></svg><span>Snap</span><b>{preferences.snapModes.length}</b></summary><div className="cf-snap-controls" role="group" aria-label="ประเภทจุด Snap">
        <span>Snap</span>
        {([['grid', 'กริด'], ['endpoint', 'ปลาย/มุม'], ['midpoint', 'กึ่งกลาง'], ['center', 'ศูนย์กลาง'], ['face', 'ขอบ'], ['centerline', 'แนว'], ['intersection', 'จุดตัด']] as [SnapMode, string][]).map(([mode, label]) => <button key={mode} type="button" aria-pressed={preferences.snapModes.includes(mode)} className={preferences.snapModes.includes(mode) ? 'is-enabled' : ''} title={`${preferences.snapModes.includes(mode) ? 'ปิด' : 'เปิด'} Snap ${label}`} onClick={() => onSnapModeToggle(mode)}>{label}</button>)}
        <span className="cf-snap-hint">Ctrl วางอิสระ · {isLinearTool ? `Space เปลี่ยนแนวอ้างอิง (ขณะนี้: ${preferences.placementReference === 'centerline' ? 'กึ่งกลาง' : preferences.placementReference === 'left_face' ? 'ชิดซ้าย' : 'ชิดขวา'})` : 'เลื่อนเมาส์ให้เห็นสัญลักษณ์ก่อนคลิก'}</span>
      </div></details>
      {(activeTool === 'wall' || activeTool === 'beam') && <label className="cf-reference-control cf-placement-reference-control">
        <span title="แนวอ้างอิงการวางผนังหรือคาน">อ้างอิง</span><select aria-label="แนวอ้างอิงการวาง" title="เลือกตำแหน่งอ้างอิงจากกึ่งกลางหรือขอบผนัง/คาน" value={preferences.placementReference} onChange={event => onPlacementReferenceChange(event.target.value as PlanCanvasPreferences['placementReference'])}><option value="centerline">กึ่งกลาง</option><option value="left_face">ขอบซ้าย</option><option value="right_face">ขอบขวา</option></select>
      </label>}
      {isLinearTool && lineDrawingMode === 'angled' && <label className="cf-reference-control cf-line-constraint-control">
        <span title="โหมดขนาน/ตั้งฉากจะอ้างอิงผนังหรือคานใกล้จุดเริ่ม">อ้างแนว</span><select aria-label="ความสัมพันธ์กับแนวผนังหรือคาน" title="โหมดตั้งฉากและขนานต้องเริ่มใกล้แนวผนังหรือคาน" value={preferences.lineConstraintMode} onChange={event => onLineConstraintModeChange(event.target.value as PlanCanvasPreferences['lineConstraintMode'])}><option value="auto">อัตโนมัติ</option><option value="none">อิสระ</option><option value="parallel">ขนานกับแนว</option><option value="perpendicular">ตั้งฉากกับแนว</option></select>
        {preferences.lineConstraintMode !== 'none' && <span className="cf-snap-hint">{lineReferenceDescription ? `อ้างอิง: ${lineReferenceDescription}` : preferences.lineConstraintMode === 'auto' ? 'เริ่มใกล้ผนัง/คานเพื่อจัดแนวอัตโนมัติ' : 'เริ่มห่างแนวไม่เกิน 150 มม. · นอกแนวจะล็อกแกน 0°/90°'}</span>}
      </label>}
      {showAngleStep && <label className="cf-reference-control cf-wall-angle-dock-control">
        <span>ขั้นมุม</span><select aria-label="ขั้นสแนปมุมผนังและคาน" value={wallAngleSnapDeg} onChange={event => onWallAngleSnapChange(Number(event.target.value) as PlanCanvasPreferences['wallAngleSnapDeg'])}>
          <option value={0}>อิสระ</option><option value={15}>15°</option><option value={30}>30°</option><option value={45}>45°</option><option value={90}>90°</option>
        </select>
      </label>}
      {activeTool === 'fill' && <details className="cf-fill-style-dock">
        <summary>สีและ Hatch</summary>
        <div className="cf-fill-style-panel" onPointerDown={event => event.stopPropagation()}>
          <div className="cf-fill-style-row"><strong>รูปแบบเติม</strong><div className="cf-fill-style-segmented"><button type="button" aria-pressed={fillStyle.fill_type === 'solid'} onClick={() => onFillStyleChange(style => ({ ...style, fill_type: 'solid' }))}>สีพื้น</button><button type="button" aria-pressed={fillStyle.fill_type === 'pattern'} onClick={() => onFillStyleChange(style => ({ ...style, fill_type: 'pattern' }))}>ลาย Hatch</button></div></div>
          {fillStyle.fill_type === 'pattern' && <div className="cf-fill-pattern-options" role="group" aria-label="เลือกลาย Hatch">{(['diagonal', 'crosshatch', 'grid', 'dots'] as const).map(pattern => <button type="button" key={pattern} aria-pressed={fillStyle.pattern === pattern} onClick={() => onFillStyleChange(style => ({ ...style, pattern }))}>{({ diagonal: 'เฉียง', crosshatch: 'กากบาท', grid: 'ตาราง', dots: 'จุด' })[pattern]}</button>)}</div>}
          <div className="cf-fill-color-row" role="group" aria-label="สีเติม">{['#64748b', '#0f172a', '#2563eb', '#7c3aed', '#dc2626', '#ea580c', '#16a34a'].map(color => <button type="button" key={color} aria-label={`เลือกสี ${color}`} aria-pressed={fillStyle.color === color} style={{ backgroundColor: color }} onClick={() => onFillStyleChange(style => ({ ...style, color }))} />)}<input type="color" aria-label="กำหนดสีเติมเอง" value={fillStyle.color} onChange={event => onFillStyleChange(style => ({ ...style, color: event.target.value }))} /></div>
          <label className="cf-fill-range-row"><span>ความโปร่งใส</span><input type="range" min="0" max="100" value={Math.round(fillStyle.opacity * 100)} onChange={event => onFillStyleChange(style => ({ ...style, opacity: Number(event.target.value) / 100 }))} /><output>{Math.round(fillStyle.opacity * 100)}%</output></label>
          {fillStyle.fill_type === 'pattern' && <><label className="cf-fill-range-row"><span>ระยะลาย</span><input type="range" min="50" max="1000" step="50" value={fillStyle.scale_mm} onChange={event => onFillStyleChange(style => ({ ...style, scale_mm: Number(event.target.value) }))} /><output>{(fillStyle.scale_mm / 1000).toFixed(2)} m</output></label><label className="cf-fill-range-row"><span>หมุนลาย</span><input type="range" min="0" max="180" step="15" value={fillStyle.rotation_deg} onChange={event => onFillStyleChange(style => ({ ...style, rotation_deg: Number(event.target.value) }))} /><output>{fillStyle.rotation_deg}°</output></label></>}
          <div className="cf-fill-style-row"><label>สีขอบ <input type="color" aria-label="กำหนดสีเส้นขอบ" value={fillStyle.border_color} onChange={event => onFillStyleChange(style => ({ ...style, border_color: event.target.value }))} /></label><label>เส้นขอบ <select value={fillStyle.border_style} onChange={event => onFillStyleChange(style => ({ ...style, border_style: event.target.value as PlanFillStyle['border_style'] }))}><option value="solid">ทึบ</option><option value="dashed">ประ</option><option value="dotted">จุด</option><option value="dot-dash">จุด-ประ</option></select></label><label>น้ำหนัก <select value={fillStyle.border_width_mm} onChange={event => onFillStyleChange(style => ({ ...style, border_width_mm: Number(event.target.value) }))}><option value={0}>ไม่มี</option><option value={10}>บาง</option><option value={20}>ปกติ</option><option value={40}>หนา</option></select></label></div>
        </div>
      </details>}
    </div>
}
