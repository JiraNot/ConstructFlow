import test from "node:test";
import assert from "node:assert/strict";
import {
  solveRoof,
  decodeRoof,
  getRoofEaveBoundary,
  getEditableRoofRidge,
  moveEditableRoofRidge,
  getRoofSeams,
  moveRoofSeam,
  calculateRoofCatchment,
  solveEaveGuttersAndDownpipes,
  solveRoofFraming,
  roofOutputs,
} from "../dist/index.js";

test("roof decoding validates overhang bounds and opening containment", () => {
  const project = { project: { active_level_id: "L2" } };
  const roof = {
    mark: "RF-VALID", boundary_mm: [[0, 0], [10000, 0], [10000, 6000], [0, 6000]],
    elevation_mm: 3000, edges: Array(4).fill({ defines_slope: false, slope_deg: 0 }),
    material: "metal_sheet", thickness_mm: 30, eaves_overhang_mm: 300,
    voids_mm: [[[2000, 2000], [4000, 2000], [4000, 4000], [2000, 4000]]],
  };
  assert.equal(decodeRoof(roof, project).eaves_overhang_mm, 300);
  assert.throws(() => decodeRoof({ ...roof, eaves_overhang_mm: 3001 }, project), /must not exceed 3000/);
  assert.throws(() => decodeRoof({ ...roof, voids_mm: [[[-400, 1000], [100, 1000], [100, 1500], [-400, 1500]]] }, project), /strictly inside/);
  assert.throws(() => decodeRoof({ ...roof, voids_mm: [roof.voids_mm[0], [[3000, 3000], [5000, 3000], [5000, 5000], [3000, 5000]]] }, project), /overlaps/);
});

test("gable ridge grip moves the ridge across the roof and preserves peak height", () => {
  const roof = {
    mark: "RF-GABLE",
    level_id: "L2",
    elevation_mm: 3500,
    thickness_mm: 30,
    material: "metal_sheet",
    boundary_mm: [[0, 0], [10000, 0], [10000, 8000], [0, 8000]],
    edges: [
      { defines_slope: true, slope_deg: 25 },
      { defines_slope: false, slope_deg: 0 },
      { defines_slope: true, slope_deg: 25 },
      { defines_slope: false, slope_deg: 0 },
    ],
  };
  const original = getEditableRoofRidge(roof);
  assert.ok(original);
  assert.deepEqual(original.grip_mm, [5000, 4000]);
  const edges = moveEditableRoofRidge(roof, [5000, 3000]);
  assert.ok(edges);
  const updated = { ...roof, edges };
  const moved = getEditableRoofRidge(updated);
  assert.ok(moved);
  assert.ok(Math.abs(moved.grip_mm[1] - 3000) < 1e-6);
  assert.ok(Math.abs(moved.rise_mm - original.rise_mm) < 1e-6);
  assert.ok(edges[0].slope_deg > edges[2].slope_deg);
  assert.equal(solveRoof(updated).length, 2);
});

test("gable ridge detection is winding-safe for clockwise footprints", () => {
  const roof = {
    boundary_mm: [[0, 0], [0, 8000], [10000, 8000], [10000, 0]],
    edges: [
      { defines_slope: true, slope_deg: 25 }, { defines_slope: false, slope_deg: 0 },
      { defines_slope: true, slope_deg: 25 }, { defines_slope: false, slope_deg: 0 },
    ],
  };
  const ridge = getEditableRoofRidge(roof);
  assert.ok(ridge);
  assert.ok(Math.abs(ridge.grip_mm[0] - 5000) < 1e-6 && Math.abs(ridge.grip_mm[1] - 4000) < 1e-6);
  const facets = solveRoof({ ...roof, elevation_mm: 0, thickness_mm: 30, material: 'tile' });
  assert.equal(facets.length, 2);
  assert.ok(facets.every(facet => facet.vertices_mm.every(point => point[2] >= -1e-7)), 'both pitches rise from their eaves toward the ridge');
});

test("hip roof exposes a movable ridge and the four hip seams", () => {
  const roof = {
    boundary_mm: [[0, 0], [10000, 0], [10000, 8000], [0, 8000]],
    edges: Array(4).fill({ defines_slope: true, slope_deg: 25 }),
    elevation_mm: 2800, thickness_mm: 30, material: "metal_sheet",
  };
  const seams = getRoofSeams(roof);
  assert.equal(seams.filter((seam) => seam.kind === "ridge").length, 1);
  assert.equal(seams.filter((seam) => seam.kind === "hip").length, 4);
  const original = getEditableRoofRidge(roof);
  assert.ok(original);
  assert.ok(Math.abs(original.grip_mm[1] - 4000) < 1e-6);
  const movedEdges = moveEditableRoofRidge(roof, [5000, 3500]);
  assert.ok(movedEdges);
  const movedRidge = getEditableRoofRidge({ ...roof, edges: movedEdges });
  assert.ok(movedRidge);
  assert.ok(Math.abs(movedRidge.grip_mm[1] - 3500) < 1e-6);
  assert.ok(Math.abs(movedRidge.rise_mm - original.rise_mm) < 1e-6);
});

test("hip seam grip changes only its two pitches and keeps the seam elevation at the grip", () => {
  const roof = {
    boundary_mm: [[0, 0], [10000, 0], [10000, 8000], [0, 8000]],
    edges: Array(4).fill({ defines_slope: true, slope_deg: 25 }),
    elevation_mm: 2800, thickness_mm: 30, material: "metal_sheet",
  };
  const hip = getRoofSeams(roof).find((seam) => seam.kind === "hip");
  assert.ok(hip);
  const nextPoint = [hip.grip_mm[0] + 120, hip.grip_mm[1] - 80];
  const edges = moveRoofSeam(roof, hip.edge_indices, nextPoint);
  assert.ok(edges);
  assert.notDeepEqual(edges.map((edge) => edge.slope_deg), roof.edges.map((edge) => edge.slope_deg));
  for (const index of [0, 1, 2, 3].filter((index) => !hip.edge_indices.includes(index)))
    assert.equal(edges[index].slope_deg, roof.edges[index].slope_deg);
  const movedHip = getRoofSeams({ ...roof, edges }).find((seam) => seam.edge_indices.join(":") === hip.edge_indices.join(":"));
  assert.ok(movedHip);
  const dx = movedHip.end_mm[0] - movedHip.start_mm[0], dy = movedHip.end_mm[1] - movedHip.start_mm[1];
  const lineDistance = Math.abs(dx * (nextPoint[1] - movedHip.start_mm[1]) - dy * (nextPoint[0] - movedHip.start_mm[0])) / Math.hypot(dx, dy);
  assert.ok(lineDistance < 1, "the adjusted seam runs through the dragged grip");
});

test("concave hip footprint identifies a valley seam at the reflex corner", () => {
  const roof = {
    boundary_mm: [[0, 0], [6000, 0], [6000, 3000], [3000, 3000], [3000, 5000], [0, 5000]],
    edges: Array(6).fill({ defines_slope: true, slope_deg: 25 }),
    elevation_mm: 2800, thickness_mm: 30, material: "metal_sheet",
  };
  const seams = getRoofSeams(roof);
  const valley = seams.find((seam) => seam.kind === "valley");
  assert.ok(valley, "the inward L-corner should start a valley line");
  assert.ok(moveRoofSeam(roof, valley.edge_indices, [valley.grip_mm[0] - 100, valley.grip_mm[1] - 100]), "valley grips should have an editable pitch pair");
});

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
  assert.equal(rainwater.gutters.length, 2, "Gable rake edges must not receive eave gutters");
  assert.equal(rainwater.downpipes.length, rainwater.catchment.recommended_downpipes, "generated downpipes must match the catchment recommendation");
});

test("roof overhang expands the actual surface mesh, catchment and eave gutters", () => {
  const roof = {
    mark: "RF-EAVE", level_id: "L2", elevation_mm: 3500, thickness_mm: 30, material: "metal_sheet",
    boundary_mm: [[0, 0], [10000, 0], [10000, 8000], [0, 8000]],
    eaves_overhang_mm: 500,
    edges: [
      { defines_slope: true, slope_deg: 25 }, { defines_slope: false, slope_deg: 0 },
      { defines_slope: true, slope_deg: 25 }, { defines_slope: false, slope_deg: 0 },
    ],
  };
  assert.deepEqual(getRoofEaveBoundary(roof), [[-500, -500], [10500, -500], [10500, 8500], [-500, 8500]]);
  const facets = solveRoof(roof);
  assert.equal(facets.length, 2);
  assert.ok(facets.every(facet => facet.vertices_mm.some(point => point[0] === -500 || point[0] === 10500)));
  const rainwater = solveEaveGuttersAndDownpipes(roof);
  assert.equal(rainwater.catchment.catchment_area_m2, 99);
  assert.deepEqual(rainwater.gutters.map(gutter => gutter.length_m), [11, 11]);
  assert.ok(rainwater.gutters.every(gutter => Math.abs(gutter.start_point_mm[2] - 3266.8) < 2));
});

test("roof voids remove real mesh triangles and surface area, including on pitched facets", () => {
  const roof = {
    mark: "RF-VOID", level_id: "L2", elevation_mm: 3000, thickness_mm: 30, material: "metal_sheet",
    boundary_mm: [[0, 0], [10000, 0], [10000, 6000], [0, 6000]],
    voids_mm: [[[2000, 2000], [4000, 2000], [4000, 4000], [2000, 4000]]],
    edges: [{ defines_slope: false, slope_deg: 0 }, { defines_slope: false, slope_deg: 0 }, { defines_slope: false, slope_deg: 0 }, { defines_slope: false, slope_deg: 0 }],
  };
  const facet = solveRoof(roof)[0];
  assert.ok(Math.abs(facet.area_m2 - 56) < 1e-9);
  assert.ok(facet.triangles.every(triangle => {
    const x = triangle.reduce((sum, point) => sum + point[0], 0) / 3;
    const y = triangle.reduce((sum, point) => sum + point[1], 0) / 3;
    return !(x > 2000 && x < 4000 && y > 2000 && y < 4000);
  }));
  const pitched = { ...roof, edges: [
    { defines_slope: true, slope_deg: 25 }, { defines_slope: false, slope_deg: 0 },
    { defines_slope: true, slope_deg: 25 }, { defines_slope: false, slope_deg: 0 },
  ] };
  const pitchedArea = solveRoof(pitched).reduce((sum, item) => sum + item.area_m2, 0);
  assert.ok(pitchedArea < solveRoof({ ...pitched, voids_mm: [] }).reduce((sum, item) => sum + item.area_m2, 0) - 4);
});

test("concave hipped roofs generate valley gutter mesh and takeoff", () => {
  const project = {
    project: { active_level_id: "L2" }, types: [],
    objects: {
      "roof-concave": {
        id: "roof-concave", object_type: "roof.system", created_phase: "new_construction", status: "active",
        module_data: {
          mark: "RF-L", elevation_mm: 3000, thickness_mm: 30, material: "metal_sheet",
          boundary_mm: [[0, 0], [6000, 0], [6000, 3000], [3000, 3000], [3000, 5000], [0, 5000]],
          edges: Array(6).fill({ defines_slope: true, slope_deg: 25 }),
        },
      },
    },
  };
  const output = roofOutputs(project)[0];
  const valley = output.quantities.find(quantity => quantity.classification === "roof.valley_gutter");
  assert.ok(valley && valley.quantity > 0);
  assert.ok(output.schedule.ValleyGutter_m > 0);
  assert.ok(output.meshes.length > solveRoof(project.objects["roof-concave"].module_data).reduce((sum, facet) => sum + facet.triangles.length, 0), "valley channel mesh should be generated along with the roof facets");
});

test("roof framing type generates rafters, purlins, repeatable trusses and 3D member takeoff", () => {
  const roof = {
    mark: "RF-FRAME", elevation_mm: 3500, thickness_mm: 30, material: "metal_sheet",
    boundary_mm: [[0, 0], [10000, 0], [10000, 8000], [0, 8000]],
    edges: [
      { defines_slope: true, slope_deg: 25 }, { defines_slope: false, slope_deg: 0 },
      { defines_slope: true, slope_deg: 25 }, { defines_slope: false, slope_deg: 0 },
    ],
    framing_system: "rafter_truss_purlin", rafter_spacing_mm: 2000, purlin_spacing_mm: 2000,
    truss_spacing_mm: 2500, rafter_section_mm: [50, 100], purlin_section_mm: [45, 75],
    truss_chord_section_mm: [50, 100], truss_web_section_mm: [40, 40], truss_depth_mm: 500,
    framing_material: "steel",
  };
  const framing = solveRoofFraming(roof);
  assert.equal(framing.truss_count, 5);
  assert.ok(framing.members.some(member => member.role === "rafter"));
  assert.ok(framing.members.some(member => member.role === "purlin"));
  assert.ok(framing.members.some(member => member.role === "truss_top_chord"));
  assert.ok(framing.members.some(member => member.role === "truss_bottom_chord"));
  assert.ok(framing.members.some(member => member.role === "truss_web"));
  assert.ok(framing.members.every(member => member.length_m > 0 && member.section_mm.every(size => size > 0)));

  const project = {
    project: { active_level_id: "L2" }, types: [], rainwater_design: {
      design_rainfall_mm_per_hr: 200, design_return_period_years: 10, location: "Bangkok", source: "Project station IDF table",
      runoff_coefficient: 0.9, outlet_capacity_lps: 2, downpipe_diameter_mm: 100,
    },
    objects: { roof: { id: "roof", object_type: "roof.system", created_phase: "new_construction", status: "active", module_data: roof } },
  };
  const output = roofOutputs(project)[0];
  assert.equal(output.schedule.Rainfall_mm_h, 200);
  assert.equal(output.schedule.Rainfall_return_period_years, 10);
  assert.equal(output.schedule.Rainfall_location, "Bangkok");
  assert.equal(output.schedule.Trusses_pcs, 5);
  assert.ok(output.quantities.some(quantity => quantity.classification === "roof.rafter" && quantity.quantity > 0));
  assert.ok(output.quantities.some(quantity => quantity.classification === "roof.purlin" && quantity.quantity > 0));
  assert.ok(output.quantities.some(quantity => quantity.classification === "roof.truss_web" && quantity.quantity > 0));
  assert.equal(output.schedule.Downpipes_pcs, 2);
  assert.ok(!output.warnings.some(warning => warning.includes("ค่าเริ่มต้นชั่วคราว")));
  assert.ok(output.meshes.length > solveRoof(roof).reduce((sum, facet) => sum + facet.triangles.length, 0));

  const catalogProject = structuredClone(project);
  catalogProject.types = [{
    id: "roof-framing-type", object_type: "roof.system", name: "RT1",
    parameters: { framing_system: "truss_purlin", truss_spacing_mm: 2500 },
  }];
  catalogProject.objects.roof.module_data.type_id = "roof-framing-type";
  catalogProject.objects.roof.module_data.instance_overrides = {};
  assert.equal(roofOutputs(catalogProject)[0].schedule.Trusses_pcs, 5);
  catalogProject.types[0].parameters.truss_spacing_mm = 5000;
  assert.equal(roofOutputs(catalogProject)[0].schedule.Trusses_pcs, 3, "catalog spacing edits cascade into the roof framing schedule");
});

test("rainwater sizing uses saved project intensity, runoff, outlet capacity and pipe diameter", () => {
  const roof = {
    boundary_mm: [[0, 0], [10000, 0], [10000, 8000], [0, 8000]],
    elevation_mm: 0, thickness_mm: 30, material: "metal_sheet",
    edges: Array(4).fill({ defines_slope: true, slope_deg: 25 }),
  };
  const settings = {
    design_rainfall_mm_per_hr: 180, design_return_period_years: 10, location: "Bangkok", source: "Municipal rainfall study 2025",
    runoff_coefficient: 0.95, outlet_capacity_lps: 1.9, downpipe_diameter_mm: 100,
  };
  const result = solveEaveGuttersAndDownpipes(roof, settings);
  assert.equal(result.catchment.peak_flow_lps, 3.8);
  assert.equal(result.downpipes.length, 2);
  assert.ok(result.downpipes.every(pipe => pipe.diameter_mm === 100));
  assert.equal(result.catchment.design_source, "Municipal rainfall study 2025");
  assert.equal(result.catchment.design_location, "Bangkok");
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
