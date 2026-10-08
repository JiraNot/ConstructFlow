import type {
  ProjectDocument,
  SlabModuleData,
  RebarModuleData,
  SmartObject,
} from "@constructflow/project-model";
import { legacyTypeUuid, resolveSlabElevation } from "@constructflow/project-model";
import type {
  CommandHandlerContext,
  CommandBusResult,
} from "@constructflow/command-schema";
import {
  simplePolygon,
  signedArea,
  extrude,
  length3,
  rectangle,
} from "@constructflow/geometry-kernel";
import {
  choice,
  domainCommand,
  integer,
  list,
  num,
  positive,
  record,
  text,
  vec2,
  output,
  resolvedData,
  placement,
  type DomainOutput,
  type Vec3,
} from "@constructflow/module-sdk";

export function decodeSlab(
  d: Record<string, unknown>,
  p: ProjectDocument,
): SlabModuleData {
  const boundary_mm = simplePolygon(
    list(d.boundary_mm, "boundary_mm", (v) => vec2(v, "boundary point"), 3),
  );
  const voids_mm = Array.isArray(d.voids_mm)
    ? d.voids_mm.map((ring, index) => simplePolygon(list(ring, `voids_mm[${index}]`, (v) => vec2(v, "void point"), 3)))
    : [];
  return {
    ...placement(d, p),
    boundary_mm,
    elevation_mm: resolveSlabElevation(p, d) ?? num(d.elevation_mm, "elevation_mm"),
    ...(voids_mm.length ? { voids_mm } : {}),
    thickness_mm: positive(d.thickness_mm, "thickness_mm"),
    topping_mm: num(d.topping_mm ?? 0, "topping_mm", 0),
    slab_system: choice(
      d.slab_system,
      ["slab_on_ground", "suspended", "precast_plank", "hollow_core"],
      "slab_system",
    ),
    material: text(d.material, "material"),
    slope_ratio: num(d.slope_ratio ?? 0, "slope_ratio", 0),
    drain_direction_deg: num(d.drain_direction_deg ?? 0, "drain_direction_deg"),
  };
}
function hostGeometry(
  p: ProjectDocument,
  id: string,
): { length: number; width: number; depth: number; start: Vec3; end: Vec3 } {
  const o = p.objects[id];
  if (!o) throw new Error("Rebar host is missing");
  const d = resolvedData(p, o);
  if (o.object_type === "structure.beam") {
    const a = list(
        d.start_point_mm,
        "start",
        (v) => num(v, "point"),
        3,
      ) as Vec3,
      b = list(d.end_point_mm, "end", (v) => num(v, "point"), 3) as Vec3,
      s = vec2(d.section_mm, "section");
    const drop = num(d.drop_mm ?? 0, "drop_mm", 0);
    a[2] += s[1] / 2 - drop;
    b[2] += s[1] / 2 - drop;
    return {
      length: length3(a, b),
      width: s[0],
      depth: s[1],
      start: a,
      end: b,
    };
  }
  if (o.object_type === "structure.column") {
    const a = list(
        d.location_mm,
        "location",
        (v) => num(v, "point"),
        3,
      ) as Vec3,
      s = vec2(d.section_mm, "section"),
      base = p.levels.find((l) => l.id === d.base_level_id),
      top = p.levels.find((l) => l.id === d.top_level_id);
    const z = num(
        d.base_elevation_mm ??
          (base?.elevation_mm ?? a[2]) +
            (typeof d.base_offset_mm === "number" ? d.base_offset_mm : 0),
        "base",
      ),
      zt =
        num(
          d.top_elevation_mm ??
            top?.elevation_mm ??
            (base?.height_mm !== undefined ? z + base.height_mm : undefined),
          "known column top",
        ) + (typeof d.top_offset_mm === "number" ? d.top_offset_mm : 0);
    return {
      length: positive(zt - z, "column height"),
      width: s[0],
      depth: s[1],
      start: [a[0], a[1], z],
      end: [a[0], a[1], zt],
    };
  }
  if (o.object_type === "structure.foundation") {
    const center = list(
        d.center_mm ?? [0, 0, 0],
        "center",
        (v) => num(v, "point"),
        3,
      ) as Vec3,
      rawSize = d.size_mm ?? [1000, 1000, 300];
    const s =
      Array.isArray(rawSize) && rawSize.length === 3
        ? [
            num(rawSize[0], "width"),
            num(rawSize[1], "length"),
            num(rawSize[2], "thickness"),
          ]
        : [1000, 1000, 300];
    const [w, l, t] = s;
    return {
      length: l,
      width: w,
      depth: t,
      start: [center[0], center[1] - l / 2, center[2] - t / 2],
      end: [center[0], center[1] + l / 2, center[2] - t / 2],
    };
  }
  throw new Error(
    "Rebar host must be a beam, column, or foundation; explicit legs can reference a slab",
  );
}
export function decodeRebar(
  raw: Record<string, unknown>,
  p: ProjectDocument,
): RebarModuleData {
  const host_id = text(raw.host_id, "host_id"),
    host = p.objects[host_id];
  if (!host || !host.object_type.startsWith("structure."))
    throw new Error("Rebar needs a structural host");
  const hostParams = resolvedData(p, host).rebar_type;
  const inherited = hostParams ? record(hostParams) : undefined;
  const role = typeof raw.role === "string" ? raw.role : "general";
  const roleParams =
    inherited && inherited[role] ? record(inherited[role]) : inherited;
  const d =
    raw.inherit_host_type === true && roleParams
      ? { ...raw, ...roleParams }
      : raw;
  const data: RebarModuleData = {
    ...placement(d, p),
    host_id,
    mode: choice(d.mode, ["longitudinal", "stirrups", "explicit"], "mode"),
    grade: choice(d.grade, ["SR24", "SD40", "SD50"], "grade"),
    diameter_mm: positive(d.diameter_mm, "diameter_mm"),
    cover_mm: num(d.cover_mm, "cover_mm", 0),
    count: integer(d.count ?? 1, "count"),
    bend_radius_mm: num(d.bend_radius_mm, "bend_radius_mm", 0),
    hook_angle_deg:
      choice(String(d.hook_angle_deg), ["0", "90", "135"], "hook_angle_deg") ===
      "0"
        ? 0
        : (Number(d.hook_angle_deg) as 90 | 135),
    hook_extension_mm:
      typeof d.hook_extension_mm === "number"
        ? num(d.hook_extension_mm, "hook_extension_mm", 0)
        : Number(d.hook_angle_deg) === 90
        ? 12 * positive(d.diameter_mm, "diameter_mm")
        : Number(d.hook_angle_deg) === 135
        ? Math.max(75, 6 * positive(d.diameter_mm, "diameter_mm"))
        : 0,
    lap_mm: num(d.lap_mm, "lap_mm", 0),
    legs_mm: list(d.legs_mm ?? [], "legs_mm", (v) => positive(v, "leg"), 0),
    spacing_zones: list(
      d.spacing_zones ?? [],
      "spacing_zones",
      (v) => {
        const z = record(v);
        const relative =
          z.start_ratio !== undefined || z.end_ratio !== undefined;
        const clear = relative
          ? hostGeometry(p, host_id).length - 2 * num(d.cover_mm, "cover_mm", 0)
          : 1;
        return {
          start_mm: relative
            ? num(z.start_ratio, "zone start ratio", 0, 1) * clear
            : num(z.start_mm, "zone start", 0),
          end_mm: relative
            ? num(z.end_ratio, "zone end ratio", 0, 1) * clear
            : positive(z.end_mm, "zone end"),
          spacing_mm: positive(z.spacing_mm, "spacing"),
        };
      },
      0,
    ),
    inherit_host_type: d.inherit_host_type === true,
  };
  if (data.diameter_mm > 100)
    throw new Error("Rebar diameter exceeds supported range");
  if (data.count > 2000) throw new Error("Rebar count exceeds supported limit");
  if (data.mode === "explicit" && !data.legs_mm.length)
    throw new Error("Explicit bar needs tangent-leg lengths");
  if (data.mode !== "explicit") {
    const h = hostGeometry(p, host_id);
    const hostObj = p.objects[host_id];
    const isFootingX =
      hostObj?.object_type === "structure.foundation" && role === "bottom_x";
    const span = isFootingX ? h.width : h.length;
    if (data.cover_mm * 2 + data.diameter_mm >= Math.min(h.width, h.depth))
      throw new Error("Cover/bar exceeds host section");
    if (span <= 2 * data.cover_mm)
      throw new Error("Cover exceeds host length");
    if (data.mode === "stirrups") {
      if (!data.spacing_zones.length)
        throw new Error("Stirrups require explicit spacing zones");
      let end = -1;
      for (const z of [...data.spacing_zones].sort(
        (a, b) => a.start_mm - b.start_mm,
      )) {
        if (
          z.end_mm <= z.start_mm ||
          z.start_mm < end - 1e-6 ||
          z.end_mm > h.length - 2 * data.cover_mm + 1e-6
        )
          throw new Error("Stirrup zones overlap or exceed clear host length");
        end = z.end_mm;
      }
      if (
        Math.min(h.width, h.depth) - 2 * data.cover_mm - data.diameter_mm <=
        2 * data.bend_radius_mm
      )
        throw new Error("Bend radius exceeds stirrup section");
    }
  }
  data.role = choice(
    role,
    [
      "top",
      "bottom",
      "stirrups",
      "general",
      "main",
      "ties",
      "bottom_x",
      "bottom_y",
      "starter",
    ] as const,
    "rebar role",
  );
  return data;
}
export interface BBSRow {
  object_id: string;
  host_id: string;
  mark: string;
  grade: string;
  diameter_mm: number;
  count: number;
  cut_length_mm: number;
  total_length_m: number;
  mass_kg: number;
  shape: string;
}
export function calculateBBS(p: ProjectDocument, o: SmartObject): BBSRow {
  const d = decodeRebar(resolvedData(p, o), p),
    arc = (d.bend_radius_mm * d.hook_angle_deg * Math.PI) / 180,
    hook = 2 * (arc + d.hook_extension_mm);
  let count = d.count,
    len = 0;
  if (d.mode === "explicit")
    len = d.legs_mm.reduce((a, b) => a + b, 0) + hook + d.lap_mm;
  else {
    const h = hostGeometry(p, d.host_id);
    const hostObj = p.objects[d.host_id];
    const isFootingX =
      hostObj?.object_type === "structure.foundation" && d.role === "bottom_x";
    const span = isFootingX ? h.width : h.length;
    if (d.mode === "longitudinal")
      len = span - 2 * d.cover_mm + hook + d.lap_mm;
    else {
      const w = h.width - 2 * d.cover_mm - d.diameter_mm,
        depth = h.depth - 2 * d.cover_mm - d.diameter_mm,
        r = d.bend_radius_mm;
      len =
        2 * (w - 2 * r) +
        2 * (depth - 2 * r) +
        2 * Math.PI * r +
        hook +
        d.lap_mm;
      const locations = new Set<number>();
      for (const z of d.spacing_zones) {
        const n = Math.floor((z.end_mm - z.start_mm) / z.spacing_mm + 1e-9);
        if (n > 50000) throw new Error("Stirrup count exceeds supported limit");
        for (let i = 0; i <= n; i++)
          locations.add(
            Math.round((z.start_mm + i * z.spacing_mm) * 1e6) / 1e6,
          );
        locations.add(z.end_mm);
      }
      count = locations.size;
    }
  }
  if (count > 2000) throw new Error("Stirrup count exceeds supported limit");
  const total_length_m = (count * len) / 1000,
    mass_kg =
      ((total_length_m * Math.PI * (d.diameter_mm / 1000) ** 2) / 4) * 7850;
  return {
    object_id: o.id,
    host_id: d.host_id,
    mark: d.mark,
    grade: d.grade,
    diameter_mm: d.diameter_mm,
    count,
    cut_length_mm: len,
    total_length_m,
    mass_kg,
    shape: d.mode,
  };
}
export function executeStructureConstructionCommand(
  c: CommandHandlerContext,
): CommandBusResult | undefined {
  if (c.commandName === "ConfigureBeamReinforcement") {
    const host = c.updated.objects[text(c.input.host_id, "host_id")];
    if (host?.object_type !== "structure.beam")
      throw new Error("Beam host required");
    const config = record(c.input.reinforcement, "reinforcement"),
      roles = ["top", "bottom", "stirrups"] as const,
      affected: string[] = [host.id];
    for (const role of roles) {
      const params = record(config[role], role),
        old = Object.values(c.updated.objects).find(
          (o) =>
            o.object_type === "structure.rebar_set" &&
            record(o.module_data).host_id === host.id &&
            record(o.module_data).role === role,
        );
      const suppliedIds = Array.isArray(c.input.bar_set_ids)
        ? c.input.bar_set_ids
        : [];
      const request = {
        ...params,
        id: old?.id ?? suppliedIds[roles.indexOf(role)] ?? crypto.randomUUID(),
        host_id: host.id,
        role,
        mark: String(record(host.module_data).mark) + "-" + role,
        level_id: record(host.module_data).level_id,
        mode: role === "stirrups" ? "stirrups" : "longitudinal",
        created_phase: host.created_phase,
        inherit_host_type: c.input.inherit_host_type !== false,
      };
      const response = domainCommand(
        { ...c, input: request },
        "structure.rebar_set",
        "constructflow.structure",
        decodeRebar,
        { update: !!old, hostFields: ["host_id"] },
      );
      affected.push(...response.result.affected_object_ids);
    }
    return {
      result: {
        status: "success",
        command_id: c.command_id,
        command_name: c.commandName,
        affected_object_ids: affected,
        updated_object_ids: affected,
      },
      updatedProject: c.updated,
      emittedEnvelope: {
        ...c.envelope,
        input: { ...c.input, bar_set_ids: affected.slice(1) },
      },
    };
  }
  if (c.commandName === "ConfigureColumnReinforcement") {
    const host = c.updated.objects[text(c.input.host_id, "host_id")];
    if (host?.object_type !== "structure.column")
      throw new Error("Column host required");
    const config = record(c.input.reinforcement, "reinforcement"),
      roles = ["main", "ties"] as const,
      affected: string[] = [host.id];
    for (const role of roles) {
      if (!config[role]) continue;
      const params = record(config[role], role),
        old = Object.values(c.updated.objects).find(
          (o) =>
            o.object_type === "structure.rebar_set" &&
            record(o.module_data).host_id === host.id &&
            record(o.module_data).role === role,
        );
      const suppliedIds = Array.isArray(c.input.bar_set_ids)
        ? c.input.bar_set_ids
        : [];
      const request = {
        ...params,
        id: old?.id ?? suppliedIds[roles.indexOf(role)] ?? crypto.randomUUID(),
        host_id: host.id,
        role,
        mark: String(record(host.module_data).mark) + "-" + role,
        level_id: record(host.module_data).level_id,
        mode: role === "ties" ? "stirrups" : "longitudinal",
        created_phase: host.created_phase,
        inherit_host_type: c.input.inherit_host_type !== false,
      };
      const response = domainCommand(
        { ...c, input: request },
        "structure.rebar_set",
        "constructflow.structure",
        decodeRebar,
        { update: !!old, hostFields: ["host_id"] },
      );
      affected.push(...response.result.affected_object_ids);
    }
    return {
      result: {
        status: "success",
        command_id: c.command_id,
        command_name: c.commandName,
        affected_object_ids: affected,
        updated_object_ids: affected,
      },
      updatedProject: c.updated,
      emittedEnvelope: {
        ...c.envelope,
        input: { ...c.input, bar_set_ids: affected.slice(1) },
      },
    };
  }
  if (c.commandName === "ConfigureFoundationReinforcement") {
    const host = c.updated.objects[text(c.input.host_id, "host_id")];
    if (host?.object_type !== "structure.foundation")
      throw new Error("Foundation host required");
    const config = record(c.input.reinforcement, "reinforcement"),
      roles = ["bottom_x", "bottom_y"] as const,
      affected: string[] = [host.id];
    for (const role of roles) {
      if (!config[role]) continue;
      const params = record(config[role], role),
        old = Object.values(c.updated.objects).find(
          (o) =>
            o.object_type === "structure.rebar_set" &&
            record(o.module_data).host_id === host.id &&
            record(o.module_data).role === role,
        );
      const suppliedIds = Array.isArray(c.input.bar_set_ids)
        ? c.input.bar_set_ids
        : [];
      const request = {
        ...params,
        id: old?.id ?? suppliedIds[roles.indexOf(role)] ?? crypto.randomUUID(),
        host_id: host.id,
        role,
        mark: String(record(host.module_data).mark) + "-" + role,
        level_id: record(host.module_data).level_id,
        mode: "longitudinal",
        created_phase: host.created_phase,
        inherit_host_type: c.input.inherit_host_type !== false,
      };
      const response = domainCommand(
        { ...c, input: request },
        "structure.rebar_set",
        "constructflow.structure",
        decodeRebar,
        { update: !!old, hostFields: ["host_id"] },
      );
      affected.push(...response.result.affected_object_ids);
    }
    return {
      result: {
        status: "success",
        command_id: c.command_id,
        command_name: c.commandName,
        affected_object_ids: affected,
        updated_object_ids: affected,
      },
      updatedProject: c.updated,
      emittedEnvelope: {
        ...c.envelope,
        input: { ...c.input, bar_set_ids: affected.slice(1) },
      },
    };
  }
  if (["CreateSlab", "UpdateSlab"].includes(c.commandName))
    return domainCommand(
      c,
      "structure.slab",
      "constructflow.structure",
      decodeSlab,
      { update: c.commandName === "UpdateSlab" },
    );
  if (["AssignRebarSet", "ModifyRebarSet"].includes(c.commandName))
    return domainCommand(
      c,
      "structure.rebar_set",
      "constructflow.structure",
      decodeRebar,
      { update: c.commandName === "ModifyRebarSet", hostFields: ["host_id"] },
    );
  if (c.commandName === "SetBeamDrop") {
    const o = c.updated.objects[text(c.input.id, "id")];
    if (o?.object_type !== "structure.beam") throw new Error("Beam is missing");
    const drop = num(c.input.drop_mm, "drop_mm", 0);
    c.updated.objects[o.id] = {
      ...o,
      schema_version: 2,
      module_data: { ...record(o.module_data), drop_mm: drop },
      updated_at: c.now,
      revision_meta: {
        ...o.revision_meta,
        dirty_quantity: true,
        dirty_drawing: true,
      },
    };
    return {
      result: {
        status: "success",
        command_id: c.command_id,
        command_name: c.commandName,
        affected_object_ids: [o.id],
        updated_object_ids: [o.id],
      },
      updatedProject: c.updated,
      emittedEnvelope: c.envelope,
    };
  }
  return undefined;
}
export function structureOutputs(p: ProjectDocument): DomainOutput[] {
  const results: DomainOutput[] = [];
  for (const o of Object.values(p.objects)) {
    if (o.object_type === "structure.slab") {
      const d = decodeSlab(resolvedData(p, o), p),
        out = output(o, d),
        area = Math.max(0, (Math.abs(signedArea(d.boundary_mm)) - (d.voids_mm ?? []).reduce((sum, ring) => sum + Math.abs(signedArea(ring)), 0)) / 1e6);
      out.meshes = extrude(
        d.boundary_mm,
        d.elevation_mm - d.thickness_mm,
        d.elevation_mm + d.topping_mm,
      );
      out.paths = [d.boundary_mm, ...(d.voids_mm ?? [])].map(ring => ring.map((v) => [...v, d.elevation_mm] as Vec3));
      out.quantities = [
        {
          classification: "slab.concrete",
          description: d.mark + " slab concrete",
          quantity: (area * d.thickness_mm) / 1000,
          unit: "m3",
          formula: "polygon_area * thickness / 1e9",
          material: d.material,
        },
        {
          classification: "slab.topping",
          description: d.mark + " topping",
          quantity: (area * d.topping_mm) / 1000,
          unit: "m3",
          formula: "polygon_area * topping / 1e9",
          material: "concrete",
        },
        {
          classification: "slab.area",
          description: d.mark + " slab area",
          quantity: area,
          unit: "m2",
          formula: "shoelace / 1e6",
          material: d.material,
        },
      ];
      out.schedule = {
        System: d.slab_system,
        Thickness_m: d.thickness_mm / 1000,
        Topping_m: d.topping_mm / 1000,
        Area_m2: area,
      };
      if (d.slope_ratio) {
        const a = ((d.drain_direction_deg ?? 0) * Math.PI) / 180,
          n = [Math.cos(a), Math.sin(a)],
          max = Math.max(
            ...d.boundary_mm.map((v) => v[0] * n[0] + v[1] * n[1]),
          );
        const sloped = (v: Vec3): Vec3 => [
          v[0],
          v[1],
          v[2] + d.slope_ratio! * (max - v[0] * n[0] - v[1] * n[1]),
        ];
        out.meshes = out.meshes.map((t) => t.map(sloped) as [Vec3, Vec3, Vec3]);
        out.paths = out.paths.map((path) => path.map(sloped));
        out.schedule.Slope = d.slope_ratio;
        out.schedule.Drain_direction_deg = d.drain_direction_deg ?? 0;
      }
      results.push(out);
    }
    if (o.object_type === "structure.rebar_set") {
      const d = decodeRebar(resolvedData(p, o), p),
        bbs = calculateBBS(p, o),
        out = output(o, d);
      out.quantities = [
        {
          classification: "rebar.mass",
          description: d.mark + " " + d.grade,
          quantity: bbs.mass_kg,
          unit: "kg",
          formula: "centerline_length * pi * (diameter_m)^2 / 4 * 7850",
        },
      ];
      out.schedule = {
        Host: d.host_id,
        Grade: d.grade,
        Diameter_mm: d.diameter_mm,
        Count: bbs.count,
        Cut_length_m: bbs.cut_length_mm / 1000,
        Mass_kg: bbs.mass_kg,
        Shape: d.mode,
      };
      out.warnings = [
        "Reinforcement is detailing input, not structural design approval",
      ];
      if (d.mode !== "explicit") {
        const h = hostGeometry(p, d.host_id);
        const hostObj = p.objects[d.host_id];
        const isFooting = hostObj?.object_type === "structure.foundation";
        const isColumn = hostObj?.object_type === "structure.column";
        if (isFooting) {
          const center = h.start.map((v, i) => (v + h.end[i]) / 2) as Vec3;
          const halfW = h.width / 2 - d.cover_mm - d.diameter_mm / 2;
          const halfL = h.length / 2 - d.cover_mm - d.diameter_mm / 2;
          const zBottom = center[2] + d.cover_mm + d.diameter_mm / 2;
          if (d.role === "bottom_x") {
            out.paths = Array.from({ length: d.count }, (_, i) => {
              const y =
                d.count === 1
                  ? center[1]
                  : center[1] - halfL + (2 * halfL * i) / (d.count - 1);
              return [
                [center[0] - halfW, y, zBottom],
                [center[0] + halfW, y, zBottom],
              ];
            });
          } else {
            out.paths = Array.from({ length: d.count }, (_, i) => {
              const x =
                d.count === 1
                  ? center[0]
                  : center[0] - halfW + (2 * halfW * i) / (d.count - 1);
              return [
                [x, center[1] - halfL, zBottom],
                [x, center[1] + halfL, zBottom],
              ];
            });
          }
        } else {
          // Bar locations are derived in the host's local section frame.
          const axis = h.end.map((v, i) => (v - h.start[i]) / h.length) as Vec3;
          const horizontal = Math.hypot(axis[0], axis[1]);
          const u: Vec3 =
            horizontal > 1e-8
              ? [-axis[1] / horizontal, axis[0] / horizontal, 0]
              : [1, 0, 0];
          const v: Vec3 = [
            axis[1] * u[2] - axis[2] * u[1],
            axis[2] * u[0] - axis[0] * u[2],
            axis[0] * u[1] - axis[1] * u[0],
          ];
          const at = (along: number, x: number, y: number): Vec3 =>
            h.start.map(
              (n, i) => n + axis[i] * along + u[i] * x + v[i] * y,
            ) as Vec3;
          const halfW = h.width / 2 - d.cover_mm - d.diameter_mm / 2,
            halfD = h.depth / 2 - d.cover_mm - d.diameter_mm / 2;
          if (d.mode === "longitudinal") {
            if (d.count > 2000)
              throw new Error("Bar rendering count exceeds supported limit");
            if (
              isColumn &&
              (d.role === "main" || d.role === "general") &&
              d.count === 4
            ) {
              const corners = [
                [-halfW, -halfD],
                [halfW, -halfD],
                [halfW, halfD],
                [-halfW, halfD],
              ];
              out.paths = corners.map(([x, y]) => [
                at(d.cover_mm, x, y),
                at(h.length - d.cover_mm, x, y),
              ]);
            } else {
              out.paths = Array.from({ length: d.count }, (_, i) => {
                const x =
                    d.count === 1 ? 0 : -halfW + (2 * halfW * i) / (d.count - 1),
                  y =
                    d.role === "bottom" ||
                    d.role === "bottom_x" ||
                    d.role === "bottom_y"
                      ? -halfD
                      : d.role === "top"
                      ? halfD
                      : 0;
                return [at(d.cover_mm, x, y), at(h.length - d.cover_mm, x, y)];
              });
            }
          } else {
          const locations = new Set<number>();
          for (const z of d.spacing_zones) {
            for (
              let n = 0;
              n <= Math.floor((z.end_mm - z.start_mm) / z.spacing_mm + 1e-9);
              n++
            )
              locations.add(
                Math.round((z.start_mm + n * z.spacing_mm) * 1e6) / 1e6,
              );
            locations.add(z.end_mm);
          }
          if (locations.size > 2000)
            throw new Error("Stirrup rendering count exceeds supported limit");
          const r = d.bend_radius_mm;
          out.paths = [...locations]
            .sort((a, b) => a - b)
            .map((t) => {
              if (r === 0)
                return [
                  [halfW, halfD],
                  [-halfW, halfD],
                  [-halfW, -halfD],
                  [halfW, -halfD],
                  [halfW, halfD],
                ].map(([x, y]) => at(t + d.cover_mm, x, y));
              const points: Vec3[] = [];
              for (const [cx, cy, start] of [
                [halfW - r, halfD - r, 0],
                [-halfW + r, halfD - r, 90],
                [-halfW + r, -halfD + r, 180],
                [halfW - r, -halfD + r, 270],
              ])
                for (let n = 0; n <= 6; n++) {
                  const a = ((start + n * 15) * Math.PI) / 180;
                  points.push(
                    at(
                      t + d.cover_mm,
                      cx + r * Math.cos(a),
                      cy + r * Math.sin(a),
                    ),
                  );
                }
              return [...points, points[0]];
            });
        }
      }
      }
      results.push(out);
    }
  }
  return results;
}
export function validateStructureConstruction(p: ProjectDocument): void {
  for (const o of Object.values(p.objects)) {
    if (o.object_type === "structure.slab") decodeSlab(resolvedData(p, o), p);
    if (o.object_type === "structure.rebar_set") calculateBBS(p, o);
  }
}

/** Catalog-owned bars are materialized with deterministic child UUIDs in the same transaction. */
export function reconcileTypeReinforcement(c: CommandHandlerContext): string[] {
  const affected: string[] = [];
  for (const host of Object.values(c.updated.objects)) {
    if (host.object_type === "structure.beam") {
      const hd = resolvedData(c.updated, host),
        config = hd.rebar_type;
      if (!config) continue;
      for (const role of ["top", "bottom", "stirrups"] as const) {
        const raw = record(config)[role];
        if (!raw) continue;
        const old = Object.values(c.updated.objects).find(
          (o) =>
            o.object_type === "structure.rebar_set" &&
            record(o.module_data).host_id === host.id &&
            record(o.module_data).role === role,
        );
        if (old && record(old.module_data).inherit_host_type !== true) continue;
        const id =
            old?.id ?? legacyTypeUuid("structure.rebar_set", host.id, role),
          input = {
            ...record(raw),
            id,
            host_id: host.id,
            role,
            mark: String(hd.mark) + "-" + role,
            level_id: hd.level_id,
            mode: role === "stirrups" ? "stirrups" : "longitudinal",
            inherit_host_type: true,
            created_phase: host.created_phase,
          };
        const decoded = decodeRebar(input, c.updated);
        if (
          old &&
          JSON.stringify(record(old.module_data)) === JSON.stringify(decoded) &&
          old.created_phase === host.created_phase &&
          old.removed_phase === host.removed_phase
        )
          continue;
        const response = domainCommand(
          { ...c, input },
          "structure.rebar_set",
          "constructflow.structure",
          decodeRebar,
          { update: !!old, hostFields: ["host_id"] },
        );
        c.updated.objects[id].created_phase = host.created_phase;
        c.updated.objects[id].removed_phase = host.removed_phase;
        affected.push(...response.result.affected_object_ids);
      }
    }
    if (host.object_type === "structure.column") {
      const hd = resolvedData(c.updated, host),
        config = hd.rebar_type;
      if (!config) continue;
      for (const role of ["main", "ties"] as const) {
        const raw = record(config)[role];
        if (!raw) continue;
        const old = Object.values(c.updated.objects).find(
          (o) =>
            o.object_type === "structure.rebar_set" &&
            record(o.module_data).host_id === host.id &&
            record(o.module_data).role === role,
        );
        if (old && record(old.module_data).inherit_host_type !== true) continue;
        const id =
            old?.id ?? legacyTypeUuid("structure.rebar_set", host.id, role),
          input = {
            ...record(raw),
            id,
            host_id: host.id,
            role,
            mark: String(hd.mark) + "-" + role,
            level_id: hd.level_id,
            mode: role === "ties" ? "stirrups" : "longitudinal",
            inherit_host_type: true,
            created_phase: host.created_phase,
          };
        const decoded = decodeRebar(input, c.updated);
        if (
          old &&
          JSON.stringify(record(old.module_data)) === JSON.stringify(decoded) &&
          old.created_phase === host.created_phase &&
          old.removed_phase === host.removed_phase
        )
          continue;
        const response = domainCommand(
          { ...c, input },
          "structure.rebar_set",
          "constructflow.structure",
          decodeRebar,
          { update: !!old, hostFields: ["host_id"] },
        );
        c.updated.objects[id].created_phase = host.created_phase;
        c.updated.objects[id].removed_phase = host.removed_phase;
        affected.push(...response.result.affected_object_ids);
      }
    }
    if (host.object_type === "structure.foundation") {
      const hd = resolvedData(c.updated, host),
        config = hd.rebar_type;
      if (!config) continue;
      for (const role of ["bottom_x", "bottom_y"] as const) {
        const raw = record(config)[role];
        if (!raw) continue;
        const old = Object.values(c.updated.objects).find(
          (o) =>
            o.object_type === "structure.rebar_set" &&
            record(o.module_data).host_id === host.id &&
            record(o.module_data).role === role,
        );
        if (old && record(old.module_data).inherit_host_type !== true) continue;
        const id =
            old?.id ?? legacyTypeUuid("structure.rebar_set", host.id, role),
          input = {
            ...record(raw),
            id,
            host_id: host.id,
            role,
            mark: String(hd.mark) + "-" + role,
            level_id: hd.level_id,
            mode: "longitudinal",
            inherit_host_type: true,
            created_phase: host.created_phase,
          };
        const decoded = decodeRebar(input, c.updated);
        if (
          old &&
          JSON.stringify(record(old.module_data)) === JSON.stringify(decoded) &&
          old.created_phase === host.created_phase &&
          old.removed_phase === host.removed_phase
        )
          continue;
        const response = domainCommand(
          { ...c, input },
          "structure.rebar_set",
          "constructflow.structure",
          decodeRebar,
          { update: !!old, hostFields: ["host_id"] },
        );
        c.updated.objects[id].created_phase = host.created_phase;
        c.updated.objects[id].removed_phase = host.removed_phase;
        affected.push(...response.result.affected_object_ids);
      }
    }
  }
  return affected;
}
