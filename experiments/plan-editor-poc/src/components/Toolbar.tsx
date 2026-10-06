import React from 'react'
import { Phase, Level } from '../types/model'
import {
  MousePointer,
  Grid,
  Square,
  Minus,
  Save,
  RotateCcw,
  Layers,
  Calendar,
} from 'lucide-react'

export type ToolType = 'select' | 'column' | 'wall' | 'grid'

interface ToolbarProps {
  activeTool: ToolType
  onSelectTool: (tool: ToolType) => void
  activeLevelId: string
  levels: Level[]
  onSelectLevel: (levelId: string) => void
  activePhase: Phase
  onSelectPhase: (phase: Phase) => void
  onAddGridLines: () => void
  onExportJson: () => void
  onResetModel: () => void
}

export const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  onSelectTool,
  activeLevelId,
  levels,
  onSelectLevel,
  activePhase,
  onSelectPhase,
  onAddGridLines,
  onExportJson,
  onResetModel,
}) => {
  return (
    <div style={styles.container}>
      {/* Brand */}
      <div style={styles.brand}>
        <div style={styles.logoBadge}>CF</div>
        <div>
          <div style={styles.brandTitle}>ConstructFlow Plan</div>
          <div style={styles.brandSub}>Dedicated 2D Editor POC</div>
        </div>
      </div>

      <div style={styles.divider} />

      {/* Tools */}
      <div style={styles.buttonGroup}>
        <button
          style={buttonStyle(activeTool === 'select')}
          onClick={() => onSelectTool('select')}
          title="Select / Move Tool (V)"
        >
          <MousePointer size={15} /> Select
        </button>
        <button
          style={buttonStyle(activeTool === 'column')}
          onClick={() => onSelectTool('column')}
          title="Place Column at Grid Intersection (C)"
        >
          <Square size={15} /> Column
        </button>
        <button
          style={buttonStyle(activeTool === 'wall')}
          onClick={() => onSelectTool('wall')}
          title="Draw Wall Segment (W)"
        >
          <Minus size={15} /> Wall
        </button>
      </div>

      <div style={styles.divider} />

      {/* Fast Grid Setup */}
      <button style={styles.secondaryButton} onClick={onAddGridLines} title="Generate Structural Grids A, B, C / 1, 2, 3">
        <Grid size={15} /> Setup Grids
      </button>

      <div style={styles.spacer} />

      {/* Level Selector */}
      <div style={styles.selectorWrapper}>
        <Layers size={14} color="#94a3b8" />
        <span style={styles.label}>Level:</span>
        <select
          value={activeLevelId}
          onChange={(e) => onSelectLevel(e.target.value)}
          style={styles.select}
        >
          {levels.map((lvl) => (
            <option key={lvl.id} value={lvl.id}>
              {lvl.name} ({lvl.elevation_mm}mm)
            </option>
          ))}
        </select>
      </div>

      {/* Phase Selector */}
      <div style={styles.selectorWrapper}>
        <Calendar size={14} color="#94a3b8" />
        <span style={styles.label}>Phase:</span>
        <select
          value={activePhase}
          onChange={(e) => onSelectPhase(e.target.value as Phase)}
          style={styles.select}
        >
          <option value="new_construction">New Construction</option>
          <option value="existing">Existing</option>
          <option value="demolition">Demolition</option>
        </select>
      </div>

      <div style={styles.divider} />

      {/* Actions */}
      <div style={styles.buttonGroup}>
        <button style={styles.secondaryButton} onClick={onExportJson} title="Export Project JSON / cfproj">
          <Save size={15} /> Export JSON
        </button>
        <button style={styles.dangerButton} onClick={onResetModel} title="Reset Model">
          <RotateCcw size={15} />
        </button>
      </div>
    </div>
  )
}

function buttonStyle(isActive: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    background: isActive ? '#0284c7' : '#1e293b',
    color: isActive ? '#ffffff' : '#cbd5e1',
    border: isActive ? '1px solid #38bdf8' : '1px solid #334155',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '48px',
    background: '#0f172a',
    borderBottom: '1px solid #1e293b',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: '12px',
    userSelect: 'none',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logoBadge: {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    background: 'linear-gradient(135deg, #0284c7, #38bdf8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: '13px',
    color: '#ffffff',
  },
  brandTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#f8fafc',
    letterSpacing: '-0.2px',
  },
  brandSub: {
    fontSize: '10px',
    color: '#64748b',
  },
  divider: {
    width: '1px',
    height: '24px',
    background: '#334155',
  },
  spacer: {
    flex: 1,
  },
  buttonGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  selectorWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: '#1e293b',
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid #334155',
  },
  label: {
    fontSize: '12px',
    color: '#94a3b8',
    fontWeight: 500,
  },
  select: {
    background: 'transparent',
    border: 'none',
    color: '#f1f5f9',
    fontSize: '12px',
    fontWeight: 500,
    outline: 'none',
    cursor: 'pointer',
  },
  secondaryButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    background: '#1e293b',
    color: '#94a3b8',
    border: '1px solid #334155',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  dangerButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 8px',
    background: '#1e293b',
    color: '#ef4444',
    border: '1px solid #334155',
    borderRadius: '6px',
    fontSize: '12px',
    cursor: 'pointer',
  },
}
