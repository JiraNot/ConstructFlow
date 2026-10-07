import test from "node:test";
import assert from "node:assert/strict";
import { createKitchenProofProject, planPhaseProof } from "../dist/index.js";
import {
  CommandBus,
  ProjectCommandSession,
} from "@constructflow/command-runtime";
import {
  serializeProject,
  deserializeProject,
} from "@constructflow/project-model";
test("Phase 1–6 proof commands are atomic, editable, replayable and persist with stable UUIDs", () => {
  const kitchen = createKitchenProofProject();
  assert.equal(kitchen.status, "success");
  const session = new ProjectCommandSession(kitchen.updatedProject),
    planned = planPhaseProof(kitchen.updatedProject),
    result = session.execute(planned);
  assert.equal(result.status, "success", JSON.stringify(result.errors));
  assert.equal(result.emittedEnvelopes.length, planned.length);
  const fresh = deserializeProject(serializeProject(result.updatedProject));
  assert.equal(
    serializeProject(fresh),
    serializeProject(result.updatedProject),
  );
  const added = Object.keys(fresh.objects).filter(
    (id) => !kitchen.updatedProject.objects[id],
  );
  assert.ok(added.length > 17);
  assert.ok(
    added.every((id) => fresh.objects[id].created_phase === "new_construction"),
  );
  assert.deepEqual(session.undo(), kitchen.updatedProject);
  assert.equal(serializeProject(session.redo()), serializeProject(fresh));
  const replay = CommandBus.executeBatch(
    kitchen.updatedProject,
    result.emittedEnvelopes.map((e) => ({ name: e.name, input: e.input })),
    "ai",
  );
  assert.equal(replay.status, "success", JSON.stringify(replay.errors));
  assert.deepEqual(
    Object.keys(replay.updatedProject.objects).sort(),
    Object.keys(fresh.objects).sort(),
  );
});
