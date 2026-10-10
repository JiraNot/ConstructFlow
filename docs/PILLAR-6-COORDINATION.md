# Pillar 6 — Exact Clash + Dependency Coordination

> **Status:** implemented and verified (`npm run verify:coordination`, 47 checks)
> **Scope:** `packages/project-model` (dependency graph + project settings), `packages/clash-engine`
> (contact kernel, coordination model, versioned rule dataset, coordination engine),
> `packages/command-runtime` + `packages/command-schema` (cascade impact on mutations),
> `apps/plan-editor` (plan/elevation overlay + inspector panel).

ConstructFlow no longer answers "do these two boxes overlap?". It answers **which rule is violated,
by exactly how many millimetres, on which objects, and what to move** — and it knows which objects
depend on each other, so a delete, demolition or move can be explained before it happens.

```
Project ─┬─ DependencyGraph ──▶ DependencyImpactReport (cascade / needs_rehost / prune / blocks)
         │
         └─ CoordinationModel ──▶ exact solids ──▶ GJK/EPA contact ──▶ Rule dataset ──▶ Findings
                                                                                        │
                                     Plan overlay ◀── CoordinationReport ◀── Inspector panel
                                     Elevation overlay
                                     Command result (dependency_impact)
```

## 1. Dependency graph — one axis for "who is affected?"

`buildDependencyGraph(project)` in [dependencyGraph.ts](../packages/project-model/src/dependencyGraph.ts)
turns every reference the model already stores (and any relationship row) into typed edges with an
explicit cascade policy:

| Edge kind | Meaning | Declared by |
| :--- | :--- | :--- |
| `hosted_on` / `hosts` | opening on a wall, LED on a cabinet, roof on a shell | `wall_id`, `host_id`, `host_refs` |
| `supported_by` / `supports` | beam on a column, footing under a column | `start_column_id`, `supported_column_id` |
| `connects_to` | pipe end at a manhole, panel feed, strap beam | `start_node_id`, `panel_id`, … |
| `controls` | fixture controlled by a switch/panel | `controlled_ids[]`, `device_ids[]` |
| `derived_from` | rebar set from its host, room-derived surfaces | `host_id`, `room_id` |
| `references_level` | storey datum (`level_id`, `base_level_id`, `head_level_id`) | `level_refs`, level fields |
| `conflicts_with` | a coordination finding | `withConflictEdges(graph, findings)` |

Whole-object references are declared **as data** in `DEPENDENCY_REFERENCE_FIELDS` — adding a new
reference field is one line, not a new bespoke rule inside each domain engine.

Cascade policies: `delete` (meaningless without the target), `rehost` (survives but needs a new
host), `prune` (drop the reference), `follow` (geometry follows, e.g. openings), `inform`,
`block` (must be resolved first).

`analyzeDependencyImpact(graph, seeds, action)` walks the graph and returns a report with
dispositions, the UUID path that reached each dependent, Thai messages for confirmations, and
blocking entries. **When one pair is linked by several edges, the strongest policy wins** — a door
declared both by `wall_id` and by a `hosted_on` relationship is deleted with its wall, not merely
"informed".

`cascadeDeletionSet(graph, seeds)` gives the exact set of objects a delete must remove.

## 2. Exact contact, not inflated boxes

`packages/clash-engine/src/exactContact.ts` reduces every supported family to a **convex** solid
with a support function — oriented boxes (beams, openings, cabinets), capsules (pipes, conduits),
vertical cylinders/discs (columns, luminaires, sockets), point clouds and vertical sectors (door
swing envelopes) — then runs:

* **GJK** for the closest distance and witness points when solids are apart;
* **EPA** for penetration depth and the minimal translation direction when they overlap.

Every result reports `penetration_mm`, `penetration_range_mm` (the bracket the two methods agree
on), `distance_mm`, `clearance_shortfall_mm`, the unit `direction`, witness points on both bodies and
equally cheap `alternatives_mm`. Axis-aligned envelopes are still used, but only as the R-tree broad
phase — overlap candidates are never promoted to a verdict.

## 3. Versioned Thai rule dataset (data, not code)

`coordinationRules.ts` holds `cf-coordination-th` v1 rev 1 with 15 rules, each carrying
`jurisdiction`, `source` (standard + edition/clause), `effective_date`, `basis`
(`code` | `engineering_default` | `project_override`) and a computed fix strategy:

| Rule | Condition | Severity | Fix |
| :--- | :--- | :--- | :--- |
| `CF-CL-MEP-STR-001` | pipe/raceway vs column, beam, footing | hard | reroute, +margin |
| `CF-CL-MEP-SLB-002` | pipe through slab / floor build-up | hard | sleeve or void |
| `CF-CL-MEP-CLG-003` | pipe crowding the ceiling plane | clearance | shift vertical |
| `CF-CL-DOOR-SWN-004` | door swing envelope obstructed (พ.ร.บ. 55 ข้อ 40) | hard | flip handing / move object |
| `CF-CL-OPEN-STR-005` | opening too close to column/beam (เสาเอ็น-ทับหลัง) | clearance | shift |
| `CF-CL-OPEN-OPEN-006` | two openings on one wall too close | clearance | shift |
| `CF-CL-CAB-OPEN-007` | cabinet crowding a window/opening | clearance | shift |
| `CF-CL-CAB-ELE-008/009` | cabinet vs socket / device | clearance | relocate |
| `CF-CL-LGT-STR-010` | downlight buried in / crowding a beam | clearance | shift lateral |
| `CF-CL-LGT-CLG-011`, `CF-CL-LED-STR-012` | luminaire/cove vs ceiling or structure | clearance | shift |
| `CF-CL-DEM-HOST-013` | live object hosted on a demolished host | hard | re-host / re-route |
| `CF-CL-DEM-NEW-014` | new work overlapping what is being demolished | hard | sequence review |
| `CF-CL-GEN-999` | unclassified overlap (catch-all) | soft | review only |

Project deviations live in the project file as `coordination_settings`
([coordinationSettings.ts](../packages/project-model/src/coordinationSettings.ts)) and are validated
at the boundary: `rule_set_id/version`, `construction_slack_mm`, `include_generic_sweep`, and
`overrides[]` (`rule_id`, `enabled`, `required_clearance_mm`, `severity`, `basis`, `note`). They are
written through the `UpdateCoordinationSettings` command, so they participate in undo/redo.

`basis` keeps policy separate from engineering judgement: code clauses are cited, while values that
are ConstructFlow defaults are marked `engineering_default` so a project can re-tune them without
pretending to change the law.

## 4. Coordination engine

`runCoordination(project, options)` returns a deterministic `CoordinationReport`:

* provenance — `rule_set` id/version/revision/jurisdiction/effective_date, `applied_overrides`,
  `generated_at`, `duration_ms` and human-readable `notes`;
* `summary` — objects considered, proxies built, rules evaluated, broad/narrow-phased pair counts,
  intentional connections suppressed, non-coexisting pairs suppressed, findings by severity and by
  rule, and narrow-phase methods (`gjk_epa` vs `sampled`);
* `findings[]` — `rule_id`, `severity`, `category`, Thai/English titles, requirement, rationale,
  the participating objects with their role/subject/phase, the measured `interaction`, witness
  point, `highlight` markers, `suggestion`, `source`, `basis`, `requires_engineer_review` and
  `phase_context` (sequential / existing-vs-new / same-phase / mixed);
* `warnings[]` — e.g. an unknown pipe invert level, which downgrades the finding to
  `basis: engineering_default` instead of silently clearing it.

Suppression is phase-aware and intent-aware: hosted/connected pairs are never reported as clashes,
and pairs that never coexist (demolished before the new work exists) are excluded from the
geometric rules and reported by the sequencing rule instead.

Fixes are expressed for the field: `reroute_primary`, `shift_primary[_lateral|_vertical]`,
`shift_secondary`, `relocate_secondary`, `add_sleeve_or_void`, `flip_swing_handing`, or
`review_only`. Magnitudes are rounded up to a 5 mm construction step after adding the rule margin
and the project's slack, so a suggestion is always buildable — e.g. a 100 mm route through a beam
reports `penetration 250 mm → ยกขึ้น 280 มม.` with the equal-cost alternative listed separately.

## 5. Commands know their consequences

* `DeleteObject` returns `dependency_impact` plus `deleted_object_ids` covering the graph cascade,
  and marks surviving dependents that lost a host in `updated_object_ids` with a Thai warning.
* `UpdateObjectPhase` (demolition) attaches a `demolish` impact report, so hosted openings, sockets
  and cabinets are flagged as needing a new host rather than silently kept.
* `UpdateCoordinationSettings` stores validated project deviations.
* Undo/redo stays atomic: one history entry per committed batch, and undo restores the previous
  document byte-for-byte (asserted in the acceptance script via `serializeProject`).

## 6. Where findings are shown

* **Plan** — [coordinationOverlayPlan.mjs](../apps/plan-editor/src/coordinationOverlayPlan.mjs)
  converts world-space highlight markers into screen primitives (pure and unit-testable);
  [coordinationOverlay.ts](../apps/plan-editor/src/rendering/coordinationOverlay.ts) paints them:
  dashed subject outlines, a filled impact rectangle, a dashed measurement segment with its
  millimetre tag, and a badge with the severity, rule id and the suggested fix.
* **Elevation** — the same overlay, projected onto the facade (horizontal axis/height), so a clash
  seen in plan is shown at the same height in elevation.
* **Inspector** — [CoordinationPanel.tsx](../apps/plan-editor/src/components/CoordinationPanel.tsx)
  lists every finding with severity chips, rule provenance, clickable objects, measured distance,
  fix suggestion and alternatives, engineer-review flags, phase context, and a per-rule
  "กำหนดระยะเอง" control that writes a project override through the CommandBus. Hard-clash counts
  appear on the panel tab itself.

## 7. Verification

| Command | Covers |
| :--- | :--- |
| `npm --prefix packages/project-model test` | 48 tests incl. dependency graph |
| `npm --prefix packages/clash-engine test` | 42 tests incl. exact contact + coordination |
| `npm run verify:coordination` | 47 acceptance checks on a real extension project |
| `npm run build:standalone` | type-checks every package and the editor |

The acceptance script seeds the real 4.00 × 2.50 m kitchen-extension project through the
CommandBus, routes a new cold-water line across an existing beam at mid-depth, places a luminaire
inside it, and then asserts: graph edges, cascade vs re-host behaviour, hard-clash penetration and
its 5 mm-rounded fix, deterministic output, override round-trip (including rejection of a malformed
override), atomic undo/redo of both a cascade delete and a settings change, and the overlay plan
produced for both plan and elevation projections.

## 8. Deliberate boundaries

* Prices, Factor F, waste factors, labour rates and law parameters are **not** in this engine; the
  dataset holds geometry/clearance requirements only. Pricing belongs to a versioned dataset of its
  own (see the roadmap in `AGENTS.md`).
* The `sheet-engine` permit set still draws the plan/elevation geometry; rendering coordination
  findings as a dedicated A-01/QA sheet is the next step.
* `apps/mcp-server` is a Python bridge, so agents reach the same commands through the TS command
  runtime; exposing `runCoordination` as an MCP tool is part of the AI/MCP phase.
