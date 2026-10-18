import React from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
import { ElevationCanvas } from './ElevationCanvas.js'
import type { CoordinatedElevationNavigation, ElevationDirection } from './ElevationCanvas.js'
import type { PlanCanvasProps } from './PlanCanvas.types.js'
import type { EditorViewMode } from '../app/useMultiViewPreferences.js'
import type { CoordinatedPlanViewport } from '../viewport/viewportTransform.js'
import { buildElevationManipulationCommands } from '../elevationManipulationCommands.js'

interface ElevationViewRendererProps {
  mode: Extract<EditorViewMode, ElevationDirection>
  project: ProjectDocument
  selectedId: string | null
  selectedIds: string[]
  onSelectObject: PlanCanvasProps['onSelectObject']
  onSelectionChange: NonNullable<PlanCanvasProps['onSelectionChange']>
  underlay: PlanCanvasProps['underlay']
  coordination: PlanCanvasProps['coordination']
  navigation: CoordinatedElevationNavigation
  onNavigationChange: (navigation: CoordinatedElevationNavigation) => void
  planNavigationViewport: CoordinatedPlanViewport | null
  onPlanNavigationViewportChange: (viewport: CoordinatedPlanViewport) => void
  planAndRcpNavigationLinked: boolean
  onMoveElevationObject: (objectId: string, deltaWorldMm: [number, number], deltaZMm: number, verticalIntent: 'move' | 'top' | 'base') => void
  previewManipulation: PlanCanvasProps['onPreviewManipulation']
  commitManipulation: PlanCanvasProps['onCommitManipulation']
  onManipulationRejected?: PlanCanvasProps['onManipulationRejected']
}

/** Loaded only when an elevation or reflected ceiling plan is opened. */
export const ElevationViewRenderer: React.FC<ElevationViewRendererProps> = ({
  mode, project, selectedId, selectedIds, onSelectObject, onSelectionChange, underlay, coordination,
  navigation, onNavigationChange, planNavigationViewport, onPlanNavigationViewportChange, planAndRcpNavigationLinked,
  onMoveElevationObject,
  previewManipulation, commitManipulation, onManipulationRejected,
}) => (
  <ElevationCanvas project={project} direction={mode} selectedId={selectedId} selectedIds={selectedIds}
    onSelectObject={onSelectObject} onSelectionChange={onSelectionChange} underlay={underlay}
    coordination={coordination} navigation={navigation} onNavigationChange={onNavigationChange}
    planNavigation={mode === 'rcp' && planAndRcpNavigationLinked ? planNavigationViewport : null}
    onPlanNavigationChange={mode === 'rcp' && planAndRcpNavigationLinked ? onPlanNavigationViewportChange : undefined}
    onMoveObject={mode === 'rcp' ? undefined : onMoveElevationObject}
    onBuildManipulation={mode === 'rcp' ? undefined : (objectId, deltaWorldMm, deltaZMm, verticalIntent, gripIndex) =>
      buildElevationManipulationCommands(project, mode, objectId, deltaWorldMm, deltaZMm, verticalIntent, gripIndex)}
    onPreviewManipulation={previewManipulation} onCommitManipulation={commitManipulation}
    onManipulationRejected={onManipulationRejected} />
)
