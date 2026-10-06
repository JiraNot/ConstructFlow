import React, { useState, useEffect } from 'react'
import {
  ProjectDocument,
  SmartObject,
  FoundationModuleData,
  isColumnObject,
  isFoundationObject,
  isGridObject,
} from '@constructflow/project-model'
import { Copy, Check, Trash2, PlusCircle } from 'lucide-react'

interface PropertiesPanelProps {
  project: ProjectDocument
  selectedId: string | null
  onAssignType: (objectId: string, typeName: string) => void
  onUpdateColumnMark: (objectId: string, newMark: string) => void
  onUpdateFoundationMark: (objectId: string, newMark: string) => void
  onUpdateGridTag: (objectId: string, newTag: string) => void
  onOpenTypeManager: () => void
  onAddFoundation: (columnId: string) => void
  onDeleteObject: (objectId: string) => void
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  project,
  selectedId,
  onAssignType,
  onUpdateColumnMark,
  onUpdateFoundationMark,
  onUpdateGridTag,
  onOpenTypeManager,
  onAddFoundation,
  onDeleteObject,
}) => {
  const selectedObj = selectedId ? project.objects[selectedId] : null
  const [copied, setCopied] = useState(false)
  const [editingMark, setEditingMark] = useState('')

  const colObj = selectedObj && isColumnObject(selectedObj) ? selectedObj : null
  const fndObj = selectedObj && isFoundationObject(selectedObj) ? selectedObj : null
  const grdObj = selectedObj && isGridObject(selectedObj) ? selectedObj : null

  const currentMark = colObj
    ? colObj.module_data.mark
    : fndObj
      ? fndObj.module_data.mark
      : grdObj
        ? grdObj.module_data.tag
        : ''

  useEffect(() => {
    setEditingMark(currentMark)
  }, [selectedId, currentMark])

  const handleCopyUUID = () => {
    if (!selectedId) return
    navigator.clipboard.writeText(selectedId)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleSaveMark = (preset?: string) => {
    const val = (preset !== undefined ? preset : editingMark).trim()
    if (!val) return
    if (colObj) {
      onAssignType(colObj.id, val)
    } else if (fndObj) {
      onAssignType(fndObj.id, val)
    } else if (grdObj) {
      onUpdateGridTag(grdObj.id, val)
    }
    setEditingMark(val)
  }

  // Check if this column already has a hosted foundation
  const hostedFoundation = colObj
    ? Object.values(project.objects).find(
        (o): o is SmartObject<FoundationModuleData> =>
          isFoundationObject(o) &&
          (o.host_refs?.includes(colObj.id) || o.module_data.supported_column_id === colObj.id)
      )
    : null

  if (!selectedObj) {
    return (
      <div style={{ padding: 16, color: '#64748b', fontSize: 13, textAlign: 'center' }}>
        No object selected. Click an element on the canvas to inspect properties.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ borderBottom: '1px solid #334155', paddingBottom: 10 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#38bdf8', fontWeight: 700 }}>
          {selectedObj.object_type}
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#f8fafc', marginTop: 2 }}>
          {currentMark || selectedObj.id.slice(0, 8)}
        </div>
      </div>

      {/* Immutable UUID Display */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
          IMMUTABLE OBJECT ID (UUID)
        </label>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: '#0f172a',
          padding: '6px 8px',
          borderRadius: 6,
          border: '1px solid #334155',
        }}>
          <span style={{
            fontSize: 11,
            fontFamily: 'monospace',
            color: '#cbd5e1',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}>
            {selectedObj.id}
          </span>
          <button
            onClick={handleCopyUUID}
            title="Copy UUID"
            style={{
              background: 'transparent',
              border: 'none',
              color: copied ? '#22c55e' : '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
        <span style={{ fontSize: 10, color: '#64748b' }}>
          * Synced to SketchUp attribute: constructflow.object_id
        </span>
      </div>

      {/* Human-Readable Mark (Editable for Columns, Foundations, and Grids!) */}
      {(colObj || fndObj || grdObj) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
              {colObj
                ? 'COLUMN TYPE MARK (SCHEDULE)'
                : fndObj
                ? 'FOOTING TYPE MARK (SCHEDULE)'
                : 'GRID AXIS TAG'}
            </label>
            <span style={{ fontSize: 10, color: '#38bdf8' }}>UUID Unchanged</span>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={editingMark}
              onChange={(e) => setEditingMark(e.target.value)}
              onBlur={() => handleSaveMark()}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveMark()}
              placeholder={colObj ? 'e.g. C1' : fndObj ? 'e.g. F1' : 'e.g. A'}
              style={{
                flex: 1,
                background: '#0f172a',
                border: '1px solid #475569',
                borderRadius: 6,
                color: '#ffffff',
                padding: '6px 10px',
                fontSize: 13,
                fontWeight: 600,
              }}
            />
            <button
              onClick={() => handleSaveMark()}
              style={{
                background: '#0284c7',
                border: 'none',
                color: '#ffffff',
                padding: '0 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Save
            </button>
          </div>

          {/* Dynamic Schedule Mark Presets from Project Catalog */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#64748b' }}>Type Presets:</span>
              {(colObj || fndObj) && (
                <button
                  onClick={onOpenTypeManager}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#38bdf8',
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  Manage Types
                </button>
              )}
            </div>

            {colObj && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(project.types || [])
                  .filter((t) => t.object_type === 'structure.column')
                  .map((t) => {
                    const isCurrent = colObj.module_data.mark.toLowerCase() === t.name.toLowerCase()
                    const sec = t.parameters?.section_mm || [200, 200]
                    return (
                      <button
                        key={t.id}
                        onClick={() => handleSaveMark(t.name)}
                        style={{
                          background: isCurrent ? '#0284c7' : '#1e293b',
                          color: isCurrent ? '#fff' : '#cbd5e1',
                          border: isCurrent ? '1px solid #38bdf8' : '1px solid #334155',
                          borderRadius: 4,
                          padding: '3px 8px',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {t.name} ({sec[0]}×{sec[1]})
                      </button>
                    )
                  })}
              </div>
            )}

            {fndObj && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(project.types || [])
                  .filter((t) => t.object_type === 'structure.foundation')
                  .map((t) => {
                    const isCurrent = fndObj.module_data.mark.toLowerCase() === t.name.toLowerCase()
                    const sz = t.parameters?.size_mm || [800, 800, 300]
                    return (
                      <button
                        key={t.id}
                        onClick={() => handleSaveMark(t.name)}
                        style={{
                          background: isCurrent ? '#d97706' : '#1e293b',
                          color: isCurrent ? '#fff' : '#cbd5e1',
                          border: isCurrent ? '1px solid #f59e0b' : '1px solid #334155',
                          borderRadius: 4,
                          padding: '3px 8px',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {t.name} ({sz[0]}×{sz[1]})
                      </button>
                    )
                  })}
              </div>
            )}

            {grdObj && (
              <div style={{ display: 'flex', gap: 4 }}>
                {(grdObj.module_data.orientation === 'vertical'
                  ? ['A', 'B', 'C', 'D']
                  : ['1', '2', '3', '4']
                ).map((p) => (
                  <button
                    key={p}
                    onClick={() => handleSaveMark(p)}
                    style={{
                      background: editingMark === p ? '#0284c7' : '#1e293b',
                      color: editingMark === p ? '#fff' : '#94a3b8',
                      border: '1px solid #334155',
                      borderRadius: 4,
                      padding: '2px 8px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* Coordinates / Position */}
      {colObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
            LOCATION (WORLD MM)
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <div style={{ background: '#0f172a', padding: '5px 8px', borderRadius: 4, fontSize: 12 }}>
              <span style={{ color: '#ef4444', fontWeight: 700 }}>X: </span>
              {Math.round(colObj.module_data.location_mm[0])}
            </div>
            <div style={{ background: '#0f172a', padding: '5px 8px', borderRadius: 4, fontSize: 12 }}>
              <span style={{ color: '#22c55e', fontWeight: 700 }}>Y: </span>
              {Math.round(colObj.module_data.location_mm[1])}
            </div>
            <div style={{ background: '#0f172a', padding: '5px 8px', borderRadius: 4, fontSize: 12 }}>
              <span style={{ color: '#38bdf8', fontWeight: 700 }}>Z: </span>
              {Math.round(colObj.module_data.location_mm[2] || 0)}
            </div>
          </div>
        </div>
      )}

      {fndObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
            CENTER (WORLD MM)
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <div style={{ background: '#0f172a', padding: '5px 8px', borderRadius: 4, fontSize: 12 }}>
              <span style={{ color: '#ef4444', fontWeight: 700 }}>X: </span>
              {Math.round(fndObj.module_data.center_mm[0])}
            </div>
            <div style={{ background: '#0f172a', padding: '5px 8px', borderRadius: 4, fontSize: 12 }}>
              <span style={{ color: '#22c55e', fontWeight: 700 }}>Y: </span>
              {Math.round(fndObj.module_data.center_mm[1])}
            </div>
            <div style={{ background: '#0f172a', padding: '5px 8px', borderRadius: 4, fontSize: 12 }}>
              <span style={{ color: '#38bdf8', fontWeight: 700 }}>Z: </span>
              {Math.round(fndObj.module_data.center_mm[2] || 0)}
            </div>
          </div>
        </div>
      )}

      {/* Cross-section / Size */}
      {colObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
              SECTION (MM)
            </label>
            <button
              onClick={onOpenTypeManager}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#38bdf8',
                fontSize: 11,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
              }}
            >
              แก้ไขใน Manage Types
            </button>
          </div>
          <div style={{
            background: '#0f172a',
            padding: '7px 10px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 700,
            color: '#38bdf8',
            border: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>{colObj.module_data.section_mm[0]} × {colObj.module_data.section_mm[1]} mm</span>
            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>Type {colObj.module_data.mark}</span>
          </div>
          <span style={{ fontSize: 10, color: '#64748b' }}>
            * ขนาดเสาถูกควบคุมโดย Type (เปลี่ยนขนาดได้ที่หน้า Manage Types)
          </span>
        </div>
      )}

      {fndObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
              FOOTING SIZE (MM)
            </label>
            <button
              onClick={onOpenTypeManager}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#f59e0b',
                fontSize: 11,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
              }}
            >
              แก้ไขใน Manage Types
            </button>
          </div>
          <div style={{
            background: '#0f172a',
            padding: '7px 10px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 700,
            color: '#f59e0b',
            border: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>{fndObj.module_data.size_mm[0]} × {fndObj.module_data.size_mm[1]} × {fndObj.module_data.size_mm[2]} mm</span>
            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>Type {fndObj.module_data.mark}</span>
          </div>
          <span style={{ fontSize: 10, color: '#64748b' }}>
            * ขนาดฐานรากถูกควบคุมโดย Type (เปลี่ยนขนาดได้ที่หน้า Manage Types)
          </span>
        </div>
      )}

      {grdObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
            GRID LINE POSITION (MM)
          </label>
          <div style={{ background: '#0f172a', padding: '6px 8px', borderRadius: 6, fontSize: 12 }}>
            {grdObj.module_data.orientation === 'vertical' ? 'X = ' : 'Y = '}
            {grdObj.module_data.position_mm} mm
          </div>
        </div>
      )}

      {/* Level and Phase */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>BASE LEVEL</label>
          <div style={{ background: '#0f172a', padding: '5px 8px', borderRadius: 4, fontSize: 12, marginTop: 4 }}>
            {selectedObj.level_refs?.[0]?.level_id || 'Ground Floor'}
          </div>
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>PHASE</label>
          <div style={{
            background: selectedObj.created_phase === 'existing' ? '#334155' : '#0369a1',
            padding: '5px 8px',
            borderRadius: 4,
            fontSize: 12,
            marginTop: 4,
            textTransform: 'capitalize',
            textAlign: 'center',
          }}>
            {selectedObj.created_phase.replace('_', ' ')}
          </div>
        </div>
      </div>

      {/* Hosted Foundation Status / Action */}
      {colObj && (
        <div style={{ borderTop: '1px solid #334155', paddingTop: 10 }}>
          <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>HOSTED FOUNDATION</label>
          {hostedFoundation ? (
            <div style={{
              background: '#0f172a',
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid #334155',
              marginTop: 6,
              fontSize: 12,
            }}>
              <div style={{ color: '#38bdf8', fontWeight: 600 }}>
                Footing {hostedFoundation.module_data.mark} ({hostedFoundation.module_data.size_mm.join(' × ')} mm)
              </div>
              <div style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>
                UUID: {hostedFoundation.id.slice(0, 8)}...
              </div>
            </div>
          ) : (
            <button
              onClick={() => onAddFoundation(colObj.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: '#1e293b',
                color: '#38bdf8',
                border: '1px solid #0284c7',
                padding: '6px 12px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                marginTop: 6,
                width: '100%',
                justifyContent: 'center',
              }}
            >
              <PlusCircle size={14} /> Add Hosted Footing (800×800)
            </button>
          )}
        </div>
      )}

      {/* Delete Object Action */}
      <div style={{ borderTop: '1px solid #334155', paddingTop: 10 }}>
        <button
          onClick={() => onDeleteObject(selectedObj.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            padding: '6px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            width: '100%',
            justifyContent: 'center',
          }}
        >
          <Trash2 size={14} /> Delete Object
        </button>
      </div>
    </div>
  )
}
