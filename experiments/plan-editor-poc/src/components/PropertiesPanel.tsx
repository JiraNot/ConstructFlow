import React from 'react'
import { SmartObject, Phase } from '../types/model'
import { Trash2, Box, Sliders } from 'lucide-react'

interface PropertiesPanelProps {
  selectedObject: SmartObject | null
  onUpdatePhase: (id: string, phase: Phase) => void
  onDeleteObject: (id: string) => void
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedObject,
  onUpdatePhase,
  onDeleteObject,
}) => {
  if (!selectedObject) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <Sliders size={14} color="#64748b" />
          <span style={styles.title}>Properties</span>
        </div>
        <div style={styles.emptyState}>
          Select a Column, Wall, or Grid line on the plan canvas to inspect and edit semantic parameters.
        </div>
      </div>
    )
  }

  const { id, object_type, owner_module, created_phase, removed_phase, module_data } = selectedObject
  const activePhase = removed_phase === 'demolition' ? 'demolition' : created_phase

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <Box size={15} color="#38bdf8" />
        <span style={styles.title}>{id}</span>
        <span style={styles.typeBadge}>{object_type}</span>
      </div>

      <div style={styles.content}>
        <div style={styles.sectionTitle}>Identity & Lifecycle</div>

        <div style={styles.row}>
          <span style={styles.label}>Object ID:</span>
          <span style={styles.valueMono}>{id}</span>
        </div>

        <div style={styles.row}>
          <span style={styles.label}>Owner Module:</span>
          <span style={styles.valueText}>{owner_module}</span>
        </div>

        <div style={styles.row}>
          <span style={styles.label}>Phase:</span>
          <select
            value={activePhase}
            onChange={(e) => onUpdatePhase(id, e.target.value as Phase)}
            style={styles.select}
          >
            <option value="new_construction">New Construction</option>
            <option value="existing">Existing</option>
            <option value="demolition">Demolition</option>
          </select>
        </div>

        <div style={styles.sectionTitle}>Geometry & Section (mm)</div>

        {object_type === 'structure.column' && (
          <>
            <div style={styles.row}>
              <span style={styles.label}>Location X:</span>
              <span style={styles.valueMono}>{module_data.location_mm[0]} mm</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Location Y:</span>
              <span style={styles.valueMono}>{module_data.location_mm[1]} mm</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Section (W × H):</span>
              <span style={styles.valueMono}>
                {module_data.section_mm[0]} × {module_data.section_mm[1]} mm
              </span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Material:</span>
              <span style={styles.valueText}>{module_data.material}</span>
            </div>
          </>
        )}

        {object_type === 'architecture.wall' && (
          <>
            <div style={styles.row}>
              <span style={styles.label}>Start:</span>
              <span style={styles.valueMono}>
                ({module_data.start_mm[0]}, {module_data.start_mm[1]}) mm
              </span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>End:</span>
              <span style={styles.valueMono}>
                ({module_data.end_mm[0]}, {module_data.end_mm[1]}) mm
              </span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Thickness:</span>
              <span style={styles.valueMono}>{module_data.thickness_mm} mm</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Height:</span>
              <span style={styles.valueMono}>{module_data.height_mm} mm</span>
            </div>
          </>
        )}

        {object_type === 'structure.grid' && (
          <>
            <div style={styles.row}>
              <span style={styles.label}>Grid Tag:</span>
              <span style={styles.valueMono}>{module_data.tag}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Orientation:</span>
              <span style={styles.valueText}>{module_data.orientation}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Position:</span>
              <span style={styles.valueMono}>{module_data.position_mm} mm</span>
            </div>
          </>
        )}

        <div style={{ marginTop: '20px' }}>
          <button style={styles.deleteButton} onClick={() => onDeleteObject(id)}>
            <Trash2 size={13} /> Delete Object
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '280px',
    background: '#0f172a',
    borderLeft: '1px solid #1e293b',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    userSelect: 'none',
  },
  header: {
    height: '42px',
    borderBottom: '1px solid #1e293b',
    padding: '0 14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  title: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#f8fafc',
  },
  typeBadge: {
    fontSize: '10px',
    background: '#1e293b',
    color: '#38bdf8',
    padding: '2px 6px',
    borderRadius: '4px',
    marginLeft: 'auto',
    fontFamily: 'JetBrains Mono, monospace',
  },
  content: {
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  emptyState: {
    padding: '24px 16px',
    fontSize: '12px',
    color: '#64748b',
    lineHeight: 1.5,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#475569',
    marginTop: '6px',
    borderBottom: '1px solid #1e293b',
    paddingBottom: '4px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '12px',
  },
  label: {
    color: '#94a3b8',
  },
  valueMono: {
    color: '#f1f5f9',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '11px',
  },
  valueText: {
    color: '#cbd5e1',
    fontSize: '12px',
  },
  select: {
    background: '#1e293b',
    border: '1px solid #334155',
    color: '#f1f5f9',
    fontSize: '11px',
    padding: '3px 6px',
    borderRadius: '4px',
    outline: 'none',
  },
  deleteButton: {
    width: '100%',
    padding: '7px 0',
    background: 'rgba(239, 68, 68, 0.15)',
    color: '#f87171',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
}
