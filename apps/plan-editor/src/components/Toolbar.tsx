import React, { useRef } from 'react'
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
  | 'stair'
  | 'grid'
  | 'measure'
  | 'calibrate'
  | 'erase'

interface ToolbarProps {
  orientation?: 'horizontal' | 'vertical'
  activeTool: ToolType
  onSelectTool: (tool: ToolType) => void
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
  onSelectTool,
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
    { id: 'grid', label: 'แกน (G)', icon: <Hash size={16} />, shortcut: 'G' },
    { id: 'measure', label: 'ตลับเมตร (M)', icon: <Ruler size={16} />, shortcut: 'M' },
    { id: 'calibrate', label: 'ปรับสเกลภาพ (R)', icon: <Ruler size={16} />, shortcut: 'R' },
  ]

  return (
    <div className={`cf-toolbar cf-toolbar-${orientation}`} style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: '#1e293b',
      padding: '6px 12px',
      borderRadius: 8,
      border: '1px solid #334155',
      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)',
      flexWrap: 'wrap',
    }}>
      {/* Tool Buttons */}
      <div className="cf-tool-list" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {tools.filter(tool => tool.id !== 'calibrate' || (underlayHasImage && underlayVisible)).map((t) => {
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
                gap: 5,
                padding: '5px 10px',
                borderRadius: 6,
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
              <span className="cf-tool-label">{t.label.split(' ')[0]}</span>
            </button>
          )
        })}
      </div>

      {/* Type Manager Launcher Button */}
      <div className="cf-toolbar-utility" style={{ borderLeft: '1px solid #334155', paddingLeft: 8 }}>
        <button
          className="cf-type-manager-button"
          onClick={onOpenTypeManager}
          title="คลังชนิด"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: 'transparent',
            border: '1px solid #475569',
            color: '#cbd5e1',
            borderRadius: 6,
            padding: '4px 8px',
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
      <div className="cf-toolbar-utility cf-underlay-tools" style={{ borderLeft: '1px solid #334155', paddingLeft: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
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
            title="นำเข้าภาพแปลนพื้น (Import Floor Plan Image / Underlay)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid #0284c7',
              color: '#38bdf8',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Upload size={13} />
            <span>Import Plan Image</span>
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* Toggle Visibility */}
            <button
              className="cf-underlay-button"
              onClick={onToggleUnderlayVisible}
              title={underlayVisible ? 'ซ่อนภาพแปลนพื้น (Hide Underlay)' : 'แสดงภาพแปลนพื้น (Show Underlay)'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: underlayVisible ? '#0369a1' : '#1e293b',
                border: '1px solid #334155',
                color: '#ffffff',
                borderRadius: 4,
                padding: '4px 6px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {underlayVisible ? <Eye size={13} /> : <EyeOff size={13} />}
              <span>{underlayVisible ? 'Underlay ON' : 'Underlay OFF'}</span>
            </button>

            {/* Opacity slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#94a3b8' }}>
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
                borderRadius: 4,
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
