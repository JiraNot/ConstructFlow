import type {
  ProjectDocument,
  RainwaterDesignSettings,
  Phase,
  RemovalPhase,
  DisplayLengthUnit,
  StairModuleData,
  RoofModuleData,
  PipeRouteModuleData,
  ElectricalFixtureModuleData,
  CabinetModuleData,
  MouldingModuleData,
} from '@constructflow/project-model'

export interface PropertiesPanelProps {
  project: ProjectDocument
  displayUnit: DisplayLengthUnit
  selectedId: string | null
  selectedIds?: string[]
  onAssignType: (objectId: string, typeName: string) => void
  onAssignTypeMany?: (objectIds: string[], typeId: string) => void
  onUpdateLevelMany?: (objectIds: string[], levelId: string) => void
  onDeleteObjects?: (objectIds: string[]) => void
  onUpdateColumnMark: (objectId: string, newMark: string) => void
  onUpdateColumnVerticalReference: (objectId: string, changes: { base_level_id?: string; top_level_id?: string | null; base_offset_mm?: number; top_offset_mm?: number }) => void
  onUpdateBeamVerticalReference: (objectId: string, changes: { level_id?: string; base_offset_mm?: number }) => void
  onUpdateArchitectureSurface?: (objectId: string, changes: { level_id?: string; elevation_offset_mm?: number; thickness_mm?: number; material?: string; finish_layers?: Array<{ material: string; thickness_mm: number; mark?: string; quantity_unit?: 'm2' | 'm3' }>; finish_pattern_mm?: [number, number]; finish_pattern_origin_mm?: [number, number]; finish_pattern_rotation_deg?: number; grid_mm?: [number, number] }) => void
  onUpdateSlab?: (objectId: string, changes: { level_id?: string; elevation_offset_mm?: number; thickness_mm?: number; slab_system?: string; material?: string; slope_ratio?: number; drain_direction_deg?: number; finish_layers?: Array<{ material: string; thickness_mm: number; offset_mm?: number; mark?: string; quantity_unit?: 'm2' | 'm3' }>; finish_pattern_mm?: [number, number]; finish_pattern_origin_mm?: [number, number]; finish_pattern_rotation_deg?: number }) => void
  onUpdateRoof?: (objectId: string, changes: Partial<RoofModuleData>) => void
  onUpdateRainwaterDesign?: (settings: RainwaterDesignSettings) => void
  onUpdatePipeRoute?: (objectId: string, changes: Partial<PipeRouteModuleData>) => void
  onUpdateElectricalFixture?: (objectId: string, changes: Partial<ElectricalFixtureModuleData>) => void
  onAssignElectricalFixtureToCircuit?: (fixtureId: string, circuitId: string | null) => void
  onUpdateCabinet?: (objectId: string, changes: Partial<CabinetModuleData>) => void
  onUpdateMoulding?: (objectId: string, changes: Partial<MouldingModuleData>) => void
  onUpdateStair?: (objectId: string, changes: Partial<StairModuleData>) => void
  onUpdateFoundationMark: (objectId: string, newMark: string) => void
  onUpdateGridTag: (objectId: string, newTag: string) => void
  onModifyGrid: (objectId: string, changes: { start_point_mm?: [number, number]; end_point_mm?: [number, number]; bubble_visible?: boolean; auto_tag?: boolean; sequence_style?: 'auto' | 'alpha' | 'numeric' }) => void
  onUpdateGridSystem: (systemId: string, changes: { positions_mm?: number[]; first_tag?: string }) => void
  onUpdateWallFace: (objectId: string, changes: { fit_to_stair?: boolean; plaster_inside_thickness_mm?: number; plaster_outside_thickness_mm?: number; plaster_inside_material?: string; plaster_outside_material?: string; inside_finish_mark?: string; outside_finish_mark?: string; inside_finish_type_id?: string; outside_finish_type_id?: string; interior_side?: 'left' | 'right'; top_level_id?: string; base_offset_mm?: number; top_offset_mm?: number; vertical_constraint?: 'fixed_height' | 'top_level'; height_mm?: number }) => void
  onDefineWallFinish?: (name: string, parameters: Record<string, unknown>) => void
  onUpdateWallFinish?: (typeId: string, name: string, parameters: Record<string, unknown>) => void
  onUpdateOpeningVertical: (objectId: string, changes: { sill_height_mm?: number; height_mm?: number; head_level_id?: string; head_offset_mm?: number; vertical_constraint?: 'fixed_height' | 'head_level' }) => void
  onUpdateOpeningInstanceParameters?: (objectId: string, parameters: Record<string, unknown | null>) => void
  onUpdatePhase?: (objectId: string, newPhase: Phase) => void
  onUpdateRemovalPhase?: (objectId: string, removedPhase: RemovalPhase | null) => void
  onFlipDoorHanding?: (doorId: string) => void
  onOpenTypeManager: () => void
  onAddFoundation: (columnId: string) => void
  onDeleteObject: (objectId: string) => void
  onDrawSurfaceVoid: (surfaceId: string) => void
  onCreateRoomFinish?: (kind: 'floor' | 'ceiling', roomId: string) => void
}
