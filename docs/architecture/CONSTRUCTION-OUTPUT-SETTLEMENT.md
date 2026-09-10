# Construction Output Settlement

Status: Accepted v1 foundation contract

## Purpose

Define when ConstructFlow may clear derived-output dirty flags and how a construction package records evidence that its quantity and drawing outputs were produced from the current Smart Object graph.

Generation and reconciliation intentionally mark Smart Objects dirty. A successful quantity calculation or drawing refresh must be able to settle the corresponding flag, but only for output that was actually completed. ConstructFlow must never clear dirty state merely because an orchestration command returned success.

## Separation of concerns

This contract distinguishes three independent states:

1. **Semantic currentness** — the current Smart Object graph and persisted domain definitions.
2. **Derived-output settlement** — whether quantity/drawing work has successfully consumed that graph.
3. **Publication approval** — whether QA, engineering/source-confidence rules and issue policy permit release.

An output may be current while still blocked from final construction issue, for example when structural objects remain `preliminary` and require engineer approval.

## Quantity settlement

`ConstructionTakeoff` remains the quantity producer. The settlement layer consumes its coverage result; it does not recompute domain quantities.

For each coverage entry:

- `included` means the owning provider successfully produced its required quantity output;
- `unsupported_type` means the quantity pipeline explicitly recognizes that no quantity output is required for that object type;
- `missing_definition` and `provider_error` are unresolved and must remain dirty.

Only objects with a settled coverage status may have `dirty_quantity` cleared.

A missing object ID cannot be treated as successful settlement.

## Drawing settlement

Drawing settlement is based on the issue-set sheet requests and the actual SketchUp scene-refresh evidence.

For each requested preset:

- a matching refresh result must exist;
- each `source_object_id` requested for that scene must appear in `rendered_object_ids` before that object may have `dirty_drawing` cleared;
- a rendered ID that no longer exists is stale evidence;
- missing or extra preset refreshes keep the drawing package partial.

Only actually rendered Smart Objects have `dirty_drawing` cleared.

When every requested issue-set scene is complete, the source `extension.zone` may also clear its own `dirty_drawing` flag because all of its current construction-package drawing dependents have been regenerated. This does not imply that the Extension itself owns a drawing representation.

## Publication requirement

Native LayOut/PDF export requires:

- successful Extension execution;
- Construction Quality Gate publishable;
- required output settlement publishable;
- Construction Currentness Audit publishable.

When native export is requested, drawing settlement is mandatory. A caller that intentionally skips drawing refresh may still build a working/non-exported quantity package, but it cannot publish a native construction issue from stale or missing drawing scenes.

## Fingerprints

The settlement layer records deterministic SHA-256 fingerprints for:

- takeoff coverage and totals;
- drawing preset/source/rendered scope.

These fingerprints are evidence for a particular derived-output run. They do not replace Smart Object IDs, domain definitions, revision metadata or the currentness scope fingerprint.

The Construction Currentness Audit is executed **after** dirty-flag settlement. This matters because the current Core dirty-flag mutation updates the Smart Object timestamp; the stored currentness fingerprint must therefore describe the post-settlement Smart Object state.

## Model-local output state

The latest construction-output evidence is stored on the source Extension entity under:

- dictionary: `constructflow.extension`
- key: `construction_output_state`
- schema version: `1`

The v1 record includes:

- Extension ID;
- drawing revision and issue status;
- settlement status/publishable state;
- takeoff fingerprint;
- drawing fingerprint;
- post-settlement currentness scope fingerprint;
- currentness status;
- settled quantity object IDs;
- settled drawing object IDs;
- export status (`not_requested`, `exported`, `failed`);
- recorded UTC timestamp.

The record is derived evidence, not a second semantic model. Missing state is valid for legacy projects and simply means no settlement evidence has been recorded yet.

## Change invalidation

Later semantic/domain mutations continue to mark affected objects `dirty_quantity` and/or `dirty_drawing`. The previous stored output-state record is historical evidence of the last package run; it must not override current dirty flags or currentness checks.

A future workflow may compare stored fingerprints against newly generated/current fingerprints after save/reopen. It must never clear dirty flags based solely on a stored fingerprint without reproducing or validating the corresponding derived output.

## Failure rules

- A quantity `provider_error` never clears `dirty_quantity`.
- A missing domain definition never clears `dirty_quantity`.
- A requested-but-not-rendered object never clears `dirty_drawing`.
- A missing requested drawing preset keeps drawing settlement partial.
- A stale rendered object ID keeps drawing settlement partial.
- Export cannot bypass a partial settlement when drawing output is required.
- Settlement never changes Smart Object identity, lifecycle, relationships or domain parameters.

## Acceptance criteria

- AC-COS-001: successful quantity coverage clears `dirty_quantity` only for settled object IDs.
- AC-COS-002: missing-definition/provider-error quantity coverage remains dirty and makes settlement partial.
- AC-COS-003: drawing refresh clears `dirty_drawing` only for actually rendered current Smart Objects.
- AC-COS-004: requested-but-not-rendered or stale rendered IDs make drawing settlement partial.
- AC-COS-005: a complete issue-set drawing refresh may clear the source Extension's package-level `dirty_drawing` flag.
- AC-COS-006: native export requires complete required output settlement in addition to QA/currentness gates.
- AC-COS-007: settlement records deterministic takeoff/drawing fingerprints and post-settlement currentness evidence in model-local Extension metadata.
- AC-COS-008: save/reopen may read the latest output-state record without requiring an external database or chat history.
- AC-COS-009: settlement never changes Smart Object identity/lifecycle/domain semantics.
