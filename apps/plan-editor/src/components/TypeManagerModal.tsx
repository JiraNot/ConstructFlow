import React, { useState } from 'react'
import {
  ProjectDocument,
  TypeDefinition,
  isColumnObject,
  isFoundationObject,
  isBeamObject,
  isWallObject,
  isDoorObject,
  isWindowObject,
} from '@constructflow/project-model'
import { X, Plus, Check, Sliders } from 'lucide-react'

interface TypeManagerModalProps {
  isOpen: boolean
  onClose: () => void
  project: ProjectDocument
  onUpdateTypeDimensions: (
    typeName: string,
    objectType:
      | 'structure.column'
      | 'structure.foundation'
      | 'structure.beam'
      | 'architecture.wall'
      | 'door_window.door'
      | 'door_window.window',
    dimensions: {
      section_mm?: [number, number]
      size_mm?: [number, number, number]
      thickness_mm?: number
      height_mm?: number
      width_mm?: number
      sill_height_mm?: number
    }
  ) => void
  onDefineType: (
    objectType:
      | 'structure.column'
      | 'structure.foundation'
      | 'structure.beam'
      | 'architecture.wall'
      | 'door_window.door'
      | 'door_window.window',
    name: string,
    parameters: {
      section_mm?: [number, number]
      size_mm?: [number, number, number]
      thickness_mm?: number
      height_mm?: number
      width_mm?: number
      sill_height_mm?: number
    }
  ) => void
  onRenameType: (typeId: string, name: string) => boolean
}

type TabType = 'column' | 'foundation' | 'beam' | 'wall' | 'door' | 'window'

export const TypeManagerModal: React.FC<TypeManagerModalProps> = ({
  isOpen,
  onClose,
  project,
  onUpdateTypeDimensions,
  onDefineType,
  onRenameType,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('column')

  // Edit draft states for existing types: typeId -> values
  const [editDrafts, setEditDrafts] = useState<
    Record<
      string,
      {
        w?: number
        d?: number
        l?: number
        t?: number
        thickness_mm?: number
        height_mm?: number
        width_mm?: number
        sill_height_mm?: number
      }
    >
  >({})

  // New Type form states
  const [newTypeName, setNewTypeName] = useState('')
  const [newColW, setNewColW] = useState(250)
  const [newColD, setNewColD] = useState(250)
  const [newBeamW, setNewBeamW] = useState(200)
  const [newBeamD, setNewBeamD] = useState(400)
  const [newFndW, setNewFndW] = useState(1000)
  const [newFndL, setNewFndL] = useState(1000)
  const [newFndT, setNewFndT] = useState(350)
  const [newWallThick, setNewWallThick] = useState(100)
  const [newWallHeight, setNewWallHeight] = useState(2800)
  const [newDoorWidth, setNewDoorWidth] = useState(800)
  const [newDoorHeight, setNewDoorHeight] = useState(2000)
  const [newWindowWidth, setNewWindowWidth] = useState(1200)
  const [newWindowHeight, setNewWindowHeight] = useState(1200)
  const [newWindowSill, setNewWindowSill] = useState(900)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [renameTypeId, setRenameTypeId] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)

  if (!isOpen) return null

  const columnTypes = (project.types || []).filter((t) => t.object_type === 'structure.column')
  const foundationTypes = (project.types || []).filter((t) => t.object_type === 'structure.foundation')
  const beamTypes = (project.types || []).filter((t) => t.object_type === 'structure.beam')
  const wallTypes = (project.types || []).filter((t) => t.object_type === 'architecture.wall')
  const doorTypes = (project.types || []).filter((t) => t.object_type === 'door_window.door')
  const windowTypes = (project.types || []).filter((t) => t.object_type === 'door_window.window')

  // Count usage of each type in current project
  const getUsageCount = (objectType: string, typeName: string) => {
    return Object.values(project.objects).filter((o) => {
      if (objectType === 'structure.column' && isColumnObject(o)) {
        return o.module_data.mark.toLowerCase() === typeName.toLowerCase()
      }
      if (objectType === 'structure.foundation' && isFoundationObject(o)) {
        return o.module_data.mark.toLowerCase() === typeName.toLowerCase()
      }
      if (objectType === 'structure.beam' && isBeamObject(o)) {
        return o.module_data.mark.toLowerCase() === typeName.toLowerCase()
      }
      if (objectType === 'architecture.wall' && isWallObject(o)) {
        return o.module_data.mark.toLowerCase() === typeName.toLowerCase()
      }
      if (objectType === 'door_window.door' && isDoorObject(o)) {
        return o.module_data.mark.toLowerCase() === typeName.toLowerCase()
      }
      if (objectType === 'door_window.window' && isWindowObject(o)) {
        return o.module_data.mark.toLowerCase() === typeName.toLowerCase()
      }
      return false
    }).length
  }

  const handleUpdateColDimensions = (typeDef: TypeDefinition) => {
    const draft = editDrafts[typeDef.id]
    const w = draft?.w ?? typeDef.parameters?.section_mm?.[0] ?? 200
    const d = draft?.d ?? typeDef.parameters?.section_mm?.[1] ?? 200
    onUpdateTypeDimensions(typeDef.id, 'structure.column', { section_mm: [w, d] })
    setSaveSuccess(typeDef.name)
    setTimeout(() => setSaveSuccess(null), 2000)
  }

  const handleUpdateBeamDimensions = (typeDef: TypeDefinition) => {
    const draft = editDrafts[typeDef.id]
    const w = draft?.w ?? typeDef.parameters?.section_mm?.[0] ?? 200
    const d = draft?.d ?? typeDef.parameters?.section_mm?.[1] ?? 400
    onUpdateTypeDimensions(typeDef.id, 'structure.beam', { section_mm: [w, d] })
    setSaveSuccess(typeDef.name)
    setTimeout(() => setSaveSuccess(null), 2000)
  }

  const handleUpdateFndDimensions = (typeDef: TypeDefinition) => {
    const draft = editDrafts[typeDef.id]
    const w = draft?.w ?? typeDef.parameters?.size_mm?.[0] ?? 800
    const l = draft?.l ?? typeDef.parameters?.size_mm?.[1] ?? 800
    const t = draft?.t ?? typeDef.parameters?.size_mm?.[2] ?? 300
    onUpdateTypeDimensions(typeDef.id, 'structure.foundation', { size_mm: [w, l, t] })
    setSaveSuccess(typeDef.name)
    setTimeout(() => setSaveSuccess(null), 2000)
  }

  const handleUpdateWallDimensions = (typeDef: TypeDefinition) => {
    const draft = editDrafts[typeDef.id]
    const thickness_mm = draft?.thickness_mm ?? typeDef.parameters?.thickness_mm ?? 100
    const height_mm = draft?.height_mm ?? typeDef.parameters?.height_mm ?? 2800
    onUpdateTypeDimensions(typeDef.id, 'architecture.wall', { thickness_mm, height_mm })
    setSaveSuccess(typeDef.name)
    setTimeout(() => setSaveSuccess(null), 2000)
  }

  const handleUpdateDoorDimensions = (typeDef: TypeDefinition) => {
    const draft = editDrafts[typeDef.id]
    const width_mm = draft?.width_mm ?? typeDef.parameters?.width_mm ?? 800
    const height_mm = draft?.height_mm ?? typeDef.parameters?.height_mm ?? 2000
    onUpdateTypeDimensions(typeDef.id, 'door_window.door', { width_mm, height_mm })
    setSaveSuccess(typeDef.name)
    setTimeout(() => setSaveSuccess(null), 2000)
  }

  const handleUpdateWindowDimensions = (typeDef: TypeDefinition) => {
    const draft = editDrafts[typeDef.id]
    const width_mm = draft?.width_mm ?? typeDef.parameters?.width_mm ?? 1200
    const height_mm = draft?.height_mm ?? typeDef.parameters?.height_mm ?? 1200
    const sill_height_mm = draft?.sill_height_mm ?? typeDef.parameters?.sill_height_mm ?? 900
    onUpdateTypeDimensions(typeDef.id, 'door_window.window', { width_mm, height_mm, sill_height_mm })
    setSaveSuccess(typeDef.name)
    setTimeout(() => setSaveSuccess(null), 2000)
  }

  const handleCreateNewType = (e: React.FormEvent) => {
    e.preventDefault()
    const name = newTypeName.trim().toUpperCase()
    if (!name) return

    if (activeTab === 'column') {
      onDefineType('structure.column', name, { section_mm: [newColW, newColD] })
    } else if (activeTab === 'beam') {
      onDefineType('structure.beam', name, { section_mm: [newBeamW, newBeamD] })
    } else if (activeTab === 'foundation') {
      onDefineType('structure.foundation', name, { size_mm: [newFndW, newFndL, newFndT] })
    } else if (activeTab === 'wall') {
      onDefineType('architecture.wall', name, { thickness_mm: newWallThick, height_mm: newWallHeight })
    } else if (activeTab === 'door') {
      onDefineType('door_window.door', name, { width_mm: newDoorWidth, height_mm: newDoorHeight })
    } else if (activeTab === 'window') {
      onDefineType('door_window.window', name, {
        width_mm: newWindowWidth,
        height_mm: newWindowHeight,
        sill_height_mm: newWindowSill,
      })
    }

    setNewTypeName('')
    setSaveSuccess(name)
    setTimeout(() => setSaveSuccess(null), 2000)
  }

  const getCurrentTypes = () => {
    switch (activeTab) {
      case 'column':
        return columnTypes
      case 'foundation':
        return foundationTypes
      case 'beam':
        return beamTypes
      case 'wall':
        return wallTypes
      case 'door':
        return doorTypes
      case 'window':
        return windowTypes
    }
  }

  return (
    <div
      style={{
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
      }}
    >
      <div
        style={{
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: 12,
          width: 760,
          maxWidth: '94vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sliders size={20} color="#38bdf8" />
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                BIM Type Catalog (กำหนดประเภทและขนาดโมเดล)
              </h2>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                การปรับขนาด Type จะอัปเดตชิ้นงานทุกชิ้นที่อ้างอิงประเภทเดียวกันในโปรเจกต์โดยอัตโนมัติ (Cascading Update)
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
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #1e293b',
            background: '#0b1329',
            padding: '0 16px',
            overflowX: 'auto',
          }}
        >
          <button
            onClick={() => setActiveTab('column')}
            style={{
              padding: '12px 14px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'column' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'column' ? '#38bdf8' : '#94a3b8',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Column (เสา) ({columnTypes.length})
          </button>
          <button
            onClick={() => setActiveTab('foundation')}
            style={{
              padding: '12px 14px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'foundation' ? '2px solid #f59e0b' : '2px solid transparent',
              color: activeTab === 'foundation' ? '#f59e0b' : '#94a3b8',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Footing (ฐานราก) ({foundationTypes.length})
          </button>
          <button
            onClick={() => setActiveTab('beam')}
            style={{
              padding: '12px 14px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'beam' ? '2px solid #a855f7' : '2px solid transparent',
              color: activeTab === 'beam' ? '#a855f7' : '#94a3b8',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Beam (คาน) ({beamTypes.length})
          </button>
          <button
            onClick={() => setActiveTab('wall')}
            style={{
              padding: '12px 14px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'wall' ? '2px solid #10b981' : '2px solid transparent',
              color: activeTab === 'wall' ? '#10b981' : '#94a3b8',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Wall (ผนัง) ({wallTypes.length})
          </button>
          <button
            onClick={() => setActiveTab('door')}
            style={{
              padding: '12px 14px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'door' ? '2px solid #f97316' : '2px solid transparent',
              color: activeTab === 'door' ? '#f97316' : '#94a3b8',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Door (ประตู) ({doorTypes.length})
          </button>
          <button
            onClick={() => setActiveTab('window')}
            style={{
              padding: '12px 14px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'window' ? '2px solid #06b6d4' : '2px solid transparent',
              color: activeTab === 'window' ? '#06b6d4' : '#94a3b8',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Window (หน้าต่าง) ({windowTypes.length})
          </button>
        </div>

        {/* Body List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {saveSuccess && (
            <div
              style={{
                background: 'rgba(34, 197, 94, 0.15)',
                border: '1px solid #22c55e',
                color: '#4ade80',
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Check size={16} /> บันทึกและอัปเดตประเภท <b>{saveSuccess}</b> ไปยังชิ้นงานทุกชิ้นเรียบร้อยแล้ว
            </div>
          )}

          {/* List of Types */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
              รายการประเภทปัจจุบันในแบบ
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault()
                const type = getCurrentTypes().find((candidate) => candidate.id === renameTypeId)
                if (!type || !renameValue.trim()) {
                  setRenameError('เลือกประเภทและกรอกชื่อใหม่ก่อน')
                  return
                }
                if (!onRenameType(type.id, renameValue.trim())) {
                  setRenameError('เปลี่ยนชื่อไม่สำเร็จ: ชื่ออาจว่างหรือซ้ำกับประเภทในหมวดเดียวกัน')
                  return
                }
                setRenameError(null)
                setSaveSuccess(renameValue.trim())
                setTimeout(() => setSaveSuccess(null), 2000)
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
            >
              <select
                aria-label="ประเภทที่ต้องการเปลี่ยนชื่อ"
                value={renameTypeId}
                onChange={(event) => {
                  const type = getCurrentTypes().find((candidate) => candidate.id === event.target.value)
                  setRenameTypeId(event.target.value)
                  setRenameValue(type?.name ?? '')
                  setRenameError(null)
                }}
                style={{ background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: 4, padding: '7px 8px' }}
              >
                <option value="">เลือก Type</option>
                {getCurrentTypes().map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
              </select>
              <input
                aria-label="ชื่อ Type ใหม่"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                placeholder="ชื่อ Type ใหม่"
                style={{ background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: 4, padding: '7px 8px' }}
              />
              <button type="submit" style={{ background: '#0e7490', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 12px', cursor: 'pointer' }}>
                เปลี่ยนชื่อ Type
              </button>
              {renameError && <span role="alert" style={{ color: '#fca5a5', fontSize: 12 }}>{renameError}</span>}
            </form>

            {getCurrentTypes().map((t) => {
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
                      <span
                        style={{
                          background: '#0284c7',
                          color: '#fff',
                          fontWeight: 800,
                          fontSize: 14,
                          padding: '3px 10px',
                          borderRadius: 4,
                          fontFamily: 'monospace',
                        }}
                      >
                        {t.name}
                      </span>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{usageCount} ต้นในแบบ</div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>กว้าง:</span>
                        <input
                          type="number"
                          step={50}
                          value={currentW}
                          onChange={(e) =>
                            setEditDrafts((d) => ({
                              ...d,
                              [t.id]: { ...d[t.id], w: Number(e.target.value), d: currentD },
                            }))
                          }
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdateColDimensions(t)}
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
                          onChange={(e) =>
                            setEditDrafts((d) => ({
                              ...d,
                              [t.id]: { ...d[t.id], w: currentW, d: Number(e.target.value) },
                            }))
                          }
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdateColDimensions(t)}
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
              } else if (activeTab === 'beam') {
                const currentW = draft?.w ?? t.parameters?.section_mm?.[0] ?? 200
                const currentD = draft?.d ?? t.parameters?.section_mm?.[1] ?? 400

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
                      <span
                        style={{
                          background: '#a855f7',
                          color: '#fff',
                          fontWeight: 800,
                          fontSize: 14,
                          padding: '3px 10px',
                          borderRadius: 4,
                          fontFamily: 'monospace',
                        }}
                      >
                        {t.name}
                      </span>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{usageCount} ช่วงในแบบ</div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>กว้าง:</span>
                        <input
                          type="number"
                          step={50}
                          value={currentW}
                          onChange={(e) =>
                            setEditDrafts((d) => ({
                              ...d,
                              [t.id]: { ...d[t.id], w: Number(e.target.value), d: currentD },
                            }))
                          }
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdateBeamDimensions(t)}
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
                          onChange={(e) =>
                            setEditDrafts((d) => ({
                              ...d,
                              [t.id]: { ...d[t.id], w: currentW, d: Number(e.target.value) },
                            }))
                          }
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdateBeamDimensions(t)}
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
                      onClick={() => handleUpdateBeamDimensions(t)}
                      style={{
                        background: '#a855f7',
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
              } else if (activeTab === 'foundation') {
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
                      <span
                        style={{
                          background: '#d97706',
                          color: '#fff',
                          fontWeight: 800,
                          fontSize: 14,
                          padding: '3px 10px',
                          borderRadius: 4,
                          fontFamily: 'monospace',
                        }}
                      >
                        {t.name}
                      </span>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{usageCount} ฐานในแบบ</div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' }}>
                      <input
                        type="number"
                        step={100}
                        value={currentW}
                        onChange={(e) =>
                          setEditDrafts((d) => ({
                            ...d,
                            [t.id]: { ...d[t.id], w: Number(e.target.value), l: currentL, t: currentT },
                          }))
                        }
                        onKeyDown={(e) => e.key === 'Enter' && handleUpdateFndDimensions(t)}
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
                        onChange={(e) =>
                          setEditDrafts((d) => ({
                            ...d,
                            [t.id]: { ...d[t.id], w: currentW, l: Number(e.target.value), t: currentT },
                          }))
                        }
                        onKeyDown={(e) => e.key === 'Enter' && handleUpdateFndDimensions(t)}
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
                        onChange={(e) =>
                          setEditDrafts((d) => ({
                            ...d,
                            [t.id]: { ...d[t.id], w: currentW, l: currentL, t: Number(e.target.value) },
                          }))
                        }
                        onKeyDown={(e) => e.key === 'Enter' && handleUpdateFndDimensions(t)}
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
              } else if (activeTab === 'wall') {
                const currentThick = draft?.thickness_mm ?? t.parameters?.thickness_mm ?? 100
                const currentHeight = draft?.height_mm ?? t.parameters?.height_mm ?? 2800

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
                      <span
                        style={{
                          background: '#10b981',
                          color: '#fff',
                          fontWeight: 800,
                          fontSize: 14,
                          padding: '3px 10px',
                          borderRadius: 4,
                          fontFamily: 'monospace',
                        }}
                      >
                        {t.name}
                      </span>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{usageCount} แผงในแบบ</div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>หนา:</span>
                        <input
                          type="number"
                          step={10}
                          value={currentThick}
                          onChange={(e) =>
                            setEditDrafts((d) => ({
                              ...d,
                              [t.id]: { ...d[t.id], thickness_mm: Number(e.target.value), height_mm: currentHeight },
                            }))
                          }
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdateWallDimensions(t)}
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
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>สูง:</span>
                        <input
                          type="number"
                          step={100}
                          value={currentHeight}
                          onChange={(e) =>
                            setEditDrafts((d) => ({
                              ...d,
                              [t.id]: { ...d[t.id], thickness_mm: currentThick, height_mm: Number(e.target.value) },
                            }))
                          }
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdateWallDimensions(t)}
                          style={{
                            width: 75,
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
                      onClick={() => handleUpdateWallDimensions(t)}
                      style={{
                        background: '#10b981',
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
              } else if (activeTab === 'door') {
                const currentWidth = draft?.width_mm ?? t.parameters?.width_mm ?? 800
                const currentHeight = draft?.height_mm ?? t.parameters?.height_mm ?? 2000

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
                      <span
                        style={{
                          background: '#f97316',
                          color: '#fff',
                          fontWeight: 800,
                          fontSize: 14,
                          padding: '3px 10px',
                          borderRadius: 4,
                          fontFamily: 'monospace',
                        }}
                      >
                        {t.name}
                      </span>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{usageCount} บานในแบบ</div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>กว้าง:</span>
                        <input
                          type="number"
                          step={50}
                          value={currentWidth}
                          onChange={(e) =>
                            setEditDrafts((d) => ({
                              ...d,
                              [t.id]: { ...d[t.id], width_mm: Number(e.target.value), height_mm: currentHeight },
                            }))
                          }
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdateDoorDimensions(t)}
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
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>สูง:</span>
                        <input
                          type="number"
                          step={50}
                          value={currentHeight}
                          onChange={(e) =>
                            setEditDrafts((d) => ({
                              ...d,
                              [t.id]: { ...d[t.id], width_mm: currentWidth, height_mm: Number(e.target.value) },
                            }))
                          }
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdateDoorDimensions(t)}
                          style={{
                            width: 75,
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
                      onClick={() => handleUpdateDoorDimensions(t)}
                      style={{
                        background: '#f97316',
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
              } else if (activeTab === 'window') {
                const currentWidth = draft?.width_mm ?? t.parameters?.width_mm ?? 1200
                const currentHeight = draft?.height_mm ?? t.parameters?.height_mm ?? 1200
                const currentSill = draft?.sill_height_mm ?? t.parameters?.sill_height_mm ?? 900

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
                      <span
                        style={{
                          background: '#06b6d4',
                          color: '#fff',
                          fontWeight: 800,
                          fontSize: 14,
                          padding: '3px 10px',
                          borderRadius: 4,
                          fontFamily: 'monospace',
                        }}
                      >
                        {t.name}
                      </span>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{usageCount} บานในแบบ</div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>ก:</span>
                        <input
                          type="number"
                          step={50}
                          value={currentWidth}
                          onChange={(e) =>
                            setEditDrafts((d) => ({
                              ...d,
                              [t.id]: {
                                ...d[t.id],
                                width_mm: Number(e.target.value),
                                height_mm: currentHeight,
                                sill_height_mm: currentSill,
                              },
                            }))
                          }
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdateWindowDimensions(t)}
                          style={{
                            width: 60,
                            background: '#0f172a',
                            border: '1px solid #475569',
                            color: '#fff',
                            borderRadius: 4,
                            padding: '4px',
                            fontSize: 12,
                            fontWeight: 600,
                            textAlign: 'center',
                          }}
                        />
                      </div>

                      <span style={{ color: '#64748b' }}>×</span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>ส:</span>
                        <input
                          type="number"
                          step={50}
                          value={currentHeight}
                          onChange={(e) =>
                            setEditDrafts((d) => ({
                              ...d,
                              [t.id]: {
                                ...d[t.id],
                                width_mm: currentWidth,
                                height_mm: Number(e.target.value),
                                sill_height_mm: currentSill,
                              },
                            }))
                          }
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdateWindowDimensions(t)}
                          style={{
                            width: 60,
                            background: '#0f172a',
                            border: '1px solid #475569',
                            color: '#fff',
                            borderRadius: 4,
                            padding: '4px',
                            fontSize: 12,
                            fontWeight: 600,
                            textAlign: 'center',
                          }}
                        />
                      </div>

                      <span style={{ color: '#64748b' }}>|</span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>ธรณี:</span>
                        <input
                          type="number"
                          step={50}
                          value={currentSill}
                          onChange={(e) =>
                            setEditDrafts((d) => ({
                              ...d,
                              [t.id]: {
                                ...d[t.id],
                                width_mm: currentWidth,
                                height_mm: currentHeight,
                                sill_height_mm: Number(e.target.value),
                              },
                            }))
                          }
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdateWindowDimensions(t)}
                          style={{
                            width: 55,
                            background: '#0f172a',
                            border: '1px solid #475569',
                            color: '#fff',
                            borderRadius: 4,
                            padding: '4px',
                            fontSize: 12,
                            fontWeight: 600,
                            textAlign: 'center',
                          }}
                        />
                        <span style={{ fontSize: 11, color: '#64748b' }}>mm</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleUpdateWindowDimensions(t)}
                      style={{
                        background: '#06b6d4',
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
          <div
            style={{
              marginTop: 10,
              borderTop: '1px solid #1e293b',
              paddingTop: 16,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#38bdf8',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Plus size={16} /> เพิ่มประเภทใหม่ (+ New{' '}
              {activeTab === 'column'
                ? 'Column'
                : activeTab === 'beam'
                ? 'Beam'
                : activeTab === 'wall'
                ? 'Wall'
                : activeTab === 'door'
                ? 'Door'
                : activeTab === 'window'
                ? 'Window'
                : 'Footing'}{' '}
              Type)
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
                  placeholder={
                    activeTab === 'column'
                      ? 'เช่น C3, C-L'
                      : activeTab === 'beam'
                      ? 'เช่น B3, GB1'
                      : activeTab === 'wall'
                      ? 'เช่น W4, W-EXT'
                      : activeTab === 'door'
                      ? 'เช่น D4, D-MAIN'
                      : activeTab === 'window'
                      ? 'เช่น W4, WIN-01'
                      : 'เช่น F3, F-COMBINED'
                  }
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
                    style={{
                      width: 60,
                      background: '#0f172a',
                      border: '1px solid #475569',
                      color: '#fff',
                      borderRadius: 4,
                      padding: '4px',
                      fontSize: 12,
                    }}
                  />
                  <span style={{ color: '#64748b' }}>×</span>
                  <input
                    type="number"
                    step={50}
                    value={newColD}
                    onChange={(e) => setNewColD(Number(e.target.value))}
                    style={{
                      width: 60,
                      background: '#0f172a',
                      border: '1px solid #475569',
                      color: '#fff',
                      borderRadius: 4,
                      padding: '4px',
                      fontSize: 12,
                    }}
                  />
                </div>
              ) : activeTab === 'beam' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label style={{ fontSize: 12, color: '#94a3b8' }}>ขนาดหน้าตัดคาน (mm):</label>
                  <input
                    type="number"
                    step={50}
                    value={newBeamW}
                    onChange={(e) => setNewBeamW(Number(e.target.value))}
                    style={{
                      width: 60,
                      background: '#0f172a',
                      border: '1px solid #475569',
                      color: '#fff',
                      borderRadius: 4,
                      padding: '4px',
                      fontSize: 12,
                    }}
                  />
                  <span style={{ color: '#64748b' }}>×</span>
                  <input
                    type="number"
                    step={50}
                    value={newBeamD}
                    onChange={(e) => setNewBeamD(Number(e.target.value))}
                    style={{
                      width: 60,
                      background: '#0f172a',
                      border: '1px solid #475569',
                      color: '#fff',
                      borderRadius: 4,
                      padding: '4px',
                      fontSize: 12,
                    }}
                  />
                </div>
              ) : activeTab === 'wall' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label style={{ fontSize: 12, color: '#94a3b8' }}>หนา × สูง (mm):</label>
                  <input
                    type="number"
                    step={10}
                    value={newWallThick}
                    onChange={(e) => setNewWallThick(Number(e.target.value))}
                    style={{
                      width: 55,
                      background: '#0f172a',
                      border: '1px solid #475569',
                      color: '#fff',
                      borderRadius: 4,
                      padding: '4px',
                      fontSize: 12,
                    }}
                  />
                  <span style={{ color: '#64748b' }}>×</span>
                  <input
                    type="number"
                    step={100}
                    value={newWallHeight}
                    onChange={(e) => setNewWallHeight(Number(e.target.value))}
                    style={{
                      width: 65,
                      background: '#0f172a',
                      border: '1px solid #475569',
                      color: '#fff',
                      borderRadius: 4,
                      padding: '4px',
                      fontSize: 12,
                    }}
                  />
                </div>
              ) : activeTab === 'door' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label style={{ fontSize: 12, color: '#94a3b8' }}>กว้าง × สูง (mm):</label>
                  <input
                    type="number"
                    step={50}
                    value={newDoorWidth}
                    onChange={(e) => setNewDoorWidth(Number(e.target.value))}
                    style={{
                      width: 60,
                      background: '#0f172a',
                      border: '1px solid #475569',
                      color: '#fff',
                      borderRadius: 4,
                      padding: '4px',
                      fontSize: 12,
                    }}
                  />
                  <span style={{ color: '#64748b' }}>×</span>
                  <input
                    type="number"
                    step={50}
                    value={newDoorHeight}
                    onChange={(e) => setNewDoorHeight(Number(e.target.value))}
                    style={{
                      width: 65,
                      background: '#0f172a',
                      border: '1px solid #475569',
                      color: '#fff',
                      borderRadius: 4,
                      padding: '4px',
                      fontSize: 12,
                    }}
                  />
                </div>
              ) : activeTab === 'window' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <label style={{ fontSize: 12, color: '#94a3b8' }}>ก × ส | ธรณี (mm):</label>
                  <input
                    type="number"
                    step={50}
                    value={newWindowWidth}
                    onChange={(e) => setNewWindowWidth(Number(e.target.value))}
                    style={{
                      width: 55,
                      background: '#0f172a',
                      border: '1px solid #475569',
                      color: '#fff',
                      borderRadius: 4,
                      padding: '4px',
                      fontSize: 12,
                    }}
                  />
                  <span>×</span>
                  <input
                    type="number"
                    step={50}
                    value={newWindowHeight}
                    onChange={(e) => setNewWindowHeight(Number(e.target.value))}
                    style={{
                      width: 55,
                      background: '#0f172a',
                      border: '1px solid #475569',
                      color: '#fff',
                      borderRadius: 4,
                      padding: '4px',
                      fontSize: 12,
                    }}
                  />
                  <span>|</span>
                  <input
                    type="number"
                    step={50}
                    value={newWindowSill}
                    onChange={(e) => setNewWindowSill(Number(e.target.value))}
                    style={{
                      width: 50,
                      background: '#0f172a',
                      border: '1px solid #475569',
                      color: '#fff',
                      borderRadius: 4,
                      padding: '4px',
                      fontSize: 12,
                    }}
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
                    style={{
                      width: 55,
                      background: '#0f172a',
                      border: '1px solid #475569',
                      color: '#fff',
                      borderRadius: 4,
                      padding: '4px',
                      fontSize: 12,
                    }}
                  />
                  <span>×</span>
                  <input
                    type="number"
                    step={100}
                    value={newFndL}
                    onChange={(e) => setNewFndL(Number(e.target.value))}
                    style={{
                      width: 55,
                      background: '#0f172a',
                      border: '1px solid #475569',
                      color: '#fff',
                      borderRadius: 4,
                      padding: '4px',
                      fontSize: 12,
                    }}
                  />
                  <span>×</span>
                  <input
                    type="number"
                    step={50}
                    value={newFndT}
                    onChange={(e) => setNewFndT(Number(e.target.value))}
                    style={{
                      width: 50,
                      background: '#0f172a',
                      border: '1px solid #475569',
                      color: '#fff',
                      borderRadius: 4,
                      padding: '4px',
                      fontSize: 12,
                    }}
                  />
                </div>
              )}

              <button
                type="submit"
                style={{
                  background:
                    activeTab === 'wall'
                      ? '#10b981'
                      : activeTab === 'door'
                      ? '#f97316'
                      : activeTab === 'window'
                      ? '#06b6d4'
                      : activeTab === 'column'
                      ? '#0284c7'
                      : activeTab === 'beam'
                      ? '#a855f7'
                      : '#d97706',
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
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #1e293b',
            background: '#0b1329',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
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
