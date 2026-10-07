import type {
  ProjectDocument,
  PumpBypassModuleData,
  PipeRouteModuleData,
} from "@constructflow/project-model";
import type {
  CommandHandlerContext,
  CommandBusResult,
} from "@constructflow/command-schema";
import { box, length3 } from "@constructflow/geometry-kernel";
import {
  domainCommand,
  placement,
  resolvedData,
  record,
  output,
  vec3,
  num,
  positive,
  choice,
  list,
  text,
  type DomainOutput,
} from "@constructflow/module-sdk";
export function decodeBypass(
  d: Record<string, unknown>,
  p: ProjectDocument,
): PumpBypassModuleData {
  const mode = choice(d.mode, ["pump", "bypass", "isolated"], "mode"),
    v = record(d.valve_states, "valve states");
  if ([v.inlet, v.outlet, v.bypass].some((x) => typeof x !== "boolean"))
    throw new Error("Valve states must be boolean");
  const expected =
    mode === "pump"
      ? [true, true, false]
      : mode === "bypass"
        ? [false, false, true]
        : [false, false, false];
  if ([v.inlet, v.outlet, v.bypass].some((x, i) => x !== expected[i]))
    throw new Error(
      "Valve states conflict with selected pump/bypass/isolation mode",
    );
  return {
    ...placement(d, p),
    location_mm: vec3(d.location_mm, "location"),
    span_mm: positive(d.span_mm, "span"),
    diameter_mm: positive(d.diameter_mm, "diameter"),
    mode,
    valve_states: {
      inlet: v.inlet as boolean,
      outlet: v.outlet as boolean,
      bypass: v.bypass as boolean,
    },
  };
}
export function decodeWater(
  d: Record<string, unknown>,
  p: ProjectDocument,
): PipeRouteModuleData {
  const nodes_mm = list(d.nodes_mm, "nodes", (v) => vec3(v, "node"), 2);
  for (let i = 1; i < nodes_mm.length; i++)
    if (length3(nodes_mm[i - 1], nodes_mm[i]) < 1e-7)
      throw new Error("Water route has zero-length segment");
  const source =
      typeof d.start_node_id === "string" ? d.start_node_id : undefined,
    destination = typeof d.end_node_id === "string" ? d.end_node_id : undefined;
  for (const id of [source, destination])
    if (id && p.objects[id]?.owner_module !== "constructflow.plumbing")
      throw new Error(
        "Water endpoint must expose a plumbing source/destination",
      );
  return {
    ...placement(d, p),
    nodes_mm,
    system: choice(d.system, ["cold_water", "hot_water"], "system"),
    diameter_mm: positive(d.diameter_mm, "diameter"),
    material: text(d.material, "material"),
    start_node_id: source,
    end_node_id: destination,
    start_invert_mm: null,
    end_invert_mm: null,
    minimum_slope_ratio: 0,
  };
}
export function bypassTopology(d: PumpBypassModuleData) {
  return {
    source: "IN",
    destination: "OUT",
    branches: [
      ["IN", "inlet_valve", "pump", "check_valve", "outlet_valve", "OUT"],
      ["IN", "bypass_valve", "OUT"],
    ],
    valves: d.valve_states,
    check_direction: "pump_to_outlet",
  };
}
export function executePlumbingCommand(
  c: CommandHandlerContext,
): CommandBusResult | undefined {
  if (["CreatePumpBypass", "UpdatePumpBypass"].includes(c.commandName))
    return domainCommand(
      c,
      "plumbing.pump_bypass",
      "constructflow.plumbing",
      decodeBypass,
      { update: c.commandName === "UpdatePumpBypass" },
    );
  if (
    ["CreatePipeRoute", "EditPipeRoute"].includes(c.commandName) &&
    ["cold_water", "hot_water"].includes(
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
      "plumbing.pipe_route",
      "constructflow.plumbing",
      decodeWater,
      {
        update: c.commandName === "EditPipeRoute",
        hostFields: ["start_node_id", "end_node_id"],
      },
    );
  return undefined;
}
export function plumbingOutputs(p: ProjectDocument): DomainOutput[] {
  return Object.values(p.objects)
    .filter((o) => o.owner_module === "constructflow.plumbing")
    .flatMap((o) => {
      if (o.object_type === "plumbing.pump_bypass") {
        const d = decodeBypass(resolvedData(p, o), p),
          out = output(o, d),
          [x, y, z] = d.location_mm,
          L = d.span_mm;
        out.meshes = box([x + L * 0.4, y, z], [L * 0.2, L * 0.25, L * 0.3]);
        out.paths = [
          [
            [x, y, z],
            [x + L, y, z],
          ],
          [
            [x, y, z],
            [x, y + L * 0.4, z],
            [x + L, y + L * 0.4, z],
            [x + L, y, z],
          ],
        ];
        for (const [vx, vy] of [
          [x + L * 0.2, y],
          [x + L * 0.65, y],
          [x + L * 0.8, y],
          [x + L * 0.5, y + L * 0.4],
        ])
          out.paths.push([
            [vx - 50, vy, z],
            [vx, vy + 50, z],
            [vx + 50, vy, z],
            [vx, vy - 50, z],
            [vx - 50, vy, z],
          ]);
        out.quantities = [
          {
            classification: "pump.count",
            description: d.mark + " pump",
            quantity: 1,
            unit: "pcs",
            formula: "explicit pump assembly count",
          },
          {
            classification: "valve.count",
            description: d.mark + " isolating/bypass valves",
            quantity: 3,
            unit: "pcs",
            formula: "three explicit valve roles",
          },
          {
            classification: "check_valve.count",
            description: d.mark + " check valve",
            quantity: 1,
            unit: "pcs",
            formula: "explicit directional check role",
          },
        ];
        out.schedule = {
          Mode: d.mode,
          Inlet: d.valve_states.inlet ? "OPEN" : "CLOSED",
          Outlet: d.valve_states.outlet ? "OPEN" : "CLOSED",
          Bypass: d.valve_states.bypass ? "OPEN" : "CLOSED",
          Check: "pump → outlet",
        };
        return [out];
      }
      if (o.object_type === "plumbing.pipe_route") {
        const d = decodeWater(resolvedData(p, o), p),
          out = output(o, d),
          L =
            d.nodes_mm
              .slice(1)
              .reduce((s, v, i) => s + length3(v, d.nodes_mm[i]), 0) / 1000;
        out.paths = [d.nodes_mm];
        out.quantities = [
          {
            classification: "water_pipe.length",
            description: d.mark + " " + d.system,
            quantity: L,
            unit: "m",
            formula: "semantic route centerline length / 1000",
            material: d.material,
          },
        ];
        out.schedule = {
          System: d.system,
          Diameter_mm: d.diameter_mm,
          Length_m: L,
        };
        if (!d.start_node_id || !d.end_node_id)
          out.warnings.push("Water source/destination is unconnected");
        return [out];
      }
      return [];
    });
}
export function validatePlumbing(p: ProjectDocument): void {
  plumbingOutputs(p);
}
