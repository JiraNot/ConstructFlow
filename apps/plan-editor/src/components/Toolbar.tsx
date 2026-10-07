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
} from 'lucide-react'

export type ToolType =
  | 'select'
  | 'column'
  | 'foundation'
  | 'beam'
  | 'wall'
  | 'door'
  | 'window'
  | 'stair'
  | 'grid'
  | 'calibrate'

interface ToolbarProps {
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
  wallTypes: { name: string; thickness_mm?: number }[]
  doorTypes: { name: string; width_mm?: number; height_mm?: number }[]
  windowTypes: { name: string; width_mm?: number; height_mm?: number }[]
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
    { id: 'select', label: 'Select (S)', icon: <MousePointer size={16} />, shortcut: 'S' },
    { id: 'column', label: 'Column (C)', icon: <Columns size={16} />, shortcut: 'C' },
    { id: 'foundation', label: 'Footing (F)', icon: <Square size={16} />, shortcut: 'F' },
    { id: 'beam', label: 'Beam (B)', icon: <Minus size={16} strokeWidth={3} />, shortcut: 'B' },
    { id: 'wall', label: 'Wall (W)', icon: <BrickWall size={16} />, shortcut: 'W' },
    { id: 'door', label: 'Door (D)', icon: <DoorOpen size={16} />, shortcut: 'D' },
    { id: 'window', label: 'Window (N)', icon: <AppWindow size={16} />, shortcut: 'N' },
    {
      id: 'stair',
      label: 'Stair (T)',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19h4v-4h4v-4h4v-4h4" />
        </svg>
      ),
      shortcut: 'T',
    },
    { id: 'grid', label: 'Grid Line (G)', icon: <Hash size={16} />, shortcut: 'G' },
    { id: 'calibrate', label: 'Calibrate Scale (R)', icon: <Ruler size={16} />, shortcut: 'R' },
  ]

  return (
    <div style={{
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {tools.map((t) => {
          const isActive = activeTool === t.id
          return (
            <button
              key={t.id}
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
              <span>{t.label.split(' ')[0]}</span>
            </button>
          )
        })}
      </div>

      {/* Active Type Selector for Column */}
      {activeTool === 'column' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          borderLeft: '1px solid #334155',
          paddingLeft: 8,
        }}>
          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Type:</span>
          <select
            value={activeColumnType}
            onChange={(e) => onChangeActiveColumnType(e.target.value)}
            style={{
              background: '#0f172a',
              color: '#38bdf8',
              border: '1px solid #0284c7',
              borderRadius: 4,
              padding: '3px 6px',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {columnTypes.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} ({t.section_mm ? `${t.section_mm[0]}×${t.section_mm[1]}` : ''} mm)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Active Type Selector for Foundation */}
      {activeTool === 'foundation' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          borderLeft: '1px solid #334155',
          paddingLeft: 8,
        }}>
          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Type:</span>
          <select
            value={activeFoundationType}
            onChange={(e) => onChangeActiveFoundationType(e.target.value)}
            style={{
              background: '#0f172a',
              color: '#f59e0b',
              border: '1px solid #d97706',
              borderRadius: 4,
              padding: '3px 6px',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {foundationTypes.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} ({t.size_mm ? `${t.size_mm[0]}×${t.size_mm[1]}` : ''} mm)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Active Type Selector for Beam */}
      {activeTool === 'beam' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          borderLeft: '1px solid #334155',
          paddingLeft: 8,
        }}>
          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Type:</span>
          <select
            value={activeBeamType}
            onChange={(e) => onChangeActiveBeamType(e.target.value)}
            style={{
              background: '#0f172a',
              color: '#38bdf8',
              border: '1px solid #0284c7',
              borderRadius: 4,
              padding: '3px 6px',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {beamTypes.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} ({t.section_mm ? `${t.section_mm[0]}×${t.section_mm[1]}` : ''} mm)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Active Type Selector for Wall */}
      {activeTool === 'wall' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          borderLeft: '1px solid #334155',
          paddingLeft: 8,
        }}>
          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Type:</span>
          <select
            value={activeWallType}
            onChange={(e) => onChangeActiveWallType(e.target.value)}
            style={{
              background: '#0f172a',
              color: '#cbd5e1',
              border: '1px solid #64748b',
              borderRadius: 4,
              padding: '3px 6px',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {wallTypes.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} ({t.thickness_mm ? `${t.thickness_mm} mm` : ''})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Active Type Selector for Door */}
      {activeTool === 'door' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          borderLeft: '1px solid #334155',
          paddingLeft: 8,
        }}>
          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Type:</span>
          <select
            value={activeDoorType}
            onChange={(e) => onChangeActiveDoorType(e.target.value)}
            style={{
              background: '#0f172a',
              color: '#4ade80',
              border: '1px solid #16a34a',
              borderRadius: 4,
              padding: '3px 6px',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {doorTypes.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} ({t.width_mm && t.height_mm ? `${t.width_mm}×${t.height_mm}` : ''} mm)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Active Type Selector for Window */}
      {activeTool === 'window' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          borderLeft: '1px solid #334155',
          paddingLeft: 8,
        }}>
          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Type:</span>
          <select
            value={activeWindowType}
            onChange={(e) => onChangeActiveWindowType(e.target.value)}
            style={{
              background: '#0f172a',
              color: '#38bdf8',
              border: '1px solid #0284c7',
              borderRadius: 4,
              padding: '3px 6px',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {windowTypes.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} ({t.width_mm && t.height_mm ? `${t.width_mm}×${t.height_mm}` : ''} mm)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Type Manager Launcher Button */}
      <div style={{ borderLeft: '1px solid #334155', paddingLeft: 8 }}>
        <button
          onClick={onOpenTypeManager}
          title="Open Type Catalog (จัดการประเภทเสา, ฐานราก, คาน, ผนัง, ประตู, หน้าต่าง)"
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
          <span>Manage Types</span>
        </button>
      </div>

      {/* Underlay Controls */}
      <div style={{ borderLeft: '1px solid #334155', paddingLeft: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
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
