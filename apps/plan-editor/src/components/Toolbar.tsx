import React from 'react'
import { MousePointer, Columns, Square, Hash } from 'lucide-react'

import { SlidersHorizontal } from 'lucide-react'

export type ToolType = 'select' | 'column' | 'foundation' | 'grid'

interface ToolbarProps {
  activeTool: ToolType
  onSelectTool: (tool: ToolType) => void
  activeColumnType: string
  onChangeActiveColumnType: (type: string) => void
  activeFoundationType: string
  onChangeActiveFoundationType: (type: string) => void
  columnTypes: { name: string; section_mm?: [number, number] }[]
  foundationTypes: { name: string; size_mm?: [number, number, number] }[]
  onOpenTypeManager: () => void
}

export const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  onSelectTool,
  activeColumnType,
  onChangeActiveColumnType,
  activeFoundationType,
  onChangeActiveFoundationType,
  columnTypes,
  foundationTypes,
  onOpenTypeManager,
}) => {
  const tools: { id: ToolType; label: string; icon: React.ReactNode; shortcut: string }[] = [
    { id: 'select', label: 'Select (S)', icon: <MousePointer size={18} />, shortcut: 'S' },
    { id: 'column', label: 'Column (C)', icon: <Columns size={18} />, shortcut: 'C' },
    { id: 'foundation', label: 'Foundation (F)', icon: <Square size={18} />, shortcut: 'F' },
    { id: 'grid', label: 'Grid Line (G)', icon: <Hash size={18} />, shortcut: 'G' },
  ]

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      background: '#1e293b',
      padding: '6px 12px',
      borderRadius: 8,
      border: '1px solid #334155',
      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)',
    }}>
      {/* Tool Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: isActive ? '1px solid #38bdf8' : '1px solid transparent',
                background: isActive ? '#0369a1' : 'transparent',
                color: isActive ? '#ffffff' : '#94a3b8',
                cursor: 'pointer',
                fontSize: 13,
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
          paddingLeft: 10,
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
              padding: '4px 8px',
              fontSize: 12,
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
          paddingLeft: 10,
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
              padding: '4px 8px',
              fontSize: 12,
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

      {/* Type Manager Launcher Button */}
      <div style={{ borderLeft: '1px solid #334155', paddingLeft: 10 }}>
        <button
          onClick={onOpenTypeManager}
          title="Open Structural Type Catalog (จัดการประเภทเสาและฐานราก)"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            border: '1px solid #475569',
            color: '#cbd5e1',
            borderRadius: 6,
            padding: '5px 10px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <SlidersHorizontal size={14} color="#38bdf8" />
          <span>Types</span>
        </button>
      </div>
    </div>
  )
}
