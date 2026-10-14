import React from 'react'
import type {
  ProjectDocument,
  SmartObject,
  DisplayLengthUnit,
  PipeRouteModuleData,
  ElectricalFixtureModuleData,
  CabinetModuleData,
  MouldingModuleData,
} from '@constructflow/project-model'
import { PipeRoutePropertiesSection } from './PipeRoutePropertiesSection.js'
import { ElectricalFixturePropertiesSection } from './ElectricalFixturePropertiesSection.js'
import { CabinetPropertiesSection } from './CabinetPropertiesSection.js'
import { MouldingPropertiesSection } from './MouldingPropertiesSection.js'

type SystemsPropertiesSectionProps = {
  project: ProjectDocument
  displayUnit: DisplayLengthUnit
  pipeObj: SmartObject | null
  fixtureObj: SmartObject | null
  cabinetObj: SmartObject | null
  mouldingObj: SmartObject | null
  onUpdatePipeRoute?: (objectId: string, changes: Partial<PipeRouteModuleData>) => void
  onUpdateElectricalFixture?: (objectId: string, changes: Partial<ElectricalFixtureModuleData>) => void
  onAssignElectricalFixtureToCircuit?: (fixtureId: string, circuitId: string | null) => void
  onApplyElectricalPhaseBalance?: (assignments: Record<string, 'Phase A' | 'Phase B' | 'Phase C'>) => void
  onUpdateCabinet?: (objectId: string, changes: Partial<CabinetModuleData>) => void
  onUpdateMoulding?: (objectId: string, changes: Partial<MouldingModuleData>) => void
}

export const SystemsPropertiesSection: React.FC<SystemsPropertiesSectionProps> = props => <>
  <PipeRoutePropertiesSection project={props.project} displayUnit={props.displayUnit} object={props.pipeObj} onUpdate={props.onUpdatePipeRoute} />
  <ElectricalFixturePropertiesSection project={props.project} displayUnit={props.displayUnit} object={props.fixtureObj}
    onUpdate={props.onUpdateElectricalFixture} onAssignToCircuit={props.onAssignElectricalFixtureToCircuit} onApplyPhaseBalance={props.onApplyElectricalPhaseBalance} />
  <CabinetPropertiesSection object={props.cabinetObj} displayUnit={props.displayUnit} onUpdate={props.onUpdateCabinet} />
  <MouldingPropertiesSection object={props.mouldingObj} displayUnit={props.displayUnit} onUpdate={props.onUpdateMoulding} />
</>
