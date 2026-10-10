import test from "node:test";
import assert from "node:assert/strict";
import {
  ConstructFlowSolver,
  evaluateParametricSymbol,
} from "../dist/index.js";
import {
  createDoorElevationSymbol,
  createWindowElevationSymbol,
} from "@constructflow/project-model";

test("constraint-engine: ConstructFlowSolver solves lock and offset constraints", () => {
  const solver = new ConstructFlowSolver();
  solver.addLockConstraint("wall1", "startX", 0);
  solver.addOffsetConstraint("wall1", "endX", "wall1", "startX", 3500);

  const solution = solver.solve();
  assert.equal(solution.get("wall1.startX"), 0);
  assert.equal(solution.get("wall1.endX"), 3500);
});

test("constraint-engine: evaluates parametric door elevation symbol", () => {
  const doorSymbol = createDoorElevationSymbol(1, true);
  const evaluatedLines = evaluateParametricSymbol(doorSymbol, {
    W: 900,
    H: 2000,
    F: 50,
  });

  assert.ok(evaluatedLines.length > 0);
  const outL = evaluatedLines.find((l) => l.id === "out_l");
  assert.ok(outL);
  assert.deepEqual(outL.start, [0, 0]);
  assert.deepEqual(outL.end, [0, 2000]);

  const outT = evaluatedLines.find((l) => l.id === "out_t");
  assert.ok(outT);
  assert.deepEqual(outT.start, [0, 2000]);
  assert.deepEqual(outT.end, [900, 2000]);

  const inL = evaluatedLines.find((l) => l.id === "in_l");
  assert.ok(inL);
  assert.deepEqual(inL.start, [50, 0]);
  assert.deepEqual(inL.end, [50, 1950]);
});

test("constraint-engine: evaluates parametric window elevation symbol with multiple sashes", () => {
  const windowSymbol = createWindowElevationSymbol(2);
  const evaluatedLines = evaluateParametricSymbol(windowSymbol, {
    W: 1800,
    H: 1200,
    F: 50,
    S: 50,
  });

  assert.ok(evaluatedLines.length > 0);
  const outT = evaluatedLines.find((l) => l.id === "out_t");
  assert.ok(outT);
  assert.deepEqual(outT.start, [0, 1200]);
  assert.deepEqual(outT.end, [1800, 1200]);

  const outB = evaluatedLines.find((l) => l.id === "out_b");
  assert.ok(outB);
  assert.deepEqual(outB.start, [0, 0]);
  assert.deepEqual(outB.end, [1800, 0]);
});
