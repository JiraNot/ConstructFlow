import type { ProjectDocument } from "./project.js";

const schemas: Record<
  string,
  {
    positive?: string;
    nonnegative?: string;
    finite?: string;
    points?: string;
    lists?: string;
    text?: string;
  }
> = {
  "structure.slab": {
    positive: "thickness_mm",
    nonnegative: "topping_mm",
    finite: "elevation_mm",
    lists: "boundary_mm:2:3",
    text: "slab_system material",
  },
  "structure.rebar_set": {
    positive: "diameter_mm count",
    nonnegative: "cover_mm bend_radius_mm hook_extension_mm lap_mm",
    text: "host_id mode grade",
  },
  "roof.system": {
    positive: "thickness_mm",
    finite: "elevation_mm",
    lists: "boundary_mm:2:3",
    text: "material",
  },
  "decorative.moulding_run": {
    positive: "miter_limit",
    lists: "path_mm:3:2 profile_mm:2:3",
    text: "material",
  },
  "decorative.panel_layout": {
    positive: "rows columns depth_mm",
    nonnegative: "margin_mm gap_mm",
    text: "host_id material",
  },
  "drainage.pipe_route": {
    positive: "diameter_mm",
    nonnegative: "minimum_slope_ratio",
    lists: "nodes_mm:3:2",
    text: "system material",
  },
  "plumbing.pipe_route": {
    positive: "diameter_mm",
    lists: "nodes_mm:3:2",
    text: "system material",
  },
  "drainage.manhole": { points: "location_mm size_mm", text: "system" },
  "drainage.septic_tank": {
    positive: "people litres_per_person capacity_litres",
    nonnegative: "reserve_ratio",
    points: "location_mm",
    text: "rule_source",
  },
  "plumbing.pump_bypass": {
    positive: "span_mm diameter_mm",
    points: "location_mm",
    text: "mode",
  },
  "architecture.bathroom": {
    positive:
      "slope_ratio waterproof_upstand_mm wet_wall_height_mm toilet_rough_in_mm",
    nonnegative: "drop_mm wet_wall_length_mm",
    finite: "elevation_mm",
    lists: "boundary_mm:2:3",
    text: "mark",
  },
  "electrical.fixture": {
    nonnegative: "watts",
    points: "location_mm",
    text: "kind",
  },
  "electrical.circuit": {
    positive: "voltage breaker_a cable_mm2 allowable_current_a",
    text: "panel_id",
  },
  "electrical.led_run": {
    positive: "watts_per_m voltage driver_watts derating_ratio",
    lists: "path_mm:3:2",
    text: "material",
  },
  "interior.cabinet_run": {
    positive: "width_mm height_mm depth_mm board_mm back_mm",
    nonnegative: "plinth_mm shelves drawers countertop_mm",
    finite: "rotation_deg",
    points: "location_mm",
    text: "front carcass_material front_material back_material countertop_material",
  },
};

/** Persisted shape validation stays in the canonical model; domain solvers enforce feasibility. */
export function validateConstructionPayloads(project: ProjectDocument): void {
  for (const object of Object.values(project.objects)) {
    const schema = schemas[object.object_type],
      d = object.module_data as Record<string, unknown>;
    const fail = (field: string): never => {
      throw new Error(
        `Invalid project format: ${object.id} has invalid ${field}`,
      );
    };
    if (
      object.object_type === "structure.beam" &&
      d.drop_mm !== undefined &&
      (typeof d.drop_mm !== "number" ||
        !Number.isFinite(d.drop_mm) ||
        d.drop_mm < 0)
    )
      fail("drop_mm");
    if (!schema) continue;
    if (object.schema_version !== 1) fail("schema_version");
    if (
      typeof d.level_id !== "string" ||
      !project.levels.some((l) => l.id === d.level_id)
    )
      fail("level_id");
    const number = (v: unknown, key: string, min: number, inclusive = true) => {
      if (
        typeof v !== "number" ||
        !Number.isFinite(v) ||
        (inclusive ? v < min : v <= min)
      )
        fail(key);
    };
    const tuple = (v: unknown, n: number, key: string) => {
      if (!Array.isArray(v) || v.length !== n) fail(key);
      (v as unknown[]).forEach((x) => number(x, key, -Infinity));
    };
    for (const k of (schema.positive ?? "").split(" ").filter(Boolean))
      number(d[k], k, 0, false);
    for (const k of (schema.nonnegative ?? "").split(" ").filter(Boolean))
      number(d[k], k, 0);
    for (const k of (schema.finite ?? "").split(" ").filter(Boolean))
      number(d[k], k, -Infinity);
    for (const k of (schema.points ?? "").split(" ").filter(Boolean))
      tuple(d[k], 3, k);
    for (const k of (schema.text ?? "").split(" ").filter(Boolean))
      if (typeof d[k] !== "string" || !(d[k] as string).trim()) fail(k);
    for (const entry of (schema.lists ?? "").split(" ").filter(Boolean)) {
      const [k, n, min] = entry.split(":");
      if (!Array.isArray(d[k]) || (d[k] as unknown[]).length < Number(min))
        fail(k);
      (d[k] as unknown[]).forEach((v) => tuple(v, Number(n), k));
    }
    for (const k of [
      "host_id",
      "panel_id",
      "start_node_id",
      "end_node_id",
      "circuit_id",
    ])
      if (
        d[k] !== undefined &&
        (typeof d[k] !== "string" ||
          !project.objects[d[k] as string] ||
          d[k] === object.id)
      )
        fail(k);
    for (const k of ["invert_mm", "start_invert_mm", "end_invert_mm"])
      if (d[k] !== undefined && d[k] !== null) number(d[k], k, -Infinity);
    for (const k of [
      "count",
      "rows",
      "columns",
      "people",
      "shelves",
      "drawers",
    ])
      if (d[k] !== undefined && !Number.isInteger(d[k])) fail(k);
    for (const k of ["device_ids", "controlled_ids"])
      if (d[k] !== undefined) {
        if (!Array.isArray(d[k])) fail(k);
        for (const id of d[k] as unknown[])
          if (typeof id !== "string" || !project.objects[id]) fail(k);
      }
    if (object.object_type === "roof.system") {
      if (
        !Array.isArray(d.edges) ||
        (d.edges as unknown[]).length !== (d.boundary_mm as unknown[]).length
      )
        fail("edges");
      for (const e of d.edges as Record<string, unknown>[]) {
        if (!e || typeof e.defines_slope !== "boolean") fail("defines_slope");
        number(e.slope_deg, "slope_deg", 0);
        if (Number(e.slope_deg) >= 89) fail("slope_deg");
      }
    }
    if (object.object_type === "interior.cabinet_run") {
      if (!Array.isArray(d.modules_mm) || !d.modules_mm.length)
        fail("modules_mm");
      for (const w of d.modules_mm as unknown[])
        number(w, "module width", 0, false);
    }
  }
}
