import React, { useState, useEffect } from 'react'
import {
  ProjectDocument,
  createEmptyProjectDocument,
  serializeProject,
  deserializeProject,
  Phase,
  isGridObject,
  isColumnObject,
  isFoundationObject,
  isBeamObject,
  isWallObject,
  isDoorObject,
  isWindowObject,
  DoorHanding,
} from '@constructflow/project-model'
import { CommandEnvelope } from '@constructflow/command-schema'
import { CommandBus } from './commands/CommandBus.js'
import { Toolbar, ToolType } from './components/Toolbar.js'
import { PlanCanvas } from './components/PlanCanvas.js'
import { PropertiesPanel } from './components/PropertiesPanel.js'
import { SyncBridgePanel } from './components/SyncBridgePanel.js'
import { TypeManagerModal } from './components/TypeManagerModal.js'
import { Building2, Layers, History, Layers2 } from 'lucide-react'

export const App: React.FC = () => {
  const [project, setProject] = useState<ProjectDocument>(() =>
    createEmptyProjectDocument('CF-PROJ-001', 'ConstructFlow Vertical Slice 01 & 02')
  )

  const [activeTool, setActiveTool] = useState<ToolType>('select')
  const [activeColumnType, setActiveColumnType] = useState<string>('C1')
  const [activeFoundationType, setActiveFoundationType] = useState<string>('F1')
  const [activeBeamType, setActiveBeamType] = useState<string>('B1')
  const [activeWallType, setActiveWallType] = useState<string>('W1')
  const [activeDoorType, setActiveDoorType] = useState<string>('D1')
  const [activeWindowType, setActiveWindowType] = useState<string>('W1')

  const [isTypeManagerOpen, setIsTypeManagerOpen] = useState<boolean>(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cursorCoords_mm, setCursorCoords_mm] = useState<[number, number]>([0, 0])
  const [snapKind, setSnapKind] = useState<string>('Free')
  const [commandQueue, setCommandQueue] = useState<CommandEnvelope[]>([])

  // Setup initial template model: Grids A, B, C & 1, 2, 3 + 9 Columns (C1) + 9 Footings (F1) + Beams (B1/B2) + Initial Walls/Door/Window
  useEffect(() => {
    let current = createEmptyProjectDocument('CF-PROJ-001', 'ConstructFlow Vertical Slice 01 & 02')
    current.levels = [
      { id: 'GF', name: 'Ground Floor', elevation_mm: 0, storey_index: 1, height_mm: 3000 },
      { id: 'L2', name: 'First Floor', elevation_mm: 3000, storey_index: 2, height_mm: 3000 },
    ]
    current.project.active_level_id = 'GF'

    const queue: CommandEnvelope[] = []

    // 1. Create Grids A, B, C (vertical) & 1, 2, 3 (horizontal)
    const grids = [
      { tag: 'A', orientation: 'vertical' as const, position_mm: 0 },
      { tag: 'B', orientation: 'vertical' as const, position_mm: 4000 },
      { tag: 'C', orientation: 'vertical' as const, position_mm: 8000 },
      { tag: '1', orientation: 'horizontal' as const, position_mm: 0 },
      { tag: '2', orientation: 'horizontal' as const, position_mm: 4000 },
      { tag: '3', orientation: 'horizontal' as const, position_mm: 8000 },
    ]

    for (const g of grids) {
      const res = CommandBus.execute(current, 'CreateGrid', g)
      if (res.result.status === 'success') {
        current = res.updatedProject
        if (res.emittedEnvelope) queue.push(res.emittedEnvelope)
      }
    }

    // 2. Create 9 Columns at intersections (A-1..C-3), all with Type Mark C1
    const intersections = [
      { x: 0, y: 0, mark: 'C1' },
      { x: 4000, y: 0, mark: 'C1' },
      { x: 8000, y: 0, mark: 'C1' },
      { x: 0, y: 4000, mark: 'C1' },
      { x: 4000, y: 4000, mark: 'C1' },
      { x: 8000, y: 4000, mark: 'C1' },
      { x: 0, y: 8000, mark: 'C1' },
      { x: 4000, y: 8000, mark: 'C1' },
      { x: 8000, y: 8000, mark: 'C1' },
    ]

    const columnIds: string[] = []

    for (const col of intersections) {
      const colId = crypto.randomUUID()
      const res = CommandBus.execute(current, 'CreateColumn', {
        id: colId,
        mark: col.mark,
        location_mm: [col.x, col.y, 0],
        section_mm: [200, 200],
        base_level_id: 'GF',
        top_level_id: 'L2',
      })
      if (res.result.status === 'success') {
        current = res.updatedProject
        columnIds.push(colId)
        if (res.emittedEnvelope) queue.push(res.emittedEnvelope)
      }
    }

    // 3. Create 9 Foundations hosting each column, all with Type Mark F1
    columnIds.forEach((colId) => {
      const fId = crypto.randomUUID()
      const fMark = 'F1'
      const res = CommandBus.execute(current, 'CreateFoundation', {
        id: fId,
        mark: fMark,
        supported_column_id: colId,
        size_mm: [800, 800, 300],
      })
      if (res.result.status === 'success') {
        current = res.updatedProject
        if (res.emittedEnvelope) queue.push(res.emittedEnvelope)
      }
    })

    // 4. Create initial Beams connecting columns along Grid lines
    const initialBeams = [
      { start: [0, 0], end: [4000, 0], mark: 'B1' },
      { start: [4000, 0], end: [8000, 0], mark: 'B1' },
      { start: [0, 4000], end: [4000, 4000], mark: 'B1' },
      { start: [4000, 4000], end: [8000, 4000], mark: 'B1' },
      { start: [0, 0], end: [0, 4000], mark: 'B2' },
      { start: [4000, 0], end: [4000, 4000], mark: 'B2' },
      { start: [8000, 0], end: [8000, 4000], mark: 'B2' },
    ]

    for (const b of initialBeams) {
      const bId = crypto.randomUUID()
      const res = CommandBus.execute(current, 'CreateBeam', {
        id: bId,
        mark: b.mark,
        start_point_mm: b.start,
        end_point_mm: b.end,
        level_id: 'GF',
      })
      if (res.result.status === 'success') {
        current = res.updatedProject
        if (res.emittedEnvelope) queue.push(res.emittedEnvelope)
      }
    }

    // 5. Create initial Wall with hosted Door and Window for Slice 02 showcase
    const wallId1 = crypto.randomUUID()
    const wallRes1 = CommandBus.execute(current, 'CreateWall', {
      id: wallId1,
      mark: 'W1',
      start_point_mm: [0, 4000, 0],
      end_point_mm: [4000, 4000, 0],
      thickness_mm: 100,
      height_mm: 2800,
      level_id: 'GF',
    })
    if (wallRes1.result.status === 'success') {
      current = wallRes1.updatedProject
      if (wallRes1.emittedEnvelope) queue.push(wallRes1.emittedEnvelope)

      // Add Door D1 on wall 1
      const doorId = crypto.randomUUID()
      const doorRes = CommandBus.execute(current, 'CreateDoor', {
        id: doorId,
        mark: 'D1',
        wall_id: wallId1,
        offset_along_wall_mm: 1400,
        location_mm: [1400, 4000, 0],
        handing: 'left_in',
        width_mm: 800,
        height_mm: 2000,
      })
      if (doorRes.result.status === 'success') {
        current = doorRes.updatedProject
        if (doorRes.emittedEnvelope) queue.push(doorRes.emittedEnvelope)
      }
    }

    const wallId2 = crypto.randomUUID()
    const wallRes2 = CommandBus.execute(current, 'CreateWall', {
      id: wallId2,
      mark: 'W1',
      start_point_mm: [4000, 4000, 0],
      end_point_mm: [8000, 4000, 0],
      thickness_mm: 100,
      height_mm: 2800,
      level_id: 'GF',
    })
    if (wallRes2.result.status === 'success') {
      current = wallRes2.updatedProject
      if (wallRes2.emittedEnvelope) queue.push(wallRes2.emittedEnvelope)

      // Add Window W1 on wall 2
      const winId = crypto.randomUUID()
      const winRes = CommandBus.execute(current, 'CreateWindow', {
        id: winId,
        mark: 'W1',
        wall_id: wallId2,
        offset_along_wall_mm: 2000,
        location_mm: [6000, 4000, 0],
        width_mm: 1200,
        height_mm: 1200,
        sill_height_mm: 900,
      })
      if (winRes.result.status === 'success') {
        current = winRes.updatedProject
        if (winRes.emittedEnvelope) queue.push(winRes.emittedEnvelope)
      }
    }

    setProject(current)
    setCommandQueue(queue)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 'Escape') {
        setActiveTool('select')
        setSelectedId(null)
      } else if (e.key === 's' || e.key === 'S') {
        setActiveTool('select')
      } else if (e.key === 'c' || e.key === 'C') {
        setActiveTool('column')
      } else if (e.key === 'f' || e.key === 'F') {
        setActiveTool('foundation')
      } else if (e.key === 'b' || e.key === 'B') {
        setActiveTool('beam')
      } else if (e.key === 'w' || e.key === 'W') {
        setActiveTool('wall')
      } else if (e.key === 'd' || e.key === 'D') {
        setActiveTool('door')
      } else if (e.key === 'n' || e.key === 'N') {
        setActiveTool('window')
      } else if (e.key === 'g' || e.key === 'G') {
        setActiveTool('grid')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Commit Column creation with active type
  const handleCommitColumn = (location_mm: [number, number]) => {
    const colId = crypto.randomUUID()
    const res = CommandBus.execute(project, 'CreateColumn', {
      id: colId,
      mark: activeColumnType,
      location_mm: [location_mm[0], location_mm[1], 0],
      base_level_id: project.project.active_level_id,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      setSelectedId(colId)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  // Commit Foundation creation with active type
  const handleCommitFoundation = (opts: { columnId?: string; location_mm?: [number, number] }) => {
    const fId = crypto.randomUUID()
    const res = CommandBus.execute(project, 'CreateFoundation', {
      id: fId,
      mark: activeFoundationType,
      supported_column_id: opts.columnId,
      location_mm: opts.location_mm ? [opts.location_mm[0], opts.location_mm[1], 0] : undefined,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      setSelectedId(fId)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  // Commit Beam creation with active type
  const handleCommitBeam = (
    start_point_mm: [number, number],
    end_point_mm: [number, number],
    startColId?: string,
    endColId?: string
  ) => {
    const beamId = crypto.randomUUID()
    const res = CommandBus.execute(project, 'CreateBeam', {
      id: beamId,
      mark: activeBeamType,
      start_point_mm: [start_point_mm[0], start_point_mm[1], 0],
      end_point_mm: [end_point_mm[0], end_point_mm[1], 0],
      start_column_id: startColId,
      end_column_id: endColId,
      level_id: project.project.active_level_id,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      setSelectedId(beamId)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  // Commit Wall creation with active type
  const handleCommitWall = (start_point_mm: [number, number], end_point_mm: [number, number]) => {
    const wallId = crypto.randomUUID()
    const res = CommandBus.execute(project, 'CreateWall', {
      id: wallId,
      mark: activeWallType,
      start_point_mm: [start_point_mm[0], start_point_mm[1], 0],
      end_point_mm: [end_point_mm[0], end_point_mm[1], 0],
      level_id: project.project.active_level_id,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      setSelectedId(wallId)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  // Commit Door creation hosted on wall
  const handleCommitDoor = (
    wallId: string,
    point_mm: [number, number],
    offset_mm: number,
    handing: DoorHanding
  ) => {
    const doorId = crypto.randomUUID()
    const res = CommandBus.execute(project, 'CreateDoor', {
      id: doorId,
      mark: activeDoorType,
      wall_id: wallId,
      offset_along_wall_mm: offset_mm,
      location_mm: [point_mm[0], point_mm[1], 0],
      handing,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      setSelectedId(doorId)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  // Commit Window creation hosted on wall
  const handleCommitWindow = (wallId: string, point_mm: [number, number], offset_mm: number) => {
    const winId = crypto.randomUUID()
    const res = CommandBus.execute(project, 'CreateWindow', {
      id: winId,
      mark: activeWindowType,
      wall_id: wallId,
      offset_along_wall_mm: offset_mm,
      location_mm: [point_mm[0], point_mm[1], 0],
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      setSelectedId(winId)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  // Flip Door Handing
  const handleFlipDoorHanding = (doorId: string) => {
    const res = CommandBus.execute(project, 'FlipDoorHanding', { object_id: doorId })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  // Assign instance type
  const handleAssignType = (objectId: string, typeName: string) => {
    const res = CommandBus.execute(project, 'AssignInstanceType', {
      object_id: objectId,
      type_name: typeName,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  // Update Type Dimensions (Cascades to all instances of this type)
  const handleUpdateTypeDimensions = (
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
  ) => {
    const res = CommandBus.execute(project, 'UpdateStructuralTypeDimensions', {
      type_id_or_name: typeName,
      type_name: typeName,
      object_type: objectType,
      section_mm: dimensions.section_mm,
      size_mm: dimensions.size_mm,
      thickness_mm: dimensions.thickness_mm,
      height_mm: dimensions.height_mm,
      width_mm: dimensions.width_mm,
      sill_height_mm: dimensions.sill_height_mm,
      parameters: dimensions,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  // Define new type in catalog
  const handleDefineType = (
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
  ) => {
    const res = CommandBus.execute(project, 'DefineStructuralType', {
      object_type: objectType,
      name,
      parameters,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  // Commit Grid creation
  const handleCommitGrid = (orientation: 'vertical' | 'horizontal', position_mm: number) => {
    const existing = Object.values(project.objects).filter(
      (o) => isGridObject(o) && o.module_data.orientation === orientation
    )
    const tag =
      orientation === 'vertical'
        ? String.fromCharCode(65 + existing.length)
        : String(existing.length + 1)

    const res = CommandBus.execute(project, 'CreateGrid', {
      id: crypto.randomUUID(),
      tag,
      orientation,
      position_mm,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  // Move Column handler (UUID stays identical!)
  const handleMoveColumn = (objectId: string, newLocation_mm: [number, number]) => {
    const res = CommandBus.execute(project, 'MoveColumn', {
      object_id: objectId,
      location_mm: [newLocation_mm[0], newLocation_mm[1], 0],
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  // Rename Column Mark handler
  const handleUpdateColumnMark = (objectId: string, newMark: string) => {
    const res = CommandBus.execute(project, 'UpdateColumnMark', {
      object_id: objectId,
      mark: newMark,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  // Rename Foundation Mark handler
  const handleUpdateFoundationMark = (objectId: string, newMark: string) => {
    const res = CommandBus.execute(project, 'UpdateFoundationMark', {
      object_id: objectId,
      mark: newMark,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  // Rename Grid Tag handler
  const handleUpdateGridTag = (objectId: string, newTag: string) => {
    const res = CommandBus.execute(project, 'UpdateGridTag', {
      object_id: objectId,
      tag: newTag,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  // Delete Object (cascades deletion of hosted openings if wall)
  const handleDeleteObject = (objectId: string) => {
    const res = CommandBus.execute(project, 'DeleteObject', { object_id: objectId })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      setSelectedId(null)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  // Export .cfproj file
  const handleExportProject = () => {
    const json = serializeProject(project)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.project.id || 'project'}.cfproj`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Counts & Schedule breakdown
  const columnCount = Object.values(project.objects).filter((o) => o.object_type === 'structure.column').length
  const foundationCount = Object.values(project.objects).filter((o) => o.object_type === 'structure.foundation').length
  const beamCount = Object.values(project.objects).filter((o) => o.object_type === 'structure.beam').length
  const wallCount = Object.values(project.objects).filter((o) => o.object_type === 'architecture.wall').length
  const doorCount = Object.values(project.objects).filter((o) => o.object_type === 'door_window.door').length
  const windowCount = Object.values(project.objects).filter((o) => o.object_type === 'door_window.window').length
  const gridCount = Object.values(project.objects).filter((o) => o.object_type === 'structure.grid').length

  const columnTypeCounts = Object.values(project.objects)
    .filter(isColumnObject)
    .reduce<Record<string, number>>((acc, col) => {
      const mark = col.module_data.mark || 'C1'
      acc[mark] = (acc[mark] || 0) + 1
      return acc
    }, {})

  const foundationTypeCounts = Object.values(project.objects)
    .filter(isFoundationObject)
    .reduce<Record<string, number>>((acc, fnd) => {
      const mark = fnd.module_data.mark || 'F1'
      acc[mark] = (acc[mark] || 0) + 1
      return acc
    }, {})

  const beamTypeCounts = Object.values(project.objects)
    .filter(isBeamObject)
    .reduce<Record<string, number>>((acc, beam) => {
      const mark = beam.module_data.mark || 'B1'
      acc[mark] = (acc[mark] || 0) + 1
      return acc
    }, {})

  const wallTypeCounts = Object.values(project.objects)
    .filter(isWallObject)
    .reduce<Record<string, number>>((acc, wall) => {
      const mark = wall.module_data.mark || 'W1'
      acc[mark] = (acc[mark] || 0) + 1
      return acc
    }, {})

  const doorTypeCounts = Object.values(project.objects)
    .filter(isDoorObject)
    .reduce<Record<string, number>>((acc, door) => {
      const mark = door.module_data.mark || 'D1'
      acc[mark] = (acc[mark] || 0) + 1
      return acc
    }, {})

  const windowTypeCounts = Object.values(project.objects)
    .filter(isWindowObject)
    .reduce<Record<string, number>>((acc, win) => {
      const mark = win.module_data.mark || 'W1'
      acc[mark] = (acc[mark] || 0) + 1
      return acc
    }, {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Top Header */}
      <header
        style={{
          height: 48,
          background: '#0f172a',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 'bold',
            }}
          >
            CF
          </div>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>ConstructFlow Plan</span>
            <span
              style={{
                fontSize: 11,
                color: '#38bdf8',
                marginLeft: 8,
                background: 'rgba(56,189,248,0.1)',
                padding: '2px 6px',
                borderRadius: 4,
              }}
            >
              Slice 01 & 02
            </span>
          </div>
        </div>

        {/* Level & Phase Selectors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Level Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8' }}>
            <Layers size={14} />
            <select
              value={project.project.active_level_id}
              onChange={(e) =>
                setProject((p) => ({
                  ...p,
                  project: { ...p.project, active_level_id: e.target.value },
                }))
              }
              style={{
                background: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                borderRadius: 4,
                padding: '4px 8px',
                fontSize: 12,
              }}
            >
              {project.levels.map((lvl) => (
                <option key={lvl.id} value={lvl.id}>
                  {lvl.name} ({lvl.elevation_mm >= 0 ? '+' : ''}
                  {lvl.elevation_mm} mm)
                </option>
              ))}
            </select>
          </div>

          {/* Phase Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8' }}>
            <History size={14} />
            <select
              value={project.project.active_phase}
              onChange={(e) =>
                setProject((p) => ({
                  ...p,
                  project: { ...p.project, active_phase: e.target.value as Phase },
                }))
              }
              style={{
                background: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                borderRadius: 4,
                padding: '4px 8px',
                fontSize: 12,
              }}
            >
              {project.phases.map((ph) => (
                <option key={ph.id} value={ph.id}>
                  {ph.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Sidebar: Structure & Architecture Schedule */}
        <aside
          style={{
            width: 210,
            background: '#0b1329',
            borderRight: '1px solid #1e293b',
            display: 'flex',
            flexDirection: 'column',
            padding: 12,
            gap: 10,
            overflowY: 'auto',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
            BIM Element Schedule
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Grids */}
            <div style={{ padding: '8px', background: '#1e293b', borderRadius: 6, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontWeight: 600 }}>
                <span>Grids (แกนเสา)</span>
                <span style={{ color: '#38bdf8' }}>{gridCount} เส้น</span>
              </div>
            </div>

            {/* Columns Breakdown */}
            <div style={{ padding: '8px', background: '#1e293b', borderRadius: 6, fontSize: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: '#cbd5e1',
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                <span>Columns (เสา)</span>
                <span style={{ color: '#38bdf8' }}>{columnCount} ต้น</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 4 }}>
                {Object.keys(columnTypeCounts).length === 0 ? (
                  <span style={{ color: '#64748b', fontSize: 11 }}>ไม่มีเสา</span>
                ) : (
                  Object.entries(columnTypeCounts)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([mark, count]) => (
                      <div
                        key={mark}
                        style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}
                      >
                        <span style={{ fontWeight: 600, color: '#38bdf8' }}>{mark}</span>
                        <span>{count} ต้น</span>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Footings Breakdown */}
            <div style={{ padding: '8px', background: '#1e293b', borderRadius: 6, fontSize: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: '#cbd5e1',
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                <span>Footings (ฐานราก)</span>
                <span style={{ color: '#f59e0b' }}>{foundationCount} ฐาน</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 4 }}>
                {Object.keys(foundationTypeCounts).length === 0 ? (
                  <span style={{ color: '#64748b', fontSize: 11 }}>ไม่มีฐานราก</span>
                ) : (
                  Object.entries(foundationTypeCounts)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([mark, count]) => (
                      <div
                        key={mark}
                        style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}
                      >
                        <span style={{ fontWeight: 600, color: '#f59e0b' }}>{mark}</span>
                        <span>{count} ฐาน</span>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Beams Breakdown */}
            <div style={{ padding: '8px', background: '#1e293b', borderRadius: 6, fontSize: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: '#cbd5e1',
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                <span>Beams (คาน)</span>
                <span style={{ color: '#a855f7' }}>{beamCount} ช่วง</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 4 }}>
                {Object.keys(beamTypeCounts).length === 0 ? (
                  <span style={{ color: '#64748b', fontSize: 11 }}>ไม่มีคาน</span>
                ) : (
                  Object.entries(beamTypeCounts)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([mark, count]) => (
                      <div
                        key={mark}
                        style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}
                      >
                        <span style={{ fontWeight: 600, color: '#a855f7' }}>{mark}</span>
                        <span>{count} ช่วง</span>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Walls Breakdown */}
            <div style={{ padding: '8px', background: '#1e293b', borderRadius: 6, fontSize: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: '#cbd5e1',
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                <span>Walls (ผนัง)</span>
                <span style={{ color: '#10b981' }}>{wallCount} แผง</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 4 }}>
                {Object.keys(wallTypeCounts).length === 0 ? (
                  <span style={{ color: '#64748b', fontSize: 11 }}>ไม่มีผนัง</span>
                ) : (
                  Object.entries(wallTypeCounts)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([mark, count]) => (
                      <div
                        key={mark}
                        style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}
                      >
                        <span style={{ fontWeight: 600, color: '#10b981' }}>{mark}</span>
                        <span>{count} แผง</span>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Doors Breakdown */}
            <div style={{ padding: '8px', background: '#1e293b', borderRadius: 6, fontSize: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: '#cbd5e1',
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                <span>Doors (ประตู)</span>
                <span style={{ color: '#f97316' }}>{doorCount} บาน</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 4 }}>
                {Object.keys(doorTypeCounts).length === 0 ? (
                  <span style={{ color: '#64748b', fontSize: 11 }}>ไม่มีประตู</span>
                ) : (
                  Object.entries(doorTypeCounts)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([mark, count]) => (
                      <div
                        key={mark}
                        style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}
                      >
                        <span style={{ fontWeight: 600, color: '#f97316' }}>{mark}</span>
                        <span>{count} บาน</span>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Windows Breakdown */}
            <div style={{ padding: '8px', background: '#1e293b', borderRadius: 6, fontSize: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: '#cbd5e1',
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                <span>Windows (หน้าต่าง)</span>
                <span style={{ color: '#06b6d4' }}>{windowCount} บาน</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 4 }}>
                {Object.keys(windowTypeCounts).length === 0 ? (
                  <span style={{ color: '#64748b', fontSize: 11 }}>ไม่มีหน้าต่าง</span>
                ) : (
                  Object.entries(windowTypeCounts)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([mark, count]) => (
                      <div
                        key={mark}
                        style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}
                      >
                        <span style={{ fontWeight: 600, color: '#06b6d4' }}>{mark}</span>
                        <span>{count} บาน</span>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 'auto', fontSize: 10, color: '#64748b', lineHeight: 1.4 }}>
            <b>Vertical Slice 01 & 02:</b>
            <br />
            Grids → Columns → Footings → Beams → Walls → Openings (Doors/Windows) → SketchUp Sync
          </div>
        </aside>

        {/* Center Canvas Area */}
        <main style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {/* Floating Tool Bar */}
          <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
            <Toolbar
              activeTool={activeTool}
              onSelectTool={setActiveTool}
              activeColumnType={activeColumnType}
              onChangeActiveColumnType={setActiveColumnType}
              activeFoundationType={activeFoundationType}
              onChangeActiveFoundationType={setActiveFoundationType}
              activeBeamType={activeBeamType}
              onChangeActiveBeamType={setActiveBeamType}
              activeWallType={activeWallType}
              onChangeActiveWallType={setActiveWallType}
              activeDoorType={activeDoorType}
              onChangeActiveDoorType={setActiveDoorType}
              activeWindowType={activeWindowType}
              onChangeActiveWindowType={setActiveWindowType}
              columnTypes={(project.types || [])
                .filter((t) => t.object_type === 'structure.column')
                .map((t) => ({ name: t.name, section_mm: t.parameters?.section_mm }))}
              foundationTypes={(project.types || [])
                .filter((t) => t.object_type === 'structure.foundation')
                .map((t) => ({ name: t.name, size_mm: t.parameters?.size_mm }))}
              beamTypes={(project.types || [])
                .filter((t) => t.object_type === 'structure.beam')
                .map((t) => ({ name: t.name, section_mm: t.parameters?.section_mm }))}
              wallTypes={(project.types || [])
                .filter((t) => t.object_type === 'architecture.wall')
                .map((t) => ({ name: t.name, thickness_mm: t.parameters?.thickness_mm }))}
              doorTypes={(project.types || [])
                .filter((t) => t.object_type === 'door_window.door')
                .map((t) => ({ name: t.name, width_mm: t.parameters?.width_mm, height_mm: t.parameters?.height_mm }))}
              windowTypes={(project.types || [])
                .filter((t) => t.object_type === 'door_window.window')
                .map((t) => ({ name: t.name, width_mm: t.parameters?.width_mm, height_mm: t.parameters?.height_mm }))}
              onOpenTypeManager={() => setIsTypeManagerOpen(true)}
            />
          </div>

          {/* Interactive Plan Canvas */}
          <div style={{ flex: 1, position: 'relative' }}>
            <PlanCanvas
              project={project}
              activeTool={activeTool}
              activeColumnTypeMark={activeColumnType}
              activeFoundationTypeMark={activeFoundationType}
              activeBeamTypeMark={activeBeamType}
              activeWallTypeMark={activeWallType}
              activeDoorTypeMark={activeDoorType}
              activeWindowTypeMark={activeWindowType}
              selectedId={selectedId}
              onSelectObject={setSelectedId}
              onCommitColumn={handleCommitColumn}
              onCommitFoundation={handleCommitFoundation}
              onCommitBeam={handleCommitBeam}
              onCommitWall={handleCommitWall}
              onCommitDoor={handleCommitDoor}
              onCommitWindow={handleCommitWindow}
              onCommitGrid={handleCommitGrid}
              onMoveColumn={handleMoveColumn}
              onCursorChange={(coords, kind) => {
                setCursorCoords_mm(coords)
                setSnapKind(kind)
              }}
            />
          </div>

          {/* Bottom Coordinate Bar */}
          <footer
            style={{
              height: 28,
              background: '#0b1329',
              borderTop: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px',
              fontSize: 11,
              color: '#94a3b8',
              fontFamily: 'monospace',
            }}
          >
            <div style={{ display: 'flex', gap: 16 }}>
              <span>
                X: <b>{Math.round(cursorCoords_mm[0])} mm</b>
              </span>
              <span>
                Y: <b>{Math.round(cursorCoords_mm[1])} mm</b>
              </span>
              <span style={{ color: snapKind === 'Free' ? '#64748b' : '#38bdf8' }}>
                Snap: <b>{snapKind}</b>
              </span>
            </div>
            <div>
              <span>
                W: Wall • D: Door (Space: Flip) • N: Window • C: Column • F: Footing • B: Beam • Scroll: Zoom • MMB: Pan
              </span>
            </div>
          </footer>
        </main>

        {/* Right Inspector & Sync Sidebar */}
        <aside
          style={{
            width: 320,
            background: '#0f172a',
            borderLeft: '1px solid #1e293b',
            display: 'flex',
            flexDirection: 'column',
            padding: 14,
            gap: 16,
            overflowY: 'auto',
          }}
        >
          <PropertiesPanel
            project={project}
            selectedId={selectedId}
            onAssignType={handleAssignType}
            onUpdateColumnMark={handleUpdateColumnMark}
            onUpdateFoundationMark={handleUpdateFoundationMark}
            onUpdateGridTag={handleUpdateGridTag}
            onFlipDoorHanding={handleFlipDoorHanding}
            onOpenTypeManager={() => setIsTypeManagerOpen(true)}
            onAddFoundation={(colId) => handleCommitFoundation({ columnId: colId })}
            onDeleteObject={handleDeleteObject}
          />

          <SyncBridgePanel
            commandQueue={commandQueue}
            onClearQueue={() => setCommandQueue([])}
            onExportProject={handleExportProject}
          />
        </aside>
      </div>

      {/* BIM Type Manager Modal */}
      <TypeManagerModal
        isOpen={isTypeManagerOpen}
        onClose={() => setIsTypeManagerOpen(false)}
        project={project}
        onUpdateTypeDimensions={handleUpdateTypeDimensions}
        onDefineType={handleDefineType}
      />
    </div>
  )
}
