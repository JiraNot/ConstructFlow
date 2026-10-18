import React, { lazy, Suspense } from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
import { PlanCanvas } from './PlanCanvas.js'
import type { PlanCanvasProps } from './PlanCanvas.types.js'
import type { CoordinatedElevationNavigation } from './ElevationCanvas.js'
import type { EditorViewMode } from '../app/useMultiViewPreferences.js'
import type { CoordinatedPlanViewport } from '../viewport/viewportTransform.js'
import { buildElevationManipulationCommands } from '../elevationManipulationCommands.js'

const Model3DViewport = lazy(() => import('./Model3DViewport.js').then(module => ({ default: module.Model3DViewport })))
const ElevationCanvas = lazy(() => import('./ElevationCanvas.js').then(module => ({ default: module.ElevationCanvas })))

interface EditorViewRendererProps {
  mode: EditorViewMode
  auxiliary?: boolean
  planCanvasProps: Omit<PlanCanvasProps, 'planDiscipline'>
  activeTool: PlanCanvasProps['activeTool']
  toolActivation?: number
  project: ProjectDocument
  selectedId: string | null
  selectedIds: string[]
  onSelectObject: PlanCanvasProps['onSelectObject']
  onSelectionChange: NonNullable<PlanCanvasProps['onSelectionChange']>
  splitViewEnabled: boolean
  planNavigationViewport: CoordinatedPlanViewport | null
  onPlanNavigationViewportChange: (viewport: CoordinatedPlanViewport) => void
  elevationNavigation: CoordinatedElevationNavigation
  onElevationNavigationChange: (navigation: CoordinatedElevationNavigation) => void
  planAnd3DNavigationLinked: boolean
  planAndRcpNavigationLinked: boolean
  underlay: PlanCanvasProps['underlay']
  coordination: PlanCanvasProps['coordination']
  onMoveElevationObject: (objectId: string, deltaWorldMm: [number, number], deltaZMm: number, verticalIntent: 'move' | 'top' | 'base') => void
  previewManipulation: PlanCanvasProps['onPreviewManipulation']
  commitManipulation: PlanCanvasProps['onCommitManipulation']
  onManipulationRejected?: PlanCanvasProps['onManipulationRejected']
}

/** Renders one coordinated plan, elevation, or 3D pane from shared editor state. */
export const EditorViewRenderer: React.FC<EditorViewRendererProps> = ({
  mode, auxiliary = false, planCanvasProps, activeTool, toolActivation, project, selectedId, selectedIds,
  onSelectObject, onSelectionChange, splitViewEnabled, planNavigationViewport, onPlanNavigationViewportChange,
  elevationNavigation, onElevationNavigationChange, planAnd3DNavigationLinked, planAndRcpNavigationLinked,
  underlay, coordination, onMoveElevationObject,
  previewManipulation, commitManipulation, onManipulationRejected,
}) => {
  if (mode === 'plan' || mode === 'framing' || mode === 'roofplan') return (
    <PlanCanvas key={mode} {...planCanvasProps}
      activeTool={auxiliary ? 'select' : activeTool}
      toolActivation={auxiliary ? undefined : toolActivation}
      planDiscipline={mode === 'framing' ? 'framing' : mode === 'roofplan' ? 'roof' : 'architecture'} />
  )

  if (mode === 'model3d') return (
    <Suspense fallback={<div style={{ padding: 24, color: '#94a3b8' }}>3D renderer is loading…</div>}>
      <Model3DViewport project={project} onSelectObject={id => onSelectionChange(id ? [id] : [], id)}
        selectedId={selectedId} selectedIds={selectedIds} autoFrameSelection={splitViewEnabled}
        planNavigation={planAnd3DNavigationLinked ? planNavigationViewport : null}
        onPlanNavigationChange={planAnd3DNavigationLinked ? onPlanNavigationViewportChange : undefined}
        coordination={coordination} />
    </Suspense>
  )

  return <Suspense fallback={<div role="status" style={{ padding: 24, color: '#64748b' }}>กำลังเปิดรูปด้าน…</div>}>
    <ElevationCanvas project={project} direction={mode} selectedId={selectedId} selectedIds={selectedIds}
      onSelectObject={onSelectObject} onSelectionChange={onSelectionChange} underlay={underlay}
      coordination={coordination} navigation={elevationNavigation} onNavigationChange={onElevationNavigationChange}
      planNavigation={mode === 'rcp' && planAndRcpNavigationLinked ? planNavigationViewport : null}
      onPlanNavigationChange={mode === 'rcp' && planAndRcpNavigationLinked ? onPlanNavigationViewportChange : undefined}
      onMoveObject={mode === 'rcp' ? undefined : onMoveElevationObject}
      onBuildManipulation={mode === 'rcp' ? undefined : (objectId, deltaWorldMm, deltaZMm, verticalIntent, gripIndex) =>
        buildElevationManipulationCommands(project, mode, objectId, deltaWorldMm, deltaZMm, verticalIntent, gripIndex)}
      onPreviewManipulation={previewManipulation} onCommitManipulation={commitManipulation}
      onManipulationRejected={onManipulationRejected} />
  </Suspense>
}
