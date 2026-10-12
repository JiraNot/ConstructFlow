import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyProjectDocument } from "@constructflow/project-model";
import { movePipeRouteEndpoint, solveGravityInverts, drainageOutputs } from "../dist/index.js";

test("drainage: moving a free route endpoint preserves gravity fall and connected nodes", () => {
  const route = {
    system: "waste",
    nodes_mm: [[0, 0, -300], [2000, 0, -320], [4000, 0, -340]],
    diameter_mm: 100,
    start_node_id: undefined,
    end_node_id: undefined,
    start_invert_mm: -300,
    end_invert_mm: -340,
    minimum_slope_ratio: 0.01,
    material: "PVC",
  };
  const endMoved = movePipeRouteEndpoint(route, "end", [6000, 0]);
  assert.deepEqual(endMoved.nodes_mm, [[0, 0, -300], [2000, 0, -320], [6000, 0, -360]]);
  assert.equal(endMoved.start_invert_mm, -300);
  assert.equal(endMoved.end_invert_mm, -360);

  const startMoved = movePipeRouteEndpoint(route, "start", [-1000, 0]);
  assert.deepEqual(startMoved.nodes_mm, [[-1000, 0, -290], [2000, 0, -320], [4000, 0, -340]]);
  assert.equal(startMoved.end_invert_mm, -340);

  assert.throws(() => movePipeRouteEndpoint({ ...route, start_node_id: "manhole-1" }, "start", [0, 500]), /connected pipe start/i);
  const water = movePipeRouteEndpoint({ ...route, system: "cold_water" }, "end", [6000, 0]);
  assert.deepEqual(water.nodes_mm, [[0, 0, -300], [2000, 0, -320], [6000, 0, -340]]);
});

test("drainage: solveGravityInverts automatically calculates 1:100 slope and cascades to manhole", () => {
  const p = createEmptyProjectDocument("TEST-DRAINAGE");
  const pipeId = "pipe-1";
  const mhStartId = "mh-start";
  const mhEndId = "mh-end";

  p.objects[mhStartId] = {
    id: mhStartId,
    object_type: "drainage.manhole",
    owner_module: "constructflow.drainage",
    schema_version: 1,
    created_phase: "new_construction",
    removed_phase: null,
    level_refs: [],
    host_refs: [],
    connector_refs: [],
    status: "active",
    module_data: {
      mark: "MH1",
      location_mm: [0, 0, 0],
      size_mm: [400, 500, 600],
      invert_mm: -300,
      system: "waste",
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  p.objects[mhEndId] = {
    id: mhEndId,
    object_type: "drainage.manhole",
    owner_module: "constructflow.drainage",
    schema_version: 1,
    created_phase: "new_construction",
    removed_phase: null,
    level_refs: [],
    host_refs: [],
    connector_refs: [],
    status: "active",
    module_data: {
      mark: "MH2",
      location_mm: [4000, 0, 0],
      size_mm: [400, 500, 600],
      invert_mm: null,
      system: "waste",
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  p.objects[pipeId] = {
    id: pipeId,
    object_type: "drainage.pipe_route",
    owner_module: "constructflow.drainage",
    schema_version: 1,
    created_phase: "new_construction",
    removed_phase: null,
    level_refs: [],
    host_refs: [mhStartId, mhEndId],
    connector_refs: [],
    status: "active",
    module_data: {
      mark: "P1",
      system: "waste",
      nodes_mm: [
        [0, 0, -300],
        [4000, 0, -300],
      ],
      diameter_mm: 50,
      start_node_id: mhStartId,
      end_node_id: mhEndId,
      start_invert_mm: null,
      end_invert_mm: null,
      minimum_slope_ratio: 0.01,
      material: "PVC",
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const solved = solveGravityInverts(p);
  const pipeData = solved.objects[pipeId].module_data;
  const mhData = solved.objects[mhEndId].module_data;

  // Run is 4000 mm. At 1:100 (0.01) slope, drop is 40 mm.
  // Start IL: -300 mm. End IL: -340 mm.
  assert.equal(pipeData.start_invert_mm, -300);
  assert.equal(pipeData.end_invert_mm, -340);
  assert.equal(mhData.invert_mm, -340);

  const outputs = drainageOutputs(solved);
  const pipeOut = outputs.find((o) => o.object_id === pipeId);
  assert.ok(pipeOut);
  assert.equal(pipeOut.schedule.Slope, 0.01);
  assert.equal(pipeOut.warnings.length, 0);
});
