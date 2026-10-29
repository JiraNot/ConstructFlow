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
  type FieldPhotoInspection,
  type InvoiceDraft,
  type InvoicePaymentMethod,
  type InvoiceStatusTarget,
  type ProposalDeviceSignatureInput,
  type ProposalRecipientSignature,
  type ProjectTakeoffRate,
} from '@constructflow/project-model'
import { validatePolygonWithVoids } from '@constructflow/geometry-kernel'
import { useProjectSession } from './app/useProjectSession.js'
import { useEditorObjectSelection } from './app/useEditorObjectSelection.js'
import { useToolSession } from './app/useToolSession.js'
import { DEFAULT_PLAN_CANVAS_PREFERENCES, loadPlanCanvasPreferences, savePlanCanvasPreferences, type PlanCanvasPreferences } from './app/planCanvasPreferences.mjs'
import { buildProjectHistoryDeltaInput, CommandBus } from './commands/CommandBus.js'
import { Toolbar, toolLabel, ToolType } from './components/Toolbar.js'
import type { PlanCanvasProps } from './components/PlanCanvas.types.js'
import type { SupplierProductBundlePlacement } from './supplierBundlePlacement.js'
import type { CoordinatedElevationNavigation } from './components/ElevationCanvas.js'
import { EditorViewRenderer } from './components/EditorViewRenderer.js'
import type { PhotoDimensionSession } from '@constructflow/laser-survey'
import { deleteLocalFieldPhotoAssets, getLocalCollaborationToken, listLocalFieldPhotoAssets, LOCAL_COLLABORATION_TOKEN_CHANGED_EVENT, LOCAL_FIELD_PHOTO_ASSETS_CHANGED_EVENT, LOCAL_PROJECT_REVISIONS_CHANGED_EVENT, saveLocalFieldPhotoAssets } from './projectAutosave.js'
import { syncFieldPhotoAssets } from './fieldPhotoSync.js'
import { syncProjectRevisionHistory } from './revisionSync.js'
import { useCoordinationReport } from './features/coordination/useCoordinationReport.js'
import type { ProjectLegalMetadata } from '@constructflow/project-model'
import { DEFAULT_PLAN_LABEL_VISIBILITY, type PlanLabelVisibility } from './rendering/planRendererTypes.js'
import { Building2, Layers, History, Layers2, Ruler, ArrowUpDown, Sparkles, Undo2, Redo2, Folder, FolderOpen, Save, Download, CookingPot, FileCheck, MoreHorizontal, Tag, ChevronDown, Home, Compass, PanelRightOpen, Network, Users, MessageSquare, Cloud, CloudOff, AlertTriangle, Share2, Check, Loader2, AlertCircle } from 'lucide-react'
import { usePlanTransformCommands } from './app/usePlanTransformCommands.js'
import { usePlanPlacementCommands } from './app/usePlanPlacementCommands.js'
import { usePropertiesPanelActions } from './app/usePropertiesPanelActions.js'
import { preloadPlanAuthoringHandlers, usePlanAuthoringCommands } from './app/usePlanAuthoringCommands.js'
import { useGridAuthoringCommands } from './app/useGridAuthoringCommands.js'
import { useProjectBrowserCommands } from './app/useProjectBrowserCommands.js'
import { useTypeCatalogSession } from './app/useTypeCatalogSession.js'
import { useProjectContextCommands } from './app/useProjectContextCommands.js'
import { useLocalProjectPersistence } from './app/useLocalProjectPersistence.js'
import { useProjectPresence } from './app/useProjectPresence.js'
import { useProjectCommentSync } from './app/useProjectCommentSync.js'
import { useProjectCommandSync } from './app/useProjectCommandSync.js'
import { projectSyncFingerprint } from './projectFingerprint.js'
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
import { SelectionActionDock } from './components/SelectionActionDock.js'
import { CanvasObjectLibraryPanel, type CanvasLibraryCategory } from './components/CanvasObjectLibraryPanel.js'
import { ViewModePicker } from './components/ViewModePicker.js'
import { DwgDrawingPickerModal } from './components/DwgDrawingPickerModal.js'
import type { DwgDrawingCandidate } from './cad/importDwgUnderlay.js'
import type { PdfPageAlignment, PdfPageScaleCalibration } from './cad/renderPdfUnderlayPage.js'

const FamilyWorkbench = lazy(() => import('./components/FamilyWorkbench.js').then(module => ({ default: module.FamilyWorkbench })))
const LaserBleHudPill = lazy(() => import('./components/LaserBleHudPill.js').then(module => ({ default: module.LaserBleHudPill })))
const EditorInspector = lazy(() => import('./components/EditorInspector.js').then(module => ({ default: module.EditorInspector })))
const SettingsModal = lazy(() => import('./components/SettingsModal.js').then(module => ({ default: module.SettingsModal })))
const TypeManagerModal = lazy(() => import('./components/TypeManagerModal.js').then(module => ({ default: module.TypeManagerModal })))
const UnderlayCalibrationModal = lazy(() => import('./components/UnderlayCalibrationModal.js').then(module => ({ default: module.UnderlayCalibrationModal })))
const ProjectLegalModal = lazy(() => import('./components/ProjectLegalModal.js').then(module => ({ default: module.ProjectLegalModal })))
const PhotoDimensionModal = lazy(() => import('./components/PhotoDimensionModal.js').then(module => ({ default: module.PhotoDimensionModal })))
const ProjectVersionHistoryModal = lazy(() => import('./components/ProjectVersionHistoryModal.js').then(module => ({ default: module.ProjectVersionHistoryModal })))
const ProjectDrawingDownloadLinkModal = lazy(() => import('./components/ProjectDrawingDownloadLinkModal.js').then(module => ({ default: module.ProjectDrawingDownloadLinkModal })))
const LocalProjectLibraryModal = lazy(() => import('./components/LocalProjectLibraryModal.js').then(module => ({ default: module.LocalProjectLibraryModal })))
const ProjectCommentsPanel = lazy(() => import('./components/ProjectCommentsPanel.js').then(module => ({ default: module.ProjectCommentsPanel })))
const ProjectCommandOutboxModal = lazy(() => import('./components/ProjectCommandOutboxModal.js').then(module => ({ default: module.ProjectCommandOutboxModal })))
const PdfPagePicker = lazy(() => import('./components/PdfPagePicker.js').then(module => ({ default: module.PdfPagePicker })))

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
  const [pdfUnderlayFile, setPdfUnderlayFile] = useState<File | null>(null)
  const [pdfUnderlayBusy, setPdfUnderlayBusy] = useState(false)
  const [pdfUnderlayCalibrations, setPdfUnderlayCalibrations] = useState<PdfPageScaleCalibration[]>([])
  const [pdfUnderlayAlignments, setPdfUnderlayAlignments] = useState<PdfPageAlignment[]>([])
  const [laserHudReady, setLaserHudReady] = useState(false)
  const {
    project,
    setProjectState,
    setProject,
    commandQueue,
    setCommandQueue,
    localCommandTransactions,
    setLocalCommandTransactions,
    historyTravelRevision,
    recordHistoryTravel,
    undo,
    redo,
    sessionRef: projectSessionRef,
    dispatchCommandBatch,
    dispatchAsyncCommandBatch,
    previewCommands: previewDirectManipulation,
  } = useProjectSession(() => createDefaultResidentialProjectDocument(crypto.randomUUID(), 'Untitled Project'))
  const currentProjectRef = useRef(project)
  currentProjectRef.current = project
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
  const fieldPhotoSyncSignature = (project.field_photo_inspections ?? [])
    .map(inspection => inspection.image_asset_id).sort().join('|')
  useEffect(() => {
    if (!fieldPhotoSyncSignature) return
    let active = true
    let inFlight = false
    let retryDelay = 5_000
    let retryTimer: number | null = null

    const schedule = (delay: number) => {
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      retryTimer = window.setTimeout(() => { retryTimer = null; void syncPhotos() }, delay)
    }
    const syncPhotos = async () => {
      if (!active || !navigator.onLine || document.visibilityState === 'hidden') return
      if (inFlight) { schedule(500); return }
      inFlight = true
      try {
        const settings = await getLocalCollaborationToken()
        if (!active || !settings) return
        const result = await syncFieldPhotoAssets(project, settings.token)
        if (!active) return
        const hasConflicts = result.conflicts.length > 0
        const hasMissing = result.missing > 0
        if (hasConflicts) {
          setFileFeedback(`ซิงค์รูปหน้างานพบ UUID ที่มีภาพคนละไฟล์ ${result.conflicts.length} รายการ · เก็บภาพเดิมไว้และไม่เขียนทับ`)
        } else if (hasMissing) {
          setFileFeedback(`ซิงค์รูปหน้างานแล้ว · ยังขาด ${result.missing} ไฟล์ รอทีมออนไลน์หรือซิงค์อีกครั้ง`)
        } else if (result.uploaded || result.downloaded) {
          setFileFeedback(`ซิงค์รูปหน้างานอัตโนมัติแล้ว · อัปโหลด ${result.uploaded} · ดาวน์โหลด ${result.downloaded}`)
        }
        if (hasMissing && result.can_upload) {
          schedule(retryDelay)
          retryDelay = Math.min(retryDelay * 2, 60_000)
        } else retryDelay = 5_000
      } catch (error) {
        if (active) {
          setFileFeedback(`ซิงค์รูปหน้างานอัตโนมัติไม่สำเร็จ: ${error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'} · จะลองใหม่เมื่อเชื่อมต่อได้`)
          schedule(retryDelay)
          retryDelay = Math.min(retryDelay * 2, 60_000)
        }
      } finally {
        inFlight = false
      }
    }
    const resumeSync = () => schedule(0)
    const handleVisibility = () => { if (document.visibilityState === 'visible') resumeSync() }

    schedule(1_200)
    window.addEventListener('online', resumeSync)
    window.addEventListener('focus', resumeSync)
    window.addEventListener(LOCAL_COLLABORATION_TOKEN_CHANGED_EVENT, resumeSync)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      active = false
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      window.removeEventListener('online', resumeSync)
      window.removeEventListener('focus', resumeSync)
      window.removeEventListener(LOCAL_COLLABORATION_TOKEN_CHANGED_EVENT, resumeSync)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [fieldPhotoSyncSignature, project.project.id])
  useEffect(() => {
    let active = true
    let inFlight = false
    let retryDelay = 5_000
    let retryTimer: number | null = null

    const schedule = (delay: number) => {
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      retryTimer = window.setTimeout(() => { retryTimer = null; void syncRevisions() }, delay)
    }
    const syncRevisions = async () => {
      if (!active || !navigator.onLine || document.visibilityState === 'hidden') return
      if (inFlight) { schedule(500); return }
      inFlight = true
      try {
        const settings = await getLocalCollaborationToken()
        if (!active || !settings) return
        const result = await syncProjectRevisionHistory(currentProjectRef.current, settings.token)
        if (!active) return
        if (result.uploaded || result.imported || result.serverConflicts || result.conflicts) {
          setFileFeedback(`ประวัติเวอร์ชันซิงค์กับทีมแล้ว · ส่งใหม่ ${result.uploaded} · รับใหม่ ${result.imported} · conflict ฝั่ง gateway ${result.serverConflicts} · ในเครื่อง ${result.conflicts}`)
        }
        retryDelay = 5_000
      } catch (error) {
        if (active) {
          setFileFeedback(`ซิงค์ประวัติเวอร์ชันอัตโนมัติไม่สำเร็จ: ${error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'} · จะลองใหม่เมื่อเชื่อมต่อได้`)
          schedule(retryDelay)
          retryDelay = Math.min(retryDelay * 2, 60_000)
        }
      } finally {
        inFlight = false
      }
    }
    const resumeSync = () => schedule(0)
    const handleVisibility = () => { if (document.visibilityState === 'visible') resumeSync() }

    schedule(1_800)
    window.addEventListener('online', resumeSync)
    window.addEventListener('focus', resumeSync)
    window.addEventListener(LOCAL_COLLABORATION_TOKEN_CHANGED_EVENT, resumeSync)
    window.addEventListener(LOCAL_PROJECT_REVISIONS_CHANGED_EVENT, resumeSync)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      active = false
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      window.removeEventListener('online', resumeSync)
      window.removeEventListener('focus', resumeSync)
      window.removeEventListener(LOCAL_COLLABORATION_TOKEN_CHANGED_EVENT, resumeSync)
      window.removeEventListener(LOCAL_PROJECT_REVISIONS_CHANGED_EVENT, resumeSync)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [project.project.id])
  const {
    supportsProjectFileOpen, confirmReplaceUnsavedProject, handleDownloadProjectCopy, handleSaveProject, handleSaveAsProject,
    handleOpenProject, handleChooseProject,
  } = useProjectFileActions({
    project, projectJson, projectFileAccess, sessionRef: projectSessionRef, dispatchCommandBatch, setProjectState, setCommandQueue,
    setSelectedId, setSelectedIds, savedProjectJson, setSavedProjectJson, replacementBaselineJson,
    setReplacementBaselineJson, activeProjectFileHandleRef, updateActiveProjectFileHandle,
    setLocalAutosaveState, setFileFeedback,
    recordHistoryTravel,
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
  const [selectionScope, setSelectionScope] = useState<ToolType | null>(null)
  const [canvasLibraryCategory, setCanvasLibraryCategory] = useState<CanvasLibraryCategory | null>(null)
  const [toolContextOpen, setToolContextOpen] = useState(false)
  const [supplierBundlePlacement, setSupplierBundlePlacement] = useState<SupplierProductBundlePlacement | null>(null)
  useEffect(() => {
    if (activeTool !== 'select') setSelectionScope(null)
  }, [activeTool])
  useEffect(() => {
    if (['door', 'window', 'pipe', 'fixture', 'cabinet', 'furniture', 'moulding', 'archFloor', 'ceiling', 'roomSeparator', 'slabVoid', 'stair'].includes(activeTool)) {
      void preloadPlanAuthoringHandlers().catch(() => undefined)
    }
  }, [activeTool])
  const [planCanvasPreferences, setPlanCanvasPreferences] = useState<PlanCanvasPreferences>(() => loadPlanCanvasPreferences())
  useEffect(() => { savePlanCanvasPreferences(planCanvasPreferences) }, [planCanvasPreferences])
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
    resetProjectSession: nextProject => { projectSessionRef.current!.reset(nextProject); recordHistoryTravel() },
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
  const labelVisibility = planCanvasPreferences.labelVisibility ?? DEFAULT_PLAN_LABEL_VISIBILITY
  const setLabelVisibility = (updater: PlanLabelVisibility | ((current: PlanLabelVisibility) => PlanLabelVisibility)) => {
    setPlanCanvasPreferences(current => ({
      ...current,
      labelVisibility: typeof updater === 'function'
        ? updater(current.labelVisibility ?? DEFAULT_PLAN_LABEL_VISIBILITY)
        : updater,
    }))
  }
  const [rightPanelTab, setRightPanelTab] = useState<'properties' | 'quantities' | 'objects' | 'field_forms' | 'coordination' | 'ai' | 'extensions' | 'integrations'>('properties')
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
  const [isProjectLibraryOpen, setIsProjectLibraryOpen] = useState(false)
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false)
  const [isDrawingShareOpen, setIsDrawingShareOpen] = useState(false)
  const [isCommandOutboxOpen, setIsCommandOutboxOpen] = useState(false)
  const [isCommentsPanelOpen, setIsCommentsPanelOpen] = useState(false)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  const [inspectorOpen,setInspectorOpen] = useState(false)
  useEffect(() => {
    if (activeTool !== 'select') setInspectorOpen(false)
  }, [activeTool])
  useEffect(() => {
    const closeInspectorForCompactWorkspace = () => {
      if (window.innerWidth <= 1180) setInspectorOpen(false)
    }
    window.addEventListener('resize', closeInspectorForCompactWorkspace)
    return () => window.removeEventListener('resize', closeInspectorForCompactWorkspace)
  }, [])
  const handleOpenLocalProject = async (projectId: string) => {
    if (projectId === project.project.id) { setIsProjectLibraryOpen(false); return }
    try {
      const { loadLocalProjectSnapshotById } = await import('./projectAutosave.js')
      const snapshot = await loadLocalProjectSnapshotById(projectId)
      if (!snapshot) { setFileFeedback('ไม่พบ snapshot ของโครงการนี้ในอุปกรณ์'); return }
      if (!confirmReplaceUnsavedProject()) return
      projectSessionRef.current!.reset(snapshot.project)
      recordHistoryTravel()
      updateActiveProjectFileHandle(null)
      setProjectState(snapshot.project)
      setSavedProjectJson(snapshot.savedProjectJson)
      setReplacementBaselineJson(snapshot.replacementBaselineJson ?? snapshot.projectJson)
      setCommandQueue([])
      setSelectedId(null)
      setSelectedIds([])
      setActiveTool('select')
      setViewMode('plan')
      setFileFeedback(`เปิด “${snapshot.project.project.name}” จากคลังในอุปกรณ์แล้ว`)
      setIsProjectLibraryOpen(false)
    } catch (error) {
      setFileFeedback(error instanceof Error ? error.message : 'เปิดโครงการจากคลังไม่สำเร็จ')
    }
  }
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
  const selectionDock = useMemo(() => {
    const ids = selectedIds.filter(id => Boolean(project.objects[id]))
    const selected = ids.map(id => project.objects[id]!)
    const selectedWallIds = new Set(selected.filter(object => object.object_type === 'architecture.wall').map(object => object.id))
    const selectedIdsSet = new Set(ids)
    const hostedOpeningCount = Object.values(project.objects).filter(object =>
      (object.object_type === 'door_window.door' || object.object_type === 'door_window.window')
      && selectedWallIds.has(String((object.module_data as Record<string, unknown>).wall_id ?? ''))
      && !selectedIdsSet.has(object.id),
    ).length
    const arrayObjectCount = ids.length + hostedOpeningCount
    const lineTypes = new Set(['architecture.wall', 'structure.beam', 'structure.grid', 'reference.grid', 'architecture.room_separator'])
    const offsetSupported = selected.length > 0 && selected.every(object => {
      const data = object.module_data as Record<string, unknown>
      if (!lineTypes.has(object.object_type)) return false
      if (object.object_type === 'architecture.wall' && data.curve_geometry) return false
      if (object.object_type === 'structure.beam') return !object.host_refs.length && !data.start_column_id && !data.end_column_id
      if (object.object_type === 'structure.grid' || object.object_type === 'reference.grid') return !data.system_id
      return true
    })
    const mirrorSupported = selected.length > 1 && selected.every(object => {
      const data = object.module_data as Record<string, unknown>
      if (object.object_type === 'architecture.wall') {
        if (data.curve_geometry) return false
        return !Object.values(project.objects).some(candidate =>
          (candidate.object_type === 'door_window.door' || candidate.object_type === 'door_window.window')
          && String((candidate.module_data as Record<string, unknown>).wall_id ?? '') === object.id)
      }
      if (object.object_type === 'structure.beam') return !object.host_refs.length && !data.start_column_id && !data.end_column_id
      if (object.object_type === 'structure.grid' || object.object_type === 'reference.grid') return !data.system_id
      return object.object_type === 'architecture.room_separator'
    })
    return { ids, arrayObjectCount, offsetSupported, mirrorSupported }
  }, [project.objects, selectedIds])
  const [cursorCoords_mm, setCursorCoords_mm] = useState<[number, number]>([0, 0])
  const cursorUpdatedAtRef = useRef(0)
  const [snapKind, setSnapKind] = useState<string>('Free')
  const teamPresence = useProjectPresence(project.project.id, localAutosaveReady, {
    selectedObjectIds: selectedIds,
    cursorMm: cursorCoords_mm,
    cursorUpdatedAt: cursorUpdatedAtRef.current,
  })
  const commandSyncStatus = useProjectCommandSync(
    project.project.id,
    localAutosaveReady,
    localCommandTransactions,
    transactionIds => setLocalCommandTransactions(current => current.filter(transaction => !transactionIds.includes(transaction.transaction_id))),
    async (envelopes, expectedFingerprint) => {
      const session = projectSessionRef.current!
      const expectedRevision = session.snapshotRevision
      const preview = await CommandBus.executeEnvelopeBatchAsync(session.project, envelopes, 'sync')
      if (session.snapshotRevision !== expectedRevision) return { status: 'rejected', errors: ['แบบเปลี่ยนระหว่างตรวจคำสั่งจากทีม กรุณาซิงก์ใหม่'] }
      if (preview.status !== 'success') return { status: preview.status, errors: preview.errors }
      if (expectedFingerprint && projectSyncFingerprint(preview.updatedProject) !== expectedFingerprint) {
        return { status: 'rejected', errors: ['ผล replay ไม่ตรงกับ fingerprint ที่เครื่องต้นทางยืนยัน'] }
      }
      const result = await session.executeEnvelopesAsync(envelopes, 'sync', expectedRevision)
      if (result.status === 'success') setProjectState(result.updatedProject)
      return { status: result.status, errors: result.errors, project: result.updatedProject }
    },
    teamPresence.currentRole,
    historyTravelRevision,
    projectJson,
  )
  const commentSyncStatus = useProjectCommentSync(project.project.id, localAutosaveReady, project.comments ?? [], commands => dispatchCommandBatch(commands))

  const underlaySession = usePlanUnderlaySession({
    project, viewMode, activeLevelId: project.project.active_level_id,
    setProject, setActiveTool,
  })
  const { underlay, setUnderlay, underlayKey, hydratedUnderlayRef, canCalibrateUnderlayRef, calibrationPointsRef } = underlaySession
  const [calibrationModalOpen, setCalibrationModalOpen] = useState<boolean>(false)
  const [measuredCalibrationDist_mm, setMeasuredCalibrationDist_mm] = useState<number>(4000)
  const [isPresetsModalOpen, setIsPresetsModalOpen] = useState<boolean>(false)
  const [isLegalModalOpen, setIsLegalModalOpen] = useState<boolean>(false)
  const [isPhotoDimensionModalOpen, setIsPhotoDimensionModalOpen] = useState<boolean>(false)
  const photoSessionsStorageKey = `cf_photo_sessions:${project.project.id}`
  const [photoSessions, setPhotoSessions] = useState<PhotoDimensionSession[]>([])
  const [activePhotoSession, setActivePhotoSession] = useState<PhotoDimensionSession | null>(null)
  useEffect(() => {
    let active = true
    setPhotoSessions([])
    setActivePhotoSession(null)
    const hydrate = async () => {
      try {
        let inspections = [...(project.field_photo_inspections ?? [])]
        let legacy: PhotoDimensionSession[] = []
        try {
          const saved = localStorage.getItem(photoSessionsStorageKey)
          const parsed: unknown = saved ? JSON.parse(saved) : []
          legacy = Array.isArray(parsed) ? parsed as PhotoDimensionSession[] : []
        } catch { /* A browser blocked the legacy localStorage entry; IndexedDB remains available. */ }
        if (legacy.length && active) {
          let migrated: PhotoDimensionSession[] = []
          try {
            migrated = legacy.map(session => ({
              ...session,
              id: crypto.randomUUID(),
              image_asset_id: crypto.randomUUID(),
              level_id: project.levels.some(level => level.id === session.level_id) ? session.level_id : project.project.active_level_id,
              camera_heading_deg: session.camera_heading_deg === undefined ? undefined : ((session.camera_heading_deg % 360) + 360) % 360,
              dimensions: session.dimensions ?? [],
              areas: session.areas ?? [],
            }))
            const migratedInspections: FieldPhotoInspection[] = migrated.map(({ image_data_url: _image, ...inspection }) => ({ ...inspection, image_asset_id: inspection.image_asset_id! }))
            await saveLocalFieldPhotoAssets(project.project.id, migrated.map(session => ({ asset_id: session.image_asset_id!, data_url: session.image_data_url })))
            const result = dispatchCommandBatch(migratedInspections.map(inspection => ({ name: 'SaveFieldPhotoInspection', input: { inspection } })))
            if (result.status !== 'success') {
              await deleteLocalFieldPhotoAssets(project.project.id, migratedInspections.map(inspection => inspection.image_asset_id))
              throw new Error(result.errors?.join(' · ') ?? 'บันทึกข้อมูลภาพลงโครงการไม่สำเร็จ')
            }
            inspections = [...inspections, ...migratedInspections]
            legacy = []
            try { localStorage.removeItem(photoSessionsStorageKey) } catch { /* The project has the migrated records. */ }
            if (active) {
              setFileFeedback(`ย้ายรูปถ่ายหน้างาน ${migrated.length} รายการเข้าโครงการแล้ว`)
            }
          } catch (error) {
            if (active) {
              setFileFeedback(`ย้ายรูปถ่ายหน้างานเข้าโครงการไม่สำเร็จ: ${error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'} · เก็บข้อมูลเดิมไว้ในเครื่อง`)
            }
          }
        }
        if (!active) return
        const assets = await listLocalFieldPhotoAssets(project.project.id)
        const resolved = inspections.flatMap(inspection => {
          const image_data_url = assets[inspection.image_asset_id]
          return image_data_url ? [{ ...inspection, image_data_url } as PhotoDimensionSession] : []
        })
        setPhotoSessions([...resolved, ...legacy])
        if (resolved.length !== inspections.length) setFileFeedback(`รูปถ่ายหน้างานขาด ${inspections.length - resolved.length} ไฟล์ในอุปกรณ์นี้ · ข้อมูลวัดและตำแหน่งยังอยู่ในโครงการ`)
      } catch (error) {
        if (active) setFileFeedback(`อ่านรูปถ่ายหน้างานไม่สำเร็จ: ${error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'}`)
      }
    }
    void hydrate()
    const handlePhotoAssetsChanged = () => { void hydrate() }
    window.addEventListener(LOCAL_FIELD_PHOTO_ASSETS_CHANGED_EVENT, handlePhotoAssetsChanged)
    return () => {
      active = false
      window.removeEventListener(LOCAL_FIELD_PHOTO_ASSETS_CHANGED_EVENT, handlePhotoAssetsChanged)
    }
  }, [photoSessionsStorageKey, project.field_photo_inspections])
  const handleSavePhotoSession = async (session: PhotoDimensionSession) => {
    const legacySessionId = session.id
    const inspectionId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(session.id) ? session.id : crypto.randomUUID()
    const image_asset_id = crypto.randomUUID()
    await saveLocalFieldPhotoAssets(project.project.id, [{ asset_id: image_asset_id, data_url: session.image_data_url }])
    const { image_data_url: _image, image_asset_id: _previousAsset, ...metadata } = { ...session, id: inspectionId }
    const inspection: FieldPhotoInspection = { ...metadata, image_asset_id }
    const result = dispatchCommandBatch([{ name: 'SaveFieldPhotoInspection', input: { inspection } }])
    if (result.status !== 'success') {
      await deleteLocalFieldPhotoAssets(project.project.id, [image_asset_id])
      throw new Error(result.errors?.join(' · ') ?? 'บันทึกข้อมูลภาพลงโครงการไม่สำเร็จ')
    }
    const nextSession = { ...session, id: inspectionId, image_asset_id }
    const next = [...photoSessions.filter(item => item.id !== legacySessionId && item.id !== inspectionId), nextSession]
    try {
      const saved = localStorage.getItem(photoSessionsStorageKey)
      const parsed: unknown = saved ? JSON.parse(saved) : []
      if (Array.isArray(parsed)) {
        const remaining = (parsed as PhotoDimensionSession[]).filter(item => item.id !== legacySessionId)
        if (remaining.length) localStorage.setItem(photoSessionsStorageKey, JSON.stringify(remaining))
        else localStorage.removeItem(photoSessionsStorageKey)
      }
    } catch { /* The project now owns inspection metadata even if legacy cleanup is unavailable. */ }
    setPhotoSessions(next)
    setFileFeedback('บันทึกรูปถ่าย ข้อมูลวัด และหมุดไว้ในโครงการแล้ว')
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
    viewMode, setActiveTool: tool => { setSelectionScope(null); setActiveTool(tool) }, setSelectedId, handleSaveProject, undo, redo, canCalibrateUnderlayRef,
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
    handleCommitWallPath,
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
    setSelectedId,
    setFileFeedback,
    dispatchCommandBatch,
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
  const { handleUploadUnderlayImage, handleImportPdfUnderlay, handleImportDwgCandidates, handleImportSiteSurvey } = useReferenceDataImportActions({
    underlayKey, hydratedUnderlayRef, setUnderlay, setFileFeedback, dispatchCommandBatch,
    activeLevelId: project.project.active_level_id,
    onChoosePdf: file => {
      setPdfUnderlayBusy(false)
      setPdfUnderlayCalibrations([])
      setPdfUnderlayAlignments([])
      setPdfUnderlayFile(file)
    },
    onImportPdfUnderlay: underlays => {
      const additions = Object.fromEntries(underlays.map(underlay => [`drawing:${underlay.drawing_id ?? crypto.randomUUID()}`, underlay])) as Record<string, ProjectUnderlay>
      setProject(current => ({ ...current, underlays: { ...current.underlays, ...additions } }))
    },
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
    collaborators: teamPresence.sessions,
    onOpenProjectComment: commentId => { setActiveCommentId(commentId); setIsCommentsPanelOpen(true) },
    navigationViewport: planNavigationViewport,
    onNavigationViewportChange: setPlanNavigationViewport,
    preferences: planCanvasPreferences,
    onPreferencesChange: setPlanCanvasPreferences,
    displayUnit,
    activeTool,
    selectionScope,
    supplierBundlePlacement,
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
    onCommitWallPath: handleCommitWallPath,
    onCommitDoor: (wallId, point, offset, handing) => { if (!familyWorkbench.placeOpening('door', wallId, point, offset, handing)) handleCommitDoor(wallId, point, offset, handing) },
    onCommitWindow: (wallId, point, offset) => { if (!familyWorkbench.placeOpening('window', wallId, point, offset)) handleCommitWindow(wallId, point, offset) },
    onCommitSlab: handleCommitSlab,
    onCommitSupplierBundle: geometry => {
      const placement = supplierBundlePlacement
      if (!placement) { setFileFeedback('เลือก Bundle จาก Library ก่อนวางบนแปลน'); setActiveTool('select'); return }
      const visualType = placement.bundle.visual_type ?? 'shape'
      const unit = visualType === 'shape' ? 'item' : visualType === 'length' ? 'm' : 'm2'
      let unitRate: ProjectTakeoffRate = { ...placement.unit_rate, unit }
      if (visualType === 'area' && geometry.boundary_mm && geometry.boundary_mm.length >= 3) {
        const ring = geometry.boundary_mm
        const boundaryValidation = validatePolygonWithVoids(ring)
        if (!boundaryValidation.valid) { setFileFeedback(`พื้นที่ Bundle ไม่ถูกต้อง · ${boundaryValidation.reason}`); return }
        const areaM2 = Math.abs(ring.reduce((sum, point, index) => {
          const next = ring[(index + 1) % ring.length]!
          return sum + point[0] * next[1] - next[0] * point[1]
        }, 0)) / 2_000_000
        const perimeterM = ring.reduce((sum, point, index) => {
          const next = ring[(index + 1) % ring.length]!
          return sum + Math.hypot(next[0] - point[0], next[1] - point[1]) / 1000
        }, 0)
        if (areaM2 <= 0 || !Number.isFinite(areaM2)) { setFileFeedback('พื้นที่ Bundle เป็นศูนย์หรือรูปทรงไม่ถูกต้อง'); return }
        let material = 0, materialSell = 0, labor = 0
        for (const component of placement.components) {
          const basis = component.quantity_mode === 'perimeter' ? perimeterM : areaM2
          const quantity = component.purchase_units_per_output_unit * (1 + component.waste_percent / 100) * basis
          material += component.unit_cost_thb * quantity
          materialSell += component.unit_sell_thb * quantity
          if (placement.bundle.labor_calculation_mode === 'components') labor += (component.unit_labor_thb ?? 0) * quantity
        }
        if (placement.bundle.labor_calculation_mode !== 'components') labor = placement.bundle.labor_rate_per_output_unit * areaM2
        material = Number((material / areaM2).toFixed(4))
        materialSell = Number((materialSell / areaM2).toFixed(4))
        labor = Number((labor / areaM2).toFixed(4))
        unitRate = {
          ...unitRate,
          material_rate: material,
          labor_rate: labor,
          material_sell_rate: materialSell,
          product_gross_margin_percent: materialSell > 0 ? Number(((materialSell - material) / materialSell * 100).toFixed(4)) : 0,
        }
      }
      const id = crypto.randomUUID()
      const module_data: Record<string, unknown> = {
        bundle_id: placement.bundle.id,
        bundle_name: placement.bundle.name,
        rate_key: placement.bundle.rate_key,
        unit,
        visual_type: visualType,
        unit_rate_snapshot: unitRate,
        hide_on_proposal: placement.bundle.hide_on_proposal === true,
        component_snapshots: structuredClone(placement.components),
        ...geometry,
      }
      const result = dispatchCommandBatch([{ name: 'CreateSupplierBundleInstance', input: {
        id, level_id: project.project.active_level_id, created_phase: project.project.active_phase, module_data,
      } }])
      if (result.status === 'success') {
        setSelectedId(id)
        const path = geometry.path_mm ?? []
        const lengthM = path.slice(1).reduce((sum, point, index) => sum + Math.hypot(point[0] - path[index]![0], point[1] - path[index]![1]), 0) / 1000
        setFileFeedback(`วาง ${placement.bundle.name} แล้ว · ${visualType === 'shape' ? '1 ชุด' : visualType === 'length' ? `${lengthM.toFixed(2)} ม.` : 'คำนวณพื้นที่ตามขอบเขต'} · ราคาและตัวเลือก SKU ถูกบันทึกไว้กับวัตถุ`)
      } else setFileFeedback(result.errors?.[0] ?? 'วาง Bundle ไม่สำเร็จ')
    },
    onCommitArchitecturalFloor: handleCommitArchitecturalFloor,
    onCommitCeiling: handleCommitCeiling,
    onCommitRoof: handleCommitRoof,
    onCommitPipeRoute: handleCommitPipeRoute,
    onCommitFixture: handleCommitFixture,
    onCommitCabinet: handleCommitCabinet,
    onCommitFurniture: (start, end, kind) => { if (!familyWorkbench.placeFurniture(start, end, kind)) handleCommitFurniture(start, end, kind) },
    onCommitFamilyFurniture: center => { familyWorkbench.placeFurnitureAt(center) },
    onCommitMoulding: handleCommitMoulding,
    onCommitRoomSeparator: handleCommitRoomSeparator,
    onCommitSurfaceVoid: handleCommitSurfaceVoid,
    onCommitGrid: handleCommitGrid,
    onCommitGridSystem: handleCommitGridSystem,
    onCopyGrid: handleCopyGrid,
    onActivateTool: tool => { setSelectionScope(null); setActiveTool(tool) },
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
      cursorUpdatedAtRef.current = Date.now()
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
  const LocalSaveStatusIcon = localAutosaveState === 'error' ? AlertCircle : localAutosaveState === 'saving' || localAutosaveState === 'restoring' ? Loader2 : Check

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
          {teamPresence.connected && <span
            className="cf-presence-pill"
            role="status"
            aria-label={`ผู้ร่วมงานออนไลน์: ${teamPresence.users.map(user => user.user_id).join(', ')}`}
            title={`กำลังเปิดโครงการนี้: ${teamPresence.users.map(user => user.user_id).join(', ')}${teamPresence.sessions.length ? ` · กำลังเลือก: ${teamPresence.sessions.filter(session => session.selected_object_ids.length).map(session => `${session.user_id} ${session.selected_object_ids.length} ชิ้น`).join(', ') || 'ไม่มี'}` : ''} · แชร์เคอร์เซอร์และการเลือกแบบชั่วคราว · หมดอายุใน 90 วินาทีหลังปิดหรือขาดการเชื่อมต่อ`}
          ><span className="cf-presence-dot" aria-hidden="true" /><Users size={13} aria-hidden="true" /><span>{teamPresence.users.length}</span><span className="cf-presence-label">ออนไลน์</span></span>}
          {commandSyncStatus.phase !== 'idle' && <button
            type="button"
            className={`cf-command-sync-pill cf-command-sync-${commandSyncStatus.phase}`}
            aria-label={commandSyncStatus.message ?? (commandSyncStatus.phase === 'synced' ? 'ซิงก์คำสั่งแบบแล้ว' : 'สถานะซิงก์คำสั่งแบบ')}
            aria-haspopup="dialog"
            aria-expanded={isCommandOutboxOpen}
            disabled={commandSyncStatus.phase !== 'conflict' && commandSyncStatus.phase !== 'baseline-required' && commandSyncStatus.pendingCount === 0}
            onClick={() => setIsCommandOutboxOpen(true)}
            title={`${commandSyncStatus.message ?? (commandSyncStatus.phase === 'synced' ? `ซิงก์แบบแล้วถึงลำดับ ${commandSyncStatus.cursor ?? 0}` : 'กำลังเชื่อมต่อการซิงก์แบบ')}${commandSyncStatus.pendingCount ? ` · ค้าง ${commandSyncStatus.pendingCount} transaction` : ''}${commandSyncStatus.phase === 'conflict' || commandSyncStatus.phase === 'baseline-required' || commandSyncStatus.pendingCount ? ' · คลิกเพื่อตรวจคิวในเครื่อง' : ''}`}
          >{commandSyncStatus.phase === 'conflict' || commandSyncStatus.phase === 'baseline-required'
            ? <AlertTriangle size={13} aria-hidden="true" />
            : commandSyncStatus.connected ? <Cloud size={13} aria-hidden="true" /> : <CloudOff size={13} aria-hidden="true" />}
            <span>{commandSyncStatus.phase === 'synced' ? 'แบบซิงก์' : commandSyncStatus.phase === 'catching-up' ? 'กำลังตามแบบ' : commandSyncStatus.phase === 'conflict' ? 'ตรวจคิว' : commandSyncStatus.phase === 'baseline-required' ? 'เทียบเวอร์ชัน' : 'กำลังเชื่อมต่อ'}</span>
            {commandSyncStatus.pendingCount > 0 && <span>{commandSyncStatus.pendingCount}</span>}
          </button>}
        </div>

        <div className="cf-header-model-controls">
          <label className="cf-header-field">
            <span>ชั้น</span>
            <select value={project.project.active_level_id} onChange={(e) => handleSetWorkingLevel(e.target.value)} aria-label="ชั้นอาคาร">
              {project.levels.map(lvl => <option key={lvl.id} value={lvl.id}>{levelPickerLabel(lvl.name)} ({lvl.elevation_mm >= 0 ? '+' : ''}{formatLengthMm(lvl.elevation_mm, displayUnit, planCanvasPreferences.elevationPrecision)} {displayUnit})</option>)}
            </select>
          </label>
          {activeTool === 'column' && <label className="cf-header-field">
            <span>ยอดเสา</span>
            <select aria-label="ระดับยอดเสาที่กำลังวาด" value={project.levels.some(level => level.id === activeColumnTopLevelId && level.elevation_mm > (project.levels.find(item => item.id === project.project.active_level_id)?.elevation_mm ?? -Infinity)) ? activeColumnTopLevelId : nextHigherLevelId(project, project.project.active_level_id)} onChange={event => setActiveColumnTopLevelId(event.target.value)}>
              {project.levels.filter(level => level.elevation_mm > (project.levels.find(item => item.id === project.project.active_level_id)?.elevation_mm ?? -Infinity)).map(level => <option key={level.id} value={level.id}>{level.name} (+{formatLengthMm(level.elevation_mm, displayUnit, planCanvasPreferences.elevationPrecision)} {displayUnit})</option>)}
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
            <button type="button" className="cf-button cf-button-quiet" aria-label="เปิดไฟล์โครงการ" onClick={() => void handleChooseProject()} title="เปิดไฟล์โครงการ .cfproj"><FolderOpen size={16} aria-hidden="true" /><span aria-hidden="true">เปิด</span></button>
          ) : (
            <label htmlFor="cfproj-open" role="button" tabIndex={0} aria-label="เปิดไฟล์โครงการ" className="cf-button cf-button-quiet" title="เปิดไฟล์โครงการ .cfproj" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); document.getElementById('cfproj-open')?.click() } }}><FolderOpen size={16} aria-hidden="true" /><span aria-hidden="true">เปิด</span></label>
          )}
          <button type="button" className="cf-button cf-button-quiet cf-local-project-library-launcher" aria-label="คลังโครงการในอุปกรณ์" onClick={() => setIsProjectLibraryOpen(true)} title="ค้นหาและจัดการโครงการที่บันทึกในอุปกรณ์นี้"><Folder size={16} aria-hidden="true" /><span aria-hidden="true">โครงการ</span></button>
          <button type="button" className="cf-button cf-button-primary" aria-label="บันทึกโครงการ" onClick={() => void handleSaveProject()} title={activeProjectFileHandle ? 'บันทึกกลับไปยังไฟล์โครงการที่เปิดอยู่' : 'บันทึกงานในเบราว์เซอร์เครื่องนี้'}><Save size={16} aria-hidden="true" /><span aria-hidden="true">บันทึก</span></button>
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
            <span className="cf-save-status-compact" aria-hidden="true"><LocalSaveStatusIcon size={15} strokeWidth={2.25} className={localAutosaveState === 'saving' || localAutosaveState === 'restoring' ? 'cf-spin' : undefined} /></span>
          </span>
          <button type="button" className="cf-icon-button" disabled={!projectSessionRef.current!.canUndo} onClick={undo} title="ย้อนกลับ (Ctrl/⌘+Z)" aria-label="ย้อนกลับ"><Undo2 size={17} /></button>
          <button type="button" className="cf-icon-button" disabled={!projectSessionRef.current!.canRedo} onClick={redo} title="ทำซ้ำ (Ctrl/⌘+Shift+Z หรือ Ctrl/⌘+Y)" aria-label="ทำซ้ำ"><Redo2 size={17} /></button>
          <button type="button" className="cf-button cf-button-quiet" aria-label="ความเห็นบนแบบ" aria-expanded={isCommentsPanelOpen} onClick={() => { setActiveCommentId(null); setIsCommentsPanelOpen(value => !value) }} title="เปิดความเห็นและหมุดบนแบบ"><MessageSquare size={16} aria-hidden="true" /><span aria-hidden="true">ความเห็น</span>{(project.comments ?? []).filter(comment => comment.status === 'open').length > 0 && <span className="cf-comments-count">{(project.comments ?? []).filter(comment => comment.status === 'open').length}</span>}</button>
          <button type="button" className="cf-button cf-button-quiet cf-inspector-launcher" aria-expanded={inspectorOpen} aria-label={inspectorOpen ? 'ปิดแผงแก้ไข' : selectedId ? 'แก้ไขวัตถุที่เลือก' : 'เปิดแผงข้อมูล'} title={inspectorOpen ? 'ปิดแผงแก้ไข' : selectedId ? 'แก้ไขวัตถุที่เลือก' : 'เปิดแผงข้อมูล'} onClick={() => { setRightPanelTab('properties'); setInspectorOpen(value => !value) }}><PanelRightOpen size={17} aria-hidden="true" /><span aria-hidden="true">{selectedId ? 'แก้ไข' : 'ข้อมูล'}</span></button>
          <details className="cf-more-menu" onClick={(event) => {
            if ((event.target as HTMLElement).closest('button')) {
              event.currentTarget.open = false;
              if (!(event.target as HTMLElement).closest('[data-preserve-focus]')) {
                event.currentTarget.querySelector('summary')?.focus();
              }
            }
          }}>
            <summary className="cf-button cf-button-quiet" aria-label="เมนูโครงการ" title="เมนูโครงการ"><MoreHorizontal size={17} aria-hidden="true" /></summary>
            <div className="cf-more-popover">
              <div className="cf-menu-label">โครงการ</div>
              <button type="button" data-preserve-focus onClick={() => { setProjectNameDraft(project.project.name); setIsProjectNameEditing(true) }}>เปลี่ยนชื่อโครงการ</button>
              <button type="button" onClick={() => setIsVersionHistoryOpen(true)}><History size={15} /> เวอร์ชันและคืนค่าในเครื่อง</button>
              <button type="button" onClick={() => { setRightPanelTab('integrations'); setInspectorOpen(true) }}><Network size={15} /> เชื่อมต่อ CAD / BIM</button>
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
              <button type="button" disabled={teamPresence.currentRole === 'viewer'} title={teamPresence.currentRole === 'viewer' ? 'ต้องเป็น Owner หรือ Editor เพื่อสร้างลิงก์ดาวน์โหลด' : 'สร้างลิงก์ดาวน์โหลด PDF A3 แบบ snapshot'} onClick={() => setIsDrawingShareOpen(true)}><Share2 size={15} />แชร์ Vector PDF A3 ให้ลูกค้า/ทีม</button>
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
            <Toolbar orientation="vertical"
              activeTool={activeTool}
              selectionScope={selectionScope}
              onSelectScope={tool => {
                familyWorkbench.clear()
                setSupplierBundlePlacement(null)
                setSelectionScope(tool)
                setActiveTool('select')
                selectObjects([], null)
              }}
              contextOpen={toolContextOpen}
              externalPanelOpen={Boolean(canvasLibraryCategory)}
              onContextOpenChange={setToolContextOpen}
              onContextCategoryChange={category => {
                const libraryMatchesCategory = (category === 'openings' && (activeTool === 'door' || activeTool === 'window'))
                  || (category === 'shapes' && activeTool === 'furniture')
                if (!libraryMatchesCategory) setCanvasLibraryCategory(null)
              }}
              lastPlacementTool={lastPlacementTool}
              onSelectTool={tool => {
                familyWorkbench.clear()
                if (tool !== 'bundle') setSupplierBundlePlacement(null)
                setSelectionScope(null)
                setActiveTool(tool)
                setCanvasLibraryCategory(tool === 'door' || tool === 'window' || tool === 'furniture' ? tool : null)
              }}
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
              onOpenTakeoff={() => { setRightPanelTab('quantities'); setInspectorOpen(true) }}
              onOpenFieldForms={() => { setRightPanelTab('field_forms'); setInspectorOpen(true) }}
            />
        </aside>

        <aside className={`cf-tool-context-dock${toolContextOpen || (!splitViewEnabled && viewMode === 'plan' && canvasLibraryCategory) ? ' is-open' : ''}${!splitViewEnabled && viewMode === 'plan' && canvasLibraryCategory ? ' has-library' : ''}`} aria-label="ตัวเลือกเครื่องมือ" aria-hidden={!toolContextOpen && !(!splitViewEnabled && viewMode === 'plan' && canvasLibraryCategory)}>
          <header className="cf-tool-context-header">
            <div><span>ConstructFlow</span><strong>เครื่องมือ</strong></div>
            <button type="button" aria-label="ซ่อนแผงเครื่องมือ" title="ซ่อนแผงเครื่องมือ" onClick={() => setToolContextOpen(false)}>×</button>
          </header>
          <div id="cf-tool-category-content" />
          <div id="cf-tool-canvas-content" />
          {!splitViewEnabled && viewMode === 'plan' && canvasLibraryCategory && <CanvasObjectLibraryPanel
            embedded
            category={canvasLibraryCategory}
            types={project.types.filter(type => type.object_type === (canvasLibraryCategory === 'door' ? 'door_window.door' : 'door_window.window'))}
            families={familyWorkbench.families.filter(family => family.category === 'furniture')}
            activeDoorType={activeDoorType}
            activeWindowType={activeWindowType}
            activeFamilyId={familyWorkbench.activeFamily?.id}
            displayUnit={displayUnit}
            onSelectType={(category, type) => {
              familyWorkbench.clear()
              setActiveTool(category)
              if (category === 'door') setActiveDoorType(type.name)
              else setActiveWindowType(type.name)
            }}
            onSelectFamily={(family, typeId) => familyWorkbench.place(family.id, typeId, family)}
            onOpenFamilyStudio={() => familyWorkbench.show()}
            onOpenTypeCatalog={() => openCatalog()}
            onClose={() => setCanvasLibraryCategory(null)}
          />}
        </aside>

        {/* Center Canvas Area */}
        <main className="cf-canvas-shell">
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
                <button type="button" className="cf-label-all-toggle" onClick={() => {
                  const allVisible = Object.values(labelVisibility).every(Boolean)
                  setLabelVisibility({ structure: !allVisible, beams: !allVisible, walls: !allVisible, openings: !allVisible, grids: !allVisible })
                }}>{Object.values(labelVisibility).every(Boolean) ? 'ซ่อนป้ายทั้งหมด' : 'แสดงป้ายทั้งหมด'}</button>
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
            {!splitViewEnabled && viewMode === 'plan' && activeTool === 'select' && selectionDock.ids.length > 0 && <SelectionActionDock
              selectedIds={selectionDock.ids}
              arrayObjectCount={selectionDock.arrayObjectCount}
              previewActive={Boolean(alignmentPreview)}
              offsetSupported={selectionDock.offsetSupported}
              mirrorSupported={selectionDock.mirrorSupported}
              onDeselect={() => { setSelectedId(null); setSelectedIds([]) }}
              onDuplicate={() => { handleCopyObjects(selectionDock.ids); handlePasteObjects() }}
              onDelete={() => handleDeleteObjects(selectionDock.ids)}
              onPreviewArray={handlePreviewArrayObjects}
              onPreviewOffset={handlePreviewOffset}
              onPreviewMirror={handlePreviewMirror}
              onCommitPreview={handleCommitAlignment}
              onCancelPreview={() => { setAlignmentPreview(null); setFileFeedback('ยกเลิก Preview แล้ว') }}
            />}
          </div>

          <div className={`cf-tablet-authoring-dock${activeTool === 'select' ? '' : ' is-active'}`} aria-label="ตั้งค่าเครื่องมือวาด" aria-hidden={activeTool === 'select'}>
            <div id="cf-tool-tablet-canvas-content" />
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
                {selectionScope
                  ? `เลือกเฉพาะ${toolLabel(selectionScope)} · ลากครอบหรือแตะเพื่อเลือก · กด “เลือก” เพื่อกลับไปเลือกทุกชนิด`
                  : `คลิกขวา/แตะค้างวัตถุเพื่อแก้ไขหรือลบ · เมาส์กลางเลื่อนแปลน · แตะค้างพื้นที่ว่างเพื่อเลื่อน · ลูกกลิ้งซูม · ${activeTool === 'wall' || activeTool === 'beam' ? 'Space เปลี่ยนแนวอ้างอิง' : activeTool === 'door' ? 'Space กลับทิศประตู' : 'เลือกเครื่องมือเพื่อเริ่มวาด'}`}
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
          onCapturePhotoDimension={() => { setActivePhotoSession(null); setIsPhotoDimensionModalOpen(true) }}
          onImportSiteSurvey={() => document.getElementById('cf-survey-open')?.click()}
          onExportTakeoff={handleExportTakeoff}
          onExportBOQ={handleExportBOQ}
          onSelectTakeoffObjects={ids => {
            const sourceIds = ids.filter(id => !!project.objects[id])
            if (!sourceIds.length) return
            selectObjects(sourceIds, sourceIds[0] ?? null)
            setActiveTool('select')
            setRightPanelTab('properties')
            setInspectorOpen(false)
          }}
          onSaveProposal={proposal => {
            const result = dispatchCommandBatch([{ name: 'SaveProposalDraft', input: { proposal } }])
            if (result.status !== 'success') setFileFeedback(result.errors?.join(' · ') ?? 'บันทึกข้อเสนอไม่สำเร็จ')
            else setFileFeedback('บันทึกข้อเสนอแบบร่างแล้ว')
            return result.status === 'success'
          }}
          onTransitionProposal={(proposalId, targetStatus, deviceSignature?: ProposalDeviceSignatureInput, recipientSignature?: ProposalRecipientSignature, note?: string) => {
            const result = dispatchCommandBatch([{
              name: 'TransitionProposalStatus',
              input: { proposal_id: proposalId, target_status: targetStatus, ...(deviceSignature ? { device_signature: deviceSignature } : {}), ...(recipientSignature ? { recipient_signature: recipientSignature } : {}), ...(note?.trim() ? { note: note.trim() } : {}) },
            }])
            if (result.status !== 'success') setFileFeedback(result.errors?.join(' · ') ?? 'บันทึกสถานะข้อเสนอไม่สำเร็จ')
            else setFileFeedback('บันทึกสถานะข้อเสนอและประวัติรายการแล้ว')
            return result.status === 'success'
          }}
          onSaveChangeOrder={changeOrder => {
            const result = dispatchCommandBatch([{ name: 'SaveChangeOrderDraft', input: { change_order: changeOrder } }])
            if (result.status !== 'success') setFileFeedback(result.errors?.join(' · ') ?? 'บันทึก change order ไม่สำเร็จ')
            else setFileFeedback('บันทึก change order แบบร่างและ snapshot ส่วนต่างแล้ว')
            return result.status === 'success'
          }}
          onTransitionChangeOrder={(changeOrderId, targetStatus) => {
            const result = dispatchCommandBatch([{
              name: 'TransitionChangeOrderStatus',
              input: { change_order_id: changeOrderId, target_status: targetStatus },
            }])
            if (result.status !== 'success') setFileFeedback(result.errors?.join(' · ') ?? 'เปลี่ยนสถานะ change order ไม่สำเร็จ')
            else setFileFeedback('บันทึกสถานะ change order และประวัติรายการแล้ว')
            return result.status === 'success'
          }}
          onSaveInvoice={invoice => {
            const result = dispatchCommandBatch([{ name: 'SaveInvoiceDraft', input: { invoice } }])
            if (result.status !== 'success') setFileFeedback(result.errors?.join(' · ') ?? 'บันทึกใบแจ้งหนี้ไม่สำเร็จ')
            else setFileFeedback('บันทึกใบแจ้งหนี้แบบร่างและ snapshot ยอดสัญญาแล้ว')
            return result.status === 'success'
          }}
          onTransitionInvoice={(invoiceId, targetStatus: InvoiceStatusTarget) => {
            const result = dispatchCommandBatch([{ name: 'TransitionInvoiceStatus', input: { invoice_id: invoiceId, target_status: targetStatus } }])
            if (result.status !== 'success') setFileFeedback(result.errors?.join(' · ') ?? 'เปลี่ยนสถานะใบแจ้งหนี้ไม่สำเร็จ')
            else setFileFeedback(targetStatus === 'issued' ? 'ออกเอกสารใบแจ้งหนี้และบันทึกประวัติแล้ว' : 'ยกเลิกใบแจ้งหนี้แล้ว')
            return result.status === 'success'
          }}
          onRecordInvoicePayment={(invoiceId, amountThb, method: InvoicePaymentMethod, reference, note) => {
            const result = dispatchCommandBatch([{ name: 'RecordInvoicePayment', input: { invoice_id: invoiceId, amount_thb: amountThb, method, reference, note } }])
            if (result.status !== 'success') setFileFeedback(result.errors?.join(' · ') ?? 'บันทึกรับชำระไม่สำเร็จ')
            else setFileFeedback('บันทึกรับชำระในรายการใบแจ้งหนี้แล้ว')
            return result.status === 'success'
          }}
          onSaveTakeoffRates={rates => {
            const result = dispatchCommandBatch([{ name: 'UpdateTakeoffRates', input: { rates } }])
            if (result.status !== 'success') setFileFeedback(result.errors?.join(' · ') ?? 'บันทึกราคาไม่สำเร็จ')
            else setFileFeedback('บันทึกราคา Library ของโครงการแล้ว')
            return result.status === 'success'
          }}
          onBeginBundlePlacement={placement => {
            setSupplierBundlePlacement(placement)
            setActiveTool('bundle')
            setInspectorOpen(false)
            const drawAs = placement.bundle.visual_type ?? 'shape'
            setFileFeedback(drawAs === 'shape' ? `วาง ${placement.bundle.name}: แตะตำแหน่งบนแปลน` : drawAs === 'length' ? `วาง ${placement.bundle.name}: แตะจุดเริ่มและจุดปลาย` : `วาง ${placement.bundle.name}: แตะมุมพื้นที่แล้วปิดรูปที่จุดเริ่ม`)
          }}
          onExecute={dispatchCommandBatch}
          integrations={{
            project,
            onExportProject: handleDownloadProjectCopy,
            onExportDxf: handleExportDxf,
            onExportIfc: handleExportIfc,
            onConfigureCollaboration: () => setIsVersionHistoryOpen(true),
            onExecute: dispatchCommandBatch,
          }}
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
      {pdfUnderlayFile && <Suspense fallback={<div role="status" className="cf-modal-loading">กำลังเปิดตัวเลือกหน้า PDF…</div>}><PdfPagePicker
        file={pdfUnderlayFile}
        scaleCalibrations={pdfUnderlayCalibrations}
        alignments={pdfUnderlayAlignments}
        levels={project.levels.map(level => ({ id: level.id, name: levelPickerLabel(level.name) }))}
        activeLevelId={project.project.active_level_id}
        requireScaleCalibration
        confirmBusy={pdfUnderlayBusy}
        onClose={() => { setPdfUnderlayBusy(false); setPdfUnderlayFile(null); setPdfUnderlayCalibrations([]); setPdfUnderlayAlignments([]) }}
        onUpdate={(pages, calibrations, alignments) => { setPdfUnderlayCalibrations(calibrations); setPdfUnderlayAlignments(alignments ?? []) }}
        onConfirm={(pages, calibrations, alignments) => {
          setPdfUnderlayBusy(true)
          void handleImportPdfUnderlay(pdfUnderlayFile, pages, calibrations, alignments).then(imported => {
            if (imported) { setPdfUnderlayFile(null); setPdfUnderlayCalibrations([]); setPdfUnderlayAlignments([]) }
          }).finally(() => setPdfUnderlayBusy(false))
        }}
      /></Suspense>}
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

      {isProjectLibraryOpen && <Suspense fallback={<div role="status" className="cf-modal-loading">กำลังเปิดคลังโครงการ…</div>}><LocalProjectLibraryModal isOpen currentProjectId={project.project.id} onClose={() => setIsProjectLibraryOpen(false)} onOpenProject={projectId => { void handleOpenLocalProject(projectId) }} /></Suspense>}
      {isSettingsOpen && <Suspense fallback={<div role="status" className="cf-modal-loading">กำลังเปิดการตั้งค่า…</div>}><SettingsModal project={project} displayUnit={displayUnit} preferences={planCanvasPreferences} onPreferencesChange={setPlanCanvasPreferences} onClose={()=>setIsSettingsOpen(false)} onExecute={dispatchCommandBatch} inspectorOpen={inspectorOpen} onInspectorChange={setInspectorOpen}/></Suspense>}
      {isCommandOutboxOpen && <Suspense fallback={<div role="status" className="cf-modal-loading">กำลังเปิดคิวซิงก์…</div>}><ProjectCommandOutboxModal
        project={project}
        projectId={project.project.id}
        syncMessage={commandSyncStatus.message}
        onClose={() => setIsCommandOutboxOpen(false)}
        onOpenVersionHistory={() => { setIsCommandOutboxOpen(false); setIsVersionHistoryOpen(true) }}
      /></Suspense>}
      {isVersionHistoryOpen && <Suspense fallback={<div role="status" className="cf-modal-loading">กำลังเปิดประวัติเวอร์ชัน…</div>}><ProjectVersionHistoryModal project={project} onClose={() => setIsVersionHistoryOpen(false)} onRestore={async (revisionId, restoredProject) => {
        try {
          const { createLocalProjectRevision } = await import('./projectAutosave.js')
          const currentProject = projectSessionRef.current!.project
          await createLocalProjectRevision(currentProject, `ก่อนคืนเวอร์ชัน · ${new Date().toLocaleString('th-TH')}`)
          let historyDelta: ReturnType<typeof buildProjectHistoryDeltaInput> | null = null
          let localOnlyReason = ''
          try { historyDelta = buildProjectHistoryDeltaInput(currentProject, restoredProject) }
          catch (error) { localOnlyReason = error instanceof Error ? error.message : String(error) }
          const result = historyDelta
            ? dispatchCommandBatch([{ name: 'ApplyProjectHistoryDelta', input: historyDelta as unknown as Record<string, unknown> }])
            : dispatchCommandBatch([{ name: 'RestoreProjectRevision', input: { revision_id: revisionId, project: restoredProject } }])
          if (result.status !== 'success') {
            setFileFeedback(result.errors?.join(' · ') ?? 'คืนเวอร์ชันไม่สำเร็จ')
            return false
          }
          setCommandQueue([])
          if (!historyDelta) recordHistoryTravel()
          setSelectedId(null)
          setSelectedIds([])
          setActiveTool('select')
          setViewMode('plan')
          setFileFeedback(historyDelta
            ? 'คืนเวอร์ชันแล้ว · บันทึกการคืนค่าเป็น delta ในประวัติทีม และ Undo กลับได้'
            : `คืนเวอร์ชันในเครื่องแล้ว · Undo กลับไปแบบก่อนคืนค่าได้ · live sync หยุดเพื่อเทียบ revision (${localOnlyReason || 'ไม่สามารถสร้าง delta ได้'})`)
          return true
        } catch (error) {
          setFileFeedback(error instanceof Error ? error.message : String(error))
          return false
        }
      }} /></Suspense>}
      {isDrawingShareOpen && <Suspense fallback={<div role="status" className="cf-modal-loading">กำลังเปิดแชร์ชุดแบบ…</div>}><ProjectDrawingDownloadLinkModal project={project} onClose={() => setIsDrawingShareOpen(false)} /></Suspense>}
      {isCommentsPanelOpen && <Suspense fallback={<div role="status" className="cf-modal-loading">กำลังเปิดความเห็น…</div>}><ProjectCommentsPanel
        project={project}
        activeLevelId={project.project.active_level_id}
        selectedObjectId={selectedId}
        cursorMm={cursorCoords_mm}
        author={teamPresence.currentUser ?? 'สมาชิกทีม'}
        selectedCommentId={activeCommentId}
        syncStatus={commentSyncStatus}
        readOnly={teamPresence.currentRole === 'viewer' || (commentSyncStatus.connected && !commentSyncStatus.canWrite)}
        onExecute={dispatchCommandBatch}
        onClose={() => { setIsCommentsPanelOpen(false); setActiveCommentId(null) }}
        onJumpTo={comment => {
          setActiveTool('select')
          setViewMode('plan')
          if (comment.level_id !== project.project.active_level_id) handleSetWorkingLevel(comment.level_id)
          setPlanNavigationViewport({ center_mm: comment.point_mm, zoom: Math.max(0.04, planNavigationViewport?.zoom ?? 0.08) })
        }}
      /></Suspense>}
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
            return { ...prev, legal_metadata: legal }
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
