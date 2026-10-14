import React, { useState, useEffect, useRef, useMemo, useSyncExternalStore, lazy, Suspense } from 'react'
import {
  ProjectDocument,
  createDefaultResidentialProjectDocument,
  deserializeProject,
  serializeProject,
  Phase,
  RemovalPhase,
  isGridObject,
  isColumnObject,
  isWallObject,
  isDoorObject,
  isWindowObject,
  PlacementReference,
  formatLengthMm,
  type DisplayLengthUnit,
  type ProjectViewTemplate,
} from '@constructflow/project-model'
import { CommandEnvelope, CommandRequest } from '@constructflow/command-schema'
import { useProjectSession } from './app/useProjectSession.js'
import { useEditorObjectSelection } from './app/useEditorObjectSelection.js'
import { useToolSession } from './app/useToolSession.js'
import { DEFAULT_PLAN_CANVAS_PREFERENCES, type PlanCanvasPreferences } from './app/planCanvasPreferences.mjs'
import { CommandBus, ProjectCommandSession } from './commands/CommandBus.js'
import { Toolbar, ToolType } from './components/Toolbar.js'
import type { PlanCanvasProps } from './components/PlanCanvas.types.js'
import type { CoordinatedElevationNavigation } from './components/ElevationCanvas.js'
import { EditorViewRenderer } from './components/EditorViewRenderer.js'
import { EditorInspector } from './components/EditorInspector.js'
import { SettingsModal } from './components/SettingsModal.js'
import { TypeManagerModal } from './components/TypeManagerModal.js'
import { UnderlayCalibrationModal } from './components/UnderlayCalibrationModal.js'
import { ProjectLegalModal } from './components/ProjectLegalModal.js'
import { useCoordinationReport } from './features/coordination/useCoordinationReport.js'
import type { ProjectLegalMetadata } from '@constructflow/project-model'
import { PlanLabelVisibility, DEFAULT_PLAN_LABEL_VISIBILITY } from './rendering/planRenderer.js'
import { Building2, Layers, History, Layers2, Ruler, ArrowUpDown, Sparkles, Undo2, Redo2, FolderOpen, Save, Download, CookingPot, FileCheck, MoreHorizontal, Tag, ChevronDown, Home } from 'lucide-react'
import { calculateTakeoff, calculatePhasedBOQ } from '@constructflow/takeoff-engine'
import { usePlanTransformCommands } from './app/usePlanTransformCommands.js'
import { usePlanPlacementCommands } from './app/usePlanPlacementCommands.js'
import { usePropertiesPanelActions } from './app/usePropertiesPanelActions.js'
import { usePlanAuthoringCommands } from './app/usePlanAuthoringCommands.js'
import { useGridAuthoringCommands } from './app/useGridAuthoringCommands.js'
import { useProjectBrowserCommands } from './app/useProjectBrowserCommands.js'
import { useTypeCatalogSession } from './app/useTypeCatalogSession.js'
import { useProjectContextCommands } from './app/useProjectContextCommands.js'
import { useLocalProjectPersistence } from './app/useLocalProjectPersistence.js'
import { useProjectFileActions, type ProjectFileAccess } from './app/useProjectFileActions.js'
import type { CoordinatedPlanViewport } from './viewport/viewportTransform.js'
import { useReferenceDataImportActions } from './app/useReferenceDataImportActions.js'
import { useWorkbenchKeyboardShortcuts } from './app/useWorkbenchKeyboardShortcuts.js'
import { useMultiViewPreferences, type EditorViewMode, type SplitViewLayout, type SplitViewPaneCount } from './app/useMultiViewPreferences.js'
import { buildMultiViewGridTracks, buildPrimaryPaneGridStyle } from './app/multiViewLayout.mjs'
import { usePlanUnderlaySession } from './app/usePlanUnderlaySession.js'

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

export const App: React.FC<AppProps> = ({ projectFileAccess }) => {
  const {
    project,
    setProjectState,
    setProject,
    commandQueue,
    setCommandQueue,
    sessionRef: projectSessionRef,
    dispatchCommandBatch,
    previewCommands: previewDirectManipulation,
  } = useProjectSession(() => createDefaultResidentialProjectDocument('CF-UNTITLED', 'Untitled Project'))
  const { selectedId, selectedIds, setSelectedId, setSelectedIds, selectObjects } = useEditorObjectSelection()
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
  const [planCanvasPreferences, setPlanCanvasPreferences] = useState<PlanCanvasPreferences>(DEFAULT_PLAN_CANVAS_PREFERENCES)
  const [planNavigationViewport, setPlanNavigationViewport] = useState<CoordinatedPlanViewport | null>(null)
  const [elevationNavigation, setElevationNavigation] = useState<CoordinatedElevationNavigation>({ zoom: 1, panY: 0, panXNorthSouth: 0, panXEastWest: 0 })
  const [viewMode, setViewMode] = useState<EditorViewMode>('plan')
  const [multiViewPreferences, setMultiViewPreferences] = useMultiViewPreferences(project.project.id)
  const { enabled: splitViewEnabled, paneCount: splitViewPaneCount, layout: splitViewLayout,
    primaryPanePercent, secondaryViewMode, tertiaryViewMode, fourthViewMode } = multiViewPreferences
  const splitViewTracks = buildMultiViewGridTracks(splitViewPaneCount, splitViewLayout, primaryPanePercent)
  const splitViewGridStyle = splitViewEnabled ? {
    display: 'grid',
    gridTemplateColumns: splitViewTracks.columns,
    gridTemplateRows: splitViewTracks.rows,
    gap: 1,
    background: '#cbd5e1',
  } : undefined
  const primaryPaneGridStyle = buildPrimaryPaneGridStyle(splitViewPaneCount, splitViewLayout)
  // Drawing a structural member opens the matching plan so the new object is visible.
  useEffect(() => {
    if (['beam', 'foundation'].includes(activeTool)) setViewMode('framing')
    else if (activeTool === 'roof') setViewMode('roofplan')
    else if (['stair', 'wall', 'door', 'window', 'archFloor', 'slab', 'ceiling', 'roomSeparator', 'pipe', 'fixture', 'cabinet', 'moulding'].includes(activeTool)) setViewMode('plan')
  }, [activeTool])
  const paneModes = splitViewEnabled
    ? [viewMode, secondaryViewMode, ...(splitViewPaneCount >= 3 ? [tertiaryViewMode] : []), ...(splitViewPaneCount >= 4 ? [fourthViewMode] : [])]
    : []
  const planAnd3DNavigationLinked = paneModes.some(mode => mode === 'plan' || mode === 'framing' || mode === 'roofplan')
    && paneModes.includes('model3d')
  const planAndRcpNavigationLinked = paneModes.some(mode => mode === 'plan' || mode === 'framing' || mode === 'roofplan')
    && paneModes.includes('rcp')
  const [labelMode, setLabelMode] = useState<'name' | 'name-size'>('name-size')
  const [labelVisibility, setLabelVisibility] = useState<PlanLabelVisibility>(DEFAULT_PLAN_LABEL_VISIBILITY)
  const [rightPanelTab, setRightPanelTab] = useState<'properties' | 'quantities' | 'objects' | 'coordination' | 'ai' | 'extensions'>('properties')
  const moduleRegistryRevision = useSyncExternalStore(
    listener => CommandBus.subscribeToModules(listener),
    () => CommandBus.getModuleRegistryRevision(),
    () => 0,
  )
  const moduleUIContributions = useMemo(() => CommandBus.getModuleUIContributions(), [moduleRegistryRevision])
  const moduleCommandDescriptors = useMemo(() => CommandBus.getModuleCommandDescriptors(), [moduleRegistryRevision])
  const coordination = useCoordinationReport(project, true)
  const coordinationFindings = coordination.report?.findings ?? []
  const [isSettingsOpen,setIsSettingsOpen] = useState(false)
  const [inspectorOpen,setInspectorOpen] = useState(() => window.innerWidth > 900)
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
    runArchitectureCommand,
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
    handleCommitPipeRoute, handleCommitFixture, handleCommitCabinet, handleCommitMoulding,
    handleCommitArchitecturalFloor, handleCommitCeiling, handleCommitRoomSeparator, handleDetectRooms,
    handleCreateRoomFinish, handleCommitSurfaceVoid, handleCommitDoor, handleCommitWindow,
    handleCommitStair, handleFlipDoorHanding,
  } = usePlanAuthoringCommands({
    project, activeDoorType, activeWindowType, dispatchCommandBatch, setSelectedId, setSelectedIds, setFileFeedback,
  })
  const { handleCommitGrid, handleCopyGrid, handleCommitGridSystem } = useGridAuthoringCommands({
    project, dispatchCommandBatch, setFileFeedback,
  })
  const { handleUploadUnderlayImage, handleImportSiteSurvey } = useReferenceDataImportActions({
    underlayKey, hydratedUnderlayRef, setUnderlay, setFileFeedback, dispatchCommandBatch,
  })
  const handleClearUnderlay = underlaySession.clearUnderlay
  const handleApplyCalibrationScale = (newScale: number, _realDistance_mm: number, axis: 'x' | 'y') => underlaySession.applyCalibrationScale(newScale, axis)

  // Apply 1-Click Extension Preset (atomic batch of SmartObjects)
  const handleApplyExtensionPreset = (updatedProject: ProjectDocument, envelopes: CommandEnvelope[]) => {
    setProject(updatedProject)
    setCommandQueue((q) => [...q, ...envelopes])
  }

  const handleMoveElevationObject = (objectId: string, deltaWorldMm: [number,number], deltaZMm: number, verticalIntent: 'move'|'top'|'base') => {
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

  const handleExportDrawingSet = async () => {
    try {
      const { renderPermitDrawingSetHtml } = await import('@constructflow/sheet-engine')
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
    } catch (error) {
      setFileFeedback(`ส่งออกชุดแบบไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleStartKitchenProof = async () => {
    if (!confirmReplaceUnsavedProject()) return
    try {
      const { createKitchenProofProject } = await import('@constructflow/extension-engine')
      const generated = createKitchenProofProject()
      if (generated.status !== 'success') {
        window.alert(`สร้างโมเดลครัวพิสูจน์ไม่สำเร็จ: ${generated.errors?.join('; ') ?? 'unknown error'}`)
        return
      }
      projectSessionRef.current!.reset(generated.updatedProject)
      updateActiveProjectFileHandle(null)
      setProjectState(generated.updatedProject)
      setSavedProjectJson(null)
      setReplacementBaselineJson(serializeProject(generated.updatedProject))
      setFileFeedback('สร้างโมเดลครัวพิสูจน์แล้ว')
      setSelectedId(null)
      setCommandQueue(generated.emittedEnvelopes)
      setViewMode('plan')
    } catch (error) {
      window.alert(`โหลดโครงการตัวอย่างครัวไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleExportDxf = async () => {
    try {
      const { exportProjectToDxf } = await import('@constructflow/cad-adapter')
      const result = exportProjectToDxf(project, { projectName: project.project.name, architectName: project.legal_metadata?.signatories?.architect_name, engineerLicense: project.legal_metadata?.signatories?.structural_engineer_license_no })
      const url = URL.createObjectURL(new Blob([result.dxfContent], { type: 'application/dxf' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${project.project.id || 'ConstructFlow'}_20Layouts.dxf`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setFileFeedback('ส่งออก DXF 20 แผ่นแล้ว')
    } catch (error) {
      setFileFeedback(`ส่งออก DXF ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleExportIfc = async () => {
    try {
      const { exportProjectToIfc } = await import('@constructflow/bim-adapter')
      const result = exportProjectToIfc(project, { projectName: project.project.name, authorName: project.legal_metadata?.signatories?.architect_name })
      const url = URL.createObjectURL(new Blob([result.ifcContent], { type: 'application/x-step' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${project.project.id || 'ConstructFlow'}.ifc`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setFileFeedback('ส่งออก IFC 4.3 แล้ว')
    } catch (error) {
      setFileFeedback(`ส่งออก IFC ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleStartHouseDemo = async () => {
    if (!confirmReplaceUnsavedProject()) return
    try {
      const { loadHouseDemoRaw } = await import('./app/houseDemo.js')
      const houseDemoRaw = loadHouseDemoRaw()
      const restored = deserializeProject(houseDemoRaw)
      projectSessionRef.current!.reset(restored)
      updateActiveProjectFileHandle(null)
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

  const handleNewBlankProject = () => {
    if (!confirmReplaceUnsavedProject()) return
    if (!window.confirm('สร้างโครงการใหม่แบบว่างหรือไม่? งานที่เปิดอยู่จะถูกแทนที่ด้วยโครงการค่าเริ่มต้น')) return
    const blank = createDefaultResidentialProjectDocument(`CF-${crypto.randomUUID()}`, 'โครงการใหม่')
    const serialized = serializeProject(blank)
    projectSessionRef.current!.reset(blank)
    updateActiveProjectFileHandle(null)
    setProjectState(blank)
    setSavedProjectJson(null)
    setReplacementBaselineJson(serialized)
    setFileFeedback('สร้างโครงการใหม่แบบว่างแล้ว')
    setSelectedId(null)
    setSelectedIds([])
    setCommandQueue([])
    setActiveTool('select')
    setViewMode('plan')
  }

  // Counts & Schedule breakdown
  const takeoff = useMemo(() => calculateTakeoff(project), [project])
  const boq = useMemo(() => calculatePhasedBOQ(project), [project])

  const planCanvasProps: Omit<PlanCanvasProps, 'planDiscipline'> = {
    project: viewProject,
    navigationViewport: planNavigationViewport,
    onNavigationViewportChange: setPlanNavigationViewport,
    preferences: planCanvasPreferences,
    onPreferencesChange: setPlanCanvasPreferences,
    displayUnit,
    activeTool,
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
    onCommitDoor: handleCommitDoor,
    onCommitWindow: handleCommitWindow,
    onCommitSlab: handleCommitSlab,
    onCommitArchitecturalFloor: handleCommitArchitecturalFloor,
    onCommitCeiling: handleCommitCeiling,
    onCommitRoof: handleCommitRoof,
    onCommitPipeRoute: handleCommitPipeRoute,
    onCommitFixture: handleCommitFixture,
    onCommitCabinet: handleCommitCabinet,
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
              {project.levels.map(lvl => <option key={lvl.id} value={lvl.id}>{lvl.name} ({lvl.elevation_mm >= 0 ? '+' : ''}{formatLengthMm(lvl.elevation_mm, displayUnit)} {displayUnit})</option>)}
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
            <Toolbar orientation="vertical"
              activeTool={activeTool}
              lastPlacementTool={lastPlacementTool}
              onSelectTool={setActiveTool}
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
              ['plan', 'แปลนพื้น'], ['framing', 'แปลนคาน'], ['roofplan', 'แปลนหลังคา'], ['north', 'รูปด้านเหนือ'], ['south', 'รูปด้านใต้'],
              ['east', 'รูปด้านตะวันออก'], ['west', 'รูปด้านตะวันตก'], ['rcp', 'แปลนฝ้า RCP'], ['model3d', '3D ดูตัวอย่าง'],
            ] as const).map(([mode, label]) => (
              <button key={mode} type="button" title={['plan', 'framing', 'roofplan'].includes(mode) ? 'แปลนพื้น แปลนคาน และแปลนหลังคาใช้ตำแหน่งและระดับซูมร่วมกัน' : ['north', 'south', 'east', 'west'].includes(mode) ? 'รูปด้านใช้ระดับซูมและตำแหน่งแนวดิ่งร่วมกัน; แนวนอนเชื่อมตามแกนฉาย' : undefined} onClick={() => setViewMode(mode)} className={viewMode === mode ? 'is-active' : ''}>{label}</button>
            ))}
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
                  </select>
                </label>}
                {splitViewEnabled && <label>สัดส่วน pane หลัก · {primaryPanePercent}%
                  <input aria-label="สัดส่วน pane หลัก" type="range" min={30} max={70} step={5} value={primaryPanePercent}
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
                {splitViewEnabled && paneModes.includes('model3d') && <span>3D จัดกรอบตามวัตถุที่เลือก · เมื่อต่อกับแปลน การเลื่อนและซูมจะประสานกันสองทาง</span>}
              </div>
            </details>
            {viewMode === 'plan' && <button type="button" onClick={handleDetectRooms} title="ค้นหาห้องจากวงผนังปิด">ตรวจจับห้อง</button>}
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

          {/* Interactive Plan Canvas */}
          <div className="cf-viewport-stage" style={splitViewGridStyle}>
            <div className="cf-multiview-pane" data-primary-selected-object-id={selectedId ?? ''} data-selected-object-ids={selectedIds.join(',')} style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden', position: 'relative', ...primaryPaneGridStyle }}>
              {renderEditorView(viewMode)}
            </div>
            {splitViewEnabled && <div className="cf-multiview-pane" data-testid="secondary-view-pane" data-primary-selected-object-id={selectedId ?? ''} data-selected-object-ids={selectedIds.join(',')} style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden', position: 'relative', borderLeft: '1px solid #cbd5e1' }}>
              {renderEditorView(secondaryViewMode, true)}
            </div>}
            {splitViewEnabled && splitViewPaneCount >= 3 && <div className="cf-multiview-pane" data-testid="tertiary-view-pane" data-primary-selected-object-id={selectedId ?? ''} data-selected-object-ids={selectedIds.join(',')} style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden', position: 'relative', borderLeft: '1px solid #cbd5e1' }}>
              {renderEditorView(tertiaryViewMode, true)}
            </div>}
            {splitViewEnabled && splitViewPaneCount === 4 && <div className="cf-multiview-pane" data-testid="fourth-view-pane" data-primary-selected-object-id={selectedId ?? ''} data-selected-object-ids={selectedIds.join(',')} style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden', position: 'relative', borderLeft: '1px solid #cbd5e1' }}>
              {renderEditorView(fourthViewMode, true)}
            </div>}
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

        {inspectorOpen && <EditorInspector
          activeTab={rightPanelTab}
          onActiveTabChange={setRightPanelTab}
          selectedId={selectedId}
          selectedIds={selectedIds}
          properties={{
            project, displayUnit, selectedId, selectedIds, ...propertiesActions,
            onDeleteObjects: handleDeleteObjects,
            onFlipDoorHanding: handleFlipDoorHanding,
            onOpenTypeManager: () => openCatalog(true, true),
            onAddFoundation: colId => handleCommitFoundation({ columnId: colId }),
            onDeleteObject: handleDeleteObject,
            onDrawSurfaceVoid: surfaceId => {
              setSelectedId(surfaceId)
              setViewMode(project.objects[surfaceId]?.object_type === 'roof.system' ? 'roofplan' : 'plan')
              setActiveTool('slabVoid')
            },
            onCreateRoomFinish: handleCreateRoomFinish,
          }}
          takeoff={takeoff}
          boq={boq}
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
            onPreview: commands => previewDirectManipulation(commands, 'ai'),
            onExecute: (commands, actor) => dispatchCommandBatch(commands, actor),
          }}
          extensions={{
            contributions: moduleUIContributions,
            commandDescriptors: moduleCommandDescriptors,
            onExecute: command => dispatchCommandBatch([command]),
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
        />}
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
      <Suspense fallback={null}><ExtensionPresetsModal
        isOpen={isPresetsModalOpen}
        onClose={() => setIsPresetsModalOpen(false)}
        project={project}
        onApplyPreset={handleApplyExtensionPreset}
      /></Suspense>

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
