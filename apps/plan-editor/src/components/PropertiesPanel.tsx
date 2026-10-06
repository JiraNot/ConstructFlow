import React, { useState, useEffect } from 'react'
import {
  ProjectDocument,
  SmartObject,
  FoundationModuleData,
  BeamModuleData,
  WallModuleData,
  DoorModuleData,
  WindowModuleData,
  isColumnObject,
  isFoundationObject,
  isGridObject,
  isBeamObject,
  isWallObject,
  isDoorObject,
  isWindowObject,
  Phase,
} from '@constructflow/project-model'
import { Copy, Check, Trash2, PlusCircle, RefreshCw, SlidersHorizontal } from 'lucide-react'

interface PropertiesPanelProps {
  project: ProjectDocument
  selectedId: string | null
  onAssignType: (objectId: string, typeName: string) => void
  onUpdateColumnMark: (objectId: string, newMark: string) => void
  onUpdateFoundationMark: (objectId: string, newMark: string) => void
  onUpdateGridTag: (objectId: string, newTag: string) => void
  onUpdatePhase?: (objectId: string, newPhase: Phase) => void
  onFlipDoorHanding?: (doorId: string) => void
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
  onUpdatePhase,
  onFlipDoorHanding,
  onOpenTypeManager,
  onAddFoundation,
  onDeleteObject,
}) => {
  const selectedObj = selectedId ? project.objects[selectedId] : null
  const [copied, setCopied] = useState(false)
  const [editingMark, setEditingMark] = useState('')

  const colObj = selectedObj && isColumnObject(selectedObj) ? selectedObj : null
  const fndObj = selectedObj && isFoundationObject(selectedObj) ? selectedObj : null
  const beamObj = selectedObj && isBeamObject(selectedObj) ? selectedObj : null
  const wallObj = selectedObj && isWallObject(selectedObj) ? selectedObj : null
  const doorObj = selectedObj && isDoorObject(selectedObj) ? selectedObj : null
  const winObj = selectedObj && isWindowObject(selectedObj) ? selectedObj : null
  const grdObj = selectedObj && isGridObject(selectedObj) ? selectedObj : null

  const currentMark = colObj
    ? colObj.module_data.mark
    : fndObj
      ? fndObj.module_data.mark
      : beamObj
        ? beamObj.module_data.mark
        : wallObj
          ? wallObj.module_data.mark
          : doorObj
            ? doorObj.module_data.mark
            : winObj
              ? winObj.module_data.mark
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
    if (colObj || fndObj || beamObj || wallObj || doorObj || winObj) {
      if (selectedObj) {
        onAssignType(selectedObj.id, val)
      }
    } else if (grdObj) {
      onUpdateGridTag(grdObj.id, val)
    }
    setEditingMark(val)
  }

  if (!selectedObj) {
    return (
      <div style={{
        padding: 16,
        color: '#64748b',
        fontSize: 13,
        textAlign: 'center',
        marginTop: 40,
      }}>
        <div style={{ marginBottom: 8, fontSize: 24 }}>📐</div>
        <div>No object selected</div>
        <div style={{ fontSize: 11, marginTop: 4, color: '#475569' }}>
          Click an element on the plan to inspect & edit its BIM properties.
        </div>
      </div>
    )
  }

  // Find hosted foundation if this is a column
  const hostedFoundation = colObj
    ? (Object.values(project.objects).find(
        (o) => isFoundationObject(o) && (o.module_data.supported_column_id === colObj.id || o.host_refs?.includes(colObj.id))
      ) as SmartObject<FoundationModuleData> | undefined)
    : undefined

  // Find hosted openings if this is a wall
  const hostedOpenings = wallObj
    ? Object.values(project.objects).filter(
        (o): o is SmartObject<DoorModuleData | WindowModuleData> =>
          (isDoorObject(o) || isWindowObject(o)) && (o.module_data as any).wall_id === wallObj.id
      )
    : []

  const columnPresets = ['C1', 'C2', 'C3']
  const foundationPresets = ['F1', 'F2', 'F3']
  const beamPresets = ['B1', 'B2', 'RB1', 'B3']
  const wallPresets = ['W1', 'W2', 'W3']
  const doorPresets = ['D1', 'D2', 'D3']
  const windowPresets = ['W1', 'W2', 'W3']

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header with Type Badge */}
      <div style={{ borderBottom: '1px solid #334155', paddingBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{
            fontSize: 10,
            textTransform: 'uppercase',
            fontWeight: 800,
            color: colObj
              ? '#38bdf8'
              : fndObj
              ? '#f59e0b'
              : beamObj
              ? '#c084fc'
              : wallObj
              ? '#94a3b8'
              : doorObj
              ? '#4ade80'
              : winObj
              ? '#38bdf8'
              : '#94a3b8',
            background: '#0f172a',
            padding: '2px 6px',
            borderRadius: 4,
            border: '1px solid #334155',
          }}>
            {selectedObj.object_type}
          </span>
          <span style={{ fontSize: 10, color: '#64748b' }}>v{selectedObj.schema_version}</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
          {colObj
            ? `Column ${colObj.module_data.mark}`
            : fndObj
            ? `Footing ${fndObj.module_data.mark}`
            : beamObj
            ? `Beam ${beamObj.module_data.mark}`
            : wallObj
            ? `Wall ${wallObj.module_data.mark}`
            : doorObj
            ? `Door ${doorObj.module_data.mark}`
            : winObj
            ? `Window ${winObj.module_data.mark}`
            : grdObj
            ? `Grid ${grdObj.module_data.tag}`
            : selectedObj.id.slice(0, 8)}
        </div>
      </div>

      {/* UUID Section (Immutable Core Identity) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>OBJECT UUID (IMMUTABLE)</label>
          <button
            onClick={handleCopyUUID}
            style={{
              background: 'transparent',
              border: 'none',
              color: copied ? '#22c55e' : '#38bdf8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              padding: 0,
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <div style={{
          background: '#0f172a',
          padding: '6px 8px',
          borderRadius: 6,
          fontFamily: 'monospace',
          fontSize: 10,
          color: '#cbd5e1',
          wordBreak: 'break-all',
          border: '1px solid #1e293b',
        }}>
          {selectedObj.id}
        </div>
      </div>

      {/* Human-Readable Mark & Type Presets */}
      {(colObj || fndObj || beamObj || wallObj || doorObj || winObj) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
            {colObj ? 'COLUMN TYPE MARK' : fndObj ? 'FOOTING TYPE MARK' : beamObj ? 'BEAM TYPE MARK' : wallObj ? 'WALL TYPE MARK' : doorObj ? 'DOOR TYPE MARK' : 'WINDOW TYPE MARK'}
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={editingMark}
              onChange={(e) => setEditingMark(e.target.value)}
              onBlur={() => handleSaveMark()}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveMark()}
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                color: '#f8fafc',
                borderRadius: 6,
                padding: '5px 8px',
                fontSize: 13,
                fontWeight: 700,
                flex: 1,
              }}
            />
          </div>

          {/* Quick Presets */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
            {(colObj
              ? columnPresets
              : fndObj
              ? foundationPresets
              : beamObj
              ? beamPresets
              : wallObj
              ? wallPresets
              : doorObj
              ? doorPresets
              : windowPresets
            ).map((preset) => {
              const isCurrent = currentMark.toLowerCase() === preset.toLowerCase()
              return (
                <button
                  key={preset}
                  onClick={() => handleSaveMark(preset)}
                  style={{
                    background: isCurrent ? '#0369a1' : '#1e293b',
                    color: isCurrent ? '#ffffff' : '#94a3b8',
                    border: isCurrent ? '1px solid #38bdf8' : '1px solid #334155',
                    borderRadius: 4,
                    padding: '3px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {preset}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Column Dimensions */}
      {colObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>SECTION (MM)</label>
            <button
              onClick={onOpenTypeManager}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#38bdf8',
                fontSize: 11,
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              [แก้ไขใน Manage Types]
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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
            <span>Position:</span>
            <span style={{ fontFamily: 'monospace' }}>({colObj.module_data.location_mm[0]}, {colObj.module_data.location_mm[1]})</span>
          </div>
        </div>
      )}

      {/* Footing Dimensions */}
      {fndObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>DIMENSIONS (MM)</label>
            <button
              onClick={onOpenTypeManager}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#f59e0b',
                fontSize: 11,
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              [แก้ไขใน Manage Types]
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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
            <span>Center:</span>
            <span style={{ fontFamily: 'monospace' }}>({fndObj.module_data.center_mm[0]}, {fndObj.module_data.center_mm[1]})</span>
          </div>
        </div>
      )}

      {/* Beam Dimensions & Span */}
      {beamObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>SECTION (MM)</label>
              <button
                onClick={onOpenTypeManager}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#38bdf8',
                  fontSize: 11,
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                [แก้ไขใน Manage Types]
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
              <span>{beamObj.module_data.section_mm[0]} × {beamObj.module_data.section_mm[1]} mm</span>
              <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>Type {beamObj.module_data.mark}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
              SPAN LENGTH (ความยาวช่วงคาน)
            </label>
            <div style={{
              background: '#0f172a',
              padding: '7px 10px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
              color: '#34d399',
              border: '1px solid #1e293b',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>{(beamObj.module_data.span_mm / 1000).toFixed(2)} m</span>
              <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
                {beamObj.module_data.span_mm.toLocaleString()} mm
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Wall Properties */}
      {wallObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>THICKNESS & HEIGHT (MM)</label>
              <button
                onClick={onOpenTypeManager}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#cbd5e1',
                  fontSize: 11,
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                [แก้ไขใน Manage Types]
              </button>
            </div>
            <div style={{
              background: '#0f172a',
              padding: '7px 10px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
              color: '#cbd5e1',
              border: '1px solid #1e293b',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>{wallObj.module_data.thickness_mm} mm (H: {wallObj.module_data.height_mm} mm)</span>
              <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>Type {wallObj.module_data.mark}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
              WALL LENGTH (ความยาวผนัง)
            </label>
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
              <span>{(wallObj.module_data.length_mm / 1000).toFixed(2)} m</span>
              <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
                {wallObj.module_data.length_mm.toLocaleString()} mm
              </span>
            </div>
          </div>

          {/* Hosted Openings Status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
              HOSTED OPENINGS ({hostedOpenings.length})
            </label>
            {hostedOpenings.length > 0 ? (
              <div style={{
                background: '#0f172a',
                padding: '6px 8px',
                borderRadius: 6,
                border: '1px solid #1e293b',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}>
                {hostedOpenings.map((op) => {
                  const isDoor = isDoorObject(op)
                  const mark = isDoor ? op.module_data.mark : isWindowObject(op) ? op.module_data.mark : ''
                  const offset = isDoor ? op.module_data.offset_along_wall_mm : isWindowObject(op) ? op.module_data.offset_along_wall_mm : 0
                  return (
                    <div key={op.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span style={{ color: isDoor ? '#4ade80' : '#38bdf8', fontWeight: 600 }}>
                        {isDoor ? `Door ${mark}` : `Window ${mark}`}
                      </span>
                      <span style={{ color: '#94a3b8' }}>
                        {(offset / 1000).toFixed(2)}m from start
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ fontSize: 10, color: '#64748b' }}>
                No openings. Select Door (D) or Window (N) tool to place on this wall.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Door Properties */}
      {doorObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>DIMENSIONS (MM)</label>
              <button
                onClick={onOpenTypeManager}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#4ade80',
                  fontSize: 11,
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                [แก้ไขใน Manage Types]
              </button>
            </div>
            <div style={{
              background: '#0f172a',
              padding: '7px 10px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
              color: '#4ade80',
              border: '1px solid #1e293b',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>{doorObj.module_data.width_mm} × {doorObj.module_data.height_mm} mm</span>
              <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>Type {doorObj.module_data.mark}</span>
            </div>
          </div>

          {/* Door Handing with Flip button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>HANDING & SWING</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{
                background: '#0f172a',
                padding: '6px 10px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                color: '#f8fafc',
                flex: 1,
                border: '1px solid #1e293b',
                textTransform: 'uppercase',
              }}>
                {doorObj.module_data.handing.replace('_', ' ')}
              </div>
              <button
                onClick={() => onFlipDoorHanding && onFlipDoorHanding(doorObj.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  background: '#1e293b',
                  color: '#4ade80',
                  border: '1px solid #16a34a',
                  padding: '6px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                <RefreshCw size={12} /> Flip
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
            <span>Offset along wall:</span>
            <span style={{ fontFamily: 'monospace' }}>{(doorObj.module_data.offset_along_wall_mm / 1000).toFixed(2)} m</span>
          </div>
        </div>
      )}

      {/* Window Properties */}
      {winObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>DIMENSIONS (MM)</label>
              <button
                onClick={onOpenTypeManager}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#38bdf8',
                  fontSize: 11,
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                [แก้ไขใน Manage Types]
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
              <span>{winObj.module_data.width_mm} × {winObj.module_data.height_mm} mm</span>
              <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>Type {winObj.module_data.mark}</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
            <span>Sill Height:</span>
            <span style={{ fontFamily: 'monospace' }}>{winObj.module_data.sill_height_mm} mm</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
            <span>Offset along wall:</span>
            <span style={{ fontFamily: 'monospace' }}>{(winObj.module_data.offset_along_wall_mm / 1000).toFixed(2)} m</span>
          </div>
        </div>
      )}

      {/* Grid Coordinates */}
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
          <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>PHASE (เฟสงาน)</label>
          <select
            value={selectedObj.created_phase}
            onChange={(e) => onUpdatePhase && onUpdatePhase(selectedObj.id, e.target.value as Phase)}
            style={{
              width: '100%',
              background:
                selectedObj.created_phase === 'existing'
                  ? '#334155'
                  : selectedObj.created_phase === 'demolition'
                  ? '#991b1b'
                  : '#0369a1',
              color: '#ffffff',
              border: '1px solid #475569',
              borderRadius: 4,
              padding: '5px 8px',
              fontSize: 11,
              fontWeight: 600,
              marginTop: 4,
              cursor: 'pointer',
            }}
          >
            <option value="existing">Existing (บ้านเดิม)</option>
            <option value="demolition">Demolition (ส่วนรื้อถอน)</option>
            <option value="new_construction">New (ส่วนสร้างใหม่)</option>
          </select>
        </div>
      </div>

      {/* Hosted Foundation Status / Action for Columns */}
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
