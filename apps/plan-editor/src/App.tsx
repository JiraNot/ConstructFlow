import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react'
import {
  ProjectDocument,
  TypeDefinition,
  createEmptyProjectDocument,
  deserializeProject,
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
  formatLengthMm,
  resolveArchitectureSurfaceElevation,
  type DisplayLengthUnit,
} from '@constructflow/project-model'
import { CommandEnvelope, CommandRequest } from '@constructflow/command-schema'
import { CommandBus, ProjectCommandSession } from './commands/CommandBus.js'
import { Toolbar, ToolType } from './components/Toolbar.js'
import { PlanCanvas } from './components/PlanCanvas.js'
import { ElevationCanvas, ElevationDirection } from './components/ElevationCanvas.js'
import { PropertiesPanel } from './components/PropertiesPanel.js'
import { SettingsModal } from './components/SettingsModal.js'
import { TOOL_FAMILIES } from './components/catalogPresentation.js'
import { TypeManagerModal } from './components/TypeManagerModal.js'
import { UnderlayCalibrationModal } from './components/UnderlayCalibrationModal.js'
import { ExtensionPresetsModal } from './components/ExtensionPresetsModal.js'
import { ProjectLegalModal } from './components/ProjectLegalModal.js'
import { CoordinationPanel } from './components/CoordinationPanel.js'
import { useCoordinationReport } from './features/coordination/useCoordinationReport.js'
import { exportProjectToDxf } from '@constructflow/cad-adapter'
import { exportProjectToIfc } from '@constructflow/bim-adapter'
import type { ProjectLegalMetadata } from '@constructflow/project-model'
import { UnderlayConfig, PlanLabelVisibility, DEFAULT_PLAN_LABEL_VISIBILITY } from './rendering/planRenderer.js'
import { Building2, Layers, History, Layers2, Ruler, ArrowUpDown, Sparkles, Undo2, Redo2, FolderOpen, Save, Download, CookingPot, FileCheck, MoreHorizontal, Tag, ChevronDown, Home } from 'lucide-react'
import { calculateTakeoff, calculatePhasedBOQ } from '@constructflow/takeoff-engine'
import { createKitchenProofProject } from '@constructflow/extension-engine'
import { renderPermitDrawingSetHtml } from '@constructflow/sheet-engine'
import { readProjectFile, writeProjectFile, type LocalProjectFileHandle } from './projectFileIO.js'
import { loadLocalProjectSnapshot, saveLocalProjectSnapshot } from './projectAutosave.js'
import houseDemoRaw from '../../../examples/constructflow-house-demo.cfproj?raw'

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
  remodeling_joint_treatment: 'รอยต่อเดิม–ใหม่',
}

const nextHigherLevelId = (project: ProjectDocument, baseLevelId: string): string => {
  const base = project.levels.find(level => level.id === baseLevelId)
  return base ? [...project.levels]
    .filter(level => level.elevation_mm > base.elevation_mm)
    .sort((a, b) => a.elevation_mm - b.elevation_mm)[0]?.id ?? '' : ''
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

const projectFileName = (project: ProjectDocument) => {
  const safeName = project.project.name.trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .replace(/\.cfproj$/i, '')
  return `${safeName || project.project.id || 'project'}.cfproj`
}

export const App: React.FC = () => {
  const [project, setProjectState] = useState<ProjectDocument>(() =>
    createEmptyProjectDocument('CF-UNTITLED', 'Untitled Project')
  )
  const displayUnit: DisplayLengthUnit = project.project.display_unit ?? 'm'
  const projectJson = useMemo(() => serializeProject(project), [project])
  const [savedProjectJson, setSavedProjectJson] = useState<string | null>(projectJson)
  const [replacementBaselineJson, setReplacementBaselineJson] = useState<string | null>(projectJson)
  const [localAutosaveReady, setLocalAutosaveReady] = useState(false)
  const [localAutosaveState, setLocalAutosaveState] = useState<'restoring' | 'saving' | 'saved' | 'error'>('restoring')
  const [isProjectNameEditing, setIsProjectNameEditing] = useState(false)
  const [projectNameDraft, setProjectNameDraft] = useState(project.project.name)
  const [fileFeedback, setFileFeedback] = useState('')
  const supportsProjectFileOpen = typeof (window as ProjectSaveWindow).showOpenFilePicker === 'function'
  const projectSessionRef = useRef<ProjectCommandSession | null>(null)
  const locallySavedProjectJsonRef = useRef<string | null>(null)
  if (!projectSessionRef.current) projectSessionRef.current = new ProjectCommandSession(project)
  useEffect(() => {
    let active = true
    void loadLocalProjectSnapshot()
      .then(snapshot => {
        if (!active) return
        if (!snapshot) {
          locallySavedProjectJsonRef.current = projectJson
          return
        }
        const restored = deserializeProject(snapshot.projectJson)
        projectSessionRef.current!.reset(restored)
        locallySavedProjectJsonRef.current = snapshot.projectJson
        setProjectState(restored)
        setSavedProjectJson(snapshot.savedProjectJson)
        setReplacementBaselineJson(snapshot.replacementBaselineJson)
        setCommandQueue([])
        setSelectedId(null)
        setFileFeedback(`กู้คืนงานในเครื่องเมื่อ ${new Date(snapshot.savedAt).toLocaleString()}`)
      })
      .catch(error => {
        if (active) {
          console.error('Unable to restore local ConstructFlow project', error)
          setLocalAutosaveState('error')
          setFileFeedback('กู้คืนงานในเครื่องไม่สำเร็จ')
        }
      })
      .finally(() => {
        if (active) setLocalAutosaveReady(true)
      })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!localAutosaveReady) return
    setLocalAutosaveState('saving')
    let saving = false
    const persistSnapshot = () => {
      if (saving) return
      saving = true
      void saveLocalProjectSnapshot({ projectJson, savedProjectJson, replacementBaselineJson })
        .then(() => {
          locallySavedProjectJsonRef.current = projectJson
          setLocalAutosaveState('saved')
        })
        .catch(error => {
          console.error('Unable to autosave local ConstructFlow project', error)
          setLocalAutosaveState('error')
        })
    }
    const timer = window.setTimeout(persistSnapshot, 350)
    window.addEventListener('pagehide', persistSnapshot)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pagehide', persistSnapshot)
    }
  }, [localAutosaveReady, projectJson, savedProjectJson, replacementBaselineJson])
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
  const handleProjectNameCommit = () => {
    const name = projectNameDraft.trim()
    setIsProjectNameEditing(false)
    if (!name) {
      setProjectNameDraft(project.project.name)
      setFileFeedback('ชื่อโครงการห้ามเว้นว่าง')
      return
    }
    if (name === project.project.name) return
    const updated = structuredClone(project)
    updated.project.name = name
    updated.project.updated_at = new Date().toISOString()
    setProject(updated)
    setFileFeedback('แก้ชื่อโครงการแล้ว')
  }

  const [activeTool, setActiveTool] = useState<ToolType>('select')
  const [viewMode, setViewMode] = useState<'plan' | ElevationDirection | 'model3d'>('plan')
  const [labelMode, setLabelMode] = useState<'name' | 'name-size'>('name-size')
  const [labelVisibility, setLabelVisibility] = useState<PlanLabelVisibility>(DEFAULT_PLAN_LABEL_VISIBILITY)
  const [rightPanelTab, setRightPanelTab] = useState<'properties' | 'quantities' | 'objects' | 'coordination'>('properties')
  const coordination = useCoordinationReport(project, true)
  const coordinationFindings = coordination.report?.findings ?? []
  const [activeColumnType, setActiveColumnType] = useState<string>('C1')
  const [activeColumnTopLevelId, setActiveColumnTopLevelId] = useState<string>(() => nextHigherLevelId(project, project.project.active_level_id))
  const [activeFoundationType, setActiveFoundationType] = useState<string>('F1')
  const [activeBeamType, setActiveBeamType] = useState<string>('B1')
  const [activeWallType, setActiveWallType] = useState<string>('AAC 100 mm')
  const [activeDoorType, setActiveDoorType] = useState<string>('D1')
  const [activeWindowType, setActiveWindowType] = useState<string>('W1')
  const [activeSlabType, setActiveSlabType] = useState<string>('GS')
  const previousTypesRef = useRef(project.types)
  useEffect(() => {
    const entries: Array<[string, string, (value: string) => void]> = [
      ['structure.column', activeColumnType, setActiveColumnType],
      ['structure.foundation', activeFoundationType, setActiveFoundationType],
      ['structure.beam', activeBeamType, setActiveBeamType],
      ['architecture.wall', activeWallType, setActiveWallType],
      ['door_window.door', activeDoorType, setActiveDoorType],
      ['door_window.window', activeWindowType, setActiveWindowType],
      ['structure.slab', activeSlabType, setActiveSlabType],
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
  const [inspectorOpen,setInspectorOpen] = useState(() => window.innerWidth > 900)
  const [workbenchTab,setWorkbenchTab] = useState<'model'|'sheets'>('model')
  const [isTypeManagerOpen, setIsTypeManagerOpen] = useState<boolean>(false)
  const [isConstructionOpen,setIsConstructionOpen]=useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const copiedObjectIdsRef = useRef<string[]>([])
  const pasteCountRef = useRef(0)
  useEffect(() => {
    if (selectedId && !selectedIds.includes(selectedId)) setSelectedIds([selectedId])
    else if (!selectedId && selectedIds.length) setSelectedIds([])
  }, [selectedId])
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
    rotation_deg: 0,
  })
  const underlayKey = `${viewMode}:${project.project.active_level_id}`
  const hydratedUnderlayRef = useRef<string | null>(null)
  useEffect(() => {
    const saved = project.underlays?.[underlayKey]
    if (!saved) {
      if (hydratedUnderlayRef.current !== underlayKey) {
        hydratedUnderlayRef.current = underlayKey
        setUnderlay(current => ({ ...current, image: null }))
      }
      return
    }
    if (hydratedUnderlayRef.current === `${underlayKey}:${saved.data_url}`) return
    const image = new Image()
    image.onload = () => {
      image.dataset.projectSrc = saved.data_url
      hydratedUnderlayRef.current = `${underlayKey}:${saved.data_url}`
      setUnderlay({ image, origin_mm: saved.origin_mm, scale_mm_per_px: saved.scale_mm_per_px, rotation_deg: saved.rotation_deg, opacity: saved.opacity, visible: saved.visible })
    }
    image.onerror = () => { hydratedUnderlayRef.current = `${underlayKey}:${saved.data_url}` }
    image.src = saved.data_url
  }, [project.underlays, underlayKey])
  useEffect(() => {
    const image = underlay.image
    const dataUrl = image?.dataset.projectSrc
    if (!image || !dataUrl || !dataUrl.startsWith('data:image/')) return
    const value = { data_url: dataUrl, origin_mm: underlay.origin_mm, scale_mm_per_px: underlay.scale_mm_per_px, rotation_deg: underlay.rotation_deg ?? 0, opacity: underlay.opacity, visible: underlay.visible }
    const timer=window.setTimeout(()=>setProjectState(current => {
      const existing = current.underlays?.[underlayKey]
      if (existing && JSON.stringify(existing) === JSON.stringify(value)) return current
      const updated = { ...current, underlays: { ...current.underlays, [underlayKey]: value } }
      projectSessionRef.current?.commit(updated)
      return updated
    }),180)
    return ()=>window.clearTimeout(timer)
  }, [underlay, underlayKey])
  const canCalibrateUnderlayRef = useRef(false)
  canCalibrateUnderlayRef.current = !!underlay.image && underlay.visible
  const [calibrationModalOpen, setCalibrationModalOpen] = useState<boolean>(false)
  const [measuredCalibrationDist_mm, setMeasuredCalibrationDist_mm] = useState<number>(4000)
  const calibrationPointsRef = useRef<{ first: [number, number]; second: [number, number] } | null>(null)
  const [isPresetsModalOpen, setIsPresetsModalOpen] = useState<boolean>(false)
  const [isLegalModalOpen, setIsLegalModalOpen] = useState<boolean>(false)

  useEffect(() => {
    if (!underlay.image || !underlay.visible) {
      if (activeTool === 'calibrate') setActiveTool('select')
      setCalibrationModalOpen(false)
    }
  }, [underlay.image, underlay.visible, activeTool])

  useEffect(() => {
    if (localAutosaveState !== 'error') return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [localAutosaveState])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void handleSaveLocalProject()
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
      } else if (e.key === 'e' || e.key === 'E') {
        setActiveTool('erase')
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
        setActiveTool(e.shiftKey ? 'gridSystem' : 'grid')
      } else if (e.key === 'm' || e.key === 'M') {
        setActiveTool('measure')
      } else if (e.key === 'r' || e.key === 'R') {
        if (canCalibrateUnderlayRef.current) setActiveTool('calibrate')
      } else if (e.key === 't' || e.key === 'T') {
        setActiveTool('stair')
      } else if (e.key === 'p' || e.key === 'P') {
        setActiveTool('slab')
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
      setActiveColumnTopLevelId(nextHigherLevelId(res.updatedProject, levelId))
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  // Upload Underlay Image file
  const handleUploadUnderlayImage = (file: File) => {
    const reader = new FileReader()
    reader.onerror = () => setFileFeedback('อ่านไฟล์ภาพอ้างอิงไม่สำเร็จ')
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '')
      if (!dataUrl.startsWith('data:image/')) { setFileFeedback('ไฟล์ที่เลือกไม่ใช่ภาพที่รองรับ'); return }
    const img = new Image()
    img.onload = () => {
      img.dataset.projectSrc = dataUrl
      hydratedUnderlayRef.current = `${underlayKey}:${dataUrl}`
      setUnderlay((prev) => ({
        ...prev,
        image: img,
        origin_mm: [0, 0],
        scale_mm_per_px: 10,
        rotation_deg: 0,
        visible: true,
      }))
    }
      img.onerror = () => setFileFeedback('เปิดภาพอ้างอิงไม่สำเร็จ')
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }
  const handleClearUnderlay = () => {
    setUnderlay(current => ({ ...current, image: null }))
    setProjectState(current => {
      if (!current.underlays?.[underlayKey]) return current
      const underlays={...current.underlays};delete underlays[underlayKey]
      const updated={...current,underlays};projectSessionRef.current?.commit(updated);return updated
    })
    hydratedUnderlayRef.current=underlayKey
  }

  // Apply calibrated 1:1 scale
  const handleApplyCalibrationScale = (newScale: number, _realDistance_mm: number, axis: 'x' | 'y') => {
    const points = calibrationPointsRef.current
    setUnderlay((prev) => ({
      ...prev,
      scale_mm_per_px: newScale,
      ...(points ? (() => {
        const dx = (points.second[0] - points.first[0]) / prev.scale_mm_per_px
        const dy = (points.second[1] - points.first[1]) / prev.scale_mm_per_px
        const rotation = (axis === 'x' ? 0 : Math.PI / 2) - Math.atan2(dy, dx)
        const cos = Math.cos(rotation), sin = Math.sin(rotation)
        const px = (points.first[0] - prev.origin_mm[0]) / prev.scale_mm_per_px
        const py = (points.first[1] - prev.origin_mm[1]) / prev.scale_mm_per_px
        return { rotation_deg: (prev.rotation_deg ?? 0) + rotation * 180 / Math.PI,
          origin_mm: [points.first[0] - (px * cos - py * sin) * newScale, points.first[1] - (px * sin + py * cos) * newScale] as [number, number] }
      })() : {}),
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
    const baseLevelId = project.project.active_level_id
    const baseElevation = project.levels.find(level => level.id === baseLevelId)?.elevation_mm ?? -Infinity
    const topLevelId = project.levels.some(level => level.id === activeColumnTopLevelId && level.elevation_mm > baseElevation)
      ? activeColumnTopLevelId
      : nextHigherLevelId(project, baseLevelId)
    const res = CommandBus.execute(project, 'CreateColumn', {
      id: colId,
      mark: activeColumnType,
      location_mm: [location_mm[0], location_mm[1], 0],
      base_level_id: baseLevelId,
      ...(topLevelId ? { top_level_id: topLevelId } : {}),
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
  const snapEndpointToColumnCenter = (point: [number, number]): [number, number] => {
    const column = Object.values(project.objects).find(object => {
      if (!isColumnObject(object)) return false
      const [cx, cy] = object.module_data.location_mm, [width, depth] = object.module_data.section_mm
      return Math.abs(point[0] - cx) <= width / 2 + 120 && Math.abs(point[1] - cy) <= depth / 2 + 120
    })
    return column && isColumnObject(column) ? [column.module_data.location_mm[0], column.module_data.location_mm[1]] : point
  }

  const handleCommitBeam = (
    start_point_mm: [number, number],
    end_point_mm: [number, number],
    startColId?: string,
    endColId?: string,
    placementReference: PlacementReference = 'centerline'
  ) => {
    const beamId = crypto.randomUUID()
    const startColumn = startColId ? project.objects[startColId] : undefined
    const endColumn = endColId ? project.objects[endColId] : undefined
    if (startColumn && isColumnObject(startColumn)) start_point_mm = [startColumn.module_data.location_mm[0], startColumn.module_data.location_mm[1]]
    if (endColumn && isColumnObject(endColumn)) end_point_mm = [endColumn.module_data.location_mm[0], endColumn.module_data.location_mm[1]]
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
  const handleCommitWall = (start_point_mm: [number, number], end_point_mm: [number, number], placementReference: PlacementReference = 'centerline', verticalReference?: { level_id: string; top_level_id?: string; height_mm?: number; base_offset_mm?: number; top_offset_mm?: number }) => {
    start_point_mm = snapEndpointToColumnCenter(start_point_mm)
    end_point_mm = snapEndpointToColumnCenter(end_point_mm)
    const wallId = crypto.randomUUID()
    const levelId = verticalReference?.level_id ?? project.project.active_level_id
    const res = CommandBus.execute(project, 'CreateWall', {
      id: wallId,
      mark: activeWallType,
      placement_reference: placementReference,
      start_point_mm: [start_point_mm[0], start_point_mm[1], 0],
      end_point_mm: [end_point_mm[0], end_point_mm[1], 0],
      level_id: levelId,
      ...(verticalReference?.top_level_id ? { top_level_id: verticalReference.top_level_id } : {}),
      ...(verticalReference?.height_mm !== undefined ? { height_mm: verticalReference.height_mm } : {}),
      ...(verticalReference?.base_offset_mm !== undefined ? { base_offset_mm: verticalReference.base_offset_mm } : {}),
      ...(verticalReference?.top_offset_mm !== undefined ? { top_offset_mm: verticalReference.top_offset_mm } : {}),
      ...(!verticalReference ? { inherit_joined_wall_constraint: true } : {}),
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      setSelectedId(wallId)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  const handleCommitSlab = (boundary_mm: [number, number][]) => {
    const type = project.types.find(item => item.object_type === 'structure.slab' && item.name.toLowerCase() === activeSlabType.toLowerCase())
    const level = project.levels.find(item => item.id === project.project.active_level_id)
    if (!type || !level || boundary_mm.length < 3) return
    const id = crypto.randomUUID()
    const result = CommandBus.execute(project, 'CreateSlab', {
      id,
      type_id: type.id,
      mark: type.name,
      level_id: level.id,
      boundary_mm,
      elevation_mm: level.elevation_mm,
      elevation_offset_mm: 0,
      thickness_mm: Number(type.parameters.thickness_mm ?? 120),
      topping_mm: Number(type.parameters.topping_mm ?? 0),
      slab_system: type.parameters.slab_system ?? 'slab_on_ground',
      material: String(type.parameters.material ?? 'reinforced_concrete'),
    })
    if (result.result.status === 'success') {
      setProject(result.updatedProject)
      setSelectedId(id)
      if (result.emittedEnvelope) setCommandQueue(queue => [...queue, result.emittedEnvelope!])
    }
  }

  const runArchitectureCommand = (name: string, input: Record<string, unknown>) => {
    const result = CommandBus.execute(project, name, input)
    if (result.result.status === 'success') {
      setProject(result.updatedProject)
      const created = result.result.created_object_ids?.[0] ?? result.result.affected_object_ids?.[0]
      if (created) setSelectedId(created)
      if (result.emittedEnvelope) setCommandQueue(queue => [...queue, result.emittedEnvelope!])
    } else setFileFeedback(result.result.errors?.join(' · ') ?? 'คำสั่งไม่สำเร็จ')
  }
  const handleCommitArchitecturalFloor = (boundary_mm: [number, number][]) => {
    const level=project.levels.find(item=>item.id===project.project.active_level_id);if(!level)return
    runArchitectureCommand('CreateArchitecturalFloor',{id:crypto.randomUUID(),mark:'AF1',level_id:level.id,boundary_mm,elevation_mm:level.elevation_mm,elevation_reference:'level',elevation_offset_mm:0,thickness_mm:50,finish_layers:[{material:'tile',thickness_mm:10,mark:'Tile'}],voids_mm:[],follows_room_boundary:false})
  }
  const handleCommitCeiling = (boundary_mm: [number, number][]) => {
    const level=project.levels.find(item=>item.id===project.project.active_level_id);if(!level)return
    runArchitectureCommand('CreateCeiling',{id:crypto.randomUUID(),mark:'CL1',level_id:level.id,boundary_mm,elevation_mm:level.elevation_mm+Number(level.height_mm??2800),elevation_reference:'level',elevation_offset_mm:Number(level.height_mm??2800),thickness_mm:12,voids_mm:[],grid_mm:[600,600],follows_room_boundary:false})
  }
  const handleCommitRoomSeparator = (start_point_mm: [number,number],end_point_mm: [number,number]) => runArchitectureCommand('CreateRoomSeparator',{id:crypto.randomUUID(),mark:'RS',level_id:project.project.active_level_id,start_point_mm,end_point_mm})
  const handleDetectRooms = () => runArchitectureCommand('DetectRooms',{level_id:project.project.active_level_id,default_name:'Room'})
  const handleCreateRoomFinish = (kind: 'floor'|'ceiling', roomId: string) => {
    const room=project.objects[roomId];if(!room||room.object_type!=='architecture.room')return
    const data=room.module_data as Record<string,unknown>;if(data.boundary_status==='unclosed'){setFileFeedback('วงผนังห้องยังเปิดอยู่ · ปิดวงและตรวจพื้นที่ก่อนสร้างพื้นหรือฝ้าตามห้อง');return}
    const level=project.levels.find(item=>item.id===data.level_id);if(!level)return
    if(kind==='floor')runArchitectureCommand('CreateArchitecturalFloor',{id:crypto.randomUUID(),mark:'AF1',level_id:level.id,room_id:roomId,elevation_mm:level.elevation_mm,elevation_reference:'level',elevation_offset_mm:0,thickness_mm:50,finish_layers:[{material:'tile',thickness_mm:10,mark:'Tile'}],voids_mm:[],follows_room_boundary:true})
    else runArchitectureCommand('CreateCeiling',{id:crypto.randomUUID(),mark:'CL1',level_id:level.id,room_id:roomId,elevation_mm:level.elevation_mm+Number(level.height_mm??2800),elevation_reference:'level',elevation_offset_mm:Number(level.height_mm??2800),thickness_mm:12,voids_mm:[],grid_mm:[600,600],follows_room_boundary:true})
  }

  const handleCommitSurfaceVoid = (hostId: string, boundary_mm: [number, number][]) => {
    const host = project.objects[hostId]
    if (!host || !['structure.slab', 'architecture.floor', 'architecture.ceiling'].includes(host.object_type) || boundary_mm.length < 3) return
    const data = host.module_data as Record<string, unknown>
    const inside = (point: [number, number], ring: [number, number][]) => {
      let result = false
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j]
        if (((yi > point[1]) !== (yj > point[1])) && point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi) result = !result
      }
      return result
    }
    const boundary = data.boundary_mm as [number, number][]
    if (!boundary || !boundary_mm.every(point => inside(point, boundary))) {
      setFileFeedback('ช่องเจาะต้องอยู่ภายในขอบเขตของพื้นหรือฝ้าทั้งหมด')
      return
    }
    const voids = Array.isArray(data.voids_mm) ? data.voids_mm as [number, number][][] : []
    const command = host.object_type === 'structure.slab'
      ? 'UpdateSlab'
      : host.object_type === 'architecture.floor' ? 'UpdateArchitecturalFloor' : 'UpdateCeiling'
    const result = CommandBus.execute(project, command, { ...data, id: hostId, voids_mm: [...voids, boundary_mm] })
    if (result.result.status === 'success') {
      setProject(result.updatedProject)
      setSelectedId(hostId)
      setFileFeedback('')
      if (result.emittedEnvelope) setCommandQueue(queue => [...queue, result.emittedEnvelope!])
    } else if (result.result.errors?.length) setFileFeedback(result.result.errors.join(' · '))
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

  const handleAssignTypeMany = (objectIds: string[], typeId: string) => {
    const objects = [...new Set(objectIds)].map(id => project.objects[id]).filter(Boolean)
    if (objects.length < 2 || objects.some(object => object.object_type !== objects[0].object_type)) return
    const type = project.types.find(candidate => candidate.id === typeId && candidate.object_type === objects[0].object_type)
    if (!type) return
    const result = dispatchCommandBatch(objects.map(object => ({
      name: 'AssignInstanceType',
      input: { object_id: object.id, type_id: type.id, type_name: type.name },
    })))
    if (result.status !== 'success') {
      setFileFeedback(result.errors?.[0] ?? 'เปลี่ยน Type ให้หลายวัตถุไม่สำเร็จ')
      return
    }
    setSelectedIds(objects.map(object => object.id))
    setSelectedId(objects.at(-1)!.id)
    setFileFeedback(`เปลี่ยน ${objects.length} ชิ้นเป็น ${type.name} แล้ว`)
  }

  const syncRenamedActiveType = (type: TypeDefinition, name: string) => {
    const entries: Array<[string,string,(value:string)=>void]> = [
      ['structure.column',activeColumnType,setActiveColumnType], ['structure.foundation',activeFoundationType,setActiveFoundationType],
      ['structure.beam',activeBeamType,setActiveBeamType], ['architecture.wall',activeWallType,setActiveWallType],
      ['door_window.door',activeDoorType,setActiveDoorType], ['door_window.window',activeWindowType,setActiveWindowType], ['structure.slab',activeSlabType,setActiveSlabType],
    ]
    for(const [family,value,setValue] of entries) if(family===type.object_type && value===type.name) setValue(name)
  }
  const openCatalog = (edit=false, fromSelection=false, familyOverride?:string) => {
    const object = fromSelection && selectedId ? project.objects[selectedId] : null
    const family = familyOverride ?? object?.object_type ?? TOOL_FAMILIES[activeTool] ?? 'structure.column'
    const marks:Record<string,string> = {column:activeColumnType,foundation:activeFoundationType,beam:activeBeamType,wall:activeWallType,door:activeDoorType,window:activeWindowType,slab:activeSlabType}
    const data = object?.module_data as Record<string,unknown> | undefined
    const type = project.types.find(t=>t.object_type===family && (data ? t.id===data.type_id || t.name===data.mark : t.name===marks[activeTool]))
    setCatalogContext({family,typeId:type?.id,edit,intent:object?'assign':'draw'})
    setIsTypeManagerOpen(true)
  }
  const chooseCatalogType = (type:TypeDefinition) => {
    if(catalogContext.intent==='assign' && selectedId) { handleAssignType(selectedId,type.id); return }
    const tool = Object.entries(TOOL_FAMILIES).find(([,family])=>family===type.object_type)?.[0] as ToolType | undefined
    if(!tool) return
    const setters:Record<string,(value:string)=>void> = {column:setActiveColumnType,foundation:setActiveFoundationType,beam:setActiveBeamType,wall:setActiveWallType,door:setActiveDoorType,window:setActiveWindowType,slab:setActiveSlabType}
    setters[tool](type.name);setActiveTool(tool)
  }

  // A reference grid is a single freely angled line defined by two points.
  const handleCommitGrid = (tag: string, start_mm: [number, number], end_mm: [number, number], sequenceStyle: 'auto' | 'alpha' | 'numeric' = 'auto') => {
    const dx = end_mm[0] - start_mm[0], dy = end_mm[1] - start_mm[1]
    const orientation = Math.abs(dx) <= Math.abs(dy) ? 'vertical' : 'horizontal'
    const position_mm = orientation === 'vertical' ? (start_mm[0] + end_mm[0]) / 2 : (start_mm[1] + end_mm[1]) / 2
    const extent_mm: [number, number] = orientation === 'vertical'
      ? [Math.min(start_mm[1], end_mm[1]), Math.max(start_mm[1], end_mm[1])]
      : [Math.min(start_mm[0], end_mm[0]), Math.max(start_mm[0], end_mm[0])]
    const res = CommandBus.execute(project, 'CreateGrid', {
      id: crypto.randomUUID(), tag, orientation, position_mm, extent_mm,
      start_point_mm: start_mm, end_point_mm: end_mm,
      sequence_style: sequenceStyle,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  const handleModifyGrid = (objectId: string, changes: { start_point_mm?: [number, number]; end_point_mm?: [number, number]; bubble_visible?: boolean; auto_tag?: boolean; sequence_style?: 'auto' | 'alpha' | 'numeric' }) => {
    const res = CommandBus.execute(project, 'ModifyGrid', { object_id: objectId, ...changes })
    if (res.result.status === 'success') { setProject(res.updatedProject); if (res.emittedEnvelope) setCommandQueue(queue => [...queue, res.emittedEnvelope!]) }
    else if (res.result.errors?.length) window.alert(res.result.errors.join('\n'))
  }

  const handleCopyGrid = (sourceId: string, start_mm: [number, number], end_mm: [number, number]) => {
    const source = project.objects[sourceId]
    if (!source || !isGridObject(source) || source.module_data.system_id) return
    const dx = end_mm[0] - start_mm[0], dy = end_mm[1] - start_mm[1]
    const orientation = Math.abs(dx) <= Math.abs(dy) ? 'vertical' : 'horizontal'
    const position_mm = orientation === 'vertical' ? (start_mm[0] + end_mm[0]) / 2 : (start_mm[1] + end_mm[1]) / 2
    const extent_mm: [number, number] = orientation === 'vertical' ? [Math.min(start_mm[1], end_mm[1]), Math.max(start_mm[1], end_mm[1])] : [Math.min(start_mm[0], end_mm[0]), Math.max(start_mm[0], end_mm[0])]
    const res = CommandBus.execute(project, 'CreateGrid', { id: crypto.randomUUID(), tag: source.module_data.tag, orientation, position_mm, extent_mm, start_point_mm: start_mm, end_point_mm: end_mm, sequence_style: source.module_data.sequence_style ?? 'auto', auto_tag: true, bubble_visible: true })
    if (res.result.status === 'success') { setProject(res.updatedProject); if (res.emittedEnvelope) setCommandQueue(queue => [...queue, res.emittedEnvelope!]) }
  }

  // Place a coordinated pair of axes in one user action. Each axis stores its
  // own explicit positions so every bay can have a different spacing.
  const handleCommitGridSystem = (origin_mm: [number, number], xIntervals_mm: number[], yIntervals_mm: number[], xFirstTag: string, yFirstTag: string) => {
    let updatedProject = project
    const envelopes: CommandEnvelope[] = []
    const createAxis = (orientation: 'vertical' | 'horizontal', origin: number, intervals: number[], first_tag: string) => {
      if (!intervals.length) return
      const positions_mm = [origin]
      for (const interval of intervals) positions_mm.push(positions_mm[positions_mm.length - 1]! + interval)
      const grid_ids = positions_mm.map(() => crypto.randomUUID())
      const result = CommandBus.execute(updatedProject, 'CreateGridSystem', {
        id: crypto.randomUUID(), grid_ids, orientation, origin_mm: origin,
        spacing_mm: intervals[0]!, count: positions_mm.length, positions_mm, first_tag,
      })
      if (result.result.status === 'success') {
        updatedProject = result.updatedProject
        if (result.emittedEnvelope) envelopes.push(result.emittedEnvelope)
      }
    }
    createAxis('vertical', origin_mm[0], xIntervals_mm, xFirstTag)
    createAxis('horizontal', origin_mm[1], yIntervals_mm, yFirstTag)
    if (updatedProject !== project) {
      setProject(updatedProject)
      if (envelopes.length) setCommandQueue(queue => [...queue, ...envelopes])
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

  const handleUpdateWallEndpoints = (objectId: string, start_point_mm: [number, number], end_point_mm: [number, number]) => {
    start_point_mm = snapEndpointToColumnCenter(start_point_mm)
    end_point_mm = snapEndpointToColumnCenter(end_point_mm)
    const res = CommandBus.execute(project, 'UpdateWallEndpoints', { object_id: objectId, start_point_mm, end_point_mm })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue(queue => [...queue, res.emittedEnvelope!])
    } else if (res.result.errors?.length) setFileFeedback(res.result.errors.join(' · '))
  }

  const handleUpdateBeamEndpoints = (objectId: string, start_point_mm: [number, number], end_point_mm: [number, number], start_column_id?: string | null, end_column_id?: string | null) => {
    if (start_column_id && isColumnObject(project.objects[start_column_id])) start_point_mm = [project.objects[start_column_id].module_data.location_mm[0], project.objects[start_column_id].module_data.location_mm[1]]
    if (end_column_id && isColumnObject(project.objects[end_column_id])) end_point_mm = [project.objects[end_column_id].module_data.location_mm[0], project.objects[end_column_id].module_data.location_mm[1]]
    const res = CommandBus.execute(project, 'UpdateBeamEndpoints', { object_id: objectId, start_point_mm, end_point_mm, start_column_id, end_column_id })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue(queue => [...queue, res.emittedEnvelope!])
    } else if (res.result.errors?.length) setFileFeedback(res.result.errors.join(' · '))
  }

  const handleResizeOpening = (objectId: string, width_mm: number) => {
    const opening = project.objects[objectId]
    if (!opening || (!isDoorObject(opening) && !isWindowObject(opening))) return
    const data = opening.module_data
    const name = isDoorObject(opening) ? 'UpdateDoorDimensions' : 'UpdateWindowDimensions'
    const input = { object_id: objectId, width_mm, height_mm: data.height_mm,
      ...(isDoorObject(opening) ? { sill_height_mm: Number(data.sill_height_mm ?? 0) } : { sill_height_mm: Number(data.sill_height_mm ?? 900) }),
      ...(data.vertical_constraint === 'head_level' ? { head_level_id: data.head_level_id, head_offset_mm: data.head_offset_mm, vertical_constraint: 'head_level' } : { vertical_constraint: 'fixed_height' }),
    }
    const res = CommandBus.execute(project, name, input)
    if (res.result.status === 'success') { setProject(res.updatedProject); if (res.emittedEnvelope) setCommandQueue(queue => [...queue, res.emittedEnvelope!]) }
    else if (res.result.errors?.length) setFileFeedback(res.result.errors.join(' · '))
  }

  const handleUpdateOpeningInstanceParameters = (objectId: string, parameters: Record<string, unknown | null>) => {
    const res = CommandBus.execute(project, 'UpdateOpeningInstanceParameters', { object_id: objectId, parameters })
    if (res.result.status === 'success') { setProject(res.updatedProject); if (res.emittedEnvelope) setCommandQueue(queue => [...queue, res.emittedEnvelope!]) }
    else if (res.result.errors?.length) setFileFeedback(res.result.errors.join(' · '))
  }

  const handleUpdateBoundaryVertex = (objectId: string, boundary_mm: [number, number][]) => {
    const object = project.objects[objectId]
    if (!object) return
    const data = object.module_data as Record<string, unknown>
    const command = object.object_type === 'structure.slab' ? 'UpdateSlab'
      : object.object_type === 'architecture.floor' ? 'UpdateArchitecturalFloor'
        : object.object_type === 'architecture.ceiling' ? 'UpdateCeiling' : null
    if (!command) return
    const input = object.object_type === 'structure.slab'
      ? { ...data, id: objectId, boundary_mm }
      : { ...data, id: objectId, boundary_mm, follows_room_boundary: false }
    const res = CommandBus.execute(project, command, input)
    if (res.result.status === 'success') { setProject(res.updatedProject); if (res.emittedEnvelope) setCommandQueue(queue => [...queue, res.emittedEnvelope!]) }
    else if (res.result.errors?.length) setFileFeedback(res.result.errors.join(' · '))
  }

  const handleUpdateRoomSeparator = (objectId: string, start_point_mm: [number, number], end_point_mm: [number, number]) => {
    const object = project.objects[objectId]
    if (!object || object.object_type !== 'architecture.room_separator') return
    const res = CommandBus.execute(project, 'UpdateRoomSeparator', { ...object.module_data, id: objectId, start_point_mm, end_point_mm })
    if (res.result.status === 'success') { setProject(res.updatedProject); if (res.emittedEnvelope) setCommandQueue(queue => [...queue, res.emittedEnvelope!]) }
    else if (res.result.errors?.length) setFileFeedback(res.result.errors.join(' · '))
  }

  const handleResizeColumn = (objectId: string, section_mm: [number, number]) => {
    const res = CommandBus.execute(project, 'UpdateColumnDimensions', { object_id: objectId, section_mm })
    if (res.result.status === 'success') { setProject(res.updatedProject); if (res.emittedEnvelope) setCommandQueue(queue => [...queue, res.emittedEnvelope!]) }
    else if (res.result.errors?.length) setFileFeedback(res.result.errors.join(' · '))
  }

  const handleResizeFoundation = (objectId: string, size_mm: [number, number]) => {
    const foundation = project.objects[objectId]
    if (!foundation || !isFoundationObject(foundation)) return
    const res = CommandBus.execute(project, 'UpdateFoundationDimensions', { object_id: objectId, size_mm: [size_mm[0], size_mm[1], foundation.module_data.size_mm[2]] })
    if (res.result.status === 'success') { setProject(res.updatedProject); if (res.emittedEnvelope) setCommandQueue(queue => [...queue, res.emittedEnvelope!]) }
    else if (res.result.errors?.length) setFileFeedback(res.result.errors.join(' · '))
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

  const handleUpdateColumnVerticalReference = (objectId: string, changes: { base_level_id?: string; top_level_id?: string | null; base_offset_mm?: number; top_offset_mm?: number }) => {
    const res = CommandBus.execute(project, 'UpdateColumnVerticalReference', { object_id: objectId, ...changes })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue(queue => [...queue, res.emittedEnvelope!])
    } else if (res.result.errors?.length) window.alert(res.result.errors.join('\n'))
  }

  const handleUpdateBeamVerticalReference = (objectId: string, changes: { level_id?: string; base_offset_mm?: number }) => {
    const res = CommandBus.execute(project, 'UpdateBeamVerticalReference', { object_id: objectId, ...changes })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue(queue => [...queue, res.emittedEnvelope!])
    } else if (res.result.errors?.length) window.alert(res.result.errors.join('\n'))
  }

  const handleUpdateArchitectureSurface = (objectId: string, changes: { level_id?: string; elevation_offset_mm?: number; thickness_mm?: number; material?: string; finish_layers?: Array<{ material: string; thickness_mm: number; mark?: string; quantity_unit?: 'm2' | 'm3' }>; finish_pattern_mm?: [number, number]; finish_pattern_origin_mm?: [number, number]; finish_pattern_rotation_deg?: number; grid_mm?: [number, number] }) => {
    const object = project.objects[objectId]
    if (!object || (object.object_type !== 'architecture.floor' && object.object_type !== 'architecture.ceiling')) return
    const data = object.module_data as Record<string, unknown>
    const oldLevelId = typeof data.level_id === 'string' ? data.level_id : project.project.active_level_id
    const levelId = changes.level_id ?? oldLevelId
    const level = project.levels.find(item => item.id === levelId)
    if (!level) { setFileFeedback(`ไม่พบระดับชั้น ${levelId}`); return }
    const oldLevel = project.levels.find(item => item.id === oldLevelId)
    const worldElevation = resolveArchitectureSurfaceElevation(project, object) ?? Number(data.elevation_mm ?? 0)
    const currentOffset = worldElevation - Number(oldLevel?.elevation_mm ?? 0)
    const offset = changes.elevation_offset_mm ?? currentOffset
    const command = object.object_type === 'architecture.floor' ? 'UpdateArchitecturalFloor' : 'UpdateCeiling'
    const res = CommandBus.execute(project, command, {
      ...data,
      ...changes,
      id: objectId,
      level_id: levelId,
      elevation_reference: 'level',
      elevation_offset_mm: offset,
      elevation_mm: level.elevation_mm + offset,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue(queue => [...queue, res.emittedEnvelope!])
    } else if (res.result.errors?.length) setFileFeedback(res.result.errors.join(' · '))
  }

  const handleUpdateSlab = (objectId: string, changes: { level_id?: string; elevation_offset_mm?: number; thickness_mm?: number; slab_system?: string; material?: string }) => {
    const object = project.objects[objectId]
    if (!object || object.object_type !== 'structure.slab') return
    const data = object.module_data as Record<string, unknown>
    const oldLevelId = typeof data.level_id === 'string' ? data.level_id : project.project.active_level_id
    const levelId = changes.level_id ?? oldLevelId
    const level = project.levels.find(item => item.id === levelId)
    if (!level) { setFileFeedback(`ไม่พบระดับชั้น ${levelId}`); return }
    const oldLevel = project.levels.find(item => item.id === oldLevelId)
    const currentResolved = Number(data.elevation_mm ?? (oldLevel ? oldLevel.elevation_mm + Number(data.elevation_offset_mm ?? 0) : 0))
    const currentOffset = Number(data.elevation_offset_mm ?? (oldLevel ? currentResolved - oldLevel.elevation_mm : 0))
    const offset = changes.elevation_offset_mm !== undefined ? changes.elevation_offset_mm : currentOffset
    const res = CommandBus.execute(project, 'UpdateSlab', {
      ...data,
      ...changes,
      id: objectId,
      level_id: levelId,
      elevation_offset_mm: offset,
      elevation_mm: level.elevation_mm + offset,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue(queue => [...queue, res.emittedEnvelope!])
    } else if (res.result.errors?.length) {
      setFileFeedback(res.result.errors.join(' · '))
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

  const handleUpdateGridSystem = (systemId: string, changes: { positions_mm?: number[]; first_tag?: string }) => {
    const member = Object.values(project.objects).filter(isGridObject).find(object => object.module_data.system_id === systemId)
    if (!member) return
    const data = member.module_data
    const members = Object.values(project.objects).filter(isGridObject)
      .filter(object => object.module_data.system_id === systemId)
      .sort((a, b) => (a.module_data.system_index ?? 0) - (b.module_data.system_index ?? 0))
    const positions_mm = changes.positions_mm ?? members.map(object => object.module_data.position_mm)
    const gridIds = Array.from({ length: positions_mm.length }, (_, index) => members[index]?.id ?? crypto.randomUUID())
    const res = CommandBus.execute(project, 'UpdateGridSystem', {
      system_id: systemId, grid_ids: gridIds,
      positions_mm,
      first_tag: changes.first_tag ?? data.system_first_tag ?? data.tag,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue(q => [...q, res.emittedEnvelope!])
    }
  }

  const handleUpdateWallFace = (objectId: string, changes: {
    plaster_inside_thickness_mm?: number
    plaster_outside_thickness_mm?: number
    plaster_inside_material?: string
    plaster_outside_material?: string
    interior_side?: 'left' | 'right'
    top_level_id?: string
    base_offset_mm?: number
    top_offset_mm?: number
    vertical_constraint?: 'fixed_height' | 'top_level'
  }) => {
    const wall = project.objects[objectId]
    if (!isWallObject(wall)) return
    const res = CommandBus.execute(project, 'UpdateWallDimensions', {
      object_id: objectId,
      thickness_mm: wall.module_data.thickness_mm,
      ...changes,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      if (res.emittedEnvelope) setCommandQueue((q) => [...q, res.emittedEnvelope!])
    }
  }

  const handleUpdateOpeningVertical = (objectId: string, changes: {
    sill_height_mm?: number
    height_mm?: number
    head_level_id?: string
    head_offset_mm?: number
    vertical_constraint?: 'fixed_height' | 'head_level'
  }) => {
    const opening = project.objects[objectId]
    if (!opening || (!isDoorObject(opening) && !isWindowObject(opening))) return
    const data = opening.module_data
    const isFixed = changes.vertical_constraint === 'fixed_height' || changes.head_level_id === '' || changes.head_level_id === null
    const result = CommandBus.execute(project, isDoorObject(opening) ? 'UpdateDoorDimensions' : 'UpdateWindowDimensions', {
      object_id: objectId,
      width_mm: data.width_mm,
      height_mm: changes.height_mm ?? data.height_mm,
      ...(isWindowObject(opening) ? { sill_height_mm: changes.sill_height_mm ?? data.sill_height_mm } : {}),
      ...changes,
      ...(isFixed ? { head_level_id: '', vertical_constraint: 'fixed_height' } : {}),
    })
    if (result.result.status === 'success') {
      setProject(result.updatedProject)
      if (result.emittedEnvelope) setCommandQueue((q) => [...q, result.emittedEnvelope!])
    }
  }

  const handleMoveElevationObject = (objectId: string, deltaWorldMm: [number,number], deltaZMm: number, verticalIntent: 'move'|'top') => {
    const object=project.objects[objectId];if(!object)return
    if(isWallObject(object)){
      const commands:CommandRequest[]=[]
      if(Math.hypot(...deltaWorldMm)>0.1)commands.push({name:'MoveWall',input:{object_id:objectId,delta_mm:deltaWorldMm}})
      if(Math.abs(deltaZMm)>0.1){const d=object.module_data;const topEdit=verticalIntent==='top';commands.push({name:'UpdateWallDimensions',input:{object_id:objectId,thickness_mm:d.thickness_mm,...(topEdit?(d.vertical_constraint==='top_level'?{top_level_id:d.top_level_id,top_offset_mm:Number(d.top_offset_mm??0)+deltaZMm,vertical_constraint:'top_level'}:{height_mm:Math.max(100,Number(d.height_mm)+deltaZMm),vertical_constraint:'fixed_height'}):(d.vertical_constraint==='top_level'?{top_level_id:d.top_level_id,base_offset_mm:Number(d.base_offset_mm??0)+deltaZMm,top_offset_mm:Number(d.top_offset_mm??0)+deltaZMm,vertical_constraint:'top_level'}:{height_mm:d.height_mm,base_offset_mm:Number(d.base_offset_mm??0)+deltaZMm,vertical_constraint:'fixed_height'}))}})}
      if(commands.length)dispatchCommandBatch(commands)
      return
    }
    if(isDoorObject(object)||isWindowObject(object)){
      const commands:CommandRequest[]=[]
      if(Math.hypot(...deltaWorldMm)>0.1){const wall=project.objects[object.module_data.wall_id];if(isWallObject(wall)){const a=wall.module_data.start_point_mm,b=wall.module_data.end_point_mm,length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length>0){const along=(deltaWorldMm[0]*(b[0]-a[0])+deltaWorldMm[1]*(b[1]-a[1]))/length;commands.push({name:'MoveOpening',input:{object_id:objectId,offset_along_wall_mm:object.module_data.offset_along_wall_mm+along}})}}}
      if(Math.abs(deltaZMm)>0.1){const d=object.module_data;const vertical=verticalIntent==='top'?(d.vertical_constraint==='head_level'?{head_level_id:d.head_level_id,head_offset_mm:Number(d.head_offset_mm??0)+deltaZMm,vertical_constraint:'head_level'}:{height_mm:Math.max(100,d.height_mm+deltaZMm),vertical_constraint:'fixed_height'}):{sill_height_mm:Math.max(0,Number(d.sill_height_mm??0)+deltaZMm)};commands.push({name:isDoorObject(object)?'UpdateDoorDimensions':'UpdateWindowDimensions',input:{object_id:objectId,width_mm:d.width_mm,height_mm:d.height_mm,...vertical}})}
      if(commands.length)dispatchCommandBatch(commands)
      return
    }
    if(isColumnObject(object)&&Math.hypot(...deltaWorldMm)>0.1){const [x,y]=object.module_data.location_mm;handleMoveColumn(objectId,[x+deltaWorldMm[0],y+deltaWorldMm[1]])}
  }

  // Delete objects under a drag eraser or multi-selection; hosted dependents are removed by the normal object command.
  const handleDeleteObjects = (objectIds: string[]) => {
    let current = project
    const envelopes: CommandEnvelope[] = []
    let failureReason: string | null = null
    for (const objectId of [...new Set(objectIds)]) {
      if (!current.objects[objectId]) continue
      const result = CommandBus.execute(current, 'DeleteObject', { object_id: objectId })
      if (result.result.status !== 'success') {
        failureReason = result.result.errors?.[0] ?? 'ลบชิ้นงานไม่สำเร็จ'
        continue
      }
      current = result.updatedProject
      if (result.emittedEnvelope) envelopes.push(result.emittedEnvelope)
    }
    if (current !== project) {
      setProject(current); setSelectedId(null); setSelectedIds([])
      setCommandQueue(queue => [...queue, ...envelopes])
    } else if (failureReason) {
      setFileFeedback(failureReason)
    }
  }
  const handleDeleteObject = (objectId: string) => handleDeleteObjects([objectId])

  const handleCopyObjects = (objectIds: string[]) => {
    const ids = [...new Set(objectIds)].filter(id => Boolean(project.objects[id]))
    if (!ids.length) return
    copiedObjectIdsRef.current = ids
    pasteCountRef.current = 0
    setFileFeedback(`คัดลอก ${ids.length} ชิ้นแล้ว · Ctrl+V เพื่อวาง`)
  }

  const handlePasteObjects = () => {
    const objectIds = copiedObjectIdsRef.current.filter(id => Boolean(project.objects[id]))
    if (!objectIds.length) return
    const id_map = Object.fromEntries(objectIds.map(id => [id, crypto.randomUUID()]))
    const distance = 500 * (pasteCountRef.current + 1)
    const result = dispatchCommandBatch([{ name: 'DuplicateObjects', input: { object_ids: objectIds, delta_x_mm: distance, delta_y_mm: 0, id_map } }])
    if (result.status !== 'success') {
      setFileFeedback(result.errors?.[0] ?? 'คัดลอกวัตถุไม่สำเร็จ')
      return
    }
    pasteCountRef.current += 1
    const ids = result.results[0]?.affected_object_ids ?? []
    if (ids.length) { setSelectedIds(ids); setSelectedId(ids[0]) }
    setFileFeedback(`วางสำเนา ${ids.length} ชิ้นแล้ว · เยื้องจากชุดต้นฉบับ ${distance} มม.`)
  }

  useEffect(() => {
    const isEditingText = (target: EventTarget | null) => target instanceof HTMLElement
      && (target.isContentEditable || Boolean(target.closest('input, textarea, select, [contenteditable="true"]')))
    const handleClipboardShortcuts = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || isEditingText(event.target) || document.querySelector('[role="dialog"]')) return
      if (event.key.toLowerCase() === 'c') {
        const ids = selectedIds.length ? selectedIds : selectedId ? [selectedId] : []
        if (!ids.length) return
        event.preventDefault()
        handleCopyObjects(ids)
      } else if (event.key.toLowerCase() === 'v' && copiedObjectIdsRef.current.length) {
        event.preventDefault()
        handlePasteObjects()
      }
    }
    window.addEventListener('keydown', handleClipboardShortcuts)
    return () => window.removeEventListener('keydown', handleClipboardShortcuts)
  }, [selectedId, selectedIds, project])

  // Delete the selected object from the plan without intercepting text editing.
  useEffect(() => {
    const handleDeleteShortcut = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('[role="dialog"]')) return
      const target = e.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"]'))) return
      if (!selectedId && selectedIds.length === 0) return
      e.preventDefault()
      handleDeleteObjects(selectedIds.length ? selectedIds : selectedId ? [selectedId] : [])
    }
    window.addEventListener('keydown', handleDeleteShortcut)
    return () => window.removeEventListener('keydown', handleDeleteShortcut)
  }, [selectedId, selectedIds, project, handleDeleteObject])

  const confirmReplaceUnsavedProject = () => {
    const hasUnsavedLocalEdits = locallySavedProjectJsonRef.current !== projectJson
    return !hasUnsavedLocalEdits || window.confirm('มีการแก้ไขที่ยังไม่ได้บันทึกในเบราว์เซอร์นี้ ต้องการแทนที่โครงการปัจจุบันหรือไม่?')
  }

  // Export .cfproj file
  const handleDownloadProjectCopy = () => {
    const json = projectJson
    const filename = projectFileName(project)
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setSavedProjectJson(json)
    setReplacementBaselineJson(json)
    setFileFeedback(`ส่งคำขอดาวน์โหลด ${filename} แล้ว`)
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const handleSaveLocalProject = async () => {
    setLocalAutosaveState('saving')
    try {
      await saveLocalProjectSnapshot({ projectJson, savedProjectJson, replacementBaselineJson })
      locallySavedProjectJsonRef.current = projectJson
      setLocalAutosaveState('saved')
      setFileFeedback('บันทึกในเบราว์เซอร์เครื่องนี้แล้ว')
    } catch (error) {
      console.error('Unable to save local ConstructFlow project', error)
      setLocalAutosaveState('error')
      setFileFeedback('บันทึกในเครื่องไม่สำเร็จ')
    }
  }

  const handleSaveAsProject = async () => {
    const json = projectJson
    const filename = projectFileName(project)
    const fileWindow = window as ProjectSaveWindow
    if (fileWindow.showSaveFilePicker) {
      try {
        const handle = await fileWindow.showSaveFilePicker.call(window, {
          suggestedName: filename,
          types: [{ description: 'ConstructFlow Project', accept: { 'application/json': ['.cfproj'] } }],
        })
        await writeProjectFile(handle, json)
        setSavedProjectJson(json)
        setReplacementBaselineJson(json)
        setFileFeedback(`บันทึกไฟล์ ${filename} แล้ว`)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        window.alert(`บันทึกไฟล์โครงการไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
      }
      return
    }
    handleDownloadProjectCopy()
  }

  const handleExportTakeoff = () => {
    const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
    const rows = [
      ['Cost center', 'Phase', 'Mark', 'Object type', 'Material', 'Quantity', 'Unit', 'Waste %', 'Gross Quantity', 'Formula'],
      ...takeoff.lines.map((line) => [
        line.cost_center, line.phase, line.mark, line.object_type, line.material ?? '',
        line.quantity.toFixed(3), line.unit, `${line.waste_percent ?? 0}%`,
        (line.gross_quantity ?? line.quantity).toFixed(3), line.formula,
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

  const handleExportBOQ = () => {
    const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
    const rows = [
      ['หมวดงาน / Cost Center', 'สถานะ / Phase', 'สัญลักษณ์ / Mark', 'ประเภทวัตถุ', 'วัสดุ', 'ปริมาณสุทธิ', 'หน่วย', 'เผื่อเศษ (%)', 'ปริมาณรวมเศษ', 'ราคาวัสดุ/หน่วย (บาท)', 'รวมค่าวัสดุ (บาท)', 'ค่าแรง/หน่วย (บาท)', 'รวมค่าแรง (บาท)', 'รวมต้นทุนตรง (บาท)', 'สูตรคำนวณ'],
    ]
    for (const [, cc] of Object.entries(boq.cost_centers)) {
      for (const item of cc.items) {
        rows.push([
          cc.cost_center_label_th, item.phase, item.mark, item.object_type, item.material ?? '',
          item.net_quantity.toFixed(3), item.unit, `${item.waste_percent}%`, item.gross_quantity.toFixed(3),
          item.unit_material_cost_thb.toFixed(2), item.total_material_cost_thb.toFixed(2),
          item.unit_labor_cost_thb.toFixed(2), item.total_labor_cost_thb.toFixed(2),
          item.total_direct_cost_thb.toFixed(2), item.formula,
        ])
      }
    }
    rows.push([])
    rows.push(['--- หมวดงานเตรียมการและงานชั่วคราว (Preliminaries) ---', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])
    for (const pre of boq.preliminaries.items) {
      rows.push([
        'งานเตรียมการและงานชั่วคราว', 'new_construction', pre.code, pre.category, pre.description,
        pre.quantity.toFixed(2), pre.unit, '0%', pre.quantity.toFixed(2),
        pre.rate_thb.toFixed(2), pre.amount_thb.toFixed(2), '0.00', '0.00', pre.amount_thb.toFixed(2), pre.notes,
      ])
    }
    rows.push([])
    rows.push(['--- สรุปประมาณการค่างานทั้งโครงการ (BOQ Summary) ---', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])
    rows.push(['สรุปต้นทุนตรงค่าวัสดุ (Direct Material)', '', '', '', '', '', '', '', '', '', boq.total_direct_material_thb.toFixed(2), '', '', '', ''])
    rows.push(['สรุปต้นทุนตรงค่าแรง (Direct Labor)', '', '', '', '', '', '', '', '', '', '', '', boq.total_direct_labor_thb.toFixed(2), '', ''])
    rows.push(['รวมต้นทุนตรงค่างาน (Direct Cost)', '', '', '', '', '', '', '', '', '', '', '', '', boq.total_direct_cost_thb.toFixed(2), ''])
    rows.push(['รวมงานเตรียมการและงานชั่วคราว (Preliminaries)', '', '', '', '', '', '', '', '', '', '', '', '', boq.preliminaries_cost_thb.toFixed(2), ''])
    rows.push(['รวมต้นทุนตรงรวมงานเตรียมการ', '', '', '', '', '', '', '', '', '', '', '', '', boq.total_direct_with_preliminaries_thb.toFixed(2), ''])
    rows.push([`Factor F (งานอาคาร กรมบัญชีกลาง - กำไร ดอกเบี้ย ภาษี 7%)`, '', '', '', '', '', '', '', '', '', '', '', '', boq.factor_f.factor_f.toFixed(4), ''])
    rows.push(['ยอดรวมค่าก่อสร้างสุทธิ (Grand Total THB)', '', '', '', '', '', '', '', '', '', '', '', '', boq.grand_total_thb.toFixed(2), ''])

    const csv = `\uFEFF${rows.map((row) => row.map(escape).join(',')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${project.project.id || 'project'}-boq-thailand.csv`
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

  const handleOpenProject = async (file?: File) => {
    if (!file) return
    try {
      const { project: loaded, serialized: loadedJson } = await readProjectFile(file)
      if (!confirmReplaceUnsavedProject()) return
      projectSessionRef.current!.reset(loaded)
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
      if (handle) await handleOpenProject(await handle.getFile())
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
    setProjectState(generated.updatedProject)
    setSavedProjectJson(null)
    setReplacementBaselineJson(serializeProject(generated.updatedProject))
    setFileFeedback('สร้างโมเดลครัวพิสูจน์แล้ว')
    setSelectedId(null)
    setCommandQueue(generated.emittedEnvelopes)
    setViewMode('plan')
  }

  const handleStartHouseDemo = () => {
    if (!confirmReplaceUnsavedProject()) return
    try {
      const restored = deserializeProject(houseDemoRaw)
      projectSessionRef.current!.reset(restored)
      setProjectState(restored)
      setSavedProjectJson(null)
      setReplacementBaselineJson(serializeProject(restored))
      setFileFeedback('เปิดแบบบ้านเดโม 2 ชั้นแล้ว')
      setSelectedId(null)
      setSelectedIds([])
      setCommandQueue([])
      setViewMode('plan')
    } catch (error) {
      window.alert(`เปิดแบบบ้านเดโมไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    }
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
  const boq = calculatePhasedBOQ(project)

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

  if (!localAutosaveReady) return (
    <div role="status" aria-live="polite" style={{ display: 'grid', placeItems: 'center', width: '100vw', height: '100vh', color: '#475569', fontFamily: 'sans-serif' }}>
      กำลังตรวจและกู้คืนงานที่บันทึกไว้ในเครื่อง…
    </div>
  )

  return (
    <div className="cf-app-root" style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Focused project header */}
      <header className="cf-app-header">
        <div className="cf-brand">
          <span className="cf-brand-mark">CF</span>
          <span className="cf-brand-name">ConstructFlow</span>
          <span className="cf-brand-divider" />
          {isProjectNameEditing ? (
            <input
              autoFocus
              className="cf-project-name-input"
              aria-label="ชื่อโครงการ"
              value={projectNameDraft}
              onChange={event => setProjectNameDraft(event.target.value)}
              onBlur={handleProjectNameCommit}
              onKeyDown={event => {
                if (event.key === 'Enter') { event.preventDefault(); handleProjectNameCommit() }
                if (event.key === 'Escape') { setProjectNameDraft(project.project.name); setIsProjectNameEditing(false) }
              }}
            />
          ) : (
            <button
              type="button"
              className="cf-project-name"
              title="คลิกเพื่อแก้ชื่อโครงการ"
              aria-label={`แก้ชื่อโครงการ: ${project.project.name}`}
              onClick={() => { setProjectNameDraft(project.project.name); setIsProjectNameEditing(true) }}
            >{project.project.name}</button>
          )}
        </div>

        <div className="cf-header-model-controls">
          <label className="cf-header-field">
            <span>ชั้น</span>
            <select value={project.project.active_level_id} onChange={(e) => handleSetWorkingLevel(e.target.value)} aria-label="ชั้นอาคาร">
              {project.levels.map((lvl) => {
                const thaiPrefix = lvl.name.includes('ชั้น') ? '' : lvl.id === 'GF' || lvl.name.toLowerCase().includes('ground') ? 'ชั้น 1 · ' : lvl.id === 'L1' || lvl.name.toLowerCase().includes('first') ? 'ชั้น 2 · ' : lvl.name.toLowerCase().includes('roof') ? 'ระดับหลังคา · ' : ''
                return <option key={lvl.id} value={lvl.id}>{thaiPrefix}{lvl.name} ({lvl.elevation_mm >= 0 ? '+' : ''}{formatLengthMm(lvl.elevation_mm, displayUnit)} {displayUnit})</option>
              })}
            </select>
          </label>
          {activeTool === 'column' && <label className="cf-header-field">
            <span>ยอดเสา</span>
            <select aria-label="ระดับยอดเสาที่กำลังวาด" value={project.levels.some(level => level.id === activeColumnTopLevelId && level.elevation_mm > (project.levels.find(item => item.id === project.project.active_level_id)?.elevation_mm ?? -Infinity)) ? activeColumnTopLevelId : nextHigherLevelId(project, project.project.active_level_id)} onChange={event => setActiveColumnTopLevelId(event.target.value)}>
              {project.levels.filter(level => level.elevation_mm > (project.levels.find(item => item.id === project.project.active_level_id)?.elevation_mm ?? -Infinity)).map(level => <option key={level.id} value={level.id}>{level.name} (+{formatLengthMm(level.elevation_mm, displayUnit)} {displayUnit})</option>)}
              {!project.levels.some(level => level.elevation_mm > (project.levels.find(item => item.id === project.project.active_level_id)?.elevation_mm ?? -Infinity)) && <option value="">ความสูงตามช่วงชั้น</option>}
            </select>
          </label>}
          <label className="cf-header-field cf-phase-field">
            <span>เฟสสร้าง</span>
            <select value={project.project.active_phase} onChange={(e) => handleSetWorkingPhase(e.target.value as Phase)} aria-label="เฟสงาน">
              {project.phases.map((ph) => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
            </select>
          </label>
          <label className="cf-unit-pill">หน่วย
            <select aria-label="หน่วยความยาวของโครงการ" value={displayUnit} onChange={event => setProject(current => ({ ...current, project: { ...current.project, display_unit: event.target.value as DisplayLengthUnit } }))}>
              <option value="m">m</option><option value="cm">cm</option><option value="mm">mm</option>
            </select>
          </label>
        </div>

        <div className="cf-header-actions">
          <input id="cfproj-open" type="file" accept=".cfproj,application/json" aria-hidden="true" tabIndex={-1} className="cf-visually-hidden" onChange={(e) => { void handleOpenProject(e.currentTarget.files?.[0] ?? undefined); e.currentTarget.value = '' }} />
          {supportsProjectFileOpen ? (
            <button type="button" className="cf-button cf-button-quiet" onClick={() => void handleChooseProject()} title="เปิดไฟล์โครงการ .cfproj"><FolderOpen size={16} /><span>เปิด</span></button>
          ) : (
            <label htmlFor="cfproj-open" role="button" tabIndex={0} className="cf-button cf-button-quiet" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); document.getElementById('cfproj-open')?.click() } }}><FolderOpen size={16} /><span>เปิด</span></label>
          )}
          <button type="button" className="cf-button cf-button-primary" onClick={() => void handleSaveLocalProject()} title="บันทึกงานในเบราว์เซอร์เครื่องนี้"><Save size={16} /><span>บันทึก</span></button>
          <details className="cf-save-menu" onClick={(event) => {
            if ((event.target as HTMLElement).closest('button')) event.currentTarget.open = false
          }}>
            <summary className="cf-icon-button" aria-label="ตัวเลือกบันทึก" title="บันทึกเป็นไฟล์"><ChevronDown size={15} /></summary>
            <div className="cf-more-popover cf-save-popover">
              <button type="button" aria-label="บันทึกเป็นไฟล์ .cfproj" onClick={() => void handleSaveAsProject()}><Download size={15} /> บันทึกเป็นไฟล์ (.cfproj)…</button>
            </div>
          </details>
          <span role="status" aria-live="polite" className={`cf-save-status ${localAutosaveState === 'error' ? 'is-unsaved' : ''}`}>{localAutosaveState === 'saving' || localAutosaveState === 'restoring' ? 'กำลังบันทึกในเครื่อง…' : localAutosaveState === 'error' ? 'บันทึกในเครื่องไม่สำเร็จ' : 'บันทึกในเครื่องแล้ว'}{fileFeedback ? ` · ${fileFeedback}` : ''}</span>
          <button type="button" className="cf-icon-button" disabled={!projectSessionRef.current!.canUndo} onClick={() => { setProjectState(projectSessionRef.current!.undo()); setCommandQueue([]) }} title="ย้อนกลับ (Ctrl/⌘+Z)" aria-label="ย้อนกลับ"><Undo2 size={17} /></button>
          <button type="button" className="cf-icon-button" disabled={!projectSessionRef.current!.canRedo} onClick={() => { setProjectState(projectSessionRef.current!.redo()); setCommandQueue([]) }} title="ทำซ้ำ (Ctrl/⌘+Shift+Z หรือ Ctrl/⌘+Y)" aria-label="ทำซ้ำ"><Redo2 size={17} /></button>
          <details className="cf-more-menu" onClick={(event) => {
            if ((event.target as HTMLElement).closest('button')) {
              event.currentTarget.open = false;
              event.currentTarget.querySelector('summary')?.focus();
            }
          }}>
            <summary className="cf-button cf-button-quiet" aria-label="เมนูโครงการ" title="เมนูโครงการ">เมนู</summary>
            <div className="cf-more-popover">
              <div className="cf-menu-label">โครงการ</div>
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
              <button type="button" aria-label="เปิดแบบบ้านเดโม 2 ชั้น" onClick={handleStartHouseDemo}><Home size={15} /> เปิดแบบบ้านเดโม 2 ชั้น (House Demo)</button>
              <button type="button" aria-label="เปิดโครงการตัวอย่างครัว" onClick={handleStartKitchenProof}><CookingPot size={15} /> เปิดโครงการตัวอย่างครัว (Kitchen Proof)</button>
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
              underlayHasImage={viewMode === 'plan' && !!underlay.image}
              underlayVisible={underlay.visible}
              underlayOpacity={underlay.opacity}
              onToggleUnderlayVisible={() => setUnderlay((u) => ({ ...u, visible: !u.visible }))}
              onChangeUnderlayOpacity={(opacity) => setUnderlay((u) => ({ ...u, opacity }))}
              onUploadUnderlayImage={handleUploadUnderlayImage}
              onClearUnderlay={handleClearUnderlay}
              onOpenTypeManager={() => openCatalog()}
            />
        </aside>

        {/* Center Canvas Area */}
        <main className="cf-canvas-shell">
          <div className="cf-view-switch">
            {([
              ['plan', 'แปลน'], ['north', 'รูปด้านเหนือ'], ['south', 'รูปด้านใต้'],
              ['east', 'รูปด้านตะวันออก'], ['west', 'รูปด้านตะวันตก'], ['rcp', 'แปลนฝ้า RCP'], ['model3d', '3D ดูตัวอย่าง'],
            ] as const).map(([mode, label]) => (
              <button key={mode} type="button" onClick={() => setViewMode(mode)} className={viewMode === mode ? 'is-active' : ''}>{label}</button>
            ))}
            {viewMode === 'plan' && <button type="button" onClick={handleDetectRooms} title="ค้นหาห้องจากวงผนังปิด">ตรวจจับห้อง</button>}
            {viewMode === 'plan' && <details className="cf-label-menu" onClick={event => {
              if ((event.target as HTMLElement).closest('input')) event.stopPropagation()
            }}>
              <summary title="การแสดงป้ายและระยะ" aria-label="การแสดงป้ายและระยะ"><Tag size={15} aria-hidden="true" /></summary>
              <div className="cf-label-popover" role="group" aria-label="การแสดงป้ายและระยะ">
                <strong>ป้ายชื่อและระยะ</strong>
                <div className="cf-label-style-toggle" role="group" aria-label="รูปแบบป้ายคาน">
                  <button type="button" aria-pressed={labelMode === 'name'} onClick={() => setLabelMode('name')}>ชื่อ</button>
                  <button type="button" aria-pressed={labelMode === 'name-size'} onClick={() => setLabelMode('name-size')}>ชื่อ + ขนาดคาน</button>
                </div>
                <div className="cf-label-category-list">
                  {([
                    ['structure', 'โครงสร้าง · เสา ฐานราก'],
                    ['beams', 'คานโครงสร้าง'],
                    ['walls', 'ผนัง · รหัสผิวสองด้าน'],
                    ['openings', 'ประตูและหน้าต่าง'],
                    ['grids', 'กริดไลน์'],
                  ] as const).map(([key, label]) => <label key={key}>
                    <input type="checkbox" checked={Boolean(labelVisibility[key])} onChange={event => setLabelVisibility(current => ({ ...current, [key]: event.target.checked }))} />
                    <span>{label}</span>
                  </label>)}
                </div>
              </div>
            </details>}
          </div>

          {/* Interactive Plan Canvas */}
          <div className="cf-viewport-stage">
            {viewMode === 'plan' ? <PlanCanvas
              project={project}
              displayUnit={displayUnit}
              activeTool={activeTool}
              activeColumnTypeMark={activeColumnType}
              activeFoundationTypeMark={activeFoundationType}
              activeBeamTypeMark={activeBeamType}
              activeWallTypeMark={activeWallType}
              activeDoorTypeMark={activeDoorType}
              activeWindowTypeMark={activeWindowType}
              activeSlabTypeMark={activeSlabType}
              labelMode={labelMode}
              labelVisibility={labelVisibility}
              coordination={coordinationFindings}
              coordinationFocusSelection={false}
              onOpenTypeManager={() => openCatalog()}
              onChangeActiveTypeMark={(mark) => {
                if (activeTool === 'column') setActiveColumnType(mark)
                else if (activeTool === 'foundation') setActiveFoundationType(mark)
                else if (activeTool === 'beam') setActiveBeamType(mark)
                else if (activeTool === 'wall') setActiveWallType(mark)
                else if (activeTool === 'door') setActiveDoorType(mark)
                else if (activeTool === 'window') setActiveWindowType(mark)
                else if (activeTool === 'slab') setActiveSlabType(mark)
              }}
              selectedId={selectedId}
              selectedIds={selectedIds}
              underlay={underlay}
              onSelectObject={setSelectedId}
              onRequestEditProperties={() => { setRightPanelTab('properties'); setInspectorOpen(true) }}
              onSelectionChange={(ids, primary) => { setSelectedIds(ids); setSelectedId(primary) }}
              onDeleteObjects={handleDeleteObjects}
              onCopyObjects={handleCopyObjects}
              onCommitColumn={handleCommitColumn}
              onCommitFoundation={handleCommitFoundation}
              onCommitBeam={handleCommitBeam}
              onCommitWall={handleCommitWall}
              onCommitDoor={handleCommitDoor}
              onCommitWindow={handleCommitWindow}
              onCommitSlab={handleCommitSlab}
              onCommitArchitecturalFloor={handleCommitArchitecturalFloor}
              onCommitCeiling={handleCommitCeiling}
              onCommitRoomSeparator={handleCommitRoomSeparator}
              onCommitSurfaceVoid={handleCommitSurfaceVoid}
              onCommitGrid={handleCommitGrid}
              onCommitGridSystem={handleCommitGridSystem}
              onModifyGrid={handleModifyGrid}
              onCopyGrid={handleCopyGrid}
              onActivateTool={setActiveTool}
              onCommitStair={handleCommitStair}
              onMoveColumn={handleMoveColumn}
              onMoveWall={handleMoveWall}
              onMoveOpening={handleMoveOpening}
              onUpdateWallEndpoints={handleUpdateWallEndpoints}
              onUpdateBeamEndpoints={handleUpdateBeamEndpoints}
              onResizeOpening={handleResizeOpening}
              onUpdateBoundaryVertex={handleUpdateBoundaryVertex}
              onUpdateRoomSeparator={handleUpdateRoomSeparator}
              onResizeColumn={handleResizeColumn}
              onResizeFoundation={handleResizeFoundation}
              onFlipDoorHanding={handleFlipDoorHanding}
              onStartCalibrationModal={(dist, first, second) => {
                setMeasuredCalibrationDist_mm(dist)
                calibrationPointsRef.current = { first, second }
                setCalibrationModalOpen(true)
              }}
              onCursorChange={(coords, kind) => {
                setCursorCoords_mm(coords)
                setSnapKind(kind)
              }}
            /> : viewMode !== 'model3d' ? <ElevationCanvas project={project} direction={viewMode} selectedId={selectedId} onSelectObject={setSelectedId} underlay={underlay} coordination={coordinationFindings} onMoveObject={viewMode === 'rcp' ? undefined : handleMoveElevationObject} /> : <Suspense fallback={<div style={{ padding: 24, color: '#94a3b8' }}>3D renderer is loading…</div>}>
              <Model3DViewport project={project} onSelectObject={setSelectedId} />
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
                คลิกขวา/แตะค้างวัตถุเพื่อแก้ไขหรือลบ · เมาส์กลางเลื่อนแปลน · แตะค้างพื้นที่ว่างเพื่อเลื่อน · ลูกกลิ้งซูม · {activeTool === 'wall' || activeTool === 'beam' ? 'Space เปลี่ยนแนวอ้างอิง' : activeTool === 'door' ? 'Space กลับทิศประตู' : 'เลือกเครื่องมือเพื่อเริ่มวาด'}
              </span>
            </div>
          </footer>
        </main>

        {/* Right Inspector & Sync Sidebar */}
        {inspectorOpen && <aside className="cf-inspector">
          <div className="cf-inspector-heading">
            <div><strong>แผงข้อมูล</strong><span>{selectedIds.length > 1 ? `เลือกอยู่ ${selectedIds.length} ชิ้น · เปลี่ยน Type หรือ Delete พร้อมกันได้` : selectedId ? 'คุณสมบัติวัตถุและปริมาณ' : 'เลือกวัตถุบนแปลนเพื่อแก้ไข'}</span></div>
          </div>
          <div className="cf-inspector-tabs" role="tablist" aria-label="แผงข้อมูล">
            <button type="button" role="tab" aria-selected={rightPanelTab === 'properties'} className={rightPanelTab === 'properties' ? 'is-active' : ''} onClick={() => setRightPanelTab('properties')}>คุณสมบัติ</button>
            <button type="button" role="tab" aria-selected={rightPanelTab === 'quantities'} className={rightPanelTab === 'quantities' ? 'is-active' : ''} onClick={() => setRightPanelTab('quantities')}>ปริมาณ</button>
            <button type="button" role="tab" aria-selected={rightPanelTab === 'objects'} className={rightPanelTab === 'objects' ? 'is-active' : ''} onClick={() => setRightPanelTab('objects')}>รายการ</button>
            <button
              type="button"
              role="tab"
              aria-selected={rightPanelTab === 'coordination'}
              className={rightPanelTab === 'coordination' ? 'is-active' : ''}
              onClick={() => setRightPanelTab('coordination')}
              title="ตรวจสอบระยะชนและความสัมพันธ์ระหว่างระบบ"
              style={{ position: 'relative' }}
            >
              ตรวจระยะ
              {coordination.report && coordination.report.summary.by_severity.hard > 0
                ? <span style={{ marginLeft: 4, color: '#ef4444', fontWeight: 700 }}>{coordination.report.summary.by_severity.hard}</span>
                : null}
            </button>
          </div>
          {rightPanelTab === 'properties' && <div className="cf-inspector-content"><PropertiesPanel
            project={project}
            displayUnit={displayUnit}
            selectedId={selectedId}
            selectedIds={selectedIds}
            onAssignType={handleAssignType}
            onAssignTypeMany={handleAssignTypeMany}
            onDeleteObjects={handleDeleteObjects}
            onUpdateColumnMark={handleUpdateColumnMark}
            onUpdateColumnVerticalReference={handleUpdateColumnVerticalReference}
            onUpdateBeamVerticalReference={handleUpdateBeamVerticalReference}
            onUpdateArchitectureSurface={handleUpdateArchitectureSurface}
            onUpdateSlab={handleUpdateSlab}
            onUpdateFoundationMark={handleUpdateFoundationMark}
            onUpdateGridTag={handleUpdateGridTag}
            onModifyGrid={handleModifyGrid}
            onUpdateGridSystem={handleUpdateGridSystem}
            onUpdateWallFace={handleUpdateWallFace}
            onUpdateOpeningVertical={handleUpdateOpeningVertical}
            onUpdateOpeningInstanceParameters={handleUpdateOpeningInstanceParameters}
            onUpdatePhase={handleUpdateObjectPhase}
            onUpdateRemovalPhase={handleUpdateObjectRemovalPhase}
            onFlipDoorHanding={handleFlipDoorHanding}
            onOpenTypeManager={() => openCatalog(true,true)}
            onAddFoundation={(colId) => handleCommitFoundation({ columnId: colId })}
            onDeleteObject={handleDeleteObject}
            onDrawSurfaceVoid={(surfaceId) => { setSelectedId(surfaceId); setViewMode('plan'); setActiveTool('slabVoid') }}
            onCreateRoomFinish={handleCreateRoomFinish}
          /></div>}

          {rightPanelTab === 'quantities' && <section className="cf-takeoff-panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <strong style={{ color: '#e2e8f0', fontSize: 12 }}>ประมาณราคา & BOQ (ไทย)</strong>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" onClick={()=>setIsConstructionOpen(true)} title="เปิด viewport และส่งออกชุดแบบ A3 20 แผ่น" style={{ ...headerActionStyle, fontSize: 10 }}>A3 · 20 Sheets</button>
                <button type="button" onClick={handleExportTakeoff} title="ส่งออกตารางถอดปริมาณ Net/Gross CSV" style={{ ...headerActionStyle, fontSize: 10 }}>Net CSV</button>
                <button type="button" onClick={handleExportBOQ} title="ส่งออกตาราง BOQ แยก 3 หมวด พร้อม Factor F และ VAT 7%" style={{ ...headerActionStyle, fontSize: 10, background: '#0284c7', color: '#fff' }}>BOQ (฿)</button>
              </div>
            </div>

            {/* BOQ Thai Gov Summary Card */}
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, padding: '7px 9px', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>ยอดรวมค่าก่อสร้าง (รวม Factor F & VAT 7%)</span>
                <b style={{ fontSize: 13, color: '#38bdf8' }}>฿{boq.grand_total_thb.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b' }}>
                <span>ต้นทุนตรง: ฿{boq.total_direct_cost_thb.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</span>
                <span>เตรียมการ: ฿{boq.preliminaries_cost_thb.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</span>
                <span>Factor F: {boq.factor_f.factor_f.toFixed(4)}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginTop: 6, paddingTop: 6, borderTop: '1px solid #1e293b', fontSize: 9 }}>
                <div style={{ color: '#ef4444' }} title="งานรื้อถอนและเตรียมพื้นที่">
                  รื้อถอน: ฿{boq.cost_centers.demolition_site_prep.total_direct_cost_thb.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                </div>
                <div style={{ color: '#38bdf8' }} title="งานโครงสร้าง สถาปัตย์ และระบบสร้างใหม่">
                  สร้างใหม่: ฿{boq.cost_centers.new_construction.total_direct_cost_thb.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                </div>
                <div style={{ color: '#f0abfc' }} title="งานเชื่อมต่อรอยต่อเดิม-ใหม่">
                  รอยต่อ: ฿{boq.cost_centers.remodeling_joint_treatment.total_direct_cost_thb.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 180, overflowY: 'auto' }}>
              {takeoff.lines.length === 0 ? (
                <span style={{ color: '#64748b', fontSize: 11 }}>ยังไม่มีรายการถอดปริมาณ</span>
              ) : takeoff.lines.slice(0, 15).map((line) => (
                <div key={line.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10, color: '#94a3b8' }}>
                  <span title={`${line.cost_center} · ${line.formula} ${line.waste_percent ? `(เผื่อเศษ ${line.waste_percent}%)` : ''}`}>
                    <b style={{ color: line.cost_center === 'remodeling_joint_treatment' ? '#f0abfc' : line.cost_center === 'demolition_site_prep' ? '#ef4444' : '#94a3b8' }}>
                      {takeoffCostCenterLabels[line.cost_center] ?? line.cost_center}
                    </b>{' '}{line.mark} · {line.phase}
                  </span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {line.waste_percent ? (
                      <span style={{ fontSize: 9, color: '#64748b' }}>+{line.waste_percent}%</span>
                    ) : null}
                    <b style={{ color: '#cbd5e1', whiteSpace: 'nowrap' }}>{line.quantity.toFixed(3)} {line.unit}</b>
                  </div>
                </div>
              ))}
            </div>
            {takeoff.warnings.length > 0 && (
              <div title={takeoff.warnings.join('\n')} style={{ color: '#fbbf24', fontSize: 10, marginTop: 7 }}>
                ต้องตรวจสอบ {takeoff.warnings.length} รายการ
              </div>
            )}
          </section>}

          {rightPanelTab === 'coordination' && <CoordinationPanel
            project={project}
            report={coordination.report}
            error={coordination.error}
            selectedIds={selectedIds}
            onSelectObjects={(ids) => { setSelectedIds(ids); setSelectedId(ids[0] ?? null) }}
            onSubmitSettings={(settings) => dispatchCommandBatch([{ name: 'UpdateCoordinationSettings', input: { settings } }])}
          />}

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

      {isSettingsOpen && <SettingsModal project={project} displayUnit={displayUnit} onClose={()=>setIsSettingsOpen(false)} onExecute={dispatchCommandBatch} inspectorOpen={inspectorOpen} onInspectorChange={setInspectorOpen}/>}
      {/* Underlay Point-to-Point Scale Calibration Modal */}
      <UnderlayCalibrationModal
        isOpen={calibrationModalOpen}
        onClose={() => setCalibrationModalOpen(false)}
        measuredDistance_mm={measuredCalibrationDist_mm}
        displayUnit={displayUnit}
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
