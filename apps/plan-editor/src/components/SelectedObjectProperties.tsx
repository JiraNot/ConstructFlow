import React from 'react'
import type { DisplayLengthUnit } from '@constructflow/project-model'
import { StairProperties } from './StairProperties.js'
import { WallPropertiesSection } from './WallPropertiesSection.js'
import { RoofPropertiesSection } from './RoofPropertiesSection.js'
import { SystemsPropertiesSection } from './SystemsPropertiesSection.js'
import { StructurePropertiesSection } from './StructurePropertiesSection.js'
import { SurfacePropertiesSection } from './SurfacePropertiesSection.js'
import { OpeningPropertiesSection } from './OpeningPropertiesSection.js'
import { RoomPropertiesSection } from './RoomPropertiesSection.js'
import { GridPropertiesSection } from './GridPropertiesSection.js'
import { ObjectLifecycleProperties } from './ObjectLifecycleProperties.js'
import { ObjectSelectionHeader } from './ObjectSelectionHeader.js'
import { resolvePropertiesSelection } from './propertiesSelection.js'
import type { PropertiesPanelProps } from './PropertiesPanel.js'

type SingleSelection = ReturnType<typeof resolvePropertiesSelection>

export const SelectedObjectProperties: React.FC<{
  props: PropertiesPanelProps
  selection: SingleSelection
}> = ({ props, selection }) => {
  const { project, displayUnit, selectedId, onAssignType, onOpenTypeManager, onUpdateColumnVerticalReference,
    onUpdateBeamVerticalReference, onUpdateArchitectureSurface, onUpdateSlab, onUpdateRoof, onUpdateRainwaterDesign,
    onUpdatePipeRoute, onUpdateElectricalFixture, onAssignElectricalFixtureToCircuit, onUpdateCabinet, onUpdateMoulding,
    onUpdateStair, onUpdateGridTag, onModifyGrid, onUpdateGridSystem, onUpdateWallFace, onDefineWallFinish,
    onUpdateWallFinish, onUpdateOpeningVertical, onUpdateOpeningInstanceParameters, onFlipDoorHanding, onUpdatePhase,
    onUpdateRemovalPhase, onAddFoundation, onDeleteObject, onDrawSurfaceVoid, onCreateRoomFinish } = props
  const { selectedObject: selectedObj, column: colObj, foundation: fndObj, beam: beamObj,
    wall: wallObj, door: doorObj, window: winObj, grid: grdObj, slab: slabObj,
    architectureSurface: architectureSurfaceObj, room: roomObj, roof: roofObj, pipe: pipeObj,
    fixture: fixtureObj, cabinet: cabinetObj, moulding: mouldingObj, currentMark, hostedFoundation } = selection

  if (!selectedObj) return null

  return (
    <div data-testid="properties-selection" data-object-id={selectedObj.id} data-object-type={selectedObj.object_type} style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ObjectSelectionHeader project={project} object={selectedObj}
        title={colObj ? `Column ${colObj.module_data.mark}` : fndObj ? `Footing ${fndObj.module_data.mark}` : beamObj ? `Beam ${beamObj.module_data.mark}` : wallObj ? `Wall ${wallObj.module_data.mark}` : doorObj ? `Door ${doorObj.module_data.mark}` : winObj ? `Window ${winObj.module_data.mark}` : grdObj ? `Grid ${grdObj.module_data.tag}` : roofObj ? `Roof ${String((roofObj.module_data as Record<string, unknown>).name ?? roofObj.id)}` : 'วัตถุ'}
        currentMark={currentMark} onAssignType={onAssignType} onOpenTypeManager={onOpenTypeManager} />

      <StructurePropertiesSection project={project} displayUnit={displayUnit} column={colObj} foundation={fndObj} beam={beamObj}
        onUpdateColumnVerticalReference={onUpdateColumnVerticalReference} onUpdateBeamVerticalReference={onUpdateBeamVerticalReference} onOpenTypeManager={onOpenTypeManager} />
      {wallObj && <WallPropertiesSection wall={wallObj} project={project} displayUnit={displayUnit} onUpdateWallFace={onUpdateWallFace}
        onUpdateWallFinish={onUpdateWallFinish} onDefineWallFinish={onDefineWallFinish} onOpenTypeManager={onOpenTypeManager} />}
      {roofObj && <RoofPropertiesSection roof={roofObj} project={project} displayUnit={displayUnit} onUpdateRoof={onUpdateRoof}
        onUpdateRainwaterDesign={onUpdateRainwaterDesign} onDrawSurfaceVoid={onDrawSurfaceVoid} />}
      <SystemsPropertiesSection project={project} displayUnit={displayUnit} pipeObj={pipeObj} fixtureObj={fixtureObj} cabinetObj={cabinetObj} mouldingObj={mouldingObj}
        onUpdatePipeRoute={onUpdatePipeRoute} onUpdateElectricalFixture={onUpdateElectricalFixture} onAssignElectricalFixtureToCircuit={onAssignElectricalFixtureToCircuit}
        onUpdateCabinet={onUpdateCabinet} onUpdateMoulding={onUpdateMoulding} />
      <OpeningPropertiesSection project={project} displayUnit={displayUnit} door={doorObj} window={winObj}
        onUpdateOpeningVertical={onUpdateOpeningVertical} onUpdateOpeningInstanceParameters={onUpdateOpeningInstanceParameters} onFlipDoorHanding={onFlipDoorHanding} onOpenTypeManager={onOpenTypeManager} />
      <GridPropertiesSection project={project} grid={grdObj} selectedId={selectedId} displayUnit={displayUnit} onUpdateGridTag={onUpdateGridTag} onModifyGrid={onModifyGrid} onUpdateGridSystem={onUpdateGridSystem} />
      {selectedObj.object_type === 'architecture.stair' && <StairProperties project={project} data={selectedObj.module_data as Record<string, unknown>} unit={displayUnit} onUpdate={changes => onUpdateStair?.(selectedObj.id, changes)} />}
      <SurfacePropertiesSection project={project} displayUnit={displayUnit} slab={slabObj} architectureSurface={architectureSurfaceObj}
        onUpdateSlab={onUpdateSlab} onUpdateArchitectureSurface={onUpdateArchitectureSurface} onDrawSurfaceVoid={onDrawSurfaceVoid} onOpenTypeManager={onOpenTypeManager} />
      <RoomPropertiesSection project={project} room={roomObj} onCreateRoomFinish={onCreateRoomFinish} />
      <ObjectLifecycleProperties object={selectedObj} project={project} displayUnit={displayUnit} hostedFoundation={hostedFoundation}
        onUpdatePhase={onUpdatePhase} onUpdateRemovalPhase={onUpdateRemovalPhase} onAddFoundation={onAddFoundation} onDeleteObject={onDeleteObject} />
    </div>
  )
}
