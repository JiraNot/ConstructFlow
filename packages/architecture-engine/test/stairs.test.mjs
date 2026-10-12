import test from "node:test";
import assert from "node:assert/strict";
import {
  validateStairThaiBuildingCode,
  computeStairGeometry,
  stairFromRun,
} from "../dist/index.js";

test("Track 3: Stair Thai Building Code validation enforces minimum standards", () => {
  // Compliant stair: width 1000mm, riser 175mm, tread 250mm, rise 2800mm, railing 950mm
  const compliant = validateStairThaiBuildingCode({
    width_mm: 1000,
    riser_height_mm: 175,
    tread_depth_mm: 250,
    total_rise_mm: 2800,
    handrail_height_mm: 950,
  });
  assert.equal(compliant.passed, true);
  assert.equal(compliant.violations.length, 0);
  assert.equal(compliant.width_ok, true);
  assert.equal(compliant.riser_ok, true);
  assert.equal(compliant.tread_ok, true);
  assert.equal(compliant.railing_ok, true);

  // Non-compliant stair: narrow width 800mm, steep riser 220mm, shallow tread 200mm, rise 3200mm without landing
  const nonCompliant = validateStairThaiBuildingCode({
    width_mm: 800,
    riser_height_mm: 220,
    tread_depth_mm: 200,
    total_rise_mm: 3200,
    handrail_height_mm: 800,
  });
  assert.equal(nonCompliant.passed, false);
  assert.equal(nonCompliant.width_ok, false);
  assert.equal(nonCompliant.riser_ok, false);
  assert.equal(nonCompliant.tread_ok, false);
  assert.equal(nonCompliant.landing_ok, false);
  assert.equal(nonCompliant.railing_ok, false);
  assert.ok(nonCompliant.violations.some((v) => v.includes("900 มม.")));
  assert.ok(nonCompliant.violations.some((v) => v.includes("200 มม.")));
  assert.ok(nonCompliant.violations.some((v) => v.includes("220 มม.")));
  assert.ok(nonCompliant.violations.some((v) => v.includes("3.00 ม.")));
});

test("Track 3: computeStairGeometry produces valid linework for Straight, L-Shape, and U-Shape stairs", () => {
  // 1. Straight Stair
  const straight = computeStairGeometry({
    stair_type: "straight",
    structure_type: "rc_monolithic",
    start_point_mm: [0, 0, 0],
    total_rise_mm: 2800,
    width_mm: 1000,
    num_risers: 16,
    riser_height_mm: 175,
    tread_depth_mm: 250,
    has_handrail: true,
    handrail_height_mm: 900,
  });
  assert.equal(straight.geometry2d.step_lines_mm.length, 16);
  assert.ok(straight.mesh3d.vertices.length > 16 * 4, 'solid risers, soffit and rails are generated');
  assert.ok(straight.code_check.passed);

  // 2. L-Shape Stair
  const lShape = computeStairGeometry({
    stair_type: "l_shape",
    structure_type: "rc_monolithic",
    start_point_mm: [0, 0, 0],
    total_rise_mm: 3000,
    width_mm: 1000,
    num_risers: 17,
    riser_height_mm: 176.5,
    tread_depth_mm: 250,
    landing_depth_mm: 1000,
    has_handrail: true,
    handrail_height_mm: 900,
  });
  assert.equal(lShape.geometry2d.step_lines_mm.length, 17);
  assert.ok(lShape.geometry2d.landing_bounds_mm);
  assert.ok(lShape.mesh3d.vertices.length > 0, "L-Shape 3D mesh vertices must not be empty");
  assert.ok(lShape.mesh3d.indices.length > 0, "L-Shape 3D mesh indices must not be empty");
  assert.ok(lShape.code_check.passed);

  // 3. U-Shape Dog-leg Stair
  const uShape = computeStairGeometry({
    stair_type: "u_shape",
    structure_type: "rc_monolithic",
    start_point_mm: [0, 0, 0],
    total_rise_mm: 3200,
    width_mm: 1000,
    num_risers: 18,
    riser_height_mm: 177.8,
    tread_depth_mm: 250,
    landing_depth_mm: 1200,
    has_handrail: true,
    handrail_height_mm: 900,
  });
  assert.equal(uShape.geometry2d.step_lines_mm.length, 18);
  assert.ok(uShape.geometry2d.landing_bounds_mm);
  assert.ok(uShape.mesh3d.vertices.length > 0, "U-Shape 3D mesh vertices must not be empty");
  assert.ok(uShape.mesh3d.indices.length > 0, "U-Shape 3D mesh indices must not be empty");
  assert.ok(uShape.code_check.passed);
});

test("Track 3 / F05: computeRailingGeometry builds compliant handrails, posts, and balusters", async () => {
  const { computeRailingGeometry, validateRailingCode } = await import("../dist/index.js");

  // Compliant 4m railing
  const compliantRailing = computeRailingGeometry({
    path_mm: [
      [0, 0, 0],
      [4000, 0, 0],
    ],
    height_mm: 950,
    style: "vertical_balusters",
    baluster_spacing_mm: 100,
    material: "stainless_steel",
  });

  assert.equal(compliantRailing.code_check.passed, true);
  assert.equal(compliantRailing.mesh3d.handrail_length_m, 4.0);
  assert.equal(compliantRailing.mesh3d.post_count, 2);
  assert.ok(compliantRailing.mesh3d.baluster_count > 30);
  assert.ok(compliantRailing.mesh3d.vertices.length > 0);

  // Non-compliant railing (too low, balusters too wide)
  const nonCompliant = validateRailingCode({
    path_mm: [
      [0, 0, 0],
      [2000, 0, 0],
    ],
    height_mm: 800, // < 900
    style: "vertical_balusters",
    baluster_spacing_mm: 150, // > 100
    material: "timber",
  });
  assert.equal(nonCompliant.passed, false);
  assert.equal(nonCompliant.height_ok, false);
  assert.equal(nonCompliant.spacing_ok, false);
});

const solidStair = {
  mark: 'ST1', level_id: 'GF', stair_type: 'u_shape', structure_type: 'rc_monolithic',
  start_point_mm: [4450, 3625, 400], total_rise_mm: 3400, width_mm: 900,
  num_risers: 18, riser_height_mm: 188.9, tread_depth_mm: 250,
  landing_depth_mm: 900, turn_direction: 'right', has_handrail: false, handrail_height_mm: 900,
};

test('two-point stair drawing uses picked direction and first-flight run without fixed tread sizes', () => {
  const project = { project: { active_level_id: 'GF' }, levels: [{ id: 'GF', elevation_mm: 400 }, { id: 'L1', elevation_mm: 3800 }] };
  for (const stair_type of ['straight', 'l_shape', 'u_shape']) for (const end of [[2800, 200], [100, 2900], [-2600, 200], [2000, 2100]]) {
    const s = stairFromRun(project, [100, 200], end, { stair_type, width_mm: 900, landing_depth_mm: 1100, num_risers: 18, first_flight_risers: 8, flight_gap_mm: 300, turn_direction: 'left', top_level_id: 'L1' });
    const steps = stair_type === 'straight' ? 17 : 7;
    assert.ok(Math.abs(s.tread_depth_mm * steps - Math.hypot(end[0] - 100, end[1] - 200)) < 1e-8);
    const g = computeStairGeometry({ ...s, has_handrail: false });
    assert.ok(g.geometry2d.step_lines_mm[steps].some(p => Math.hypot(p[0] - end[0], p[1] - end[1]) < 1e-7));
    assert.equal(Math.max(...g.mesh3d.vertices.map(p => p[2])), 3800);
  }
  assert.throws(() => stairFromRun(project, [0, 0], [0, 0], { stair_type: 'u_shape', num_risers: 18, width_mm: 900, landing_depth_mm: 900, turn_direction: 'right', top_level_id: 'L1' }));
});

test('unequal flights and a configurable U-stair gap alter steps, landing and solids together', () => {
  const s = { ...solidStair, first_flight_risers: 8, second_tread_depth_mm: 300, flight_gap_mm: 400 };
  const g = computeStairGeometry(s), lines = g.geometry2d.step_lines_mm;
  assert.equal(lines.length, 18);
  assert.equal(lines[7][0][0] - 4450, 7 * 250);
  assert.equal(lines[8][0][1] - 3625, 2 * 900 + 400);
  assert.equal(lines[8][0][0] - lines.at(-1)[0][0], 9 * 300);
  assert.equal(Math.max(...g.mesh3d.vertices.map(p => p[2])), 3800);
});

test('solid stair uses eight treads per nine-riser flight and reaches exact floor datums', () => {
  const g = computeStairGeometry(solidStair), vertices = g.mesh3d.vertices;
  assert.equal(g.geometry2d.step_lines_mm.length, 18);
  assert.equal(Math.max(...vertices.map(p => p[0])), 7350);
  assert.equal(Math.max(...vertices.map(p => p[2])), 3800);
  assert.ok(vertices.some(p => p[0] === 4450 && Math.abs(p[2] - (400 + 3400 / 18)) < 1e-8));
  assert.ok(vertices.some(p => p[0] === 6450 && p[2] === 2100));
  const vertical = g.mesh3d.indices.some((_, i, ix) => i % 3 === 0 &&
    vertices[ix[i]][0] === vertices[ix[i + 1]][0] && vertices[ix[i]][0] === vertices[ix[i + 2]][0] &&
    new Set([vertices[ix[i]][2], vertices[ix[i + 1]][2], vertices[ix[i + 2]][2]]).size > 1);
  assert.ok(vertical, 'risers and solid end faces must exist');
  const firstHeight = 400 + 3400 / 18;
  const firstTread = g.mesh3d.indices.flatMap((_, i, ix) => i % 3 === 0
    ? [[vertices[ix[i]], vertices[ix[i + 1]], vertices[ix[i + 2]]]] : [])
    .find(triangle => triangle.every(p => Math.abs(p[2] - firstHeight) < 1e-8));
  assert.ok(firstTread);
  const [a, b, c] = firstTread;
  assert.ok((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0,
    'tread face winding points upward after the profile axis swap');
  assert.ok(g.mesh3d.concrete_volume_m3 > 0);
});

test('stair guards are generated only when enabled and follow both flights', () => {
  const plain = computeStairGeometry(solidStair), guarded = computeStairGeometry({ ...solidStair, has_handrail: true });
  assert.equal(plain.mesh3d.handrail_length_m, 0);
  assert.ok(guarded.mesh3d.handrail_length_m > 8);
  assert.equal(Math.max(...guarded.mesh3d.vertices.map(p => p[2])), 4700);
  assert.equal(plain.mesh3d.concrete_volume_m3, guarded.mesh3d.concrete_volume_m3);
});

test('left turns mirror stair treads, landing, solid faces and guards together', () => {
  const right = computeStairGeometry(solidStair), left = computeStairGeometry({ ...solidStair, turn_direction: 'left' });
  const mirrored = right.mesh3d.vertices.map(([x, y, z]) => [x, 2 * 3625 + 900 - y, z]);
  assert.deepEqual(left.mesh3d.vertices, mirrored);
  assert.deepEqual(left.geometry2d.landing_bounds_mm, right.geometry2d.landing_bounds_mm.map(([x, y]) => [x, 8150 - y]));
});

test('plan rotation transforms stair mesh, landing, treads and guards about the same start point', () => {
  const original = computeStairGeometry({ ...solidStair, has_handrail: true });
  const rotated = computeStairGeometry({ ...solidStair, has_handrail: true, rotation_deg: 180 });
  for (let i = 0; i < original.mesh3d.vertices.length; i++) {
    const [x, y, z] = original.mesh3d.vertices[i], p = rotated.mesh3d.vertices[i];
    assert.ok(Math.abs(p[0] - (8900 - x)) < 1e-7);
    assert.ok(Math.abs(p[1] - (7250 - y)) < 1e-7);
    assert.equal(p[2], z);
  }
  assert.equal(rotated.mesh3d.concrete_volume_m3, original.mesh3d.concrete_volume_m3);
});
