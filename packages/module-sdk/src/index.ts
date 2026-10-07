import type {
  ProjectDocument,
  SmartObject,
  Phase,
} from "@constructflow/project-model";
import type {
  CommandHandlerContext,
  CommandBusResult,
} from "@constructflow/command-schema";
import type { Vec2, Vec3, Triangle } from "@constructflow/geometry-kernel";
export type { Vec2, Vec3, Triangle };
export interface DomainQuantity {
  classification: string;
  description: string;
  quantity: number;
  unit: "m" | "m2" | "m3" | "kg" | "pcs";
  formula: string;
  material?: string;
}
export interface DomainOutput {
  object_id: string;
  family: string;
  phase: Phase;
  removed_phase: "demolition" | null;
  mark: string;
  meshes: Triangle[];
  paths: Vec3[][];
  quantities: DomainQuantity[];
  schedule: Record<string, string | number>;
  warnings: string[];
}
export type DomainProvider = (project: ProjectDocument) => DomainOutput[];
export function record(
  value: unknown,
  label = "data",
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(label + " must be an object");
  return value as Record<string, unknown>;
}
export function num(
  value: unknown,
  label: string,
  min = -Infinity,
  max = Infinity,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error(
      label + " must be finite within [" + min + ", " + max + "]",
    );
  return value;
}
export function positive(value: unknown, label: string): number {
  const n = num(value, label);
  if (n <= 0) throw new Error(label + " must be positive");
  return n;
}
export function integer(value: unknown, label: string, min = 1): number {
  const n = num(value, label, min);
  if (!Number.isInteger(n)) throw new Error(label + " must be an integer");
  return n;
}
export function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(label + " is required");
  return value.trim();
}
export function choice<T extends string>(
  value: unknown,
  options: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !options.includes(value as T))
    throw new Error(label + " must be " + options.join("/"));
  return value as T;
}
export function vec2(value: unknown, label: string): Vec2 {
  if (!Array.isArray(value) || value.length !== 2)
    throw new Error(label + " requires XY");
  return [num(value[0], label), num(value[1], label)];
}
export function vec3(value: unknown, label: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3)
    throw new Error(label + " requires XYZ");
  return [num(value[0], label), num(value[1], label), num(value[2], label)];
}
export function list<T>(
  value: unknown,
  label: string,
  decode: (v: unknown, i: number) => T,
  min = 1,
): T[] {
  if (!Array.isArray(value) || value.length < min)
    throw new Error(label + " requires " + min + " entries");
  return value.map(decode);
}
export function resolvedData(
  project: ProjectDocument,
  object: SmartObject,
): Record<string, unknown> {
  const data = record(object.module_data),
    type = project.types.find(
      (t) => t.id === data.type_id && t.object_type === object.object_type,
    );
  return {
    ...data,
    ...type?.parameters,
    ...(data.instance_overrides ? record(data.instance_overrides) : {}),
  };
}
export function output(object: SmartObject, data: object): DomainOutput {
  return {
    object_id: object.id,
    family: object.object_type,
    phase: object.created_phase,
    removed_phase: object.removed_phase,
    mark: String(record(data).mark ?? object.object_type),
    meshes: [],
    paths: [],
    quantities: [],
    schedule: {},
    warnings: [],
  };
}
export function placement(d: Record<string, unknown>, p: ProjectDocument) {
  return {
    mark: text(d.mark ?? "NEW", "mark"),
    level_id:
      typeof d.level_id === "string" ? d.level_id : p.project.active_level_id,
    ...(typeof d.type_id === "string" ? { type_id: d.type_id } : {}),
    ...(d.instance_overrides
      ? { instance_overrides: record(d.instance_overrides) }
      : {}),
  };
}
export function domainCommand<T extends object>(
  context: CommandHandlerContext,
  family: string,
  owner: string,
  decode: (data: Record<string, unknown>, project: ProjectDocument) => T,
  options: { update?: boolean; hostFields?: string[]; version?: number } = {},
): CommandBusResult {
  const { updated, input, commandName, command_id, now, envelope } = context;
  const id = typeof input.id === "string" ? input.id : crypto.randomUUID(),
    old = updated.objects[id];
  if (options.update && (!old || old.object_type !== family))
    throw new Error("Object to edit is missing or incompatible");
  if (!options.update && old) throw new Error("Object UUID already exists");
  const oldData = old ? record(old.module_data) : {};
  const typeId = input.type_id ?? oldData.type_id;
  const type =
    typeof typeId === "string"
      ? updated.types.find((t) => t.id === typeId && t.object_type === family)
      : undefined;
  if (input.type_id && !type)
    throw new Error("Missing or incompatible type UUID");
  const overrides: Record<string, unknown> = {
    ...(input.type_id && input.type_id !== oldData.type_id
      ? {}
      : oldData.instance_overrides
        ? record(oldData.instance_overrides)
        : {}),
    ...(input.instance_overrides ? record(input.instance_overrides) : {}),
  };
  for (const [key, value] of Object.entries(type?.parameters ?? {}))
    if (input[key] !== undefined) {
      if (JSON.stringify(input[key]) === JSON.stringify(value))
        delete overrides[key];
      else overrides[key] = structuredClone(input[key]);
    }
  const raw: Record<string, unknown> = {
    ...oldData,
    ...type?.parameters,
    ...overrides,
    ...input,
    ...(type ? { type_id: type.id, instance_overrides: overrides } : {}),
  };
  const data = decode(raw, updated);
  const levelId =
    typeof raw.level_id === "string"
      ? raw.level_id
      : updated.project.active_level_id;
  if (!updated.levels.some((l) => l.id === levelId))
    throw new Error("Missing level " + levelId);
  const hosts = (options.hostFields ?? []).flatMap((k) =>
    typeof raw[k] === "string" ? [raw[k] as string] : [],
  );
  for (const host of hosts)
    if (!updated.objects[host] || host === id)
      throw new Error("Missing or self-referencing host " + host);
  const object: SmartObject<T> = {
    id,
    object_type: family,
    owner_module: owner,
    schema_version: options.version ?? 1,
    created_phase:
      old?.created_phase ??
      ((raw.created_phase ??
        raw.phase ??
        updated.project.active_phase) as Phase),
    removed_phase: old?.removed_phase ?? null,
    level_refs: [{ role: "host_level", level_id: levelId }],
    host_refs: hosts,
    connector_refs: [],
    status: "active",
    module_data: data,
    created_at: old?.created_at ?? now,
    updated_at: now,
    revision_meta: {
      ...old?.revision_meta,
      dirty_quantity: true,
      dirty_drawing: true,
    },
  };
  updated.objects[id] = object as unknown as SmartObject;
  updated.relationships = updated.relationships.filter(
    (r) =>
      r.source_id !== id ||
      r.kind !== "hosted_on" ||
      hosts.includes(r.target_id),
  );
  for (const host of hosts)
    if (
      !updated.relationships.some(
        (r) =>
          r.source_id === id && r.target_id === host && r.kind === "hosted_on",
      )
    )
      updated.relationships.push({
        kind: "hosted_on",
        source_id: id,
        target_id: host,
      });
  return {
    result: {
      status: "success",
      command_id,
      command_name: commandName,
      affected_object_ids: [id],
      ...(old ? { updated_object_ids: [id] } : { created_object_ids: [id] }),
    },
    updatedProject: updated,
    emittedEnvelope: { ...envelope, input: { ...input, id } },
  };
}
