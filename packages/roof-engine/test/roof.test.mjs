import test from "node:test";
import assert from "node:assert/strict";
import {
  solveRoof,
  calculateRoofCatchment,
  solveEaveGuttersAndDownpipes,
  roofOutputs,
} from "../dist/index.js";

test("F09: solveRoof accurately computes facets and area for concave L-shaped roofs", () => {
  // L-shaped roof boundary: 6 vertices
  // (0,0) -> (6000,0) -> (6000,3000) -> (3000,3000) -> (3000,5000) -> (0,5000)
  // Area = (6m * 3m) + (3m * 2m) = 18 + 6 = 24 m2
  const lShapedRoof = {
    mark: "RF1",
    level_id: "L2",
    elevation_mm: 6000,
    thickness_mm: 50,
    material: "metal_sheet",
    boundary_mm: [
      [0, 0],
      [6000, 0],
      [6000, 3000],
      [3000, 3000],
      [3000, 5000],
      [0, 5000],
    ],
    // Flat / mono-pitch roof on concave boundary
    edges: Array(6).fill({ defines_slope: false, slope_deg: 0 }),
    allow_concave: true,
  };

  const facets = solveRoof(lShapedRoof);
  assert.equal(facets.length, 1);
  assert.equal(Math.round(facets[0].area_m2), 24);
  assert.ok(facets[0].triangles.length >= 4);
});

test("F09: calculateRoofCatchment and solveEaveGuttersAndDownpipes automate rainwater calculations", () => {
  // 10m x 8m Gable Roof = 80 m2
  const gableRoof = {
    mark: "RF2",
    level_id: "L2",
    elevation_mm: 3500,
    thickness_mm: 30,
    material: "concrete_tile",
    boundary_mm: [
      [0, 0],
      [10000, 0],
      [10000, 8000],
      [0, 8000],
    ],
    // 2 sloped edges (eaves at edge 0 and edge 2)
    edges: [
      { defines_slope: true, slope_deg: 25 },
      { defines_slope: false, slope_deg: 0 },
      { defines_slope: true, slope_deg: 25 },
      { defines_slope: false, slope_deg: 0 },
    ],
  };

  const catchment = calculateRoofCatchment(gableRoof, 120, 0.9, 3.0);
  assert.equal(catchment.catchment_area_m2, 80);
  // peak_flow_lps = 120 * 80 * 0.9 / 3600 = 2.4 lps
  assert.equal(catchment.peak_flow_lps, 2.4);
  // ceil(2.4 / 3.0) = 1 downpipe minimum per code
  assert.ok(catchment.recommended_downpipes >= 1);

  const rainwater = solveEaveGuttersAndDownpipes(gableRoof);
  assert.ok(rainwater.gutters.length >= 2, "Must generate gutters along eave shedding edges");
  assert.ok(rainwater.downpipes.length >= 1, "Must generate downpipes");
});

test("F09: roofOutputs integrates roof covering, box gutters and downpipes takeoff", () => {
  const project = {
    project: { active_level_id: "L2" },
    types: [],
    objects: {
      "roof-1": {
        id: "roof-1",
        object_type: "roof.system",
        created_phase: "new_construction",
        status: "active",
        module_data: {
          mark: "RF3",
          elevation_mm: 3000,
          thickness_mm: 30,
          material: "pu_metal_sheet",
          boundary_mm: [
            [0, 0],
            [5000, 0],
            [5000, 4000],
            [0, 4000],
          ],
          edges: [
            { defines_slope: true, slope_deg: 10 },
            { defines_slope: false, slope_deg: 0 },
            { defines_slope: false, slope_deg: 0 },
            { defines_slope: false, slope_deg: 0 },
          ],
        },
      },
    },
  };

  const outputs = roofOutputs(project);
  assert.equal(outputs.length, 1);
  const out = outputs[0];

  assert.ok(out.quantities.some((q) => q.classification === "roof.covering"));
  assert.ok(out.quantities.some((q) => q.classification === "roof.gutter"));
  assert.ok(out.quantities.some((q) => q.classification === "roof.downpipe"));
  assert.ok(out.schedule.Gutters_m > 0);
  assert.ok(out.schedule.Downpipes_pcs > 0);
});
