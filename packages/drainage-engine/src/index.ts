import type {
  ProjectDocument,
  PipeRouteModuleData,
  ManholeModuleData,
  SepticModuleData,
} from "@constructflow/project-model";
import type {
  CommandHandlerContext,
  CommandBusResult,
} from "@constructflow/command-schema";
import { length3, box, type Vec3 } from "@constructflow/geometry-kernel";
import {
  domainCommand,
  placement,
  resolvedData,
  output,
  vec3,
  list,
  positive,
  num,
  integer,
  text,
  choice,
  record,
  type DomainOutput,
} from "@constructflow/module-sdk";
export function decodeManhole(
  d: Record<string, unknown>,
  p: ProjectDocument,
): ManholeModuleData {
  const size_mm = vec3(d.size_mm, "size");
  if (size_mm.some((v) => v <= 0))
    throw new Error("Manhole dimensions must be positive");
  return {
    ...placement(d, p),
    location_mm: vec3(d.location_mm, "location"),
    size_mm,
    invert_mm: d.invert_mm === null ? null : num(d.invert_mm, "invert"),
    system: choice(d.system, ["waste", "soil", "rainwater"], "system"),
  };
}
export function decodePipe(
  d: Record<string, unknown>,
  p: ProjectDocument,
): PipeRouteModuleData {
  const system = choice(
    d.system,
    ["waste", "soil", "rainwater", "vent", "cold_water", "hot_water"],
    "system",
  );
  const nodes_mm = list(d.nodes_mm, "nodes", (v) => vec3(v, "node"), 2),
    start_node_id =
      typeof d.start_node_id === "string" ? d.start_node_id : undefined,
    end_node_id = typeof d.end_node_id === "string" ? d.end_node_id : undefined;
  let start_invert_mm =
      d.start_invert_mm == null ? null : num(d.start_invert_mm, "start invert"),
    end_invert_mm =
      d.end_invert_mm == null ? null : num(d.end_invert_mm, "end invert");
  for (const [id, index, key] of [
    [start_node_id, 0, "start"],
    [end_node_id, nodes_mm.length - 1, "end"],
  ] as const) {
    if (!id) continue;
    const host = p.objects[id];
    if (
      !host ||
      !["drainage.manhole", "drainage.septic_tank"].includes(host.object_type)
    )
      throw new Error("Pipe endpoint requires a compatible network node");
    const hd = resolvedData(p, host);
    if (
      host.object_type === "drainage.manhole" &&
      system !== "vent" &&
      hd.system !== system
    )
      throw new Error("Pipe/node systems are incompatible");
    if (
      host.object_type === "drainage.septic_tank" &&
      !["soil", "waste", "vent"].includes(system)
    )
      throw new Error("Rainwater cannot terminate in septic");
    const xyz = vec3(hd.location_mm, "endpoint");
    nodes_mm[index] = [...xyz];
    if (host.object_type === "drainage.manhole") {
      const IL =
          hd.invert_mm === null ? null : num(hd.invert_mm, "node invert"),
        declared = key === "start" ? start_invert_mm : end_invert_mm;
      if (IL !== null && declared !== null && Math.abs(IL - declared) > 1e-6)
        throw new Error(
          "Declared pipe invert conflicts with connected manhole",
        );
      if (key === "start") start_invert_mm = IL;
      else end_invert_mm = IL;
    }
  }
  if (start_node_id && start_node_id === end_node_id)
    throw new Error("Pipe endpoints cannot be the same node");
  const gravity = ["waste", "soil", "rainwater"].includes(system),
    min = num(d.minimum_slope_ratio ?? 0, "minimum slope", 0);
  let horizontal = 0;
  nodes_mm.slice(1).forEach((v, i) => {
    if (length3(v, nodes_mm[i]) < 1e-7)
      throw new Error("Pipe has duplicate adjacent node");
    horizontal += Math.hypot(v[0] - nodes_mm[i][0], v[1] - nodes_mm[i][1]);
  });
  if (gravity && horizontal < 1e-7)
    throw new Error("Gravity route requires horizontal run");
  if (gravity && start_invert_mm !== null && end_invert_mm !== null) {
    if ((start_invert_mm - end_invert_mm) / horizontal < min - 1e-9)
      throw new Error(
        "Known endpoint inverts violate the configured minimum slope",
      );
    let distance = 0;
    nodes_mm[0][2] = start_invert_mm;
    for (let i = 1; i < nodes_mm.length; i++) {
      distance += Math.hypot(
        nodes_mm[i][0] - nodes_mm[i - 1][0],
        nodes_mm[i][1] - nodes_mm[i - 1][1],
      );
      nodes_mm[i][2] =
        start_invert_mm +
        ((end_invert_mm - start_invert_mm) * distance) / horizontal;
    }
  }
  return {
    ...placement(d, p),
    system,
    nodes_mm,
    diameter_mm: positive(d.diameter_mm, "diameter"),
    start_node_id,
    end_node_id,
    start_invert_mm,
    end_invert_mm,
    minimum_slope_ratio: min,
    material: text(d.material, "material"),
  };
}
export function decodeSeptic(
  d: Record<string, unknown>,
  p: ProjectDocument,
): SepticModuleData {
  const people = integer(d.people, "people"),
    litres_per_person = positive(d.litres_per_person, "litres/person"),
    reserve_ratio = num(d.reserve_ratio, "reserve", 0),
    capacity_litres = positive(d.capacity_litres, "capacity");
  if (capacity_litres + 1e-7 < people * litres_per_person * (1 + reserve_ratio))
    throw new Error("Septic capacity is smaller than supplied PE sizing rule");
  return {
    ...placement(d, p),
    location_mm: vec3(d.location_mm, "location"),
    people,
    litres_per_person,
    reserve_ratio,
    capacity_litres,
    rule_source: text(d.rule_source, "verified sizing rule source"),
  };
}
export function executeDrainageCommand(
  c: CommandHandlerContext,
): CommandBusResult | undefined {
  if (
    ["CreatePipeRoute", "EditPipeRoute"].includes(c.commandName) &&
    !["cold_water", "hot_water"].includes(
      String(
        c.input.system ??
          (c.updated.objects[String(c.input.id)]
            ? record(c.updated.objects[String(c.input.id)].module_data).system
            : ""),
      ),
    )
  )
    return domainCommand(
      c,
      "drainage.pipe_route",
      "constructflow.drainage",
      decodePipe,
      {
        update: c.commandName === "EditPipeRoute",
        hostFields: ["start_node_id", "end_node_id"],
      },
    );
  if (["PlaceManhole", "UpdateManhole"].includes(c.commandName)) {
    const response = domainCommand(
      c,
      "drainage.manhole",
      "constructflow.drainage",
      decodeManhole,
      { update: c.commandName === "UpdateManhole" },
    );
    for (const o of Object.values(c.updated.objects))
      if (
        o.object_type === "drainage.pipe_route" &&
        o.host_refs.includes(String(response.emittedEnvelope?.input.id))
      ) {
        const next = decodePipe(
          {
            ...resolvedData(c.updated, o),
            start_invert_mm: null,
            end_invert_mm: null,
          },
          c.updated,
        );
        c.updated.objects[o.id] = {
          ...o,
          module_data: next as unknown as Record<string, unknown>,
          updated_at: c.now,
          revision_meta: {
            ...o.revision_meta,
            dirty_quantity: true,
            dirty_drawing: true,
          },
        };
        response.result.affected_object_ids.push(o.id);
      }
    return response;
  }
  if (["CreateSepticTank", "UpdateSepticTank"].includes(c.commandName))
    return domainCommand(
      c,
      "drainage.septic_tank",
      "constructflow.drainage",
      decodeSeptic,
      { update: c.commandName === "UpdateSepticTank" },
    );
  return undefined;
}
export function drainageOutputs(p: ProjectDocument): DomainOutput[] {
  return Object.values(p.objects)
    .filter((o) => o.object_type.startsWith("drainage."))
    .flatMap((o) => {
      const raw = resolvedData(p, o);
      if (o.object_type === "drainage.pipe_route") {
        const d = decodePipe(raw, p),
          out = output(o, d),
          len =
            d.nodes_mm
              .slice(1)
              .reduce((s, v, i) => s + length3(v, d.nodes_mm[i]), 0) / 1000;
        out.paths = [d.nodes_mm];
        out.quantities = [
          {
            classification: "pipe." + d.system,
            description: d.mark + " " + d.system + " " + d.diameter_mm + "mm",
            quantity: len,
            unit: "m",
            formula: "sum semantic route segment length / 1000",
            material: d.material,
          },
        ];
        const horizontal = d.nodes_mm
          .slice(1)
          .reduce(
            (s, v, i) =>
              s + Math.hypot(v[0] - d.nodes_mm[i][0], v[1] - d.nodes_mm[i][1]),
            0,
          );
        out.schedule = {
          System: d.system,
          Diameter_mm: d.diameter_mm,
          Length_m: len,
          Start_IL:
            d.start_invert_mm === null ? "UNKNOWN" : d.start_invert_mm / 1000,
          End_IL: d.end_invert_mm === null ? "UNKNOWN" : d.end_invert_mm / 1000,
          Slope:
            horizontal <= 1e-7
              ? "NTS"
              : d.start_invert_mm === null || d.end_invert_mm === null
                ? "UNKNOWN"
                : (d.start_invert_mm - d.end_invert_mm) / horizontal,
        };
        if (
          ["waste", "soil", "rainwater"].includes(d.system) &&
          (d.start_invert_mm === null || d.end_invert_mm === null)
        )
          out.warnings.push(
            "Insufficient invert data — Verify On Site; slope is not passing",
          );
        if (!d.start_node_id || !d.end_node_id)
          out.warnings.push(
            "Route has unconnected endpoint; destination must be verified",
          );
        return [out];
      }
      if (o.object_type === "drainage.manhole") {
        const d = decodeManhole(raw, p),
          out = output(o, d);
        out.meshes = box(d.location_mm, d.size_mm);
        out.quantities = [
          {
            classification: "manhole.count",
            description: d.mark,
            quantity: 1,
            unit: "pcs",
            formula: "explicit semantic manhole count",
          },
        ];
        out.schedule = {
          System: d.system,
          Invert_m: d.invert_mm === null ? "UNKNOWN" : d.invert_mm / 1000,
          Depth_m: d.size_mm[2] / 1000,
        };
        if (d.invert_mm === null)
          out.warnings.push("Unknown manhole invert — Verify On Site");
        return [out];
      }
      if (o.object_type === "drainage.septic_tank") {
        const d = decodeSeptic(raw, p),
          out = output(o, d);
        out.quantities = [
          {
            classification: "septic.count",
            description: d.mark + " " + d.capacity_litres + "L",
            quantity: 1,
            unit: "pcs",
            formula: "explicit sized tank count",
          },
        ];
        out.schedule = {
          People: d.people,
          Required_L: d.people * d.litres_per_person * (1 + d.reserve_ratio),
          Selected_L: d.capacity_litres,
          Rule: d.rule_source,
        };
        return [out];
      }
      return [];
    });
}
export function validateDrainage(p: ProjectDocument): void {
  drainageOutputs(p);
  const edges = new Map<string, string[]>();
  for (const o of Object.values(p.objects))
    if (o.object_type === "drainage.pipe_route" && o.removed_phase === null) {
      const d = decodePipe(resolvedData(p, o), p);
      if (
        d.start_node_id &&
        d.end_node_id &&
        ["soil", "waste", "rainwater"].includes(d.system)
      )
        edges.set(d.start_node_id, [
          ...(edges.get(d.start_node_id) ?? []),
          d.end_node_id,
        ]);
    }
  const visiting = new Set<string>(),
    visited = new Set<string>(),
    visit = (node: string) => {
      if (visiting.has(node))
        throw new Error("Gravity drainage network contains a directed cycle");
      if (visited.has(node)) return;
      visiting.add(node);
      for (const target of edges.get(node) ?? []) visit(target);
      visiting.delete(node);
      visited.add(node);
    };
  for (const node of edges.keys()) visit(node);
}
