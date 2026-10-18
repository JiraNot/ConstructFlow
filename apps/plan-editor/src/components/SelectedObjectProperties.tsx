import React, { lazy, Suspense } from 'react'
import type { DisplayLengthUnit } from '@constructflow/project-model'
import { ObjectLifecycleProperties } from './ObjectLifecycleProperties.js'
import { SourceReferencesProperties } from './SourceReferencesProperties.js'
import { ObjectSelectionHeader } from './ObjectSelectionHeader.js'
import { SelectedObjectDimensionGuide } from './SelectedObjectDimensionGuide.js'
import { resolvePropertiesSelection } from './propertiesSelection.js'
import { getObjectFamilyDisplayName } from './objectDisplayNames.js'
import type { PropertiesPanelProps } from './PropertiesPanel.types.js'

type SingleSelection = ReturnType<typeof resolvePropertiesSelection>
const FamilyInstanceProperties = lazy(() => import('./FamilyInstanceProperties.js').then(module => ({ default: module.FamilyInstanceProperties })))
const StairProperties = lazy(() => import('./StairProperties.js').then(module => ({ default: module.StairProperties })))
const WallPropertiesSection = lazy(() => import('./WallPropertiesSection.js').then(module => ({ default: module.WallPropertiesSection })))
const RoofPropertiesSection = lazy(() => import('./RoofPropertiesSection.js').then(module => ({ default: module.RoofPropertiesSection })))
const SystemsPropertiesSection = lazy(() => import('./SystemsPropertiesSection.js').then(module => ({ default: module.SystemsPropertiesSection })))
const StructurePropertiesSection = lazy(() => import('./StructurePropertiesSection.js').then(module => ({ default: module.StructurePropertiesSection })))
const SurfacePropertiesSection = lazy(() => import('./SurfacePropertiesSection.js').then(module => ({ default: module.SurfacePropertiesSection })))
const OpeningPropertiesSection = lazy(() => import('./OpeningPropertiesSection.js').then(module => ({ default: module.OpeningPropertiesSection })))
const RoomPropertiesSection = lazy(() => import('./RoomPropertiesSection.js').then(module => ({ default: module.RoomPropertiesSection })))
const GridPropertiesSection = lazy(() => import('./GridPropertiesSection.js').then(module => ({ default: module.GridPropertiesSection })))
const SectionLoading: React.FC = () => <div aria-hidden="true" style={{ minHeight: 24 }} />

export const SelectedObjectProperties: React.FC<{
  props: PropertiesPanelProps
  selection: SingleSelection
}> = ({ props, selection }) => {
  const { project, displayUnit, selectedId, onAssignType, onOpenTypeManager, onUpdateColumnVerticalReference,
    onUpdateBeamVerticalReference, onUpdateArchitectureSurface, onUpdateSlab, onUpdateRoof, onUpdateRainwaterDesign,
    onUpdatePipeRoute, onUpdateElectricalFixture, onAssignElectricalFixtureToCircuit, onApplyElectricalPhaseBalance, onUpdateCabinet, onUpdateInteriorFurniture, onUpdateMoulding,
    onUpdateStair, onUpdateGridTag, onModifyGrid, onUpdateGridSystem, onUpdateWallFace, onDefineWallFinish,
    onUpdateWallFinish, onUpdateOpeningVertical, onRehostOpening, onUpdateOpeningInstanceParameters, onFlipDoorHanding, onUpdatePhase,
    onUpdateRemovalPhase, onAddFoundation, onDeleteObject, onDrawSurfaceVoid, onCreateRoomFinish } = props
  const { selectedObject: selectedObj, column: colObj, foundation: fndObj, beam: beamObj,
    wall: wallObj, door: doorObj, window: winObj, grid: grdObj, slab: slabObj,
    architectureSurface: architectureSurfaceObj, room: roomObj, roof: roofObj, pipe: pipeObj,
    fixture: fixtureObj, cabinet: cabinetObj, interiorFurniture: interiorFurnitureObj, moulding: mouldingObj, currentMark, hostedFoundation } = selection

  if (!selectedObj) return null

  return (
    <div data-testid="properties-selection" data-object-id={selectedObj.id} data-object-type={selectedObj.object_type} style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ObjectSelectionHeader project={project} object={selectedObj}
        title={`${getObjectFamilyDisplayName(selectedObj.object_type)} ${currentMark}`}
        currentMark={currentMark} onAssignType={onAssignType} onOpenTypeManager={onOpenTypeManager} />
      <SelectedObjectDimensionGuide project={project} object={selectedObj} displayUnit={displayUnit} />

      {(colObj || fndObj || beamObj) && <Suspense fallback={<SectionLoading />}><StructurePropertiesSection project={project} displayUnit={displayUnit} column={colObj} foundation={fndObj} beam={beamObj}
        onUpdateColumnVerticalReference={onUpdateColumnVerticalReference} onUpdateBeamVerticalReference={onUpdateBeamVerticalReference} onOpenTypeManager={onOpenTypeManager} /></Suspense>}
      {wallObj && <Suspense fallback={<SectionLoading />}><WallPropertiesSection wall={wallObj} project={project} displayUnit={displayUnit} onUpdateWallFace={onUpdateWallFace}
        onUpdateWallFinish={onUpdateWallFinish} onDefineWallFinish={onDefineWallFinish} /></Suspense>}
      {roofObj && <Suspense fallback={<SectionLoading />}><RoofPropertiesSection roof={roofObj} project={project} displayUnit={displayUnit} onUpdateRoof={onUpdateRoof}
        onUpdateRainwaterDesign={onUpdateRainwaterDesign} onDrawSurfaceVoid={onDrawSurfaceVoid} /></Suspense>}
      {(pipeObj || fixtureObj || cabinetObj || mouldingObj) && <Suspense fallback={<SectionLoading />}><SystemsPropertiesSection project={project} displayUnit={displayUnit} pipeObj={pipeObj} fixtureObj={fixtureObj} cabinetObj={cabinetObj} mouldingObj={mouldingObj}
        onUpdatePipeRoute={onUpdatePipeRoute} onUpdateElectricalFixture={onUpdateElectricalFixture} onAssignElectricalFixtureToCircuit={onAssignElectricalFixtureToCircuit} onApplyElectricalPhaseBalance={onApplyElectricalPhaseBalance}
        onUpdateCabinet={onUpdateCabinet} onUpdateMoulding={onUpdateMoulding} /></Suspense>}
      {['family.instance','interior.furniture','interior.cabinet_run','door_window.door','door_window.window'].includes(selectedObj.object_type) && <Suspense fallback={<SectionLoading />}><FamilyInstanceProperties project={project} object={selectedObj} onEdit={props.onOpenFamilyEditor} onUpdate={changes=>props.onUpdateFamilyInstance?.(selectedObj.id,changes)}/></Suspense>}
      {(doorObj || winObj) && <Suspense fallback={<SectionLoading />}><OpeningPropertiesSection project={project} displayUnit={displayUnit} door={doorObj} window={winObj}
        onUpdateOpeningVertical={onUpdateOpeningVertical} onRehostOpening={onRehostOpening} onUpdateOpeningInstanceParameters={onUpdateOpeningInstanceParameters} onFlipDoorHanding={onFlipDoorHanding} onOpenTypeManager={onOpenTypeManager} /></Suspense>}
      {grdObj && <Suspense fallback={<SectionLoading />}><GridPropertiesSection project={project} grid={grdObj} selectedId={selectedId} displayUnit={displayUnit} onUpdateGridTag={onUpdateGridTag} onModifyGrid={onModifyGrid} onUpdateGridSystem={onUpdateGridSystem} /></Suspense>}
      {selectedObj.object_type === 'architecture.stair' && <Suspense fallback={<SectionLoading />}><StairProperties project={project} data={selectedObj.module_data as Record<string, unknown>} unit={displayUnit} onUpdate={changes => onUpdateStair?.(selectedObj.id, changes)} /></Suspense>}
      {(slabObj || architectureSurfaceObj) && <Suspense fallback={<SectionLoading />}><SurfacePropertiesSection project={project} displayUnit={displayUnit} slab={slabObj} architectureSurface={architectureSurfaceObj}
        onUpdateSlab={onUpdateSlab} onUpdateArchitectureSurface={onUpdateArchitectureSurface} onDrawSurfaceVoid={onDrawSurfaceVoid} onOpenTypeManager={onOpenTypeManager} /></Suspense>}
      {roomObj && <Suspense fallback={<SectionLoading />}><RoomPropertiesSection project={project} room={roomObj} onCreateRoomFinish={onCreateRoomFinish} /></Suspense>}
      <SourceReferencesProperties project={project} object={selectedObj} onUpdate={props.onUpdateSourceReferences ?? (() => {})} />
      <ObjectLifecycleProperties object={selectedObj} project={project} displayUnit={displayUnit} hostedFoundation={hostedFoundation}
        onUpdatePhase={onUpdatePhase} onUpdateRemovalPhase={onUpdateRemovalPhase} onAddFoundation={onAddFoundation} onDeleteObject={onDeleteObject} />
    </div>
  )
}
