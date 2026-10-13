import type { ProjectDocument } from "@constructflow/project-model";
import { CommandBus } from "../commands/CommandBus.js";
import type { ModuleCommandDescriptor } from "../commands/CommandBus.js";

const pointSchema = {
  type: "array",
  items: { type: "number" },
  minItems: 2,
  maxItems: 3,
};

const builtInCommands: ModuleCommandDescriptor[] = [
  {
    name: "CreateWall",
    version: 1,
    owner_module: "constructflow.architecture",
    ai_allowed: true,
    confirmation: "none",
    preconditions_summary: "An active project level is available",
    input_schema: {
      type: "object",
      properties: {
        mark: { type: "string" },
        start_point_mm: pointSchema,
        end_point_mm: pointSchema,
        thickness_mm: { type: "number", exclusiveMinimum: 0 },
        height_mm: { type: "number", exclusiveMinimum: 0 },
        level_id: { type: "string" },
        type_id: { type: "string" },
      },
      required: ["start_point_mm", "end_point_mm", "thickness_mm", "height_mm"],
    },
  },
  {
    name: "CreateColumn",
    version: 1,
    owner_module: "constructflow.structure",
    ai_allowed: true,
    confirmation: "none",
    preconditions_summary: "Target level and column type must exist in the current project",
    input_schema: {
      type: "object",
      properties: {
        mark: { type: "string" },
        location_mm: pointSchema,
        section_mm: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
        type_id: { type: "string" },
        base_level_id: { type: "string" },
        top_level_id: { type: "string" },
      },
      required: ["location_mm"],
    },
  },
  {
    name: "CreateBeam",
    version: 1,
    owner_module: "constructflow.structure",
    ai_allowed: true,
    confirmation: "none",
    preconditions_summary: "Target level and beam type must exist in the current project",
    input_schema: {
      type: "object",
      properties: {
        mark: { type: "string" },
        start_point_mm: pointSchema,
        end_point_mm: pointSchema,
        section_mm: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
        type_id: { type: "string" },
        level_id: { type: "string" },
        start_column_id: { type: "string" },
        end_column_id: { type: "string" },
      },
      required: ["start_point_mm", "end_point_mm"],
    },
  },
  {
    name: "CreateDoor",
    version: 1,
    owner_module: "constructflow.architecture",
    ai_allowed: true,
    confirmation: "none",
    preconditions_summary: "A compatible host wall UUID and opening dimensions are required",
    input_schema: {
      type: "object",
      properties: {
        mark: { type: "string" },
        wall_id: { type: "string" },
        offset_along_wall_mm: { type: "number", minimum: 0 },
        width_mm: { type: "number", exclusiveMinimum: 0 },
        height_mm: { type: "number", exclusiveMinimum: 0 },
        type_id: { type: "string" },
        level_id: { type: "string" },
      },
      required: ["wall_id", "offset_along_wall_mm", "width_mm", "height_mm"],
    },
  },
  {
    name: "CreateWindow",
    version: 1,
    owner_module: "constructflow.architecture",
    ai_allowed: true,
    confirmation: "none",
    preconditions_summary: "A compatible host wall UUID and opening dimensions are required",
    input_schema: {
      type: "object",
      properties: {
        mark: { type: "string" },
        wall_id: { type: "string" },
        offset_along_wall_mm: { type: "number", minimum: 0 },
        width_mm: { type: "number", exclusiveMinimum: 0 },
        height_mm: { type: "number", exclusiveMinimum: 0 },
        sill_height_mm: { type: "number", minimum: 0 },
        type_id: { type: "string" },
        level_id: { type: "string" },
      },
      required: ["wall_id", "offset_along_wall_mm", "width_mm", "height_mm"],
    },
  },
];

export function getAICommandDescriptors(): ModuleCommandDescriptor[] {
  const extensionCommands = CommandBus.getAICommandDescriptors();
  const byName = new Map<string, ModuleCommandDescriptor>();
  for (const descriptor of [...builtInCommands, ...extensionCommands]) {
    if (descriptor.ai_allowed) byName.set(descriptor.name, descriptor);
  }
  return [...byName.values()];
}

export function buildAIProjectContext(project: ProjectDocument, selectedIds: readonly string[]) {
  const selected = new Set(selectedIds);
  const objects = Object.values(project.objects);
  const summary = objects.slice(-160).map((object) => {
    const data = object.module_data as Record<string, unknown>;
    return {
      id: object.id,
      object_type: object.object_type,
      mark: String(data.mark ?? ""),
      level_id: String(data.level_id ?? object.level_refs[0]?.level_id ?? ""),
      ...(Array.isArray(data.start_point_mm) ? { start_point_mm: data.start_point_mm } : {}),
      ...(Array.isArray(data.end_point_mm) ? { end_point_mm: data.end_point_mm } : {}),
      ...(Array.isArray(data.location_mm) ? { location_mm: data.location_mm } : {}),
      ...(typeof data.offset_along_wall_mm === "number" ? { offset_along_wall_mm: data.offset_along_wall_mm } : {}),
      ...(typeof data.width_mm === "number" ? { width_mm: data.width_mm } : {}),
      ...(typeof data.height_mm === "number" ? { height_mm: data.height_mm } : {}),
      ...(typeof data.wall_id === "string" ? { wall_id: data.wall_id } : {}),
      selected: selected.has(object.id),
    };
  });
  return {
    project_name: project.project.name,
    units: "mm",
    active_phase: project.project.active_phase,
    active_level_id: project.project.active_level_id,
    levels: project.levels.map(({ id, name, elevation_mm }) => ({ id, name, elevation_mm })),
    types: project.types.map(({ id, name, object_type, parameters }) => ({ id, name, object_type, parameters })),
    object_count: objects.length,
    objects,
    selection_ids: selectedIds,
    visible_object_summaries: summary,
  };
}
