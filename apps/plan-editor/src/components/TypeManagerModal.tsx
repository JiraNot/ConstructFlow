import React, { useState } from 'react'
import { ProjectDocument, TypeDefinition, isColumnObject, isFoundationObject } from '@constructflow/project-model'
import { X, Plus, Check, Sliders, Layers } from 'lucide-react'

interface TypeManagerModalProps {
  isOpen: boolean
  onClose: () => void
  project: ProjectDocument
  onUpdateTypeDimensions: (
    typeName: string,
    objectType: 'structure.column' | 'structure.foundation',
    dimensions: { section_mm?: [number, number]; size_mm?: [number, number, number] }
  ) => void
  onDefineType: (
    objectType: 'structure.column' | 'structure.foundation',
    name: string,
    parameters: { section_mm?: [number, number]; size_mm?: [number, number, number] }
  ) => void
}

export const TypeManagerModal: React.FC<TypeManagerModalProps> = ({
  isOpen,
  onClose,
  project,
  onUpdateTypeDimensions,
  onDefineType,
}) => {
  const [activeTab, setActiveTab] = useState<'column' | 'foundation'>('column')

  // Edit draft states for existing types: typeId -> { w, d, l, t }
  const [editDrafts, setEditDrafts] = useState<Record<string, { w: number; d: number; l?: number; t?: number }>>({})

  // New Type form state
  const [newTypeName, setNewTypeName] = useState('')
  const [newColW, setNewColW] = useState(250)
  const [newColD, setNewColD] = useState(250)
  const [newFndW, setNewFndW] = useState(1000)
  const [newFndL, setNewFndL] = useState(1000)
  const [newFndT, setNewFndT] = useState(350)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)

  if (!isOpen) return null

  const columnTypes = (project.types || []).filter((t) => t.object_type === 'structure.column')
  const foundationTypes = (project.types || []).filter((t) => t.object_type === 'structure.foundation')

  // Count usage of each type in current project
  const getUsageCount = (objectType: string, typeName: string) => {
    return Object.values(project.objects).filter((o) => {
      if (objectType === 'structure.column' && isColumnObject(o)) {
        return o.module_data.mark.toLowerCase() === typeName.toLowerCase()
      }
      if (objectType === 'structure.foundation' && isFoundationObject(o)) {
        return o.module_data.mark.toLowerCase() === typeName.toLowerCase()
      }
      return false
    }).length
  }

  const handleUpdateColDimensions = (typeDef: TypeDefinition) => {
    const draft = editDrafts[typeDef.id]
    const w = draft?.w ?? typeDef.parameters?.section_mm?.[0] ?? 200
    const d = draft?.d ?? typeDef.parameters?.section_mm?.[1] ?? 200
    onUpdateTypeDimensions(typeDef.name, 'structure.column', { section_mm: [w, d] })
    setSaveSuccess(typeDef.name)
    setTimeout(() => setSaveSuccess(null), 2000)
  }

  const handleUpdateFndDimensions = (typeDef: TypeDefinition) => {
    const draft = editDrafts[typeDef.id]
    const w = draft?.w ?? typeDef.parameters?.size_mm?.[0] ?? 800
    const l = draft?.l ?? typeDef.parameters?.size_mm?.[1] ?? 800
    const t = draft?.t ?? typeDef.parameters?.size_mm?.[2] ?? 300
    onUpdateTypeDimensions(typeDef.name, 'structure.foundation', { size_mm: [w, l, t] })
    setSaveSuccess(typeDef.name)
    setTimeout(() => setSaveSuccess(null), 2000)
  }

  const handleCreateNewType = (e: React.FormEvent) => {
    e.preventDefault()
    const name = newTypeName.trim().toUpperCase()
    if (!name) return

    if (activeTab === 'column') {
      onDefineType('structure.column', name, { section_mm: [newColW, newColD] })
    } else {
      onDefineType('structure.foundation', name, { size_mm: [newFndW, newFndL, newFndT] })
    }

    setNewTypeName('')
    setSaveSuccess(name)
    setTimeout(() => setSaveSuccess(null), 2000)
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      backdropFilter: 'blur(3px)',
    }}>
      <div style={{
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: 12,
        width: 620,
        maxWidth: '92vw',
        maxHeight: '88vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sliders size={20} color="#38bdf8" />
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                Structural Type Catalog (กำหนดประเภทและขนาด)
              </h2>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                การปรับขนาด Type จะอัปเดตเสาและฐานรากทุกต้นในโปรเจกต์โดยอัตโนมัติ
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #1e293b',
          background: '#0b1329',
          padding: '0 20px',
        }}>
          <button
            onClick={() => setActiveTab('column')}
            style={{
              padding: '12px 18px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'column' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'column' ? '#38bdf8' : '#94a3b8',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Column Types (เสา) ({columnTypes.length})
          </button>
          <button
            onClick={() => setActiveTab('foundation')}
            style={{
              padding: '12px 18px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'foundation' ? '2px solid #f59e0b' : '2px solid transparent',
              color: activeTab === 'foundation' ? '#f59e0b' : '#94a3b8',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Footing Types (ฐานราก) ({foundationTypes.length})
          </button>
        </div>

        {/* Body List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {saveSuccess && (
            <div style={{
              background: 'rgba(34, 197, 94, 0.15)',
              border: '1px solid #22c55e',
              color: '#4ade80',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <Check size={16} /> บันทึกและอัปเดตประเภท <b>{saveSuccess}</b> ไปยังเสา/ฐานรากทุกต้นเรียบร้อยแล้ว
            </div>
          )}

          {/* List of Types */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
              รายการประเภทปัจจุบันในแบบ
            </div>

            {(activeTab === 'column' ? columnTypes : foundationTypes).map((t) => {
              const usageCount = getUsageCount(t.object_type, t.name)
              const draft = editDrafts[t.id]

              if (activeTab === 'column') {
                const currentW = draft?.w ?? t.parameters?.section_mm?.[0] ?? 200
                const currentD = draft?.d ?? t.parameters?.section_mm?.[1] ?? 200

                return (
                  <div
                    key={t.id}
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 90 }}>
                      <span style={{
                        background: '#0284c7',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: 14,
                        padding: '3px 10px',
                        borderRadius: 4,
                        fontFamily: 'monospace',
                      }}>
                        {t.name}
                      </span>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                        {usageCount} ต้นในแบบ
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>กว้าง:</span>
                        <input
                          type="number"
                          step={50}
                          value={currentW}
                          onChange={(e) => setEditDrafts((d) => ({
                            ...d,
                            [t.id]: { w: Number(e.target.value), d: currentD },
                          }))}
                          style={{
                            width: 65,
                            background: '#0f172a',
                            border: '1px solid #475569',
                            color: '#fff',
                            borderRadius: 4,
                            padding: '4px 6px',
                            fontSize: 12,
                            fontWeight: 600,
                            textAlign: 'center',
                          }}
                        />
                        <span style={{ fontSize: 11, color: '#64748b' }}>mm</span>
                      </div>

                      <span style={{ color: '#64748b' }}>×</span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>ลึก:</span>
                        <input
                          type="number"
                          step={50}
                          value={currentD}
                          onChange={(e) => setEditDrafts((d) => ({
                            ...d,
                            [t.id]: { w: currentW, d: Number(e.target.value) },
                          }))}
                          style={{
                            width: 65,
                            background: '#0f172a',
                            border: '1px solid #475569',
                            color: '#fff',
                            borderRadius: 4,
                            padding: '4px 6px',
                            fontSize: 12,
                            fontWeight: 600,
                            textAlign: 'center',
                          }}
                        />
                        <span style={{ fontSize: 11, color: '#64748b' }}>mm</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleUpdateColDimensions(t)}
                      style={{
                        background: '#0284c7',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        padding: '6px 14px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      บันทึกขนาด
                    </button>
                  </div>
                )
              } else {
                const currentW = draft?.w ?? t.parameters?.size_mm?.[0] ?? 800
                const currentL = draft?.l ?? t.parameters?.size_mm?.[1] ?? 800
                const currentT = draft?.t ?? t.parameters?.size_mm?.[2] ?? 300

                return (
                  <div
                    key={t.id}
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 90 }}>
                      <span style={{
                        background: '#d97706',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: 14,
                        padding: '3px 10px',
                        borderRadius: 4,
                        fontFamily: 'monospace',
                      }}>
                        {t.name}
                      </span>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                        {usageCount} ฐานในแบบ
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' }}>
                      <input
                        type="number"
                        step={100}
                        value={currentW}
                        onChange={(e) => setEditDrafts((d) => ({
                          ...d,
                          [t.id]: { w: Number(e.target.value), l: currentL, t: currentT, d: currentL },
                        }))}
                        style={{
                          width: 58,
                          background: '#0f172a',
                          border: '1px solid #475569',
                          color: '#fff',
                          borderRadius: 4,
                          padding: '4px 4px',
                          fontSize: 12,
                          textAlign: 'center',
                        }}
                      />
                      <span style={{ color: '#64748b' }}>×</span>
                      <input
                        type="number"
                        step={100}
                        value={currentL}
                        onChange={(e) => setEditDrafts((d) => ({
                          ...d,
                          [t.id]: { w: currentW, l: Number(e.target.value), t: currentT, d: Number(e.target.value) },
                        }))}
                        style={{
                          width: 58,
                          background: '#0f172a',
                          border: '1px solid #475569',
                          color: '#fff',
                          borderRadius: 4,
                          padding: '4px 4px',
                          fontSize: 12,
                          textAlign: 'center',
                        }}
                      />
                      <span style={{ color: '#64748b' }}>×</span>
                      <input
                        type="number"
                        step={50}
                        value={currentT}
                        onChange={(e) => setEditDrafts((d) => ({
                          ...d,
                          [t.id]: { w: currentW, l: currentL, t: Number(e.target.value), d: currentL },
                        }))}
                        style={{
                          width: 54,
                          background: '#0f172a',
                          border: '1px solid #475569',
                          color: '#fff',
                          borderRadius: 4,
                          padding: '4px 4px',
                          fontSize: 12,
                          textAlign: 'center',
                        }}
                      />
                      <span style={{ fontSize: 10, color: '#64748b' }}>mm</span>
                    </div>

                    <button
                      onClick={() => handleUpdateFndDimensions(t)}
                      style={{
                        background: '#d97706',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        padding: '6px 14px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      บันทึกขนาด
                    </button>
                  </div>
                )
              }
            })}
          </div>

          {/* Create New Type Form */}
          <div style={{
            marginTop: 10,
            borderTop: '1px solid #1e293b',
            paddingTop: 16,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={16} /> เพิ่มประเภทใหม่ (+ New {activeTab === 'column' ? 'Column' : 'Footing'} Type)
            </div>

            <form
              onSubmit={handleCreateNewType}
              style={{
                background: '#0b1329',
                border: '1px dashed #334155',
                borderRadius: 8,
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>ชื่อ Type Mark:</label>
                <input
                  type="text"
                  placeholder={activeTab === 'column' ? 'เช่น C3, C-L' : 'เช่น F3, F-COMBINED'}
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  style={{
                    width: 110,
                    background: '#0f172a',
                    border: '1px solid #475569',
                    color: '#fff',
                    borderRadius: 4,
                    padding: '6px 8px',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                  required
                />
              </div>

              {activeTab === 'column' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label style={{ fontSize: 12, color: '#94a3b8' }}>ขนาดหน้าตัด (mm):</label>
                  <input
                    type="number"
                    step={50}
                    value={newColW}
                    onChange={(e) => setNewColW(Number(e.target.value))}
                    style={{ width: 60, background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: 4, padding: '4px', fontSize: 12 }}
                  />
                  <span style={{ color: '#64748b' }}>×</span>
                  <input
                    type="number"
                    step={50}
                    value={newColD}
                    onChange={(e) => setNewColD(Number(e.target.value))}
                    style={{ width: 60, background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: 4, padding: '4px', fontSize: 12 }}
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <label style={{ fontSize: 12, color: '#94a3b8' }}>ขนาด (mm):</label>
                  <input
                    type="number"
                    step={100}
                    value={newFndW}
                    onChange={(e) => setNewFndW(Number(e.target.value))}
                    style={{ width: 55, background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: 4, padding: '4px', fontSize: 12 }}
                  />
                  <span>×</span>
                  <input
                    type="number"
                    step={100}
                    value={newFndL}
                    onChange={(e) => setNewFndL(Number(e.target.value))}
                    style={{ width: 55, background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: 4, padding: '4px', fontSize: 12 }}
                  />
                  <span>×</span>
                  <input
                    type="number"
                    step={50}
                    value={newFndT}
                    onChange={(e) => setNewFndT(Number(e.target.value))}
                    style={{ width: 50, background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: 4, padding: '4px', fontSize: 12 }}
                  />
                </div>
              )}

              <button
                type="submit"
                style={{
                  background: activeTab === 'column' ? '#0284c7' : '#d97706',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  marginLeft: 'auto',
                }}
              >
                + สร้าง Type ใหม่
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid #1e293b',
          background: '#0b1329',
          display: 'flex',
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              background: '#334155',
              color: '#f8fafc',
              border: 'none',
              borderRadius: 6,
              padding: '6px 16px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  )
}
