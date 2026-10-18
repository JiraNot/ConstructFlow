import type { ProjectDocument } from '@constructflow/project-model'
import type { PropertiesPanelProps } from '../components/PropertiesPanel.types.js'
import type { useProjectSession } from './useProjectSession.js'
type ProjectSession = ReturnType<typeof useProjectSession>
type PanelActions = Pick<PropertiesPanelProps,
  | 'onAssignType' | 'onAssignTypeMany' | 'onUpdatePhase' | 'onUpdateSourceReferences' | 'onUpdateRemovalPhase'
  | 'onUpdateLevelMany' | 'onUpdateColumnMark' | 'onUpdateColumnVerticalReference' | 'onUpdateBeamVerticalReference'
  | 'onUpdateArchitectureSurface' | 'onUpdateSlab' | 'onUpdateRoof' | 'onUpdateRainwaterDesign' | 'onUpdatePipeRoute'
  | 'onUpdateElectricalFixture' | 'onAssignElectricalFixtureToCircuit' | 'onApplyElectricalPhaseBalance' | 'onUpdateCabinet'
  | 'onUpdateInteriorFurniture' | 'onUpdateMoulding' | 'onUpdateStair' | 'onUpdateFoundationMark' | 'onUpdateGridTag'
  | 'onModifyGrid' | 'onUpdateGridSystem' | 'onUpdateWallFace' | 'onDefineWallFinish' | 'onUpdateWallFinish'
  | 'onUpdateOpeningVertical' | 'onRehostOpening' | 'onUpdateOpeningInstanceParameters'
>

interface UsePropertiesPanelActionsOptions {
  project: ProjectDocument
  dispatchCommandBatch: ProjectSession['dispatchCommandBatch']
  setFileFeedback: (message: string) => void
  setSelectedId: (id: string | null) => void
  setSelectedIds: (ids: string[]) => void
}

const panelActionNames: (keyof PanelActions)[] = [
  'onAssignType','onAssignTypeMany','onUpdatePhase','onUpdateSourceReferences','onUpdateRemovalPhase','onUpdateLevelMany',
  'onUpdateColumnMark','onUpdateColumnVerticalReference','onUpdateBeamVerticalReference','onUpdateArchitectureSurface','onUpdateSlab',
  'onUpdateRoof','onUpdateRainwaterDesign','onUpdatePipeRoute','onUpdateElectricalFixture','onAssignElectricalFixtureToCircuit',
  'onApplyElectricalPhaseBalance','onUpdateCabinet','onUpdateInteriorFurniture','onUpdateMoulding','onUpdateStair','onUpdateFoundationMark',
  'onUpdateGridTag','onModifyGrid','onUpdateGridSystem','onUpdateWallFace','onDefineWallFinish','onUpdateWallFinish',
  'onUpdateOpeningVertical','onRehostOpening','onUpdateOpeningInstanceParameters',
]

/** Defers property-edit command construction until the user selects an object to edit. */
export function usePropertiesPanelActions(options: UsePropertiesPanelActionsOptions): PanelActions {
  const invoke = (name: keyof PanelActions) => (...args: unknown[]) => {
    void import('./propertiesPanelActionHandlers.js').then(({ createPropertiesPanelActions }) => {
      const handlers = createPropertiesPanelActions(options)
      return (handlers[name] as (...values: unknown[]) => void)(...args)
    }).catch(error => options.setFileFeedback(error instanceof Error ? error.message : String(error)))
  }
  return Object.fromEntries(panelActionNames.map(name => [name, invoke(name)])) as PanelActions
}
