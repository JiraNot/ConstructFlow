import React from 'react'
import { MousePointer, Columns, Square, Hash } from 'lucide-react'

export type ToolType = 'select' | 'column' | 'foundation' | 'grid'

interface ToolbarProps {
  activeTool: ToolType
  onSelectTool: (tool: ToolType) => void
}

export const Toolbar: React.FC<ToolbarProps> = ({ activeTool, onSelectTool }) => {
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
      gap: 6,
      background: '#1e293b',
      padding: '6px 10px',
      borderRadius: 8,
      border: '1px solid #334155',
      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)',
    }}>
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
  )
}
