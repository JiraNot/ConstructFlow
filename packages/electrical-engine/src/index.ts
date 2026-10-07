import type {
  ProjectDocument,
  ElectricalFixtureModuleData,
  CircuitModuleData,
  LEDModuleData,
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
  output,
  vec3,
  list,
  positive,
  num,
  choice,
  text,
  type DomainOutput,
} from "@constructflow/module-sdk";
export function decodeFixture(
  d: Record<string, unknown>,
  p: ProjectDocument,
): ElectricalFixtureModuleData {
  const controlled_ids = list(
      d.controlled_ids ?? [],
      "controlled_ids",
      (v) => text(v, "load id"),
      0,
    ),
    kind = choice(
      d.kind,
      ["light", "switch", "outlet", "panel"],
      "fixture kind",
    );
  for (const id of controlled_ids)
    if (
      p.objects[id]?.object_type !== "electrical.fixture" ||
      resolvedData(p, p.objects[id]).kind !== "light"
    )
      throw new Error("Switch target must be a light Smart Object");
  if (kind !== "switch" && controlled_ids.length)
    throw new Error("Only switches may control lights");
  if (d.grounded !== true && d.grounded !== false)
    throw new Error("Grounding state must be explicit");
  const ways = Number(
    choice(String(d.switch_ways ?? 1), ["1", "2", "3"], "switch_ways"),
  ) as 1 | 2 | 3;
  return {
    ...placement(d, p),
    location_mm: vec3(d.location_mm, "location"),
    kind,
    watts: num(d.watts, "watts", 0),
    controlled_ids,
    switch_ways: ways,
    grounded: d.grounded,
    ...(typeof d.circuit_id === "string" ? { circuit_id: d.circuit_id } : {}),
  };
}
export function decodeCircuit(
  d: Record<string, unknown>,
  p: ProjectDocument,
): CircuitModuleData {
  const panel_id = text(d.panel_id, "panel_id");
  if (
    p.objects[panel_id]?.object_type !== "electrical.fixture" ||
    resolvedData(p, p.objects[panel_id]).kind !== "panel"
  )
    throw new Error("Circuit requires a panel");
  const device_ids = list(d.device_ids, "devices", (v) => text(v, "device id"));
  if (new Set(device_ids).size !== device_ids.length)
    throw new Error("Circuit has duplicate device IDs");
  for (const id of device_ids)
    if (p.objects[id]?.object_type !== "electrical.fixture" || id === panel_id)
      throw new Error("Circuit device is missing or is the panel");
  const voltage = positive(d.voltage, "voltage"),
    breaker_a = positive(d.breaker_a, "breaker"),
    allowable_current_a = positive(
      d.allowable_current_a,
      "user supplied cable ampacity",
    );
  if (breaker_a > allowable_current_a)
    throw new Error("Breaker exceeds supplied cable ampacity");
  const result: CircuitModuleData = {
    ...placement(d, p),
    panel_id,
    device_ids,
    voltage,
    breaker_a,
    allowable_current_a,
    cable_mm2: positive(d.cable_mm2, "cable size"),
  };
  const load = device_ids
    .filter((id) => p.objects[id].removed_phase === null)
    .reduce(
      (s, id) =>
        s + num(resolvedData(p, p.objects[id]).watts, "device watts", 0),
      0,
    );
  if (load / voltage > breaker_a + 1e-9)
    throw new Error("Connected load exceeds breaker current");
  return result;
}
export function decodeLED(
  d: Record<string, unknown>,
  p: ProjectDocument,
): LEDModuleData {
  const path_mm = list(d.path_mm, "LED path", (v) => vec3(v, "point"), 2),
    watts_per_m = positive(d.watts_per_m, "watts/m"),
    voltage = positive(d.voltage, "voltage"),
    driver_watts = positive(d.driver_watts, "driver wattage"),
    derating_ratio = positive(d.derating_ratio, "derating");
  if (derating_ratio > 1) throw new Error("Driver derating must be <= 1");
  const length =
    path_mm.slice(1).reduce((s, v, i) => s + length3(v, path_mm[i]), 0) / 1000;
  if (
    length <= 0 ||
    driver_watts * derating_ratio + 1e-9 < length * watts_per_m
  )
    throw new Error("LED driver is undersized or strip length is zero");
  return {
    ...placement(d, p),
    path_mm,
    watts_per_m,
    voltage,
    driver_watts,
    derating_ratio,
    material: text(d.material, "profile/diffuser material"),
    ...(typeof d.host_id === "string" ? { host_id: d.host_id } : {}),
  };
}
export function executeElectricalCommand(
  c: CommandHandlerContext,
): CommandBusResult | undefined {
  if (
    ["PlaceElectricalFixture", "UpdateElectricalFixture"].includes(
      c.commandName,
    )
  )
    return domainCommand(
      c,
      "electrical.fixture",
      "constructflow.electrical",
      decodeFixture,
      { update: c.commandName === "UpdateElectricalFixture" },
    );
  if (["CreateCircuit", "UpdateCircuit"].includes(c.commandName)) {
    const response = domainCommand(
      c,
      "electrical.circuit",
      "constructflow.electrical",
      decodeCircuit,
      { update: c.commandName === "UpdateCircuit", hostFields: ["panel_id"] },
    );
    return response;
  }
  if (["CreateLEDRun", "UpdateLEDRun"].includes(c.commandName))
    return domainCommand(
      c,
      "electrical.led_run",
      "constructflow.electrical",
      decodeLED,
      { update: c.commandName === "UpdateLEDRun", hostFields: ["host_id"] },
    );
  return undefined;
}
export function electricalOutputs(p: ProjectDocument): DomainOutput[] {
  return Object.values(p.objects)
    .filter((o) => o.owner_module === "constructflow.electrical")
    .flatMap((o) => {
      const raw = resolvedData(p, o);
      if (o.object_type === "electrical.fixture") {
        const d = decodeFixture(raw, p),
          out = output(o, d);
        out.meshes = box(
          d.location_mm,
          d.kind === "panel" ? [400, 150, 600] : [100, 100, 50],
        );
        out.quantities = [
          {
            classification: "electrical." + d.kind,
            description: d.mark + " " + d.kind,
            quantity: 1,
            unit: "pcs",
            formula: "explicit device count",
          },
        ];
        out.schedule = {
          Kind: d.kind,
          Watts: d.watts,
          Mounting_m: d.location_mm[2] / 1000,
          Switch_ways: d.switch_ways,
          Grounded: d.grounded ? "yes" : "no",
          Controls: d.controlled_ids.join(","),
        };
        if (d.kind === "switch" && !d.controlled_ids.length)
          out.warnings.push("Switch has no controlled load");
        if (d.kind === "outlet" && !d.grounded)
          out.warnings.push("Outlet grounding is missing");
        return [out];
      }
      if (o.object_type === "electrical.circuit") {
        const d = decodeCircuit(raw, p),
          out = output(o, d),
          watts = d.device_ids
            .filter((id) => p.objects[id].removed_phase === null)
            .reduce(
              (s, id) => s + num(resolvedData(p, p.objects[id]).watts, "watts"),
              0,
            );
        out.schedule = {
          Panel: d.panel_id,
          Loads: d.device_ids.join(","),
          Watts: watts,
          Current_A: watts / d.voltage,
          Breaker_A: d.breaker_a,
          Cable_mm2: d.cable_mm2,
          Voltage: d.voltage,
        };
        out.warnings.push(
          "Cable ampacity/design inputs supplied by user; electrical design verification required",
        );
        return [out];
      }
      if (o.object_type === "electrical.led_run") {
        const d = decodeLED(raw, p),
          out = output(o, d),
          length =
            d.path_mm
              .slice(1)
              .reduce((s, v, i) => s + length3(v, d.path_mm[i]), 0) / 1000;
        out.paths = [d.path_mm];
        out.quantities = [
          {
            classification: "led.length",
            description: d.mark + " LED strip",
            quantity: length,
            unit: "m",
            formula: "sum path length / 1000",
            material: d.material,
          },
          {
            classification: "led.driver",
            description: d.mark + " " + d.driver_watts + "W driver",
            quantity: 1,
            unit: "pcs",
            formula: "explicit compatible driver count",
          },
        ];
        out.schedule = {
          Length_m: length,
          Load_W: length * d.watts_per_m,
          Required_driver_W: (length * d.watts_per_m) / d.derating_ratio,
          Selected_driver_W: d.driver_watts,
          Voltage: d.voltage,
        };
        return [out];
      }
      return [];
    });
}
export function validateElectrical(p: ProjectDocument): void {
  electricalOutputs(p);
  const assigned = new Map<string, string>();
  for (const o of Object.values(p.objects))
    if (o.object_type === "electrical.circuit" && o.removed_phase === null) {
      const d = decodeCircuit(resolvedData(p, o), p);
      for (const id of d.device_ids) {
        if (assigned.has(id))
          throw new Error("A device is assigned to multiple active circuits");
        assigned.set(id, o.id);
      }
    }
}
