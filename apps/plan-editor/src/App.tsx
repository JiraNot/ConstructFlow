import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react'
import {
  ProjectDocument,
  TypeDefinition,
  createEmptyProjectDocument,
  serializeProject,
  Phase,
  RemovalPhase,
  isGridObject,
  isColumnObject,
  isFoundationObject,
  isBeamObject,
  isWallObject,
  isDoorObject,
  isWindowObject,
  DoorHanding,
  PlacementReference,
} from '@constructflow/project-model'
import { CommandEnvelope, CommandRequest } from '@constructflow/command-schema'
import { CommandBus, ProjectCommandSession } from './commands/CommandBus.js'
import { Toolbar, ToolType } from './components/Toolbar.js'
import { PlanCanvas } from './components/PlanCanvas.js'
import { PropertiesPanel } from './components/PropertiesPanel.js'
import { SettingsModal } from './components/SettingsModal.js'
import { TOOL_FAMILIES } from './components/catalogPresentation.js'
import { TypeManagerModal } from './components/TypeManagerModal.js'
import { UnderlayCalibrationModal } from './components/UnderlayCalibrationModal.js'
import { ExtensionPresetsModal } from './components/ExtensionPresetsModal.js'
import { ProjectLegalModal } from './components/ProjectLegalModal.js'
import { exportProjectToDxf } from '@constructflow/cad-adapter'
import { exportProjectToIfc } from '@constructflow/bim-adapter'
import type { ProjectLegalMetadata } from '@constructflow/project-model'
import { UnderlayConfig } from './rendering/planRenderer.js'
import { Building2, Layers, History, Layers2, Ruler, ArrowUpDown, Sparkles, Undo2, Redo2, FolderOpen, Save, Download, CookingPot, FileCheck, MoreHorizontal } from 'lucide-react'
import { calculateTakeoff } from '@constructflow/takeoff-engine'
import { createKitchenProofProject } from '@constructflow/extension-engine'
import { renderPermitDrawingSetHtml } from '@constructflow/sheet-engine'
import { readProjectFile, writeProjectFile, type LocalProjectFileHandle } from './projectFileIO.js'

const headerActionStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  background: '#1e293b',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: 4,
  padding: '4px 7px',
  fontSize: 11,
  cursor: 'pointer',
}

const takeoffCostCenterLabels: Record<string, string> = {
  demolition_site_prep: 'รื้อถอน/เตรียมพื้นที่',
  new_construction: 'งานสร้างใหม่',
  existing_to_remain: 'ของเดิมคงอยู่',
  remodeling_joint_treatment: 'รอยต่อเดิม–ใหม่',
}

const Model3DViewport = lazy(() => import('./components/Model3DViewport.js').then(module => ({ default: module.Model3DViewport })))
const ConstructionWorkbench=lazy(()=>import('./components/ConstructionWorkbench.js').then(m=>({default:m.ConstructionWorkbench})))

type ProjectSaveWindow = Window & {
  showOpenFilePicker?: (options: {
    multiple?: boolean
    types: Array<{ description: string; accept: Record<string, string[]> }>
  }) => Promise<LocalProjectFileHandle[]>
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: Array<{ description: string; accept: Record<string, string[]> }>
  }) => Promise<LocalProjectFileHandle>
}

export const App: React.FC = () => {
  const [project, setProjectState] = useState<ProjectDocument>(() =>
    createEmptyProjectDocument('CF-PROJ-001', 'ConstructFlow Vertical Slice 01 & 02')
  )
  const projectJson = useMemo(() => serializeProject(project), [project])
  const [savedProjectJson, setSavedProjectJson] = useState<string | null>(null)
  const [replacementBaselineJson, setReplacementBaselineJson] = useState<string | null>(null)
  const [fileFeedback, setFileFeedback] = useState('')
  const supportsProjectFileOpen = typeof (window as ProjectSaveWindow).showOpenFilePicker === 'function'
  const hasUnsavedChanges = savedProjectJson !== projectJson
  const projectSessionRef = useRef<ProjectCommandSession | null>(null)
  const projectFileHandleRef = useRef<LocalProjectFileHandle | null>(null)
  if (!projectSessionRef.current) projectSessionRef.current = new ProjectCommandSession(project)
  const setProject = (next: ProjectDocument | ((current: ProjectDocument) => ProjectDocument)) => {
    const updated = typeof next === 'function' ? next(project) : next
    projectSessionRef.current!.commit(updated)
    setProjectState(updated)
  }
  const dispatchCommandBatch = (commands: CommandRequest[]) => {
    const result = projectSessionRef.current!.execute(commands)
    if (result.status === 'success') {
      setProjectState(result.updatedProject)
      if (result.emittedEnvelopes.length > 0) {
        setCommandQueue((queue) => [...queue, ...result.emittedEnvelopes])
      }
    }
    return result
  }

  const [activeTool, setActiveTool] = useState<ToolType>('select')
  const [viewMode, setViewMode] = useState<'plan' | 'model3d'>('plan')
  const [rightPanelTab, setRightPanelTab] = useState<'properties' | 'quantities' | 'objects'>('properties')
  const [activeColumnType, setActiveColumnType] = useState<string>('C1')
  const [activeFoundationType, setActiveFoundationType] = useState<string>('F1')
  const [activeBeamType, setActiveBeamType] = useState<string>('B1')
  const [activeWallType, setActiveWallType] = useState<string>('W1')
  const [activeDoorType, setActiveDoorType] = useState<string>('D1')
  const [activeWindowType, setActiveWindowType] = useState<string>('W1')
  const previousTypesRef = useRef(project.types)
  useEffect(() => {
    const entries: Array<[string, string, (value: string) => void]> = [
      ['structure.column', activeColumnType, setActiveColumnType],
      ['structure.foundation', activeFoundationType, setActiveFoundationType],
      ['structure.beam', activeBeamType, setActiveBeamType],
      ['architecture.wall', activeWallType, setActiveWallType],
      ['door_window.door', activeDoorType, setActiveDoorType],
      ['door_window.window', activeWindowType, setActiveWindowType],
    ]
    for (const [family, name, setName] of entries) {
      if (project.types.some(type => type.object_type === family && type.name === name)) continue
      const previous = previousTypesRef.current.find(type => type.object_type === family && type.name === name)
      const next = project.types.find(type => type.id === previous?.id)
        ?? project.types.find(type => type.object_type === family)
      if (next) setName(next.name)
    }
    previousTypesRef.current = project.types
  }, [project.types])

  const [catalogContext,setCatalogContext] = useState<{family?:string;typeId?:string;edit?:boolean;intent:'draw'|'assign'}>({intent:'draw'})
  const [isSettingsOpen,setIsSettingsOpen] = useState(false)
  const [inspectorOpen,setInspectorOpen] = useState(true)
  const [workbenchTab,setWorkbenchTab] = useState<'model'|'sheets'>('model')
  const [isTypeManagerOpen, setIsTypeManagerOpen] = useState<boolean>(false)
  const [isConstructionOpen,setIsConstructionOpen]=useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cursorCoords_mm, setCursorCoords_mm] = useState<[number, number]>([0, 0])
  const [snapKind, setSnapKind] = useState<string>('Free')
  const [commandQueue, setCommandQueue] = useState<CommandEnvelope[]>([])

  // Underlay & Calibration State
  const [underlay, setUnderlay] = useState<UnderlayConfig>({
    image: null,
    origin_mm: [0, 0],
    scale_mm_per_px: 10,
    opacity: 0.6,
    visible: true,
  })
  const [calibrationModalOpen, setCalibrationModalOpen] = useState<boolean>(false)
  const [measuredCalibrationDist_mm, setMeasuredCalibrationDist_mm] = useState<number>(4000)
  const [isPresetsModalOpen, setIsPresetsModalOpen] = useState<boolean>(false)
  const [isLegalModalOpen, setIsLegalModalOpen] = useState<boolean>(false)

  useEffect(() => {
    if (!hasUnsavedChanges) return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [hasUnsavedChanges])

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

    projectSessionRef.current!.reset(current)
    setProjectState(current)
    setReplacementBaselineJson(serializeProject(current))
    setCommandQueue(queue)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleExportProject()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        const session = projectSessionRef.current!
        if (e.shiftKey) {
          if (session.canRedo) {
            setProjectState(session.redo())
            setCommandQueue([])
          }
        } else if (session.canUndo) {
          setProjectState(session.undo())
          setCommandQueue([])
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        const session = projectSessionRef.current!
        if (session.canRedo) {
          setProjectState(session.redo())
          setCommandQueue([])
        }
      } else if (e.key === 'Escape') {
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
      } else if (e.key === 'r' || e.key === 'R') {
        setActiveTool('calibrate')
      } else if (e.key === 't' || e.key === 'T') {
        setActiveTool('stair')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Update Object Phase (Existing / Demolition / New Construction)
  const handleUpdateObjectPhase = (objectId: string, newPhase: Phase) => {
    const res = CommandBus.execute(project, 'UpdateObjectPhase', {
      object_id: objectId,
      created_phase: newPhase,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  const handleUpdateObjectRemovalPhase = (objectId: string, removedPhase: RemovalPhase | null) => {
    const res = CommandBus.execute(project, 'UpdateObjectPhase', {
      object_id: objectId,
      removed_phase: removedPhase,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  const handleSetWorkingPhase = (phase: Phase) => {
    const res = CommandBus.execute(project, 'SetWorkingPhase', { phase })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  const handleSetWorkingLevel = (levelId: string) => {
    const res = CommandBus.execute(project, 'SetWorkingLevel', { level_id: levelId })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  // Upload Underlay Image file
  const handleUploadUnderlayImage = (file: File) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      setUnderlay((prev) => ({
        ...prev,
        image: img,
        origin_mm: [0, 0],
        scale_mm_per_px: 10,
        visible: true,
      }))
    }
    img.src = url
  }

  // Apply calibrated 1:1 scale
  const handleApplyCalibrationScale = (newScale: number, _realDistance_mm: number) => {
    setUnderlay((prev) => ({
      ...prev,
      scale_mm_per_px: newScale,
    }))
    setActiveTool('select')
  }

  // Update floor-to-floor storey height
  const handleUpdateStoryHeight = (height_mm: number) => {
    dispatchCommandBatch([
      { name: 'UpdateLevel', input: { id: 'GF', height_mm } },
      { name: 'UpdateLevel', input: { id: 'L2', elevation_mm: height_mm } },
    ])
  }

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
    endColId?: string,
    placementReference: PlacementReference = 'centerline'
  ) => {
    const beamId = crypto.randomUUID()
    const res = CommandBus.execute(project, 'CreateBeam', {
      id: beamId,
      mark: activeBeamType,
      placement_reference: placementReference,
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
  const handleCommitWall = (start_point_mm: [number, number], end_point_mm: [number, number], placementReference: PlacementReference = 'centerline') => {
    const wallId = crypto.randomUUID()
    const res = CommandBus.execute(project, 'CreateWall', {
      id: wallId,
      mark: activeWallType,
      placement_reference: placementReference,
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
    const activeType = project.types?.find(
      (t) => t.object_type === 'door_window.door' && t.name.toLowerCase() === activeDoorType.toLowerCase()
    )
    const width_mm = activeType?.parameters.width_mm || 800
    const height_mm = activeType?.parameters.height_mm || 2000

    const res = CommandBus.execute(project, 'CreateDoor', {
      id: doorId,
      mark: activeDoorType,
      wall_id: wallId,
      offset_along_wall_mm: offset_mm,
      location_mm: [point_mm[0], point_mm[1], 0],
      width_mm,
      height_mm,
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
    const activeType = project.types?.find(
      (t) => t.object_type === 'door_window.window' && t.name.toLowerCase() === activeWindowType.toLowerCase()
    )
    const width_mm = activeType?.parameters.width_mm || 1200
    const height_mm = activeType?.parameters.height_mm || 1200
    const sill_height_mm = activeType?.parameters.sill_height_mm || 900

    const res = CommandBus.execute(project, 'CreateWindow', {
      id: winId,
      mark: activeWindowType,
      wall_id: wallId,
      offset_along_wall_mm: offset_mm,
      location_mm: [point_mm[0], point_mm[1], 0],
      width_mm,
      height_mm,
      sill_height_mm,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      setSelectedId(winId)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  // Commit Stair creation
  const handleCommitStair = (location_mm: [number, number]) => {
    const stairId = crypto.randomUUID()
    const res = CommandBus.execute(project, 'CreateStair', {
      id: stairId,
      mark: 'ST1',
      stair_type: 'straight',
      structure_type: 'rc_monolithic',
      start_point_mm: [location_mm[0], location_mm[1], 0],
      total_rise_mm: 3000,
      width_mm: 1000,
      num_risers: 17,
      riser_height_mm: 176.5,
      tread_depth_mm: 250,
      landing_depth_mm: 1000,
      has_handrail: true,
      handrail_height_mm: 900,
      level_id: project.project.active_level_id || 'GF',
      created_phase: project.project.active_phase || 'new_construction',
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      setSelectedId(stairId)
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
    const object = project.objects[objectId]
    if (!object) return
    const type = project.types.find((candidate) =>
      candidate.object_type === object.object_type &&
      (candidate.id.toLowerCase() === typeName.toLowerCase() || candidate.name.toLowerCase() === typeName.toLowerCase())
    )
    if (!type) return
    const res = CommandBus.execute(project, 'AssignInstanceType', {
      object_id: objectId,
      type_id: type.id,
      type_name: type.name,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  const syncRenamedActiveType = (type: TypeDefinition, name: string) => {
    const entries: Array<[string,string,(value:string)=>void]> = [
      ['structure.column',activeColumnType,setActiveColumnType], ['structure.foundation',activeFoundationType,setActiveFoundationType],
      ['structure.beam',activeBeamType,setActiveBeamType], ['architecture.wall',activeWallType,setActiveWallType],
      ['door_window.door',activeDoorType,setActiveDoorType], ['door_window.window',activeWindowType,setActiveWindowType],
    ]
    for(const [family,value,setValue] of entries) if(family===type.object_type && value===type.name) setValue(name)
  }
  const openCatalog = (edit=false, fromSelection=false, familyOverride?:string) => {
    const object = fromSelection && selectedId ? project.objects[selectedId] : null
    const family = familyOverride ?? object?.object_type ?? TOOL_FAMILIES[activeTool] ?? 'structure.column'
    const marks:Record<string,string> = {column:activeColumnType,foundation:activeFoundationType,beam:activeBeamType,wall:activeWallType,door:activeDoorType,window:activeWindowType}
    const data = object?.module_data as Record<string,unknown> | undefined
    const type = project.types.find(t=>t.object_type===family && (data ? t.id===data.type_id || t.name===data.mark : t.name===marks[activeTool]))
    setCatalogContext({family,typeId:type?.id,edit,intent:object?'assign':'draw'})
    setIsTypeManagerOpen(true)
  }
  const chooseCatalogType = (type:TypeDefinition) => {
    if(catalogContext.intent==='assign' && selectedId) { handleAssignType(selectedId,type.id); return }
    const tool = Object.entries(TOOL_FAMILIES).find(([,family])=>family===type.object_type)?.[0] as ToolType | undefined
    if(!tool) return
    const setters:Record<string,(value:string)=>void> = {column:setActiveColumnType,foundation:setActiveFoundationType,beam:setActiveBeamType,wall:setActiveWallType,door:setActiveDoorType,window:setActiveWindowType}
    setters[tool](type.name);setActiveTool(tool)
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

  // Apply 1-Click Extension Preset (atomic batch of SmartObjects)
  const handleApplyExtensionPreset = (updatedProject: ProjectDocument, envelopes: CommandEnvelope[]) => {
    setProject(updatedProject)
    setCommandQueue((q) => [...q, ...envelopes])
  }

  // Move Column handler (UUID stays identical!)
  const handleMoveColumn = (objectId: string, newLocation_mm: [number, number]): boolean => {
    const res = CommandBus.execute(project, 'MoveColumn', {
      object_id: objectId,
      location_mm: newLocation_mm,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
      return true
    }
    return false
  }

  const handleMoveWall = (objectId: string, delta_mm: [number, number]): boolean => {
    const res = CommandBus.execute(project, 'MoveWall', { object_id: objectId, delta_mm })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
      return true
    }
    return false
  }

  const handleMoveFoundation = (objectId: string, center_mm: [number, number]): boolean => {
    const foundation = project.objects[objectId]
    if (!foundation || foundation.object_type !== 'structure.foundation') return false
    const data = foundation.module_data as Record<string, unknown>
    const supportedColumnId = typeof data.supported_column_id === 'string'
      ? data.supported_column_id
      : foundation.host_refs.find(hostId => project.objects[hostId]?.object_type === 'structure.column')
    const column = supportedColumnId ? project.objects[supportedColumnId] : undefined
    if (!column || column.object_type !== 'structure.column') return false
    const columnData = column.module_data as Record<string, unknown>
    const location = columnData.location_mm as number[]
    const currentCenter = data.center_mm as number[]
    const deltaX = center_mm[0] - currentCenter[0]
    const deltaY = center_mm[1] - currentCenter[1]
    return handleMoveColumn(column.id, [location[0] + deltaX, location[1] + deltaY])
  }

  const handleMoveOpening = (objectId: string, offset_along_wall_mm: number): boolean => {
    const res = CommandBus.execute(project, 'MoveOpening', { object_id: objectId, offset_along_wall_mm })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
      return true
    }
    return false
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

  const confirmReplaceUnsavedProject = () => {
    const hasProjectEdits = replacementBaselineJson !== null && projectJson !== replacementBaselineJson
    return !hasProjectEdits || window.confirm('มีการแก้ไขโครงการที่ยังไม่ได้บันทึก ต้องการทิ้งการแก้ไขและแทนที่โครงการปัจจุบันหรือไม่?')
  }

  // Export .cfproj file
  const handleDownloadProjectCopy = () => {
    const json = projectJson
    const filename = `${project.project.id || 'project'}.cfproj`
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setFileFeedback(`ส่งคำขอดาวน์โหลด ${filename} แล้ว`)
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const handleExportProject = async () => {
    const json = projectJson
    const filename = `${project.project.id || 'project'}.cfproj`
    const fileWindow = window as ProjectSaveWindow
    let handle = projectFileHandleRef.current
    if (!handle && fileWindow.showSaveFilePicker) {
      try {
        handle = await fileWindow.showSaveFilePicker.call(window, {
          suggestedName: filename,
          types: [{ description: 'ConstructFlow Project', accept: { 'application/json': ['.cfproj'] } }],
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        window.alert(`บันทึกไฟล์โครงการไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
        return
      }
    }
    if (handle) {
      try {
        await writeProjectFile(handle, json)
        projectFileHandleRef.current = handle
        setSavedProjectJson(json)
        setReplacementBaselineJson(json)
        setFileFeedback('บันทึกไฟล์โครงการแล้ว')
      } catch (error) {
        window.alert(`บันทึกไฟล์โครงการไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
      }
      return
    }
    handleDownloadProjectCopy()
  }

  const handleExportTakeoff = () => {
    const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
    const rows = [
      ['Cost center', 'Phase', 'Mark', 'Object type', 'Material', 'Quantity', 'Unit', 'Formula', 'Source UUIDs'],
      ...takeoff.lines.map((line) => [
        line.cost_center, line.phase, line.mark, line.object_type, line.material ?? '',
        line.quantity.toFixed(3), line.unit, line.formula, line.source_object_ids.join('; '),
      ]),
    ]
    const csv = `\uFEFF${rows.map((row) => row.map(escape).join(',')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${project.project.id || 'project'}-takeoff.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleExportDrawingSet = () => {
    const html = renderPermitDrawingSetHtml(project)
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
    const preview = window.open(url, '_blank')
    if (!preview) {
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${project.project.id || 'project'}-A02-S01-A08.html`
      anchor.click()
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const handleOpenProject = async (file?: File, fileHandle: LocalProjectFileHandle | null = null) => {
    if (!file) return
    try {
      const { project: loaded, serialized: loadedJson } = await readProjectFile(file)
      if (!confirmReplaceUnsavedProject()) return
      projectSessionRef.current!.reset(loaded)
      projectFileHandleRef.current = fileHandle
      setProjectState(loaded)
      setSavedProjectJson(loadedJson)
      setReplacementBaselineJson(loadedJson)
      setFileFeedback(`เปิดไฟล์ ${file.name} แล้ว`)
      setCommandQueue([])
      setSelectedId(null)
    } catch (error) {
      window.alert(`เปิดไฟล์โครงการไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleChooseProject = async () => {
    const fileWindow = window as ProjectSaveWindow
    if (!fileWindow.showOpenFilePicker) return
    try {
      const handles = await fileWindow.showOpenFilePicker.call(window, {
        multiple: false,
        types: [{ description: 'ConstructFlow Project', accept: { 'application/json': ['.cfproj'] } }],
      })
      const handle = handles[0]
      if (handle) await handleOpenProject(await handle.getFile(), handle)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      window.alert(`เปิดไฟล์โครงการไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleStartKitchenProof = () => {
    if (!confirmReplaceUnsavedProject()) return
    const generated = createKitchenProofProject()
    if (generated.status !== 'success') {
      window.alert(`สร้างโมเดลครัวพิสูจน์ไม่สำเร็จ: ${generated.errors?.join('; ') ?? 'unknown error'}`)
      return
    }
    projectSessionRef.current!.reset(generated.updatedProject)
    projectFileHandleRef.current = null
    setProjectState(generated.updatedProject)
    setSavedProjectJson(null)
    setReplacementBaselineJson(serializeProject(generated.updatedProject))
    setFileFeedback('สร้างโมเดลครัวพิสูจน์แล้ว')
    setSelectedId(null)
    setCommandQueue(generated.emittedEnvelopes)
    setViewMode('plan')
  }

  // Counts & Schedule breakdown
  const columnCount = Object.values(project.objects).filter((o) => o.object_type === 'structure.column').length
  const foundationCount = Object.values(project.objects).filter((o) => o.object_type === 'structure.foundation').length
  const beamCount = Object.values(project.objects).filter((o) => o.object_type === 'structure.beam').length
  const wallCount = Object.values(project.objects).filter((o) => o.object_type === 'architecture.wall').length
  const doorCount = Object.values(project.objects).filter((o) => o.object_type === 'door_window.door').length
  const windowCount = Object.values(project.objects).filter((o) => o.object_type === 'door_window.window').length
  const gridCount = Object.values(project.objects).filter((o) => o.object_type === 'structure.grid').length
  const takeoff = calculateTakeoff(project)

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
      {/* Focused project header */}
      <header className="cf-app-header">
        <div className="cf-brand">
          <span className="cf-brand-mark">CF</span>
          <span className="cf-brand-name">ConstructFlow</span>
          <span className="cf-brand-divider" />
          <span className="cf-project-name" title={project.project.name}>{project.project.name}</span>
        </div>

        <div className="cf-header-model-controls">
          <label className="cf-header-field">
            <span>ชั้น</span>
            <select value={project.project.active_level_id} onChange={(e) => handleSetWorkingLevel(e.target.value)} aria-label="ชั้นอาคาร">
              {project.levels.map((lvl) => <option key={lvl.id} value={lvl.id}>{lvl.name} ({lvl.elevation_mm >= 0 ? '+' : ''}{lvl.elevation_mm} mm)</option>)}
            </select>
          </label>
          <label className="cf-header-field cf-phase-field">
            <span>เฟสสร้าง</span>
            <select value={project.project.active_phase} onChange={(e) => handleSetWorkingPhase(e.target.value as Phase)} aria-label="เฟสงาน">
              {project.phases.map((ph) => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
            </select>
          </label>
          <span className="cf-unit-pill">หน่วย · เมตร</span>
        </div>

        <div className="cf-header-actions">
          <input id="cfproj-open" type="file" accept=".cfproj,application/json" aria-hidden="true" tabIndex={-1} className="cf-visually-hidden" onChange={(e) => { void handleOpenProject(e.currentTarget.files?.[0] ?? undefined, null); e.currentTarget.value = '' }} />
          {supportsProjectFileOpen ? (
            <button type="button" className="cf-button cf-button-quiet" onClick={() => void handleChooseProject()} title="เปิดไฟล์โครงการ .cfproj"><FolderOpen size={16} /><span>เปิด</span></button>
          ) : (
            <label htmlFor="cfproj-open" role="button" tabIndex={0} className="cf-button cf-button-quiet" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); document.getElementById('cfproj-open')?.click() } }}><FolderOpen size={16} /><span>เปิด</span></label>
          )}
          <button type="button" className="cf-button cf-button-primary" onClick={handleExportProject} title="บันทึกไฟล์โครงการ .cfproj"><Save size={16} /><span>บันทึก</span></button>
          <span role="status" aria-live="polite" className={`cf-save-status ${hasUnsavedChanges ? 'is-unsaved' : ''}`}>{hasUnsavedChanges ? 'ยังไม่ได้บันทึก' : 'บันทึกแล้ว'}{fileFeedback ? ` · ${fileFeedback}` : ''}</span>
          <button type="button" className="cf-icon-button" disabled={!projectSessionRef.current!.canUndo} onClick={() => { setProjectState(projectSessionRef.current!.undo()); setCommandQueue([]) }} title="ย้อนกลับ (Ctrl+Z)" aria-label="ย้อนกลับ"><Undo2 size={17} /></button>
          <button type="button" className="cf-icon-button" disabled={!projectSessionRef.current!.canRedo} onClick={() => { setProjectState(projectSessionRef.current!.redo()); setCommandQueue([]) }} title="ทำซ้ำ (Ctrl+Y)" aria-label="ทำซ้ำ"><Redo2 size={17} /></button>
          <details className="cf-more-menu" onClick={(event) => {
            if ((event.target as HTMLElement).closest('button')) {
              event.currentTarget.open = false;
              event.currentTarget.querySelector('summary')?.focus();
            }
          }}>
            <summary className="cf-button cf-button-quiet" aria-label="เมนูโครงการ" title="เมนูโครงการ">เมนู</summary>
            <div className="cf-more-popover">
              <div className="cf-menu-label">โครงการ</div>
              <button type="button" aria-label="ดาวน์โหลดสำเนา .cfproj" onClick={handleDownloadProjectCopy}><Download size={15} /> ดาวน์โหลดสำเนา .cfproj</button>
              <button type="button" aria-label="โฉนดและผู้เซ็นแบบ" onClick={() => setIsLegalModalOpen(true)}><FileCheck size={15} /> โฉนดและผู้เซ็นแบบ</button>
              <div className="cf-menu-label">สร้าง</div>
              <button type="button" onClick={()=>{setWorkbenchTab('model');setIsConstructionOpen(true)}}><Layers2 size={15}/> เครื่องมืองานอาคาร</button>
              <button type="button" onClick={()=>setIsPresetsModalOpen(true)}><Sparkles size={15}/> ส่วนต่อเติมสำเร็จรูป</button>
              <button type="button" onClick={()=>openCatalog()}>คลังชนิด</button>
              <div className="cf-menu-label">แบบและส่งออก</div>
              <button type="button" onClick={()=>{setWorkbenchTab('sheets');setIsConstructionOpen(true)}}>ชุดแบบและตาราง</button>
              <button type="button" aria-label="ส่งออก DXF 20 แผ่น" onClick={() => { const res = exportProjectToDxf(project, { projectName: project.project.name, architectName: project.legal_metadata?.signatories?.architect_name, engineerLicense: project.legal_metadata?.signatories?.structural_engineer_license_no }); const blob = new Blob([res.dxfContent], { type: 'application/dxf' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${project.project.id || 'ConstructFlow'}_20Layouts.dxf`; a.click(); URL.revokeObjectURL(url) }}>DXF · 20 แผ่น</button>
              <button type="button" aria-label="ส่งออก IFC 4.3" onClick={() => { const res = exportProjectToIfc(project, { projectName: project.project.name, authorName: project.legal_metadata?.signatories?.architect_name }); const blob = new Blob([res.ifcContent], { type: 'application/x-step' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${project.project.id || 'ConstructFlow'}.ifc`; a.click(); URL.revokeObjectURL(url) }}>IFC 4.3</button>
              <div className="cf-menu-label">ตั้งค่าและช่วยเหลือ</div>
              <button type="button" onClick={()=>setIsSettingsOpen(true)}>ตั้งค่า · ชั้น/ระดับ/พื้นที่ทำงาน</button>
              <button type="button" onClick={()=>setInspectorOpen(value=>!value)}>{inspectorOpen?'ยุบ':'แสดง'}แผงข้อมูล</button>
              <button type="button" aria-label="เปิดโครงการตัวอย่างครัว" onClick={handleStartKitchenProof}><CookingPot size={15} /> เปิดโครงการตัวอย่างครัว</button>
            </div>
          </details>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="cf-workspace">
        <aside className="cf-tool-rail" aria-label="เครื่องมือเขียนแบบ">
          <div className="cf-rail-caption">เครื่องมือ</div>
            <Toolbar orientation="vertical"
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
                .map((t) => ({ name: t.name, thickness_mm: t.parameters?.thickness_mm, masonry_thickness_mm: t.parameters?.masonry_thickness_mm, plaster_inside_thickness_mm: t.parameters?.plaster_inside_thickness_mm, plaster_outside_thickness_mm: t.parameters?.plaster_outside_thickness_mm }))}
              doorTypes={(project.types || [])
                .filter((t) => t.object_type === 'door_window.door')
                  .map((t) => ({ name: t.name, width_mm: t.parameters?.width_mm, height_mm: t.parameters?.height_mm, opening_operation: t.parameters?.opening_operation, panel_count: t.parameters?.panel_count, panel_layout: Array.isArray(t.parameters?.panel_layout) ? t.parameters.panel_layout as string[] : undefined, panel_width_ratios: Array.isArray(t.parameters?.panel_width_ratios) ? t.parameters.panel_width_ratios as number[] : undefined, transom_height_mm: t.parameters?.transom_height_mm, muntin_rows: t.parameters?.muntin_rows, muntin_columns: t.parameters?.muntin_columns }))}
              windowTypes={(project.types || [])
                .filter((t) => t.object_type === 'door_window.window')
                  .map((t) => ({ name: t.name, width_mm: t.parameters?.width_mm, height_mm: t.parameters?.height_mm, opening_operation: t.parameters?.opening_operation, panel_count: t.parameters?.panel_count, panel_layout: Array.isArray(t.parameters?.panel_layout) ? t.parameters.panel_layout as string[] : undefined, panel_width_ratios: Array.isArray(t.parameters?.panel_width_ratios) ? t.parameters.panel_width_ratios as number[] : undefined, transom_height_mm: t.parameters?.transom_height_mm, bottom_light_height_mm: t.parameters?.bottom_light_height_mm, muntin_rows: t.parameters?.muntin_rows, muntin_columns: t.parameters?.muntin_columns }))}
              underlayHasImage={!!underlay.image}
              underlayVisible={underlay.visible}
              underlayOpacity={underlay.opacity}
              onToggleUnderlayVisible={() => setUnderlay((u) => ({ ...u, visible: !u.visible }))}
              onChangeUnderlayOpacity={(opacity) => setUnderlay((u) => ({ ...u, opacity }))}
              onUploadUnderlayImage={handleUploadUnderlayImage}
              onClearUnderlay={() => setUnderlay((u) => ({ ...u, image: null }))}
              onOpenTypeManager={() => openCatalog()}
            />
        </aside>

        {/* Center Canvas Area */}
        <main className="cf-canvas-shell">
          <div className="cf-view-switch">
            {(['plan', 'model3d'] as const).map(mode => (
              <button key={mode} type="button" onClick={() => setViewMode(mode)} className={viewMode === mode ? 'is-active' : ''}>
                {mode === 'plan' ? '2D แปลน' : '3D โมเดล'}
              </button>
            ))}
          </div>

          {/* Interactive Plan Canvas */}
          <div className="cf-viewport-stage">
            {viewMode === 'plan' ? <PlanCanvas
              project={project}
              activeTool={activeTool}
              activeColumnTypeMark={activeColumnType}
              activeFoundationTypeMark={activeFoundationType}
              activeBeamTypeMark={activeBeamType}
              activeWallTypeMark={activeWallType}
              activeDoorTypeMark={activeDoorType}
              activeWindowTypeMark={activeWindowType}
              onOpenTypeManager={() => openCatalog()}
              onChangeActiveTypeMark={(mark) => {
                if (activeTool === 'column') setActiveColumnType(mark)
                else if (activeTool === 'foundation') setActiveFoundationType(mark)
                else if (activeTool === 'beam') setActiveBeamType(mark)
                else if (activeTool === 'wall') setActiveWallType(mark)
                else if (activeTool === 'door') setActiveDoorType(mark)
                else if (activeTool === 'window') setActiveWindowType(mark)
              }}
              selectedId={selectedId}
              underlay={underlay}
              onSelectObject={setSelectedId}
              onCommitColumn={handleCommitColumn}
              onCommitFoundation={handleCommitFoundation}
              onCommitBeam={handleCommitBeam}
              onCommitWall={handleCommitWall}
              onCommitDoor={handleCommitDoor}
              onCommitWindow={handleCommitWindow}
              onCommitGrid={handleCommitGrid}
              onCommitStair={handleCommitStair}
              onMoveColumn={handleMoveColumn}
              onMoveWall={handleMoveWall}
              onMoveOpening={handleMoveOpening}
              onFlipDoorHanding={handleFlipDoorHanding}
              onStartCalibrationModal={(dist) => {
                setMeasuredCalibrationDist_mm(dist)
                setCalibrationModalOpen(true)
              }}
              onCursorChange={(coords, kind) => {
                setCursorCoords_mm(coords)
                setSnapKind(kind)
              }}
            /> : <Suspense fallback={<div style={{ padding: 24, color: '#94a3b8' }}>3D renderer is loading…</div>}>
              <Model3DViewport project={project} selectedId={selectedId} onSelectObject={setSelectedId} onMoveColumn={handleMoveColumn} onMoveWall={handleMoveWall} onMoveFoundation={handleMoveFoundation} onMoveOpening={handleMoveOpening} />
            </Suspense>}
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
                X: <b>{(cursorCoords_mm[0] / 1000).toFixed(3)} m</b> <span style={{ color: '#64748b', fontSize: 10 }}>({Math.round(cursorCoords_mm[0])} mm)</span>
              </span>
              <span>
                Y: <b>{(cursorCoords_mm[1] / 1000).toFixed(3)} m</b> <span style={{ color: '#64748b', fontSize: 10 }}>({Math.round(cursorCoords_mm[1])} mm)</span>
              </span>
              <span style={{ color: snapKind === 'Free' ? '#64748b' : '#38bdf8' }}>
                Snap: <b>{snapKind}</b>
              </span>
            </div>
            <div>
              <span>
                ปุ่มกลางเลื่อนแปลน · ลูกกลิ้งซูม · {activeTool === 'wall' || activeTool === 'beam' ? 'Space เปลี่ยนแนวอ้างอิง' : activeTool === 'door' ? 'Space กลับทิศประตู' : 'เลือกเครื่องมือเพื่อเริ่มวาด'}
              </span>
            </div>
          </footer>
        </main>

        {/* Right Inspector & Sync Sidebar */}
        {inspectorOpen && <aside className="cf-inspector">
          <div className="cf-inspector-heading">
            <div><strong>แผงข้อมูล</strong><span>{selectedId ? 'คุณสมบัติวัตถุและปริมาณ' : 'เลือกวัตถุบนแปลนเพื่อแก้ไข'}</span></div>
          </div>
          <div className="cf-inspector-tabs" role="tablist" aria-label="แผงข้อมูล">
            <button type="button" role="tab" aria-selected={rightPanelTab === 'properties'} className={rightPanelTab === 'properties' ? 'is-active' : ''} onClick={() => setRightPanelTab('properties')}>คุณสมบัติ</button>
            <button type="button" role="tab" aria-selected={rightPanelTab === 'quantities'} className={rightPanelTab === 'quantities' ? 'is-active' : ''} onClick={() => setRightPanelTab('quantities')}>ปริมาณ</button>
            <button type="button" role="tab" aria-selected={rightPanelTab === 'objects'} className={rightPanelTab === 'objects' ? 'is-active' : ''} onClick={() => setRightPanelTab('objects')}>รายการ</button>
          </div>
          {rightPanelTab === 'properties' && <div className="cf-inspector-content"><PropertiesPanel
            project={project}
            selectedId={selectedId}
            onAssignType={handleAssignType}
            onUpdateColumnMark={handleUpdateColumnMark}
            onUpdateFoundationMark={handleUpdateFoundationMark}
            onUpdateGridTag={handleUpdateGridTag}
            onUpdatePhase={handleUpdateObjectPhase}
            onUpdateRemovalPhase={handleUpdateObjectRemovalPhase}
            onFlipDoorHanding={handleFlipDoorHanding}
            onOpenTypeManager={() => openCatalog(true,true)}
            onAddFoundation={(colId) => handleCommitFoundation({ columnId: colId })}
            onDeleteObject={handleDeleteObject}
          /></div>}

          {rightPanelTab === 'quantities' && <section className="cf-takeoff-panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <strong style={{ color: '#e2e8f0', fontSize: 12 }}>ปริมาณจากโมเดล (BOQ)</strong>
              <div style={{ display: 'flex', gap: 5 }}>
                <button type="button" onClick={()=>setIsConstructionOpen(true)} title="เปิด viewport และส่งออกชุดแบบ A3 20 แผ่น" style={{ ...headerActionStyle, fontSize: 10 }}>A3 · 20 Sheets</button>
                <button type="button" onClick={handleExportTakeoff} style={{ ...headerActionStyle, fontSize: 10 }}>CSV</button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 190, overflowY: 'auto' }}>
              {takeoff.lines.length === 0 ? (
                <span style={{ color: '#64748b', fontSize: 11 }}>ยังไม่มีรายการถอดปริมาณ</span>
              ) : takeoff.lines.slice(0, 12).map((line) => (
                <div key={line.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10, color: '#94a3b8' }}>
                  <span title={`${line.cost_center} · ${line.formula}`}>
                    <b style={{ color: line.cost_center === 'remodeling_joint_treatment' ? '#f0abfc' : '#94a3b8' }}>
                      {takeoffCostCenterLabels[line.cost_center] ?? line.cost_center}
                    </b>{' '}{line.mark} · {line.phase}
                  </span>
                  <b style={{ color: '#cbd5e1', whiteSpace: 'nowrap' }}>{line.quantity.toFixed(3)} {line.unit}</b>
                </div>
              ))}
            </div>
            {takeoff.warnings.length > 0 && (
              <div title={takeoff.warnings.join('\n')} style={{ color: '#fbbf24', fontSize: 10, marginTop: 7 }}>
                ต้องตรวจสอบ {takeoff.warnings.length} รายการ
              </div>
            )}
          </section>}

          {rightPanelTab === 'objects' && <div className="cf-object-summary">
            {[['แกนเสา', gridCount, 'เส้น'], ['เสา', columnCount, 'ต้น'], ['ฐานราก', foundationCount, 'ฐาน'], ['คาน', beamCount, 'ช่วง'], ['ผนัง', wallCount, 'แผง'], ['ประตู', doorCount, 'บาน'], ['หน้าต่าง', windowCount, 'บาน']].map(([label, count, unit]) => <div className="cf-object-row" key={String(label)}><span>{label}</span><strong>{count} {unit}</strong></div>)}
          </div>}


        </aside>}
      </div>

      {/* BIM Type Manager Modal */}
      {isConstructionOpen&&<Suspense fallback={<div>กำลังเปิด BIM Workbench…</div>}><ConstructionWorkbench project={project} initialTab={workbenchTab} onOpenCatalog={()=>{setIsConstructionOpen(false);openCatalog(false,false,'structure.slab')}} onClose={()=>setIsConstructionOpen(false)} onExecute={dispatchCommandBatch}/></Suspense>}
      <TypeManagerModal
        isOpen={isTypeManagerOpen}
        onClose={() => setIsTypeManagerOpen(false)}
        project={project}
        initialFamily={catalogContext.family}
        initialTypeId={catalogContext.typeId}
        editInitially={catalogContext.edit}
        selectedObjectId={catalogContext.intent==='assign'?selectedId??undefined:undefined}
        selectionIntent={catalogContext.intent}
        selectionFamily={catalogContext.family}
        onChoose={chooseCatalogType}
        onExecute={dispatchCommandBatch}
        onRenamed={syncRenamedActiveType}
      />

      {isSettingsOpen && <SettingsModal project={project} onClose={()=>setIsSettingsOpen(false)} onExecute={dispatchCommandBatch} inspectorOpen={inspectorOpen} onInspectorChange={setInspectorOpen}/>}
      {/* Underlay Point-to-Point Scale Calibration Modal */}
      <UnderlayCalibrationModal
        isOpen={calibrationModalOpen}
        onClose={() => setCalibrationModalOpen(false)}
        measuredDistance_mm={measuredCalibrationDist_mm}
        currentScale_mm_per_px={underlay.scale_mm_per_px}
        onApplyScale={handleApplyCalibrationScale}
      />

      {/* 1-Click Parametric Extension Presets Modal */}
      <ExtensionPresetsModal
        isOpen={isPresetsModalOpen}
        onClose={() => setIsPresetsModalOpen(false)}
        project={project}
        onApplyPreset={handleApplyExtensionPreset}
      />

      {/* Title Deed & Legal Signatories Modal (Permit Issue Set) */}
      <ProjectLegalModal
        isOpen={isLegalModalOpen}
        onClose={() => setIsLegalModalOpen(false)}
        project={project}
        onSave={(legal) => {
          setProject((prev) => {
            const next = { ...prev, legal_metadata: legal }
            projectSessionRef.current = new ProjectCommandSession(next)
            return next
          })
        }}
      />
    </div>
  )
}
