# Extension Domain Bridges

Status: Accepted v1 foundation contract.

## Purpose

An Extension orchestration plan is useful only when every enabled domain can consume its intent through a public domain command. This contract closes that boundary without allowing `constructflow.extension` to create or mutate sibling-domain geometry directly.

The canonical command convention remains:

`GenerateOrUpdate<Domain>FromExtension`

## Required bridge set

The v1 construction vertical slice registers bridges for:

- Structure;
- Surface;
- Roof;
- Drainage;
- Interior;
- Electrical.

The Extension `ExecutionRunner` dispatches these commands in dependency order. Each target module owns its definition, geometry, validation, Smart Object lifecycle and dirty-state events.

## Idempotency and provenance

Generated construction objects must carry a `generated_from` relationship to the source `extension.zone` plus a stable semantic slot. Re-running the same intent updates the matching generated object rather than duplicating it.

Foundation slots are:

- Structure columns: `corner_N`;
- Structure foundations: `foundation_corner_N` corresponding to the supported generated column slot;
- Surface: `primary_floor`;
- Roof: `primary`;
- Drainage: `primary_route` when explicit network endpoints are supplied;
- Interior: `primary_joinery` when a deterministic preliminary joinery request is permitted;
- Electrical: `primary_light` when a deterministic preliminary lighting request is permitted.

Stable slots are implementation identities, not drawing labels.

## Regeneration reconciliation

Regeneration is a convergence operation, not append-only generation. After a successful bridge execution, the generated Smart Objects for that source Extension must represent the current source intent rather than an accumulation of historical generated output.

A generated `new_construction` object may be erased when all of the following are true:

- it is derived from the current Extension through `generated_from`;
- the bridge owns the object's domain lifecycle;
- its semantic slot is no longer present or no longer permitted by the current source intent;
- the object represents generated/unissued derived work rather than existing/as-built construction that requires lifecycle history.

This erasure is **not demolition**. Existing construction, issued construction that requires history, relocation and construction replacement continue to use lifecycle and replacement semantics. A stale generated new-work object must not be kept merely by setting `removed_phase=demolition`, because removal of an unissued derived result is a source reconciliation operation rather than a field demolition event.

Current v1 reconciliation rules:

- Structure removes generated `corner_N` columns whose slots no longer exist after the Extension boundary topology shrinks. Their generated `foundation_corner_N` foundations are reconciled first. Remaining slots are updated in place.
- Structure removes all generated Extension foundations when the current Structure config explicitly disables foundation generation while retaining the current generated columns.
- Interior removes the generated `primary_joinery` assumption when the current program/policy no longer permits automatic joinery.
- Electrical removes the generated `primary_light` assumption when the current program/policy no longer permits automatic lighting.
- Surface and Roof remain singleton generated objects and update their existing stable slots in place.
- Drainage does **not** treat omitted endpoint overrides as deletion. Endpoint overrides are not yet a persisted Extension source contract, so missing connector IDs on a later invocation are ambiguous. Reconnect, disable or removal of a generated Drainage route requires explicit persisted intent/command semantics.

Removed generated IDs must be returned through `removed_object_ids` and must invalidate downstream quantity/drawing outputs so package generation cannot retain stale takeoff or drawing content.

The current Structure `corner_N` slots are stable only while source vertex order remains stable. A future source-topology identity contract may replace positional corner slots with persistent member intent IDs; this v1 reconciliation does not claim vertex-reorder identity stability.

## Domain safety rules

### Structure

The Structure bridge creates or updates one preliminary column per Extension boundary corner. When the Structure config uses the default `foundation: auto`, it also creates or updates one preliminary foundation supporting each generated column.

Foundation generation uses the Structure domain's own `FoundationDefinition`, geometry, validation, quantity and plan-representation contracts. The Extension bridge only passes orchestration intent.

Foundation controls in the v1 intent are:

- `foundation`: `auto`, a supported foundation type (`spread_footing` or `pile_cap`), or an explicit disabled value (`false`, `none`, `disabled`, `off`);
- `foundation_type`: supported type when `foundation` remains `auto`;
- `foundation_size_mm`: width, length and thickness;
- `foundation_top_offset_mm`: offset from the generated column base elevation;
- `foundation_material`;
- `foundation_engineering_status`.

Defaults are deliberately preliminary: spread footing, `800 x 800 x 300 mm`, reinforced concrete, top at the column base and `preliminary` engineering status. These defaults are modeling assumptions, not structural design approval. Final construction issue remains subject to the Construction Quality Gate.

A generated foundation carries both `generated_from` provenance to the Extension and a `supports` relation to its generated column; the column carries the reciprocal `supported_by` relation. If foundation generation is explicitly disabled, this generated relationship pair is reconciled away with the generated foundation.

### Surface

The extension footprint can deterministically generate/update a floor/surface boundary. Level semantics are resolved from the Extension base level and offset where known. The foundation default surface is concrete unless the domain config provides another supported type.

### Roof

The extension footprint and target height can deterministically generate/update the primary roof. Unsupported high-level roof intents must fall back only to an explicitly supported foundation roof form; they must not fabricate a complex roof topology.

### Drainage

Drainage must not invent network destinations. A generated route requires explicit compatible start and end connector IDs. Without both endpoints the bridge succeeds as a reviewed coordination intent with a visible warning and creates no pipe geometry.

Changing the endpoints of an already generated route requires an explicit reconnect workflow; regeneration may update the path and route parameters only while endpoint identity remains stable.

### Interior

Automatic joinery is permitted only for a deterministic program policy or an explicit `auto_joinery: true` request. Foundation auto programs are Kitchen and Laundry. Generated joinery is marked preliminary/assumed and requires designer review. Other programs create no invented cabinet geometry.

### Electrical

A single preliminary central luminaire may be generated for deterministic covered programs or an explicit `auto_lighting: true` request. It is marked assumed and requires electrical-design review. This is not a final circuit or lighting calculation.

## Failure propagation

Bridge failures use the existing Extension dependency graph. A failed domain blocks only transitive dependents. Independent domains can continue. Failed/dependency-blocked domains remain dirty and cannot be treated as current for issue/publication workflows.

## Drawing and quantity propagation

A generated, updated or reconciled-away domain Smart Object must invalidate its domain-owned quantity and drawing output. Later project-level workflow stages consume semantic states and current Smart Object membership; they must not recalculate domain meaning from raw SketchUp geometry or retain removed generated IDs.

Generated Structure foundations are ordinary Structure Smart Objects for downstream purposes: Structure plan representations render them, the Structure quantity provider supplies concrete/formwork quantities, and the Extension ConstructionTakeoff aggregates those items without re-deriving foundation meaning.

## Acceptance criteria

- AC-EXT-020: every enabled v1 Extension domain resolves to a registered public `GenerateOrUpdate*FromExtension` command.
- AC-EXT-021: Surface and Roof regeneration reuse stable `generated_from` object identities rather than duplicating output.
- AC-EXT-022: Drainage does not generate a route without explicit connector endpoints.
- AC-EXT-023: generated Interior/Electrical assumptions are visibly preliminary and do not masquerade as final design.
- AC-EXT-024: all bridge mutations remain inside target-domain command ownership and emit Quantity/Drawing invalidation.
- AC-EXT-025: Extension dependency failure propagation remains unchanged when the real bridge set is installed.
- AC-EXT-026: regeneration removes generated Structure slots that are no longer present in the current Extension topology and reports them in `removed_object_ids`.
- AC-EXT-027: when automatic Interior/Electrical policy changes from enabled to disabled, their prior generated singleton assumptions are removed rather than retained as stale model/quantity/drawing content.
- AC-EXT-028: Drainage route removal is never inferred solely from omitted non-persisted endpoint overrides; explicit source intent is required.
- AC-EXT-029: default Structure Extension generation creates one preliminary foundation per generated column with reciprocal support relationships and stable `foundation_corner_N` provenance.
- AC-EXT-030: changing foundation type/size updates the same generated foundation identities, while explicitly disabling foundations removes those generated foundations without deleting the supported columns.
- AC-EXT-031: generated foundation concrete/formwork quantities flow into the Extension ConstructionTakeoff with source-object traceability and phase scope.
