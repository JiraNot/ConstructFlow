// ConstructFlow Revit Direct Transfer Serializer (constructflow.revit_transfer.v1)
// For consumption by PyRevit / Dynamo automated native Revit modeling bridges.

import type { ProjectDocument, SmartObject } from "@constructflow/project-model";

export interface RevitTransferDocument {
  schema_version: "constructflow.revit_transfer.v1";
  generated_at: string;
  project: {
    id: string;
    name: string;
    units: "mm";
  };
  levels: Array<{
    id: string;
    name: string;
    elevation_mm: number;
    height_mm?: number;
  }>;
  elements: {
    walls: RevitWall[];
    columns: RevitColumn[];
    beams: RevitBeam[];
    floors: RevitFloor[];
    openings: RevitOpening[];
  };
}

export interface RevitWall {
  cf_uuid: string;
  phase: "Existing" | "Demolition" | "New Construction";
  family_type: string;
  base_level_id: string;
  start_point_mm: [number, number, number];
  end_point_mm: [number, number, number];
  thickness_mm: number;
  height_mm: number;
  location_line: "WallCenterline" | "FinishFaceExterior";
}

export interface RevitColumn {
  cf_uuid: string;
  phase: "Existing" | "Demolition" | "New Construction";
  family_type: string;
  base_level_id: string;
  location_mm: [number, number, number];
  section_mm: [number, number];
  rotation_deg: number;
  height_mm: number;
  is_structural: boolean;
}

export interface RevitBeam {
  cf_uuid: string;
  phase: "Existing" | "Demolition" | "New Construction";
  family_type: string;
  level_id: string;
  start_point_mm: [number, number, number];
  end_point_mm: [number, number, number];
  section_mm: [number, number];
  z_offset_mm?: number;
}

export interface RevitFloor {
  cf_uuid: string;
  phase: "Existing" | "Demolition" | "New Construction";
  family_type: string;
  level_id: string;
  boundary_loops_mm: Array<[number, number][]>;
  thickness_mm: number;
}

export interface RevitOpening {
  cf_uuid: string;
  host_wall_uuid: string;
  category: "Door" | "Window";
  family_type: string;
  location_on_host_mm: [number, number, number];
  width_mm: number;
  height_mm: number;
  sill_height_mm: number;
}

export function serializeRevitTransfer(project: ProjectDocument): RevitTransferDocument {
  const walls: RevitWall[] = [];
  const columns: RevitColumn[] = [];
  const beams: RevitBeam[] = [];
  const floors: RevitFloor[] = [];
  const openings: RevitOpening[] = [];

  const defaultLevelId = project.levels[0]?.id ?? "level-ground";

  const mapPhase = (phase: string): "Existing" | "Demolition" | "New Construction" => {
    if (phase === "demolition") return "Demolition";
    if (phase === "existing") return "Existing";
    return "New Construction";
  };

  for (const obj of Object.values(project.objects)) {
    const type = obj.object_type;
    const phase = mapPhase(obj.created_phase);
    const d = obj.module_data as Record<string, any>;

    if (type.startsWith("arch.wall") || type.startsWith("architecture.wall")) {
      walls.push({
        cf_uuid: obj.id,
        phase,
        family_type: d.mark ?? (d.thickness_mm === 75 ? "Basic Wall - AAC 7.5cm" : "Basic Wall - Brick 10cm"),
        base_level_id: d.level_id ?? d.base_level_id ?? defaultLevelId,
        start_point_mm: d.start_point_mm ?? [0, 0, 0],
        end_point_mm: d.end_point_mm ?? [4000, 0, 0],
        thickness_mm: d.thickness_mm ?? 100,
        height_mm: d.height_mm ?? 2800,
        location_line: "WallCenterline",
      });
    } else if (type.startsWith("structure.column")) {
      columns.push({
        cf_uuid: obj.id,
        phase,
        family_type: d.mark ?? "M_Concrete-Rectangular-Column",
        base_level_id: d.base_level_id ?? d.level_id ?? defaultLevelId,
        location_mm: d.location_mm ?? [0, 0, 0],
        section_mm: d.section_mm ?? [200, 200],
        rotation_deg: d.rotation_deg ?? 0,
        height_mm: d.height_mm ?? 3000,
        is_structural: true,
      });
    } else if (type.startsWith("structure.beam")) {
      beams.push({
        cf_uuid: obj.id,
        phase,
        family_type: d.mark ?? "M_Concrete-Rectangular Beam",
        level_id: d.level_id ?? defaultLevelId,
        start_point_mm: d.start_point_mm ?? [0, 0, 0],
        end_point_mm: d.end_point_mm ?? [4000, 0, 0],
        section_mm: d.section_mm ?? [200, 400],
        z_offset_mm: d.drop_mm ? -d.drop_mm : 0,
      });
    } else if (type.startsWith("structure.slab")) {
      floors.push({
        cf_uuid: obj.id,
        phase,
        family_type: d.slab_system ?? "Floor - 120mm Concrete",
        level_id: d.level_id ?? defaultLevelId,
        boundary_loops_mm: [
          [
            [0, 0],
            [5000, 0],
            [5000, 4000],
            [0, 4000],
          ],
        ],
        thickness_mm: d.thickness_mm ?? 120,
      });
    } else if (type.startsWith("arch.door") || type.startsWith("opening.door")) {
      openings.push({
        cf_uuid: obj.id,
        host_wall_uuid: d.host_wall_id ?? "",
        category: "Door",
        family_type: d.mark ?? "Single-Flush 0915 x 2134mm",
        location_on_host_mm: d.location_mm ?? [1000, 0, 0],
        width_mm: d.width_mm ?? 900,
        height_mm: d.height_mm ?? 2000,
        sill_height_mm: 0,
      });
    } else if (type.startsWith("arch.window") || type.startsWith("opening.window")) {
      openings.push({
        cf_uuid: obj.id,
        host_wall_uuid: d.host_wall_id ?? "",
        category: "Window",
        family_type: d.mark ?? "Sliding 2-Panel",
        location_on_host_mm: d.location_mm ?? [2000, 0, 900],
        width_mm: d.width_mm ?? 1200,
        height_mm: d.height_mm ?? 1100,
        sill_height_mm: d.sill_height_mm ?? 900,
      });
    }
  }

  return {
    schema_version: "constructflow.revit_transfer.v1",
    generated_at: new Date().toISOString(),
    project: {
      id: project.project.id,
      name: project.project.name,
      units: "mm",
    },
    levels: project.levels.map((lvl) => ({
      id: lvl.id,
      name: lvl.name,
      elevation_mm: lvl.elevation_mm,
      height_mm: lvl.height_mm,
    })),
    elements: {
      walls,
      columns,
      beams,
      floors,
      openings,
    },
  };
}
