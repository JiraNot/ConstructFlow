import test from "node:test";
import assert from "node:assert/strict";
import {
  recommendEITBreakerAndWire,
  balanceCircuitsPhase,
} from "../dist/index.js";

test("electrical: recommendEITBreakerAndWire enforces วสท. standard breaker and wire sizing", () => {
  // Low load lighting: 500W -> 2.17A (design 2.7A) -> 16AT/50AF, 2.5 mm2
  const light = recommendEITBreakerAndWire(500);
  assert.equal(light.breaker_rating_at, 16);
  assert.equal(light.breaker_frame_af, 50);
  assert.equal(light.cable_size_mm2, 2.5);

  // General outlet: 2500W -> 10.87A (design 13.6A) -> 20AT/50AF, 4.0 mm2
  const outlet = recommendEITBreakerAndWire(2500);
  assert.equal(outlet.breaker_rating_at, 20);
  assert.equal(outlet.cable_size_mm2, 4.0);

  // Water heater / AC: 4000W -> 17.39A (design 21.7A) -> 32AT/50AF, 6.0 mm2
  const heater = recommendEITBreakerAndWire(4000);
  assert.equal(heater.breaker_rating_at, 32);
  assert.equal(heater.cable_size_mm2, 6.0);
});

test("electrical: balanceCircuitsPhase distributes circuits across Phase A, B, C under 15% unbalance", () => {
  const circuits = [
    { id: "ckt-1", watts: 1500 },
    { id: "ckt-2", watts: 1200 },
    { id: "ckt-3", watts: 1800 },
    { id: "ckt-4", watts: 800 },
    { id: "ckt-5", watts: 950 },
    { id: "ckt-6", watts: 1100 },
  ];

  const result = balanceCircuitsPhase(circuits);
  assert.equal(result.total_watts, 7350);
  assert.equal(result.average_watts, 2450);
  assert.ok(result.max_unbalance_pct <= 15, `Unbalance ${result.max_unbalance_pct}% exceeds 15%`);
  assert.equal(result.is_balanced, true);

  // Every circuit has an assigned phase
  for (const c of circuits) {
    assert.ok(["Phase A", "Phase B", "Phase C"].includes(result.assignments[c.id]));
  }
});
