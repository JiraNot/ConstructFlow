import test from "node:test";
import assert from "node:assert/strict";
import {
  ConstructFlowSolver,
  evaluateParametricSymbol,
} from "../dist/index.js";
import {
  createDoorElevationSymbol,
  createWindowElevationSymbol,
  createDoorPlanSymbol,
  createWindowPlanSymbol,
} from "@constructflow/project-model";

test("constraint-engine: ConstructFlowSolver solves lock and offset constraints", () => {
  const solver = new ConstructFlowSolver();
  solver.addLockConstraint("wall1", "startX", 0);
  solver.addOffsetConstraint("wall1", "endX", "wall1", "startX", 3500);

  const solution = solver.solve();
  assert.equal(solution.get("wall1.startX"), 0);
  assert.equal(solution.get("wall1.endX"), 3500);
});

test("constraint-engine: evaluates parametric door elevation symbol with closed background polygons", () => {
  const doorSymbol = createDoorElevationSymbol({ panelCount: 1, hingeAtStart: true, showOperationIndicator: false });
  const result = evaluateParametricSymbol(doorSymbol, {
    W: 900,
    H: 2000,
    F: 50,
  });

  assert.ok(result.length > 0);
  const outL = result.find((l) => l.id === "out_l");
  assert.ok(outL);
  assert.deepEqual(outL.start, [0, 0]);
  assert.deepEqual(outL.end, [0, 2000]);

  // Polygons check
  assert.ok(result.polygons.length >= 2);
  const outPoly = result.polygons.find((p) => p.id === "out_frame_poly");
  assert.ok(outPoly);
  assert.equal(outPoly.fill, "#ffffff");
  assert.equal(outPoly.closed, true);
  assert.deepEqual(outPoly.points, [
    [0, 0],
    [900, 0],
    [900, 2000],
    [0, 2000],
  ]);

  // When showOperationIndicator is false, no diagonal swing lines exist
  assert.ok(result.every((l) => l.style !== "dashed"));
});

test("constraint-engine: door elevation emits swing diagonals when showOperationIndicator is true", () => {
  const doorSymbol = createDoorElevationSymbol({ panelCount: 1, hingeAtStart: true, showOperationIndicator: true });
  const result = evaluateParametricSymbol(doorSymbol, {
    W: 900,
    H: 2000,
    F: 50,
  });

  const swingTop = result.find((l) => l.id === "p0_swing_t");
  assert.ok(swingTop);
  assert.equal(swingTop.style, "dashed");
});

test("constraint-engine: evaluates parametric window elevation with muntins and panel ratios", () => {
  const windowSymbol = createWindowElevationSymbol({
    panelCount: 2,
    panelWidthRatios: [0.35, 0.65],
    muntinRows: 2,
    muntinColumns: 2,
    showOperationIndicator: false,
  });
  const result = evaluateParametricSymbol(windowSymbol, {
    W: 2100,
    H: 1400,
    F: 50,
    S: 50,
  });

  assert.ok(result.length > 0);
  const outPoly = result.polygons.find((p) => p.id === "out_frame_poly");
  assert.ok(outPoly);
  assert.equal(outPoly.fill, "#ffffff");
  assert.deepEqual(outPoly.points[0], [0, 0]);
  assert.deepEqual(outPoly.points[2], [2100, 1400]);

  // Meeting stile at 35% ratio = 735 mm
  const stile = result.find((l) => l.id === "stile_0");
  assert.ok(stile);
  assert.equal(stile.start[0], 735);
  assert.equal(stile.end[0], 735);

  // Muntins check
  const mRow1 = result.find((l) => l.id === "muntin_row_1");
  const mCol1 = result.find((l) => l.id === "muntin_col_1");
  assert.ok(mRow1);
  assert.ok(mCol1);
});

test("constraint-engine: evaluates parametric door plan symbol with jambs and 90-degree swing arc", () => {
  const doorPlan = createDoorPlanSymbol({ handing: "left_in", panelCount: 1 });
  const result = evaluateParametricSymbol(doorPlan, {
    W: 900,
    T: 100,
    F: 50,
    D: 40,
  });

  // Left and right jamb polygons
  assert.ok(result.polygons.length >= 2);
  const leftJamb = result.polygons.find((p) => p.id === "left_jamb");
  const rightJamb = result.polygons.find((p) => p.id === "right_jamb");
  assert.ok(leftJamb);
  assert.ok(rightJamb);
  assert.deepEqual(leftJamb.points[0], [-50, -50]);
  assert.deepEqual(leftJamb.points[2], [0, 50]);
  assert.deepEqual(rightJamb.points[0], [900, -50]);
  assert.deepEqual(rightJamb.points[2], [950, 50]);

  // Swing arc
  assert.ok(result.arcs.length >= 1);
  const swingArc = result.arcs.find((a) => a.id === "swing_arc");
  assert.ok(swingArc);
  assert.equal(swingArc.radius, 900);
  assert.equal(swingArc.sweep_angle_deg, 90);
});

test("constraint-engine: evaluates parametric window plan symbol with jambs and sliding sashes", () => {
  const windowPlan = createWindowPlanSymbol({ panelCount: 2, panelWidthRatios: [0.5, 0.5] });
  const result = evaluateParametricSymbol(windowPlan, {
    W: 1200,
    T: 100,
    F: 50,
    S: 40,
  });

  assert.ok(result.polygons.length >= 2);
  const sillExt = result.find((l) => l.id === "sill_ext");
  const sillInt = result.find((l) => l.id === "sill_int");
  assert.ok(sillExt);
  assert.ok(sillInt);
  assert.deepEqual(sillExt.start, [0, -50]);
  assert.deepEqual(sillExt.end, [1200, -50]);

  const sash0 = result.find((l) => l.id === "sash_0");
  const sash1 = result.find((l) => l.id === "sash_1");
  assert.ok(sash0);
  assert.ok(sash1);
  assert.notEqual(sash0.start[1], sash1.start[1]); // staggered tracks
});
