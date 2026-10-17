import React, { useEffect, useRef, useState } from 'react'
import {
  MousePointer,
  Columns,
  Square,
  Minus,
  BrickWall,
  DoorOpen,
  AppWindow,
  Hash,
  SlidersHorizontal,
  Ruler,
  Upload,
  Eye,
  EyeOff,
  Trash2,
  Eraser,
  Layers,
  House,
  Repeat2,
} from 'lucide-react'

const panelLayoutLabel = (layout?: string[]) => layout && layout.length > 1
  ? layout.map(operation => ({ hinged: 'เปิด', sliding: 'เลื่อน', fixed: 'ฟิกซ์', awning: 'กระทุ้ง', louver: 'เกล็ด' } as Record<string, string>)[operation] ?? operation).join('-')
  : ''
const panelWidthLabel = (ratios?: number[]) => ratios && ratios.length > 1
  ? ` ${ratios.map(value => Math.round(value * 100)).join(':')}`
  : ''

export type ToolType =
  | 'select'
  | 'column'
  | 'foundation'
  | 'beam'
  | 'wall'
  | 'door'
  | 'window'
  | 'slab'
  | 'slabVoid'
  | 'archFloor'
  | 'ceiling'
  | 'roof'
  | 'pipe'
  | 'fixture'
  | 'cabinet'
  | 'furniture'
  | 'moulding'
  | 'roomSeparator'
  | 'stair'
  | 'grid'
  | 'gridSystem'
  | 'gridCopy'
  | 'measure'
  | 'dimension'
  | 'calibrate'
  | 'erase'

interface ToolbarProps {
  orientation?: 'horizontal' | 'vertical'
  activeTool: ToolType
  lastPlacementTool?: ToolType
  onSelectTool: (tool: ToolType) => void
  onRepeatLastTool?: () => void
  activeColumnType: string
  onChangeActiveColumnType: (type: string) => void
  activeFoundationType: string
  onChangeActiveFoundationType: (type: string) => void
  activeBeamType: string
  onChangeActiveBeamType: (type: string) => void
  activeWallType: string
  onChangeActiveWallType: (type: string) => void
  activeDoorType: string
  onChangeActiveDoorType: (type: string) => void
  activeWindowType: string
  onChangeActiveWindowType: (type: string) => void
  columnTypes: { name: string; section_mm?: [number, number] }[]
  foundationTypes: { name: string; size_mm?: [number, number, number] }[]
  beamTypes: { name: string; section_mm?: [number, number] }[]
  wallTypes: { name: string; thickness_mm?: number; masonry_thickness_mm?: number; plaster_inside_thickness_mm?: number; plaster_outside_thickness_mm?: number }[]
  doorTypes: { name: string; width_mm?: number; height_mm?: number; opening_operation?: string; panel_count?: number; panel_layout?: string[]; panel_width_ratios?: number[]; transom_height_mm?: number; muntin_rows?: number; muntin_columns?: number }[]
  windowTypes: { name: string; width_mm?: number; height_mm?: number; opening_operation?: string; panel_count?: number; panel_layout?: string[]; panel_width_ratios?: number[]; transom_height_mm?: number; bottom_light_height_mm?: number; muntin_rows?: number; muntin_columns?: number }[]
  underlayHasImage?: boolean
  underlayVisible?: boolean
  underlayOpacity?: number
  onToggleUnderlayVisible?: () => void
  onChangeUnderlayOpacity?: (opacity: number) => void
  onUploadUnderlayImage?: (file: File) => void
  onClearUnderlay?: () => void
  onOpenTypeManager: () => void
}

export const Toolbar: React.FC<ToolbarProps> = ({
  orientation = 'horizontal',
  activeTool,
  lastPlacementTool = 'wall',
  onSelectTool,
  onRepeatLastTool,
  activeColumnType,
  onChangeActiveColumnType,
  activeFoundationType,
  onChangeActiveFoundationType,
  activeBeamType,
  onChangeActiveBeamType,
  activeWallType,
  onChangeActiveWallType,
  activeDoorType,
  onChangeActiveDoorType,
  activeWindowType,
  onChangeActiveWindowType,
  columnTypes,
  foundationTypes,
  beamTypes,
  wallTypes,
  doorTypes,
  windowTypes,
  underlayHasImage,
  underlayVisible,
  underlayOpacity,
  onToggleUnderlayVisible,
  onChangeUnderlayOpacity,
  onUploadUnderlayImage,
  onClearUnderlay,
  onOpenTypeManager,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [expandedToolGroup, setExpandedToolGroup] = useState<string | null>(null)

  const tools: { id: ToolType; label: string; icon: React.ReactNode; shortcut: string }[] = [
    { id: 'select', label: 'เลือก (S)', icon: <MousePointer size={16} />, shortcut: 'S' },
    { id: 'erase', label: 'ยางลบ (E)', icon: <Eraser size={16} />, shortcut: 'E' },
    { id: 'column', label: 'เสา (C)', icon: <Columns size={16} />, shortcut: 'C' },
    { id: 'foundation', label: 'ฐานราก (F)', icon: <Square size={16} />, shortcut: 'F' },
    { id: 'beam', label: 'คาน (B)', icon: <Minus size={16} strokeWidth={3} />, shortcut: 'B' },
    { id: 'wall', label: 'ผนัง (W)', icon: <BrickWall size={16} />, shortcut: 'W' },
    { id: 'door', label: 'ประตู (D)', icon: <DoorOpen size={16} />, shortcut: 'D' },
    { id: 'window', label: 'หน้าต่าง (N)', icon: <AppWindow size={16} />, shortcut: 'N' },
    { id: 'slab', label: 'พื้น (P)', icon: <Layers size={16} />, shortcut: 'P' },
    { id: 'archFloor', label: 'พื้นสถาปัตย์ (Shift+P)', icon: <Layers size={16} />, shortcut: 'Shift+P' },
    { id: 'ceiling', label: 'ฝ้าเพดาน (Shift+C)', icon: <Layers size={16} />, shortcut: 'Shift+C' },
    { id: 'roof', label: 'หลังคา (Q)', icon: <House size={16} />, shortcut: 'Q' },
    { id: 'pipe', label: 'แนวท่อ (U)', icon: <Minus size={16} />, shortcut: 'U' },
    { id: 'fixture', label: 'อุปกรณ์ไฟฟ้า (L)', icon: <Layers size={16} />, shortcut: 'L' },
    { id: 'cabinet', label: 'บิลท์อิน (K)', icon: <Square size={16} />, shortcut: 'K' },
    { id: 'furniture', label: 'เฟอร์นิเจอร์ (V)', icon: <House size={16} />, shortcut: 'V' },
    { id: 'moulding', label: 'แนวบัว (J)', icon: <Minus size={16} />, shortcut: 'J' },
    { id: 'roomSeparator', label: 'เส้นแบ่งห้อง (Shift+R)', icon: <Minus size={16} />, shortcut: 'Shift+R' },
    {
      id: 'stair',
      label: 'บันได (T)',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19h4v-4h4v-4h4v-4h4" />
        </svg>
      ),
      shortcut: 'T',
    },
    { id: 'grid', label: 'เส้นกริด (G)', icon: <Hash size={16} />, shortcut: 'G' },
    { id: 'gridSystem', label: 'ระบบ Grid Line (Shift+G)', icon: <Layers size={16} />, shortcut: 'Shift+G' },
    { id: 'measure', label: 'ตลับเมตร (M)', icon: <Ruler size={16} />, shortcut: 'M' },
    { id: 'dimension', label: 'บอกระยะ (Shift+M) · เลือกสองจุดแล้ววางเส้นระยะ', icon: <Ruler size={16} />, shortcut: 'Shift+M' },
    { id: 'calibrate', label: 'ปรับสเกลภาพ (R)', icon: <Ruler size={16} />, shortcut: 'R' },
  ]

  const availableTools = tools.filter(tool => tool.id !== 'calibrate' || (underlayHasImage && underlayVisible))
  const pinnedTools = availableTools.filter(tool => ['select', 'wall', 'beam', 'door', 'window', 'dimension'].includes(tool.id))
  const toolGroups: { title: string; ids: ToolType[] }[] = [
    { title: 'โครงสร้าง', ids: ['column', 'foundation', 'slab'] },
    { title: 'สถาปัตย์', ids: ['archFloor', 'ceiling', 'roof', 'cabinet', 'furniture', 'moulding', 'roomSeparator', 'stair'] },
    { title: 'ระบบ', ids: ['pipe', 'fixture'] },
    { title: 'เขียนแบบ/สำรวจ', ids: ['erase', 'grid', 'gridSystem', 'measure', 'calibrate'] },
  ]
  useEffect(() => {
    const activeGroup = toolGroups.find(group => group.ids.includes(activeTool))
    if (activeGroup) setExpandedToolGroup(activeGroup.title)
  }, [activeTool])

  return (
    <div className={`cf-toolbar cf-toolbar-${orientation}`} style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      background: '#1e293b',
      padding: '4px 8px',
      borderRadius: 4,
      border: '1px solid #334155',
      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)',
      flexWrap: 'wrap',
    }}>
      {/* Tool Buttons */}
      <div className="cf-tool-list" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {pinnedTools.map((t) => {
          const isActive = activeTool === t.id
          return (
            <button
              key={t.id}
              className={`cf-tool-button ${isActive ? 'is-active' : ''}`}
              onClick={() => onSelectTool(t.id)}
              title={`${t.label}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 7px',
                borderRadius: 3,
                border: isActive ? '1px solid #38bdf8' : '1px solid transparent',
                background: isActive ? '#0369a1' : 'transparent',
                color: isActive ? '#ffffff' : '#94a3b8',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
                transition: 'all 0.15s ease',
              }}
            >
              {t.icon}
              <span className="cf-tool-label">{({ select: 'เลือก', wall: 'ผนัง', beam: 'คาน', door: 'ประตู', window: 'หน้าต่าง', dimension: 'บอกระยะ' } as Partial<Record<ToolType, string>>)[t.id]}</span>
            </button>
          )
        })}
      </div>

      <div className="cf-tool-groups" aria-label="เครื่องมือเพิ่มเติม">
        {toolGroups.map(group => {
          const groupTools = availableTools.filter(tool => group.ids.includes(tool.id))
          if (!groupTools.length) return null
          return <details className="cf-tool-group" key={group.title} open={expandedToolGroup === group.title} onToggle={event => {
            if (event.currentTarget.open) setExpandedToolGroup(group.title)
            else setExpandedToolGroup(current => current === group.title ? null : current)
          }}>
            <summary aria-label={group.title}>{group.title}</summary>
            <div className="cf-tool-group-menu" role="group" aria-label={group.title}>
              {groupTools.map(t => <button key={t.id} type="button" className={`cf-tool-button ${activeTool === t.id ? 'is-active' : ''}`} onClick={() => onSelectTool(t.id)} title={t.label} aria-label={t.label}>
              {t.icon}<span className="cf-tool-label">{({ erase: 'ลบ', column: 'เสา', foundation: 'ฐานราก', slab: 'พื้น', archFloor: 'พื้นสถาปัตย์', ceiling: 'ฝ้า', roof: 'หลังคา', pipe: 'ท่อ', fixture: 'อุปกรณ์', cabinet: 'บิลท์อิน', furniture: 'เฟอร์นิเจอร์', moulding: 'บัว', roomSeparator: 'แบ่งห้อง', stair: 'บันได', grid: 'กริด', gridSystem: 'ระบบกริด', measure: 'วัด', calibrate: 'ปรับสเกล' } as Partial<Record<ToolType, string>>)[t.id]}</span>
              </button>)}
            </div>
          </details>
        })}
      </div>

      {onRepeatLastTool && <button type="button" className="cf-tool-repeat" onClick={onRepeatLastTool} title={`ใช้เครื่องมือล่าสุดซ้ำ (${lastPlacementTool})`} aria-label={`ใช้เครื่องมือล่าสุดซ้ำ ${lastPlacementTool}`}><Repeat2 size={14} /><span>ใช้ซ้ำ</span></button>}

      {/* Type Manager Launcher Button */}
      <div className="cf-toolbar-utility" style={{ borderLeft: '1px solid #334155', paddingLeft: 8 }}>
        <button
          className="cf-type-manager-button"
          onClick={onOpenTypeManager}
          title="คลังชนิด"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'transparent',
            border: '1px solid #475569',
            color: '#cbd5e1',
            borderRadius: 3,
            padding: '3px 6px',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <SlidersHorizontal size={13} color="#38bdf8" />
          <span>คลังชนิด</span>
        </button>
      </div>

      {/* Underlay Controls */}
      <div className="cf-toolbar-utility cf-underlay-tools" style={{ borderLeft: '1px solid #334155', paddingLeft: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.dxf,application/dxf,.dwg,application/acad,application/x-acad"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file && onUploadUnderlayImage) {
              onUploadUnderlayImage(file)
            }
          }}
        />

        {!underlayHasImage ? (
          <button
            className="cf-underlay-button"
            onClick={() => fileInputRef.current?.click()}
            title="นำเข้าภาพหรือไฟล์ DWG/DXF เป็น Underlay แล้วปรับเทียบสเกลได้"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid #0284c7',
              color: '#38bdf8',
              borderRadius: 3,
              padding: '3px 6px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Upload size={13} />
            <span>Import Underlay</span>
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {/* Toggle Visibility */}
            <button
              className="cf-underlay-button"
              onClick={onToggleUnderlayVisible}
              title={underlayVisible ? 'ซ่อนภาพแปลนพื้น (Hide Underlay)' : 'แสดงภาพแปลนพื้น (Show Underlay)'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                background: underlayVisible ? '#0369a1' : '#1e293b',
                border: '1px solid #334155',
                color: '#ffffff',
                borderRadius: 2,
                padding: '3px 4px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {underlayVisible ? <Eye size={13} /> : <EyeOff size={13} />}
              <span>{underlayVisible ? 'Underlay ON' : 'Underlay OFF'}</span>
            </button>

            {/* Opacity slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#94a3b8' }}>
              <span>{Math.round((underlayOpacity ?? 0.6) * 100)}%</span>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={underlayOpacity ?? 0.6}
                onChange={(e) => onChangeUnderlayOpacity && onChangeUnderlayOpacity(parseFloat(e.target.value))}
                style={{ width: 44, accentColor: '#38bdf8', cursor: 'pointer' }}
                title="ปรับความโปร่งใสภาพแปลน (Opacity)"
              />
            </div>

            {/* Clear Underlay */}
            <button
              onClick={onClearUnderlay}
              title="ลบภาพแปลนพื้นออก (Remove Underlay)"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ef4444',
                padding: '4px',
                cursor: 'pointer',
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
