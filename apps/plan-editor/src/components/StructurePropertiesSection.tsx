import React from 'react'
import { BeamModuleData, ColumnModuleData, FoundationModuleData, ProjectDocument, SmartObject, type DisplayLengthUnit } from '@constructflow/project-model'
import { ColumnPropertiesSection } from './ColumnPropertiesSection.js'
import { FoundationPropertiesSection } from './FoundationPropertiesSection.js'
import { BeamPropertiesSection } from './BeamPropertiesSection.js'

type StructurePropertiesSectionProps = { project: ProjectDocument; displayUnit: DisplayLengthUnit; column: SmartObject<ColumnModuleData> | null; foundation: SmartObject<FoundationModuleData> | null; beam: SmartObject<BeamModuleData> | null; onUpdateColumnVerticalReference: (objectId: string, changes: { base_level_id?: string; top_level_id?: string | null; base_offset_mm?: number; top_offset_mm?: number }) => void; onUpdateBeamVerticalReference: (objectId: string, changes: { level_id?: string; base_offset_mm?: number }) => void; onOpenTypeManager: () => void }

export const StructurePropertiesSection: React.FC<StructurePropertiesSectionProps> = props => (
  <>
    <ColumnPropertiesSection project={props.project} displayUnit={props.displayUnit} column={props.column} onUpdateVerticalReference={props.onUpdateColumnVerticalReference} onOpenTypeManager={props.onOpenTypeManager} />
    <FoundationPropertiesSection displayUnit={props.displayUnit} foundation={props.foundation} onOpenTypeManager={props.onOpenTypeManager} />
    <BeamPropertiesSection project={props.project} displayUnit={props.displayUnit} beam={props.beam} onUpdateVerticalReference={props.onUpdateBeamVerticalReference} onOpenTypeManager={props.onOpenTypeManager} />
  </>
)
