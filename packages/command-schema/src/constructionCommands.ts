import type {
  Phase,
  SlabModuleData,
  RebarModuleData,
  RoofModuleData,
  MouldingModuleData,
  PanelLayoutModuleData,
  PipeRouteModuleData,
  ManholeModuleData,
  SepticModuleData,
  PumpBypassModuleData,
  BathroomModuleData,
  ElectricalFixtureModuleData,
  CircuitModuleData,
  CabinetModuleData,
  LEDModuleData,
} from "@constructflow/project-model";
export type ConstructionInput<T extends object> = T & {
  id?: string;
  phase?: Phase;
  created_phase?: Phase;
};
export interface ConstructionCommandInputs {
  ConfigureBeamReinforcement: {
    host_id: string;
    reinforcement: Record<
      "top" | "bottom" | "stirrups",
      Omit<RebarModuleData, "host_id" | "role" | "mark" | "level_id">
    >;
    bar_set_ids?: string[];
    inherit_host_type?: boolean;
  };
  ConfigureColumnReinforcement: {
    host_id: string;
    reinforcement: Partial<
      Record<
        "main" | "ties",
        Omit<RebarModuleData, "host_id" | "role" | "mark" | "level_id">
      >
    >;
    bar_set_ids?: string[];
    inherit_host_type?: boolean;
  };
  ConfigureFoundationReinforcement: {
    host_id: string;
    reinforcement: Partial<
      Record<
        "bottom_x" | "bottom_y",
        Omit<RebarModuleData, "host_id" | "role" | "mark" | "level_id">
      >
    >;
    bar_set_ids?: string[];
    inherit_host_type?: boolean;
  };
  CreateSlab: ConstructionInput<SlabModuleData>;
  UpdateSlab: ConstructionInput<SlabModuleData>;
  AssignRebarSet: ConstructionInput<RebarModuleData>;
  ModifyRebarSet: ConstructionInput<RebarModuleData>;
  GenerateRoof: ConstructionInput<RoofModuleData>;
  UpdateRoof: ConstructionInput<RoofModuleData>;
  CreateMouldingRun: ConstructionInput<MouldingModuleData>;
  UpdateMouldingRun: ConstructionInput<MouldingModuleData>;
  SetPanelLayout: ConstructionInput<PanelLayoutModuleData>;
  UpdatePanelLayout: ConstructionInput<PanelLayoutModuleData>;
  CreatePipeRoute: ConstructionInput<PipeRouteModuleData>;
  EditPipeRoute: ConstructionInput<PipeRouteModuleData>;
  PlaceManhole: ConstructionInput<ManholeModuleData>;
  UpdateManhole: ConstructionInput<ManholeModuleData>;
  CreateSepticTank: ConstructionInput<SepticModuleData>;
  UpdateSepticTank: ConstructionInput<SepticModuleData>;
  CreatePumpBypass: ConstructionInput<PumpBypassModuleData>;
  UpdatePumpBypass: ConstructionInput<PumpBypassModuleData>;
  CreateBathroom: ConstructionInput<BathroomModuleData>;
  UpdateBathroom: ConstructionInput<BathroomModuleData>;
  PlaceElectricalFixture: ConstructionInput<ElectricalFixtureModuleData>;
  UpdateElectricalFixture: ConstructionInput<ElectricalFixtureModuleData>;
  CreateCircuit: ConstructionInput<CircuitModuleData>;
  UpdateCircuit: ConstructionInput<CircuitModuleData>;
  CreateCabinetRun: ConstructionInput<CabinetModuleData>;
  UpdateCabinetRun: ConstructionInput<CabinetModuleData>;
  CreateLEDRun: ConstructionInput<LEDModuleData>;
  UpdateLEDRun: ConstructionInput<LEDModuleData>;
  SetBeamDrop: { id: string; drop_mm: number };
}
