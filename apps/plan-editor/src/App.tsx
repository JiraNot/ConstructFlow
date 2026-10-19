import { useFamilyWorkbenchSession } from './app/useFamilyWorkbenchSession.js'
import React, { useState, useEffect, useRef, useMemo, useSyncExternalStore, lazy, Suspense } from 'react'
import {
  ProjectDocument,
  createDefaultResidentialProjectDocument,
  Phase,
  RemovalPhase,
  isGridObject,
  PlacementReference,
  formatLengthMm,
  type DisplayLengthUnit,
  type ProjectViewTemplate,
  type ProjectUnderlay,
} from '@constructflow/project-model'
import { useProjectSession } from './app/useProjectSession.js'
import { useEditorObjectSelection } from './app/useEditorObjectSelection.js'
import { useToolSession } from './app/useToolSession.js'
import { DEFAULT_PLAN_CANVAS_PREFERENCES, type PlanCanvasPreferences } from './app/planCanvasPreferences.mjs'
import { CommandBus, ProjectCommandSession } from './commands/CommandBus.js'
import { Toolbar, ToolType } from './components/Toolbar.js'
import type { PlanCanvasProps } from './components/PlanCanvas.types.js'
import type { CoordinatedElevationNavigation } from './components/ElevationCanvas.js'
import { EditorViewRenderer } from './components/EditorViewRenderer.js'
import type { PhotoDimensionSession } from '@constructflow/laser-survey'
import { useCoordinationReport } from './features/coordination/useCoordinationReport.js'
import type { ProjectLegalMetadata } from '@constructflow/project-model'
import { DEFAULT_PLAN_LABEL_VISIBILITY, type PlanLabelVisibility } from './rendering/planRendererTypes.js'
import { Building2, Layers, History, Layers2, Ruler, ArrowUpDown, Sparkles, Undo2, Redo2, FolderOpen, Save, Download, CookingPot, FileCheck, MoreHorizontal, Tag, ChevronDown, Home, Compass, PanelRightOpen } from 'lucide-react'
import { usePlanTransformCommands } from './app/usePlanTransformCommands.js'
import { usePlanPlacementCommands } from './app/usePlanPlacementCommands.js'
import { usePropertiesPanelActions } from './app/usePropertiesPanelActions.js'
import { preloadPlanAuthoringHandlers, usePlanAuthoringCommands } from './app/usePlanAuthoringCommands.js'
import { useGridAuthoringCommands } from './app/useGridAuthoringCommands.js'
import { useProjectBrowserCommands } from './app/useProjectBrowserCommands.js'
import { useTypeCatalogSession } from './app/useTypeCatalogSession.js'
import { useProjectContextCommands } from './app/useProjectContextCommands.js'
import { useLocalProjectPersistence } from './app/useLocalProjectPersistence.js'
import { useProjectFileActions, type ProjectFileAccess } from './app/useProjectFileActions.js'
import { useProjectCreationActions } from './app/useProjectCreationActions.js'
import type { CoordinatedPlanViewport } from './viewport/viewportTransform.js'
import { useReferenceDataImportActions } from './app/useReferenceDataImportActions.js'
import { useWorkbenchKeyboardShortcuts } from './app/useWorkbenchKeyboardShortcuts.js'
import { type EditorViewMode, type SplitViewLayout, type SplitViewPaneCount, type SplitViewPaneSlot } from './app/useMultiViewPreferences.js'
import { getMultiViewTrackBoundaryRange } from './app/multiViewLayout.mjs'
import { useWorkbenchMultiViewLayout } from './app/useWorkbenchMultiViewLayout.js'
import { useWorkbenchExportActions } from './app/useWorkbenchExportActions.js'
import { usePlanUnderlaySession } from './app/usePlanUnderlaySession.js'
import { createElevationObjectCommandHandler } from './app/elevationObjectCommands.js'
import { MultiViewResizeHandle } from './components/MultiViewResizeHandle.js'
import { ViewModePicker } from './components/ViewModePicker.js'
import { DwgDrawingPickerModal } from './components/DwgDrawingPickerModal.js'
import type { DwgDrawingCandidate } from './cad/importDwgUnderlay.js'

const FamilyWorkbench = lazy(() => import('./components/FamilyWorkbench.js').then(module => ({ default: module.FamilyWorkbench })))
const LaserBleHudPill = lazy(() => import('./components/LaserBleHudPill.js').then(module => ({ default: module.LaserBleHudPill })))
const EditorInspector = lazy(() => import('./components/EditorInspector.js').then(module => ({ default: module.EditorInspector })))
const SettingsModal = lazy(() => import('./components/SettingsModal.js').then(module => ({ default: module.SettingsModal })))
const TypeManagerModal = lazy(() => import('./components/TypeManagerModal.js').then(module => ({ default: module.TypeManagerModal })))
const UnderlayCalibrationModal = lazy(() => import('./components/UnderlayCalibrationModal.js').then(module => ({ default: module.UnderlayCalibrationModal })))
const ProjectLegalModal = lazy(() => import('./components/ProjectLegalModal.js').then(module => ({ default: module.ProjectLegalModal })))
const PhotoDimensionModal = lazy(() => import('./components/PhotoDimensionModal.js').then(module => ({ default: module.PhotoDimensionModal })))

const ExtensionPresetsModal = lazy(() => import('./components/ExtensionPresetsModal.js').then(module => ({ default: module.ExtensionPresetsModal })))

const EDITOR_VIEW_OPTIONS: readonly [EditorViewMode, string][] = [
  ['plan', 'แปลนพื้น'], ['framing', 'แปลนคาน'], ['roofplan', 'แปลนหลังคา'], ['north', 'รูปด้านเหนือ'],
  ['south', 'รูปด้านใต้'], ['east', 'รูปด้านตะวันออก'], ['west', 'รูปด้านตะวันตก'], ['rcp', 'แปลนฝ้า RCP'], ['model3d', '3D ดูตัวอย่าง'],
]

const nextHigherLevelId = (project: ProjectDocument, baseLevelId: string): string => {
  const base = project.levels.find(level => level.id === baseLevelId)
  return base ? [...project.levels]
    .filter(level => level.elevation_mm > base.elevation_mm)
    .sort((a, b) => a.elevation_mm - b.elevation_mm)[0]?.id ?? '' : ''
}

const ConstructionWorkbench=lazy(()=>import('./components/ConstructionWorkbench.js').then(m=>({default:m.ConstructionWorkbench})))

export interface AppProps {
  /** Optional picker injection for controlled acceptance runs; production uses the browser APIs. */
  projectFileAccess?: ProjectFileAccess
}

const levelPickerLabel = (name: string) => {
  const normalized = name.trim().toLowerCase()
  if (normalized === 'ground floor') return 'ชั้นล่าง'
  if (normalized === 'first floor') return 'ชั้น 1'
  if (normalized === 'second floor') return 'ชั้น 2'
  if (normalized === 'roof eaves') return 'ชายคา'
  return name
}

const phasePickerLabel = (phase: Phase, fallback: string) => {
  if (phase === 'existing') return 'อาคารเดิม'
  if (phase === 'demolition') return 'รื้อถอน'
  if (phase === 'new_construction') return 'สร้างใหม่'
  return fallback
}

export const App: React.FC<AppProps> = ({ projectFileAccess }) => {
  const [dwgPickerState, setDwgPickerState] = useState<{ file: File; candidates: DwgDrawingCandidate[] } | null>(null)
  const [quickStartDismissed, setQuickStartDismissed] = useState(false)
  const [laserHudReady, setLaserHudReady] = useState(false)
  const {
    project,
    setProjectState,
    setProject,
    commandQueue,
    setCommandQueue,
    sessionRef: projectSessionRef,
    dispatchCommandBatch,
    dispatchAsyncCommandBatch,
    previewCommands: previewDirectManipulation,
  } = useProjectSession(() => createDefaultResidentialProjectDocument('CF-UNTITLED', 'Untitled Project'))
  const { selectedId, selectedIds, setSelectedId, setSelectedIds, selectObjects } = useEditorObjectSelection()

  useEffect(() => {
    // Keep the laser driver and BLE stack off the critical editor startup path.
    const timer = window.setTimeout(() => setLaserHudReady(true), 700)
    return () => window.clearTimeout(timer)
  }, [])
  const {
    projectJson, savedProjectJson, setSavedProjectJson, replacementBaselineJson, setReplacementBaselineJson,
    localAutosaveReady, localAutosaveState, setLocalAutosaveState, activeProjectFileHandle,
    activeProjectFileHandleRef, updateActiveProjectFileHandle, fileFeedback, setFileFeedback,
  } = useLocalProjectPersistence({ project, sessionRef: projectSessionRef, setProjectState, setCommandQueue, setSelectedId })
  const {
    supportsProjectFileOpen, confirmReplaceUnsavedProject, handleSaveProject, handleSaveAsProject,
    handleOpenProject, handleChooseProject,
  } = useProjectFileActions({
    project, projectJson, projectFileAccess, sessionRef: projectSessionRef, setProjectState, setCommandQueue,
    setSelectedId, setSelectedIds, savedProjectJson, setSavedProjectJson, replacementBaselineJson,
    setReplacementBaselineJson, activeProjectFileHandleRef, updateActiveProjectFileHandle,
    setLocalAutosaveState, setFileFeedback,
  })
  const displayUnit: DisplayLengthUnit = project.project.display_unit ?? 'm'
  const [isProjectNameEditing, setIsProjectNameEditing] = useState(false)
  const [projectNameDraft, setProjectNameDraft] = useState(project.project.name)
  const commitDirectManipulation = dispatchCommandBatch
  const handleManipulationRejected = (errors: string[]) => {
    if (errors.length) setFileFeedback(errors[0])
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

  const { activeTool, activation: toolActivation, lastPlacementTool, activate: setActiveTool, repeat: repeatLastTool } = useToolSession()
  useEffect(() => {
    if (['door', 'window', 'pipe', 'fixture', 'cabinet', 'furniture', 'moulding', 'archFloor', 'ceiling', 'roomSeparator', 'slabVoid', 'stair'].includes(activeTool)) {
      void preloadPlanAuthoringHandlers().catch(() => undefined)
    }
  }, [activeTool])
  const [planCanvasPreferences, setPlanCanvasPreferences] = useState<PlanCanvasPreferences>(DEFAULT_PLAN_CANVAS_PREFERENCES)
  const [planNavigationViewport, setPlanNavigationViewport] = useState<CoordinatedPlanViewport | null>(null)
  const [elevationNavigation, setElevationNavigation] = useState<CoordinatedElevationNavigation>({ zoom: 1, panY: 0, panXNorthSouth: 0, panXEastWest: 0 })
  const multiView = useWorkbenchMultiViewLayout(project.project.id, activeTool)
  const {
    viewMode, setViewMode, multiViewPreferences, setMultiViewPreferences,
    splitViewEnabled, splitViewPaneCount, splitViewLayout, customColumnCount,
    customColumnTrackShares, customRowTrackShares, customColumnBoundaries, customRowBoundaries,
    primaryPanePercent, secondaryViewMode, tertiaryViewMode, fourthViewMode,
    splitViewGridStyle, primaryPaneGridStyle, paneGridStyle, paneViewModes,
    visiblePaneSlots, orderedPaneSlots, paneModes, paneSlotLabels,
    movePaneSlot, reorderPaneSlots, resizePaneTrack,
    planAnd3DNavigationLinked, planAndRcpNavigationLinked,
  } = multiView
  const { handleStartKitchenProof, handleStartHouseDemo, handleNewBlankProject } = useProjectCreationActions({
    confirmReplaceUnsavedProject,
    resetProjectSession: nextProject => projectSessionRef.current!.reset(nextProject),
    updateActiveProjectFileHandle,
    setProjectState,
    setSavedProjectJson,
    setReplacementBaselineJson,
    setFileFeedback,
    setSelectedId,
    setSelectedIds,
    setCommandQueue,
    setActiveTool,
    setViewMode,
  })
  const [labelMode, setLabelMode] = useState<'name' | 'name-size'>('name-size')
  const [labelVisibility, setLabelVisibility] = useState<PlanLabelVisibility>(DEFAULT_PLAN_LABEL_VISIBILITY)
  const [rightPanelTab, setRightPanelTab] = useState<'properties' | 'quantities' | 'objects' | 'coordination' | 'ai' | 'extensions'>('properties')
  useEffect(() => {
    if (rightPanelTab === 'objects') void import('./app/planTransformHandlers.js').catch(() => undefined)
  }, [rightPanelTab])
  const moduleRegistryRevision = useSyncExternalStore(
    listener => CommandBus.subscribeToModules(listener),
    () => CommandBus.getModuleRegistryRevision(),
    () => 0,
  )
  const moduleUIContributions = useMemo(() => CommandBus.getModuleUIContributions(), [moduleRegistryRevision])
  const moduleCommandDescriptors = useMemo(() => CommandBus.getModuleCommandDescriptors(), [moduleRegistryRevision])
  const [isSettingsOpen,setIsSettingsOpen] = useState(false)
  const [inspectorOpen,setInspectorOpen] = useState(() => window.innerWidth > 1180 && !window.matchMedia('(pointer: coarse)').matches)
  const coordinationViews = splitViewEnabled ? paneModes : [viewMode]
  const coordinationNeeded = (inspectorOpen && rightPanelTab === 'coordination')
    || coordinationViews.some(mode => !['plan', 'framing', 'roofplan'].includes(mode))
  const coordination = useCoordinationReport(project, coordinationNeeded)
  const coordinationFindings = coordination.report?.findings ?? []
  useEffect(() => {
    if (selectedId && inspectorOpen) void import('./app/propertiesPanelActionHandlers.js').catch(() => undefined)
  }, [selectedId, inspectorOpen])
  const [workbenchTab,setWorkbenchTab] = useState<'model'|'sheets'>('model')
  const [isConstructionOpen,setIsConstructionOpen]=useState(false)
  const {
    alignmentPreview,
    setAlignmentPreview,
    handlePreviewArrayObjects,
    handleMoveObjectsByDelta,
    handlePreviewAlignment,
    handlePreviewOffset,
    handlePreviewMirror,
    handlePreviewSplit,
    handlePreviewJoin,
    handlePreviewTrim,
    handleCommitAlignment,
  } = usePlanTransformCommands({
    project,
    selectedIds,
    displayUnit,
    dispatchCommandBatch,
    setSelectedIds,
    setSelectedId,
    setRightPanelTab,
    setFileFeedback,
    setViewMode,
  })
  const activeVisibilityScopeId = `${viewMode}:${project.project.active_level_id}`
  const hiddenObjectIds = useMemo(() => new Set(project.view_settings?.hidden_object_ids_by_scope[activeVisibilityScopeId] ?? []), [project.view_settings, activeVisibilityScopeId])
  const {
    handleDeleteObjects, handleDeleteObject, handleCopyObjects, handlePasteObjects,
    handleToggleObjectVisibility, handleShowAllObjects, handleSaveViewTemplate,
    handleApplyViewTemplate, handleDeleteViewTemplate,
  } = useProjectBrowserCommands({
    project, selectedId, selectedIds, dispatchCommandBatch, setSelectedId, setSelectedIds, selectObjects,
    visibilityScope: { id: activeVisibilityScopeId, hiddenObjectIds },
    setActiveLevelType: levelId => setActiveColumnTopLevelId(nextHigherLevelId(project, levelId)),
    activeViewId: viewMode, setActiveViewId: setViewMode,
    clearTransformPreview: () => setAlignmentPreview(null), setFileFeedback,
  })
  const viewProject = useMemo(() => {
    if (!hiddenObjectIds.size) return project
    return { ...project, objects: Object.fromEntries(Object.entries(project.objects).filter(([id]) => !hiddenObjectIds.has(id))) }
  }, [project, hiddenObjectIds])
  const [cursorCoords_mm, setCursorCoords_mm] = useState<[number, number]>([0, 0])
  const [snapKind, setSnapKind] = useState<string>('Free')

  const underlaySession = usePlanUnderlaySession({
    project, viewMode, activeLevelId: project.project.active_level_id,
    sessionRef: projectSessionRef, setProjectState, setActiveTool,
  })
  const { underlay, setUnderlay, underlayKey, hydratedUnderlayRef, canCalibrateUnderlayRef, calibrationPointsRef } = underlaySession
  const [calibrationModalOpen, setCalibrationModalOpen] = useState<boolean>(false)
  const [measuredCalibrationDist_mm, setMeasuredCalibrationDist_mm] = useState<number>(4000)
  const [isPresetsModalOpen, setIsPresetsModalOpen] = useState<boolean>(false)
  const [isLegalModalOpen, setIsLegalModalOpen] = useState<boolean>(false)
  const [isPhotoDimensionModalOpen, setIsPhotoDimensionModalOpen] = useState<boolean>(false)
  const photoSessionsStorageKey = `cf_photo_sessions:${project.project.id}`
  const [photoSessions, setPhotoSessions] = useState<PhotoDimensionSession[]>(() => {
    try {
      const saved = localStorage.getItem(photoSessionsStorageKey)
      const parsed: unknown = saved ? JSON.parse(saved) : []
      return Array.isArray(parsed) ? parsed as PhotoDimensionSession[] : []
    } catch {
      return []
    }
  })
  const [activePhotoSession, setActivePhotoSession] = useState<PhotoDimensionSession | null>(null)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(photoSessionsStorageKey)
      const parsed: unknown = saved ? JSON.parse(saved) : []
      setPhotoSessions(Array.isArray(parsed) ? parsed as PhotoDimensionSession[] : [])
    } catch {
      setPhotoSessions([])
    }
    setActivePhotoSession(null)
  }, [photoSessionsStorageKey])
  const handleSavePhotoSession = (session: PhotoDimensionSession) => {
    setPhotoSessions(prev => {
      const idx = prev.findIndex(s => s.id === session.id)
      const next = idx >= 0 ? prev.map(s => s.id === session.id ? session : s) : [...prev, session]
      try {
        localStorage.setItem(photoSessionsStorageKey, JSON.stringify(next))
      } catch (e) {
        console.warn('Could not save photo sessions', e)
      }
      return next
    })
  }

  useEffect(() => {
    if (![underlay, ...(underlay.additional_layers ?? [])].some(layer => layer.image && layer.visible)) {
      if (activeTool === 'calibrate') setActiveTool('select')
      setCalibrationModalOpen(false)
    }
  }, [underlay, activeTool])

  useEffect(() => {
    if (localAutosaveState !== 'error') return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [localAutosaveState])

  useWorkbenchKeyboardShortcuts({
    viewMode, setActiveTool, setSelectedId, handleSaveProject, projectSessionRef,
    setProjectState, setCommandQueue, canCalibrateUnderlayRef,
  })

  const propertiesActions = usePropertiesPanelActions({ project, dispatchCommandBatch, setFileFeedback, setSelectedId, setSelectedIds })
  const typeCatalog = useTypeCatalogSession({
    project, activeTool, setActiveTool, selectedId, onAssignType: propertiesActions.onAssignType,
  })
  const {
    activeTypeMarks, isTypeManagerOpen, setIsTypeManagerOpen, catalogContext,
    openCatalog, chooseCatalogType, syncRenamedActiveType,
  } = typeCatalog
  const activeColumnType = activeTypeMarks.column!
  const activeFoundationType = activeTypeMarks.foundation!
  const activeBeamType = activeTypeMarks.beam!
  const activeWallType = activeTypeMarks.wall!
  const activeDoorType = activeTypeMarks.door!
  const activeWindowType = activeTypeMarks.window!
  const activeSlabType = activeTypeMarks.slab!
  const activeRoofType = activeTypeMarks.roof!
  const setActiveColumnType = (value: string) => typeCatalog.setActiveTypeMark('column', value)
  const setActiveFoundationType = (value: string) => typeCatalog.setActiveTypeMark('foundation', value)
  const setActiveBeamType = (value: string) => typeCatalog.setActiveTypeMark('beam', value)
  const setActiveWallType = (value: string) => typeCatalog.setActiveTypeMark('wall', value)
  const setActiveDoorType = (value: string) => typeCatalog.setActiveTypeMark('door', value)
  const setActiveWindowType = (value: string) => typeCatalog.setActiveTypeMark('window', value)
  const setActiveSlabType = (value: string) => typeCatalog.setActiveTypeMark('slab', value)
  const setActiveRoofType = (value: string) => typeCatalog.setActiveTypeMark('roof', value)
  const [activeColumnTopLevelId, setActiveColumnTopLevelId] = useState<string>(() => nextHigherLevelId(project, project.project.active_level_id))
  const {
    handleSetWorkingPhase, handleSetWorkingLevel, handleUpdateStoryHeight, handleMoveColumn,
  } = useProjectContextCommands({
    project, dispatchCommandBatch, nextHigherLevelId, setActiveColumnTopLevelId, setFileFeedback,
  })

  const {
    handleCommitColumn,
    handleCommitFoundation,
    handleCommitBeam,
    handleCommitWall,
    handleCommitSlab,
    handleCommitRoof,
  } = usePlanPlacementCommands({
    project,
    activeColumnType,
    activeColumnTopLevelId,
    activeFoundationType,
    activeBeamType,
    activeWallType,
    activeSlabType,
    activeRoofType,
    setProject,
    setSelectedId,
    setCommandQueue,
    setFileFeedback,
  })
  const {
    handleCommitPipeRoute, handleCommitFixture, handleCommitCabinet, handleCommitFurniture, handleCommitMoulding,
    handleCommitArchitecturalFloor, handleCommitCeiling, handleCommitRoomSeparator, handleDetectRooms,
    handleCreateRoomFinish, handleCommitSurfaceVoid, handleCommitDoor, handleCommitWindow,
    handleCommitStair, handleFlipDoorHanding,
  } = usePlanAuthoringCommands({
    project, activeDoorType, activeWindowType, dispatchCommandBatch, setSelectedId, setSelectedIds, setFileFeedback,
  })
  const { handleCommitGrid, handleCopyGrid, handleCommitGridSystem } = useGridAuthoringCommands({
    project, dispatchCommandBatch, setFileFeedback,
  })
  const { handleUploadUnderlayImage, handleImportDwgCandidates, handleImportSiteSurvey } = useReferenceDataImportActions({
    underlayKey, hydratedUnderlayRef, setUnderlay, setFileFeedback, dispatchCommandBatch,
    onChooseDwgCandidates: (file, candidates) => setDwgPickerState({ file, candidates }),
    onImportDwgDrawings: drawings => {
      const additions = Object.fromEntries(drawings.map(({ key, underlay }) => [key, underlay])) as Record<string, ProjectUnderlay>
      setProject({ ...project, underlays: { ...project.underlays, ...additions } })
    },
    viewId: viewMode,
  })
  const handleClearUnderlay = underlaySession.clearUnderlay
  const handleApplyCalibrationScale = (newScale: number, _realDistance_mm: number, axis: 'x' | 'y') => underlaySession.applyCalibrationScale(newScale, axis)

  const handleMoveElevationObject = createElevationObjectCommandHandler(project, dispatchCommandBatch, handleMoveColumn)

  // Counts & Schedule breakdown
  const {
    handleExportTakeoff, handleExportBOQ, handleExportDrawingSet, handleExportDxf, handleExportIfc,
  } = useWorkbenchExportActions(project, setFileFeedback)

  const familyWorkbench = useFamilyWorkbenchSession({
    project, selectedId, onExecute: dispatchCommandBatch,
    onSelect: id => { setSelectedId(id); setSelectedIds([id]) }, onTool: setActiveTool,
    onViewPlan: () => setViewMode('plan'), onFeedback: setFileFeedback,
    onSetOpeningType: (category, name) => category === 'door' ? setActiveDoorType(name) : setActiveWindowType(name),
  })

  const planCanvasProps: Omit<PlanCanvasProps, 'planDiscipline'> = {
    project: viewProject,
    navigationViewport: planNavigationViewport,
    onNavigationViewportChange: setPlanNavigationViewport,
    preferences: planCanvasPreferences,
    onPreferencesChange: setPlanCanvasPreferences,
    displayUnit,
    activeTool,
    activeFamilyId: familyWorkbench.activeFamily?.id,
    activeFamilyTypeId: familyWorkbench.activeTypeId,
    toolActivation: toolActivation,
    activeColumnTypeMark: activeColumnType,
    activeFoundationTypeMark: activeFoundationType,
    activeBeamTypeMark: activeBeamType,
    activeWallTypeMark: activeWallType,
    activeDoorTypeMark: activeDoorType,
    activeWindowTypeMark: activeWindowType,
    activeSlabTypeMark: activeSlabType,
    activeRoofTypeMark: activeRoofType,
    labelMode,
    labelVisibility,
    coordination: coordinationFindings,
    coordinationFocusSelection: false,
    onOpenTypeManager: () => openCatalog(),
    onChangeActiveTypeMark: mark => {
      familyWorkbench.clear()
      if (activeTool === 'column') setActiveColumnType(mark)
      else if (activeTool === 'foundation') setActiveFoundationType(mark)
      else if (activeTool === 'beam') setActiveBeamType(mark)
      else if (activeTool === 'wall') setActiveWallType(mark)
      else if (activeTool === 'door') setActiveDoorType(mark)
      else if (activeTool === 'window') setActiveWindowType(mark)
      else if (activeTool === 'slab') setActiveSlabType(mark)
      else if (activeTool === 'roof') setActiveRoofType(mark)
    },
    selectedId,
    selectedIds,
    underlay,
    onSelectObject: setSelectedId,
    onRequestEditProperties: () => { setRightPanelTab('properties'); setInspectorOpen(true) },
    onSelectionChange: selectObjects,
    onDeleteObjects: handleDeleteObjects,
    onCopyObjects: handleCopyObjects,
    onCommitColumn: handleCommitColumn,
    onCommitFoundation: handleCommitFoundation,
    onCommitBeam: handleCommitBeam,
    onCommitWall: handleCommitWall,
    onCommitDoor: (wallId, point, offset, handing) => { if (!familyWorkbench.placeOpening('door', wallId, point, offset, handing)) handleCommitDoor(wallId, point, offset, handing) },
    onCommitWindow: (wallId, point, offset) => { if (!familyWorkbench.placeOpening('window', wallId, point, offset)) handleCommitWindow(wallId, point, offset) },
    onCommitSlab: handleCommitSlab,
    onCommitArchitecturalFloor: handleCommitArchitecturalFloor,
    onCommitCeiling: handleCommitCeiling,
    onCommitRoof: handleCommitRoof,
    onCommitPipeRoute: handleCommitPipeRoute,
    onCommitFixture: handleCommitFixture,
    onCommitCabinet: handleCommitCabinet,
    onCommitFurniture: (start, end, kind) => { if (!familyWorkbench.placeFurniture(start, end, kind)) handleCommitFurniture(start, end, kind) },
    onCommitMoulding: handleCommitMoulding,
    onCommitRoomSeparator: handleCommitRoomSeparator,
    onCommitSurfaceVoid: handleCommitSurfaceVoid,
    onCommitGrid: handleCommitGrid,
    onCommitGridSystem: handleCommitGridSystem,
    onCopyGrid: handleCopyGrid,
    onActivateTool: setActiveTool,
    onCommitStair: handleCommitStair,
    onPreviewManipulation: previewDirectManipulation,
    onCommitManipulation: commitDirectManipulation,
    externalManipulationPreview: alignmentPreview ? { project: alignmentPreview.project, ids: alignmentPreview.ids, valid: true } : null,
    onManipulationRejected: handleManipulationRejected,
    onFlipDoorHanding: handleFlipDoorHanding,
    onStartCalibrationModal: (dist, first, second) => {
      setMeasuredCalibrationDist_mm(dist)
      calibrationPointsRef.current = { first, second }
      setCalibrationModalOpen(true)
    },
    onCursorChange: (coords, kind) => {
      setCursorCoords_mm(coords)
      setSnapKind(kind)
    },
    photoSessions,
    onOpenPhotoSession: (session: PhotoDimensionSession) => {
      setActivePhotoSession(session)
      setIsPhotoDimensionModalOpen(true)
    },
  }

  const sharedEditorViewProps = {
    planCanvasProps, activeTool, toolActivation, project: viewProject, selectedId, selectedIds,
    onSelectObject: setSelectedId, onSelectionChange: selectObjects, splitViewEnabled,
    planNavigationViewport, onPlanNavigationViewportChange: setPlanNavigationViewport,
    elevationNavigation, onElevationNavigationChange: setElevationNavigation,
    planAnd3DNavigationLinked, planAndRcpNavigationLinked, underlay, coordination: coordinationFindings,
    onMoveElevationObject: handleMoveElevationObject, previewManipulation: previewDirectManipulation,
    commitManipulation: commitDirectManipulation, onManipulationRejected: handleManipulationRejected,
  }
  const renderEditorView = (mode: EditorViewMode, auxiliary = false) =>
    <EditorViewRenderer mode={mode} auxiliary={auxiliary} {...sharedEditorViewProps} />
  const localSaveStatusLabel = localAutosaveState === 'saving' || localAutosaveState === 'restoring'
    ? 'กำลังบันทึกในเครื่อง…'
    : localAutosaveState === 'error' ? 'บันทึกในเครื่องไม่สำเร็จ' : 'บันทึกอัตโนมัติในเครื่องแล้ว'
  const localSaveStatusIcon = localAutosaveState === 'error' ? '!' : localAutosaveState === 'saving' || localAutosaveState === 'restoring' ? '…' : '✓'

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
                if (event.key === 'Escape') {
                  setProjectNameDraft(project.project.name)
                  setIsProjectNameEditing(false)
                  window.requestAnimationFrame(() => document.querySelector<HTMLElement>('.cf-more-menu summary')?.focus())
                }
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
              {project.levels.map(lvl => <option key={lvl.id} value={lvl.id}>{levelPickerLabel(lvl.name)} ({lvl.elevation_mm >= 0 ? '+' : ''}{formatLengthMm(lvl.elevation_mm, displayUnit)} {displayUnit})</option>)}
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
              {project.phases.map((ph) => <option key={ph.id} value={ph.id}>{phasePickerLabel(ph.id as Phase, ph.name)}</option>)}
            </select>
          </label>
          <label className="cf-unit-pill">หน่วย
            <select aria-label="หน่วยความยาวของโครงการ" value={displayUnit} onChange={event => setProject(current => ({ ...current, project: { ...current.project, display_unit: event.target.value as DisplayLengthUnit } }))}>
              <option value="m">m</option><option value="cm">cm</option><option value="mm">mm</option>
            </select>
          </label>
          {laserHudReady ? (
            <Suspense fallback={<span aria-hidden="true" className="cf-laser-hud-placeholder" />}>
              <LaserBleHudPill onOpenPhotoDimensionModal={() => {
                setActivePhotoSession(null)
                setIsPhotoDimensionModalOpen(true)
              }} />
            </Suspense>
          ) : <span aria-hidden="true" className="cf-laser-hud-placeholder" />}
        </div>

        <div className="cf-header-actions">
          <input id="cfproj-open" type="file" accept=".cfproj,application/json" aria-hidden="true" tabIndex={-1} className="cf-visually-hidden" onChange={(e) => { void handleOpenProject(e.currentTarget.files?.[0] ?? undefined); e.currentTarget.value = '' }} />
          <input id="cf-survey-open" type="file" accept=".csv,text/csv" aria-hidden="true" tabIndex={-1} className="cf-visually-hidden" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) handleImportSiteSurvey(file); event.currentTarget.value = '' }} />
          {supportsProjectFileOpen ? (
            <button type="button" className="cf-button cf-button-quiet" onClick={() => void handleChooseProject()} title="เปิดไฟล์โครงการ .cfproj"><FolderOpen size={16} /><span>เปิด</span></button>
          ) : (
            <label htmlFor="cfproj-open" role="button" tabIndex={0} className="cf-button cf-button-quiet" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); document.getElementById('cfproj-open')?.click() } }}><FolderOpen size={16} /><span>เปิด</span></label>
          )}
          <button type="button" className="cf-button cf-button-primary" onClick={() => void handleSaveProject()} title={activeProjectFileHandle ? 'บันทึกกลับไปยังไฟล์โครงการที่เปิดอยู่' : 'บันทึกงานในเบราว์เซอร์เครื่องนี้'}><Save size={16} /><span>บันทึก</span></button>
          <details className="cf-save-menu" onClick={(event) => {
            if ((event.target as HTMLElement).closest('button')) event.currentTarget.open = false
          }}>
            <summary className="cf-icon-button" aria-label="ตัวเลือกบันทึก" title="บันทึกเป็นไฟล์"><ChevronDown size={15} /></summary>
            <div className="cf-more-popover cf-save-popover">
              <button type="button" aria-label="บันทึกเป็นไฟล์ .cfproj" onClick={() => void handleSaveAsProject()}><Download size={15} /> บันทึกเป็นไฟล์ (.cfproj)…</button>
            </div>
          </details>
          <span role="status" aria-live="polite" title={localSaveStatusLabel} className={`cf-save-status ${localAutosaveState === 'error' ? 'is-unsaved' : ''} ${localAutosaveState === 'saving' || localAutosaveState === 'restoring' ? 'is-saving' : 'is-saved'}`}>
            <span className="cf-save-status-full">{localSaveStatusLabel}{fileFeedback ? ` · ${fileFeedback}` : ''}</span>
            <span className="cf-save-status-compact" aria-hidden="true">{localSaveStatusIcon}</span>
          </span>
          <button type="button" className="cf-icon-button" disabled={!projectSessionRef.current!.canUndo} onClick={() => { setProjectState(projectSessionRef.current!.undo()); setCommandQueue([]) }} title="ย้อนกลับ (Ctrl/⌘+Z)" aria-label="ย้อนกลับ"><Undo2 size={17} /></button>
          <button type="button" className="cf-icon-button" disabled={!projectSessionRef.current!.canRedo} onClick={() => { setProjectState(projectSessionRef.current!.redo()); setCommandQueue([]) }} title="ทำซ้ำ (Ctrl/⌘+Shift+Z หรือ Ctrl/⌘+Y)" aria-label="ทำซ้ำ"><Redo2 size={17} /></button>
          <button type="button" className="cf-button cf-button-quiet cf-inspector-launcher" aria-expanded={inspectorOpen} aria-label={inspectorOpen ? 'ปิดแผงแก้ไข' : selectedId ? 'แก้ไขวัตถุที่เลือก' : 'เปิดแผงข้อมูล'} onClick={() => { setRightPanelTab('properties'); setInspectorOpen(value => !value) }}><PanelRightOpen size={17} /><span>{selectedId ? 'แก้ไข' : 'ข้อมูล'}</span></button>
          <details className="cf-more-menu" onClick={(event) => {
            if ((event.target as HTMLElement).closest('button')) {
              event.currentTarget.open = false;
              if (!(event.target as HTMLElement).closest('[data-preserve-focus]')) {
                event.currentTarget.querySelector('summary')?.focus();
              }
            }
          }}>
            <summary className="cf-button cf-button-quiet" aria-label="เมนูโครงการ" title="เมนูโครงการ">เมนู</summary>
            <div className="cf-more-popover">
              <div className="cf-menu-label">โครงการ</div>
              <button type="button" data-preserve-focus onClick={() => { setProjectNameDraft(project.project.name); setIsProjectNameEditing(true) }}>เปลี่ยนชื่อโครงการ</button>
              <button type="button" onClick={handleNewBlankProject}>สร้างโครงการใหม่ (ว่าง)</button>
              <button type="button" aria-label="โฉนดและผู้เซ็นแบบ" onClick={() => setIsLegalModalOpen(true)}><FileCheck size={15} /> โฉนดและผู้เซ็นแบบ</button>
              <button type="button" onClick={() => document.getElementById('cf-survey-open')?.click()}>นำเข้าข้อมูลสำรวจ CSV</button>
              {project.site_survey && <div className="cf-menu-note" role="status">
                Survey · {project.site_survey.name} · {project.site_survey.points.filter(point => point.source_status === 'measured').length} วัดจริง / {project.site_survey.points.filter(point => point.source_status === 'assumed').length} สมมติ
              </div>}
              <div className="cf-menu-label">สร้าง</div>
              <button type="button" onClick={()=>{setWorkbenchTab('model');setIsConstructionOpen(true)}}><Layers2 size={15}/> เครื่องมืองานอาคาร</button>
              <button type="button" onClick={()=>setIsPresetsModalOpen(true)}><Sparkles size={15}/> ส่วนต่อเติมสำเร็จรูป</button>
              <button type="button" onClick={()=>openCatalog()}>คลังชนิด</button>
              <button type="button" onClick={()=>familyWorkbench.show()}>Family Studio · นำเข้า / สร้าง / แก้ CAD</button>
              <div className="cf-menu-label">แบบและส่งออก</div>
              <button type="button" onClick={()=>{setWorkbenchTab('sheets');setIsConstructionOpen(true)}}>ชุดแบบและตาราง</button>
              <button type="button" aria-label="ส่งออก DXF 20 แผ่น" onClick={() => void handleExportDxf()}>DXF · 20 แผ่น</button>
              <button type="button" aria-label="ส่งออก IFC 4.3" onClick={() => void handleExportIfc()}>IFC 4.3</button>
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
          <button type="button" className="cf-button cf-rail-family" onClick={()=>familyWorkbench.show()} title="สร้าง Family · เปิด DWG/DXF · นำเข้าโมเดล 3D">Family / CAD</button>
            <Toolbar orientation="vertical"
              activeTool={activeTool}
              lastPlacementTool={lastPlacementTool}
              onSelectTool={tool => { familyWorkbench.clear(); setActiveTool(tool) }}
              onRepeatLastTool={repeatLastTool}
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
              underlayHasImage={viewMode === 'plan' && [underlay, ...(underlay.additional_layers ?? [])].some(layer => !!layer.image)}
              underlayVisible={[underlay, ...(underlay.additional_layers ?? [])].some(layer => !!layer.image && layer.visible)}
              underlayOpacity={underlay.opacity}
              underlayLabel={(underlay.additional_layers?.length ?? 0) > 0 ? `${(underlay.additional_layers?.length ?? 0) + (underlay.image ? 1 : 0)} แปลนอ้างอิง` : underlay.source_layout ? `${underlay.source_file ?? 'ไฟล์อ้างอิง'} · ${underlay.source_layout}` : underlay.source_file}
              onToggleUnderlayVisible={underlaySession.toggleAllUnderlays}
              onChangeUnderlayOpacity={(opacity) => setUnderlay((u) => ({ ...u, opacity }))}
              onUploadUnderlayImage={handleUploadUnderlayImage}
              onClearUnderlay={handleClearUnderlay}
              onOpenTypeManager={() => openCatalog()}
            />
        </aside>

        {/* Center Canvas Area */}
        <main className="cf-canvas-shell">
          {Object.keys(project.objects).length === 0 && !quickStartDismissed && <section aria-label="เริ่มทำแปลน" style={{ position: 'absolute', zIndex: 6, top: 58, left: '50%', transform: 'translateX(-50%)', width: 'min(760px, calc(100% - 24px))', padding: '12px 14px', border: '1px solid #cbd5e1', borderRadius: 12, background: 'rgba(255,255,255,.97)', boxShadow: '0 10px 28px rgba(15,23,42,.12)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div><strong style={{ display: 'block', fontSize: 15 }}>เริ่มแบบบ้านของคุณ</strong><span style={{ color: '#64748b', fontSize: 12 }}>เลือกวิธีเริ่มงานได้เลย เปลี่ยนหรือย้อนกลับได้ภายหลัง</span></div>
              <button type="button" aria-label="ปิดคำแนะนำเริ่มงาน" onClick={() => setQuickStartDismissed(true)} style={{ minWidth: 44, minHeight: 44, border: 0, borderRadius: 8, background: 'transparent', color: '#64748b', fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            <div className="cf-quick-start-actions">
              <button type="button" onClick={() => document.querySelector<HTMLInputElement>('.cf-underlay-tools input[type="file"]')?.click()} style={{ minHeight: 44, border: '1px solid #7dd3fc', borderRadius: 9, background: '#f0f9ff', color: '#075985', fontWeight: 650 }}>นำเข้าแบบเดิม</button>
              <button type="button" onClick={() => { setQuickStartDismissed(true); setActiveTool('wall') }} style={{ minHeight: 44, border: '1px solid #cbd5e1', borderRadius: 9, background: '#fff', color: '#334155', fontWeight: 650 }}>วาดผนังเอง</button>
              <button type="button" onClick={() => { setQuickStartDismissed(true); handleStartHouseDemo() }} style={{ minHeight: 44, border: '1px solid #cbd5e1', borderRadius: 9, background: '#fff', color: '#334155', fontWeight: 650 }}>ลองแบบตัวอย่าง</button>
            </div>
          </section>}
          <details className="cf-view-switch-shell" onClick={event => {
            if ((event.target as HTMLElement).closest('.cf-view-switch button')) event.currentTarget.open = false
          }}>
            <summary className="cf-current-view" aria-label={`มุมมองปัจจุบัน: ${EDITOR_VIEW_OPTIONS.find(([mode]) => mode === viewMode)?.[1] ?? viewMode}`} title="เลือกมุมมอง">
              <Compass size={15} aria-hidden="true" />
              <span>{EDITOR_VIEW_OPTIONS.find(([mode]) => mode === viewMode)?.[1] ?? viewMode}</span>
              <ChevronDown size={13} aria-hidden="true" />
            </summary>
            <div className="cf-view-switch-popover">
            <ViewModePicker viewMode={viewMode} onChange={setViewMode} />
            <div className="cf-view-utilities">
            <details className="cf-multiview-menu">
              <summary aria-label="แบ่งมุมมอง" aria-pressed={splitViewEnabled} title="เปิดมุมมองหลาย pane พร้อมกัน">▥</summary>
              <div className="cf-multiview-popover" role="group" aria-label="ตั้งค่ามุมมองหลาย pane">
                <label><input type="checkbox" checked={splitViewEnabled} onChange={event => setMultiViewPreferences(current => ({ ...current, enabled: event.target.checked }))} />แสดงหลายมุมมอง</label>
                {splitViewEnabled && <label>มุมมองที่สอง
                  <select aria-label="มุมมองที่สอง" value={secondaryViewMode} onChange={event => setMultiViewPreferences(current => ({ ...current, secondaryViewMode: event.target.value as EditorViewMode }))}>
                    {EDITOR_VIEW_OPTIONS.map(([mode, label]) => <option key={mode} value={mode}>{label}</option>)}
                  </select>
                </label>}
                {splitViewEnabled && <label>จำนวนมุมมอง
                  <select aria-label="จำนวนมุมมอง" value={splitViewPaneCount} onChange={event => {
                    const count = Number(event.target.value) as SplitViewPaneCount
                    setMultiViewPreferences(current => ({
                      ...current,
                      paneCount: count,
                      customColumnCount: Math.min(current.customColumnCount, count),
                      layout: count === 4 ? 'grid' : current.layout === 'grid' || (count === 2 && current.layout === 'focus') ? 'columns' : current.layout,
                    }))
                  }}>
                    <option value={2}>2 มุมมอง</option>
                    <option value={3}>3 มุมมอง</option>
                    <option value={4}>4 มุมมอง</option>
                  </select>
                </label>}
                {splitViewEnabled && <label>การจัดวาง
                  <select aria-label="การจัดวางมุมมอง" value={splitViewLayout} onChange={event => setMultiViewPreferences(current => ({ ...current, layout: event.target.value as SplitViewLayout }))}>
                    <option value="columns">เรียงซ้ายไปขวา</option>
                    <option value="rows">เรียงบนลงล่าง</option>
                    {splitViewPaneCount === 3 && <option value="focus">1 + 2 · pane หลักใหญ่</option>}
                    {splitViewPaneCount === 4 && <option value="grid">2 × 2</option>}
                    <option value="custom">กำหนดจำนวนคอลัมน์</option>
                  </select>
                </label>}
                {splitViewEnabled && splitViewLayout === 'custom' && <label>คอลัมน์ในมุมมอง
                  <select aria-label="จำนวนคอลัมน์มุมมองหลาย pane" value={customColumnCount} onChange={event => setMultiViewPreferences(current => ({ ...current, customColumnCount: Number(event.target.value) }))}>
                    {Array.from({ length: splitViewPaneCount }, (_, index) => index + 1).map(count => <option key={count} value={count}>{count} คอลัมน์</option>)}
                  </select>
                </label>}
                {splitViewEnabled && splitViewLayout !== 'custom' && <label>สัดส่วน pane หลัก · {primaryPanePercent}%
                  <input aria-label="สัดส่วน pane หลัก" type="range" min={30} max={70} step={1} value={primaryPanePercent}
                    onChange={event => setMultiViewPreferences(current => ({ ...current, primaryPanePercent: Number(event.target.value) }))} />
                </label>}
                {splitViewEnabled && splitViewPaneCount >= 3 && <label>มุมมองที่สาม
                  <select aria-label="มุมมองที่สาม" value={tertiaryViewMode} onChange={event => setMultiViewPreferences(current => ({ ...current, tertiaryViewMode: event.target.value as EditorViewMode }))}>
                    {EDITOR_VIEW_OPTIONS.map(([mode, label]) => <option key={mode} value={mode}>{label}</option>)}
                  </select>
                </label>}
                {splitViewEnabled && splitViewPaneCount === 4 && <label>มุมมองที่สี่
                  <select aria-label="มุมมองที่สี่" value={fourthViewMode} onChange={event => setMultiViewPreferences(current => ({ ...current, fourthViewMode: event.target.value as EditorViewMode }))}>
                    {EDITOR_VIEW_OPTIONS.map(([mode, label]) => <option key={mode} value={mode}>{label}</option>)}
                  </select>
                </label>}
                {splitViewEnabled && <div className="cf-multiview-order" role="group" aria-label="ลำดับ pane">
                  <strong>ลำดับ pane</strong>
                  {visiblePaneSlots.map((slot, index) => <div key={slot} className="cf-multiview-order-row">
                    <span>{index + 1}. {paneSlotLabels[slot]}</span>
                    <div>
                      <button type="button" aria-label={`เลื่อน pane ลำดับ ${index + 1} ขึ้น`} disabled={index === 0} onClick={() => movePaneSlot(slot, -1)}>↑</button>
                      <button type="button" aria-label={`เลื่อน pane ลำดับ ${index + 1} ลง`} disabled={index === visiblePaneSlots.length - 1} onClick={() => movePaneSlot(slot, 1)}>↓</button>
                    </div>
                  </div>)}
                </div>}
                {splitViewEnabled && paneModes.includes('model3d') && <span>3D จัดกรอบตามวัตถุที่เลือก · เมื่อต่อกับแปลน การเลื่อนและซูมจะประสานกันสองทาง</span>}
              </div>
            </details>
            {viewMode === 'plan' && <button className="cf-view-icon-action" type="button" aria-label="ตรวจจับห้อง" onClick={handleDetectRooms} title="ค้นหาห้องจากวงผนังปิด">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4zM4 12h7V4m0 8v8m0-8h9" /><path d="m15 16 2 2 4-5" /></svg>
            </button>}
            {(viewMode === 'plan' || viewMode === 'framing' || viewMode === 'roofplan') && <details className="cf-label-menu" onClick={event => {
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
            </div>
          </details>

          {/* Interactive Plan Canvas */}
          <div className="cf-viewport-stage" style={splitViewGridStyle}>
            {orderedPaneSlots.map((slot, index) => <div
              key={slot}
              className="cf-multiview-pane"
              data-pane-slot={slot}
              data-testid={slot === 'primary' ? 'primary-view-pane' : `${slot}-view-pane`}
              data-primary-selected-object-id={selectedId ?? ''}
              data-selected-object-ids={selectedIds.join(',')}
              onDragOver={event => {
                if (event.dataTransfer.types.includes('text/plain')) event.preventDefault()
              }}
              onDrop={event => {
                event.preventDefault()
                const sourceSlot = event.dataTransfer.getData('text/plain') as SplitViewPaneSlot
                if (['primary', 'secondary', 'tertiary', 'fourth'].includes(sourceSlot)) reorderPaneSlots(sourceSlot, slot)
              }}
              style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden', position: 'relative', ...(slot === 'primary' ? primaryPaneGridStyle : {}), ...paneGridStyle(index) }}
            >
              {splitViewEnabled && <span
                className="cf-multiview-pane-grip"
                draggable
                aria-hidden="true"
                title={`ลากเพื่อจัดลำดับ ${paneSlotLabels[slot]}`}
                onDragStart={event => {
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', slot)
                }}
              >⠿</span>}
              {renderEditorView(paneViewModes[slot], slot !== 'primary')}
            </div>)}
            {splitViewEnabled && splitViewLayout === 'custom' && <>
              {customColumnBoundaries.map((value, index) => {
                const range = getMultiViewTrackBoundaryRange(customColumnTrackShares, index)
                return <MultiViewResizeHandle
                  key={`column-${index}`}
                  orientation="vertical"
                  value={value}
                  min={range.min}
                  max={range.max}
                  label={`ปรับสัดส่วนระหว่างคอลัมน์ ${index + 1} และ ${index + 2}`}
                  onChange={position => resizePaneTrack('column', index, position)}
                />
              })}
              {customRowBoundaries.map((value, index) => {
                const range = getMultiViewTrackBoundaryRange(customRowTrackShares, index)
                return <MultiViewResizeHandle
                  key={`row-${index}`}
                  orientation="horizontal"
                  value={value}
                  min={range.min}
                  max={range.max}
                  label={`ปรับสัดส่วนระหว่างแถว ${index + 1} และ ${index + 2}`}
                  onChange={position => resizePaneTrack('row', index, position)}
                />
              })}
            </>}
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
              <span data-testid="snap-feedback" style={{ color: snapKind === 'Free' ? '#64748b' : '#38bdf8' }}>
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

        {inspectorOpen && <button type="button" className="cf-inspector-backdrop" aria-label="ปิดแผงข้อมูล" onClick={() => setInspectorOpen(false)} />}
        {inspectorOpen && <Suspense fallback={<aside className="cf-inspector" role="status">กำลังเปิดแผงข้อมูล…</aside>}><EditorInspector
          onCloseInspector={() => setInspectorOpen(false)}
          activeTab={rightPanelTab}
          onActiveTabChange={setRightPanelTab}
          project={project}
          selectedId={selectedId}
          selectedIds={selectedIds}
          properties={{
            project, displayUnit, selectedId, selectedIds, ...propertiesActions,
            onDeleteObjects: handleDeleteObjects,
            onFlipDoorHanding: handleFlipDoorHanding,
            onOpenTypeManager: () => openCatalog(true, true),
            onOpenFamilyEditor: () => familyWorkbench.show(true),
            onUpdateFamilyInstance: (objectId, changes) => { const result = dispatchCommandBatch([{name:'UpdateFamilyInstance',input:{object_id:objectId,...changes}}]); if(result.status!=='success') setFileFeedback(result.errors?.join(' · ')??'แก้ Family ไม่สำเร็จ') },
            onAddFoundation: colId => handleCommitFoundation({ columnId: colId }),
            onDeleteObject: handleDeleteObject,
            onDrawSurfaceVoid: surfaceId => {
              setSelectedId(surfaceId)
              setViewMode(project.objects[surfaceId]?.object_type === 'roof.system' ? 'roofplan' : 'plan')
              setActiveTool('slabVoid')
            },
            onCreateRoomFinish: handleCreateRoomFinish,
          }}
          onOpenConstruction={() => setIsConstructionOpen(true)}
          onExportTakeoff={handleExportTakeoff}
          onExportBOQ={handleExportBOQ}
          coordination={{
            project,
            report: coordination.report,
            error: coordination.error,
            selectedIds,
            onSelectObjects: ids => selectObjects(ids, ids[0] ?? null),
            onSubmitSettings: settings => dispatchCommandBatch([{ name: 'UpdateCoordinationSettings', input: { settings } }]),
          }}
          ai={{
            project,
            selectedIds,
            onPreview: async commands => {
              const result = await CommandBus.executeBatchAsync(project, commands, 'ai')
              return {
                valid: result.status === 'success',
                affected_object_ids: [...new Set(result.results.flatMap(item => item.affected_object_ids))],
                errors: result.errors ?? [],
              }
            },
            onExecute: (commands, actor) => dispatchAsyncCommandBatch(commands, actor),
          }}
          extensions={{
            contributions: moduleUIContributions,
            commandDescriptors: moduleCommandDescriptors,
            onExecute: command => dispatchAsyncCommandBatch([command]),
          }}
          browser={{
            project,
            selectedIds,
            hiddenObjectIds,
            activeLevelId: project.project.active_level_id,
            activeViewId: viewMode,
            viewTemplates: project.view_settings?.view_templates ?? [],
            onSelectLevel: handleSetWorkingLevel,
            onSelectView: view => { setAlignmentPreview(null); setViewMode(view as typeof viewMode) },
            onSaveViewTemplate: handleSaveViewTemplate,
            onApplyViewTemplate: handleApplyViewTemplate,
            onDeleteViewTemplate: handleDeleteViewTemplate,
            onUpdateReferenceDrawing: (key, changes) => {
              const underlay = project.underlays?.[key]
              if (!underlay?.drawing_id) return
              setProject({ ...project, underlays: { ...project.underlays, [key]: { ...underlay, ...changes } } })
            },
            onDeleteReferenceDrawing: key => {
              if (!project.underlays?.[key]?.drawing_id) return
              const underlays = { ...project.underlays }
              delete underlays[key]
              setProject({ ...project, underlays })
            },
            onSelectObjects: ids => {
              const object = project.objects[ids[0] ?? '']
              if (object) {
                const levelId = object.level_refs?.[0]?.level_id
                if (levelId && project.levels.some(level => level.id === levelId)) handleSetWorkingLevel(levelId)
                if (object.object_type === 'roof.system') setViewMode('roofplan')
                else if (['structure.beam', 'structure.foundation'].includes(object.object_type)) setViewMode('framing')
                else if (['plan', 'framing', 'roofplan'].includes(viewMode)) setViewMode('plan')
              }
              selectObjects(ids, ids[0] ?? null)
              setRightPanelTab('properties')
              setInspectorOpen(true)
            },
            onToggleVisibility: handleToggleObjectVisibility,
            onShowAll: handleShowAllObjects,
            onPreviewArray: handlePreviewArrayObjects,
            onMoveObjects: handleMoveObjectsByDelta,
            onPreviewAlignment: handlePreviewAlignment,
            onPreviewOffset: handlePreviewOffset,
            onPreviewMirror: handlePreviewMirror,
            onPreviewSplit: handlePreviewSplit,
            onPreviewJoin: handlePreviewJoin,
            onPreviewTrim: handlePreviewTrim,
            onCommitAlignment: handleCommitAlignment,
            onCancelAlignment: () => setAlignmentPreview(null),
            alignmentPreviewActive: !!alignmentPreview,
          }}
        /></Suspense>}
      </div>

      {familyWorkbench.open && <Suspense fallback={<div>กำลังเปิด Family Studio…</div>}><FamilyWorkbench project={project} initialFamily={familyWorkbench.seed} selectedObjectId={selectedId} onExecute={dispatchCommandBatch} onPlace={familyWorkbench.place} onClose={familyWorkbench.close}/></Suspense>}
      {/* BIM Type Manager Modal */}
      {dwgPickerState && <DwgDrawingPickerModal
        file={dwgPickerState.file}
        candidates={dwgPickerState.candidates}
        levels={project.levels.map(level => ({ id: level.id, name: levelPickerLabel(level.name) }))}
        activeLevelId={project.project.active_level_id}
        onClose={() => setDwgPickerState(null)}
        onImport={selections => {
          const { file } = dwgPickerState
          setDwgPickerState(null)
          void handleImportDwgCandidates(file, selections)
        }}
      />}
      {isConstructionOpen&&<Suspense fallback={<div>กำลังเปิด BIM Workbench…</div>}><ConstructionWorkbench project={project} initialTab={workbenchTab} onOpenCatalog={()=>{setIsConstructionOpen(false);openCatalog(false,false,'structure.slab')}} onClose={()=>setIsConstructionOpen(false)} onExecute={dispatchCommandBatch}/></Suspense>}
      {isTypeManagerOpen && <Suspense fallback={<div role="status" className="cf-modal-loading">กำลังเปิดคลังชนิด…</div>}><TypeManagerModal
        isOpen
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
      /></Suspense>}

      {isSettingsOpen && <Suspense fallback={<div role="status" className="cf-modal-loading">กำลังเปิดการตั้งค่า…</div>}><SettingsModal project={project} displayUnit={displayUnit} onClose={()=>setIsSettingsOpen(false)} onExecute={dispatchCommandBatch} inspectorOpen={inspectorOpen} onInspectorChange={setInspectorOpen}/></Suspense>}
      {/* Underlay Point-to-Point Scale Calibration Modal */}
      {calibrationModalOpen && <Suspense fallback={<div role="status" className="cf-modal-loading">กำลังเปิดปรับมาตราส่วน…</div>}><UnderlayCalibrationModal
        isOpen
        onClose={() => setCalibrationModalOpen(false)}
        measuredDistance_mm={measuredCalibrationDist_mm}
        displayUnit={displayUnit}
        currentScale_mm_per_px={underlay.scale_mm_per_px}
        onApplyScale={handleApplyCalibrationScale}
      /></Suspense>}

      {/* 1-Click Parametric Extension Presets Modal */}
      <Suspense fallback={null}><ExtensionPresetsModal
        isOpen={isPresetsModalOpen}
        onClose={() => setIsPresetsModalOpen(false)}
        project={project}
        onApplyPreset={dispatchCommandBatch}
      /></Suspense>

      {/* Title Deed & Legal Signatories Modal (Permit Issue Set) */}
      {isLegalModalOpen && <Suspense fallback={<div role="status" className="cf-modal-loading">กำลังเปิดข้อมูลโครงการ…</div>}><ProjectLegalModal
        isOpen
        onClose={() => setIsLegalModalOpen(false)}
        project={project}
        onSave={(legal) => {
          setProject((prev) => {
            const next = { ...prev, legal_metadata: legal }
            projectSessionRef.current = new ProjectCommandSession(next)
            return next
          })
        }}
      /></Suspense>}

      {/* On-Site Photo Dimension Overlay & Defect Inspection Modal */}
      {isPhotoDimensionModalOpen && <Suspense fallback={<div role="status" className="cf-modal-loading">กำลังเปิดเครื่องมือวัดจากภาพ…</div>}><PhotoDimensionModal
        isOpen
        onClose={() => {
          setIsPhotoDimensionModalOpen(false)
          setActivePhotoSession(null)
        }}
        currentRoomName={project.project.name}
        activeLevelId={project.project.active_level_id}
        initialSession={activePhotoSession}
        onSaveSession={handleSavePhotoSession}
      /></Suspense>}

    </div>
  )
}
