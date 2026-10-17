import type { ProjectDocument } from "./project.js";

type Point2 = [number, number];

function ringArea(ring: Point2[]): number {
  return ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

function orientation(a: Point2, b: Point2, c: Point2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: Point2, b: Point2, p: Point2): boolean {
  return Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0])
    && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
}

function segmentsIntersect(a: Point2, b: Point2, c: Point2, d: Point2): boolean {
  const o1 = orientation(a, b, c), o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a), o4 = orientation(c, d, b);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
  return (o1 === 0 && onSegment(a, b, c)) || (o2 === 0 && onSegment(a, b, d))
    || (o3 === 0 && onSegment(c, d, a)) || (o4 === 0 && onSegment(c, d, b));
}

function validRing(value: unknown): value is Point2[] {
  if (!Array.isArray(value) || value.length < 3 || !value.every(point => Array.isArray(point) && point.length === 2 && point.every(coordinate => typeof coordinate === "number" && Number.isFinite(coordinate)))) return false;
  const ring = value as Point2[];
  if (new Set(ring.map(point => `${point[0]}\0${point[1]}`)).size !== ring.length || Math.abs(ringArea(ring)) <= 1e-7) return false;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (a[0] === b[0] && a[1] === b[1]) return false;
    for (let j = i + 1; j < ring.length; j++) {
      if (j === i || j === (i + 1) % ring.length || i === (j + 1) % ring.length) continue;
      if (segmentsIntersect(a, b, ring[j], ring[(j + 1) % ring.length])) return false;
    }
  }
  return true;
}

function pointInRing(point: Point2, ring: Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (orientation(a, b, point) === 0 && onSegment(a, b, point)) return false;
    const crosses = (a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function validVoids(boundary: Point2[], value: unknown): boolean {
  if (!Array.isArray(value) || !value.every(validRing)) return false;
  const holes = value as Point2[][];
  for (let i = 0; i < holes.length; i++) {
    const hole = holes[i];
    if (!hole.every(point => pointInRing(point, boundary))) return false;
    for (let edge = 0; edge < hole.length; edge++) {
      const a = hole[edge], b = hole[(edge + 1) % hole.length];
      for (let outer = 0; outer < boundary.length; outer++) {
        if (segmentsIntersect(a, b, boundary[outer], boundary[(outer + 1) % boundary.length])) return false;
      }
    }
    for (let j = 0; j < i; j++) {
      const other = holes[j];
      if (hole.some((point, edge) => other.some((otherPoint, otherEdge) =>
        segmentsIntersect(point, hole[(edge + 1) % hole.length], otherPoint, other[(otherEdge + 1) % other.length]))
        || pointInRing(point, other)) || other.some(point => pointInRing(point, hole))) return false;
    }
  }
  return true;
}

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
  "architecture.stair": {
    positive: "total_rise_mm width_mm num_risers riser_height_mm tread_depth_mm handrail_height_mm",
    nonnegative: "landing_depth_mm",
    points: "start_point_mm",
    text: "mark stair_type structure_type",
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
  "interior.furniture": {
    positive: "width_mm depth_mm height_mm",
    finite: "rotation_deg",
    points: "location_mm",
    text: "kind material",
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
    if (object.object_type === 'architecture.stair' && d.rotation_deg !== undefined)
      number(d.rotation_deg, 'rotation_deg', -Infinity);
    if (object.object_type === 'architecture.stair') {
      if (!Number.isInteger(d.num_risers) || Number(d.num_risers) < (d.stair_type === 'straight' ? 2 : 4)) fail('num_risers');
      if (!['straight', 'l_shape', 'u_shape'].includes(String(d.stair_type))) fail('stair_type');
      if (d.turn_direction !== undefined && !['left', 'right'].includes(String(d.turn_direction))) fail('turn_direction');
      for (const key of ['base_offset_mm', 'top_offset_mm']) if (d[key] !== undefined) number(d[key], key, -Infinity);
      if (d.top_level_id !== undefined && !project.levels.some(l => l.id === d.top_level_id)) fail('top_level_id');
      if (d.first_flight_risers !== undefined && (!Number.isInteger(d.first_flight_risers) || Number(d.first_flight_risers) < 2 || (d.stair_type !== 'straight' && Number(d.num_risers) - Number(d.first_flight_risers) < 2))) fail('first_flight_risers');
      if (d.second_tread_depth_mm !== undefined) number(d.second_tread_depth_mm, 'second_tread_depth_mm', 0, false);
      if (d.flight_gap_mm !== undefined) number(d.flight_gap_mm, 'flight_gap_mm', 0);
    }
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
        if (!e || typeof e !== "object" || Array.isArray(e) || typeof e.defines_slope !== "boolean") fail("defines_slope");
        number(e.slope_deg, "slope_deg", 0);
        if (Number(e.slope_deg) >= 89) fail("slope_deg");
      }
      if (!validRing(d.boundary_mm)) fail("boundary_mm");
      if (d.voids_mm !== undefined && !validVoids(d.boundary_mm as Point2[], d.voids_mm)) fail("voids_mm");
    }
    if (object.object_type === "structure.slab") {
      if (!validRing(d.boundary_mm)) fail("boundary_mm");
      if (!(["slab_on_ground", "suspended", "precast_plank", "hollow_core"] as unknown[]).includes(d.slab_system)) fail("slab_system");
      if (d.elevation_offset_mm !== undefined) number(d.elevation_offset_mm, "elevation_offset_mm", -Infinity);
      if (d.slope_ratio !== undefined) number(d.slope_ratio, "slope_ratio", 0);
      if (d.drain_direction_deg !== undefined && (typeof d.drain_direction_deg !== "number" || !Number.isFinite(d.drain_direction_deg))) fail("drain_direction_deg");
      if (d.voids_mm !== undefined && !validVoids(d.boundary_mm as Point2[], d.voids_mm)) fail("voids_mm");
    }
    if (object.object_type === "interior.cabinet_run") {
      if (!Array.isArray(d.modules_mm) || !d.modules_mm.length)
        fail("modules_mm");
      for (const w of d.modules_mm as unknown[])
        number(w, "module width", 0, false);
    }
    if (object.object_type === "interior.furniture") {
      if (!["sofa", "chair", "dining_table", "coffee_table", "desk", "bed_single", "bed_double", "toilet", "washbasin", "bathtub"].includes(String(d.kind))) fail("kind");
    }
  }
}
