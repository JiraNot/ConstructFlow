import test from "node:test";
import assert from "node:assert/strict";
import {
  validateStairThaiBuildingCode,
  computeStairGeometry,
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
  assert.equal(straight.mesh3d.vertices.length, 16 * 4);
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
  assert.ok(uShape.code_check.passed);
});
