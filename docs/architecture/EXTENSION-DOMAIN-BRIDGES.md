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

- Structure: existing stable member slots (`corner_N`);
- Surface: `primary_floor`;
- Roof: `primary`;
- Drainage: `primary_route` when explicit network endpoints are supplied;
- Interior: `primary_joinery` when a deterministic preliminary joinery request is permitted;
- Electrical: `primary_light` when a deterministic preliminary lighting request is permitted.

Stable slots are implementation identities, not drawing labels.

## Domain safety rules

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

A generated or updated domain Smart Object must mark its domain-owned quantity and drawing output dirty. Later project-level workflow stages consume these semantic states; they must not recalculate domain meaning from raw SketchUp geometry.

## Acceptance criteria

- AC-EXT-020: every enabled v1 Extension domain resolves to a registered public `GenerateOrUpdate*FromExtension` command.
- AC-EXT-021: Surface and Roof regeneration reuse stable `generated_from` object identities rather than duplicating output.
- AC-EXT-022: Drainage does not generate a route without explicit connector endpoints.
- AC-EXT-023: generated Interior/Electrical assumptions are visibly preliminary and do not masquerade as final design.
- AC-EXT-024: all bridge mutations remain inside target-domain command ownership and emit Quantity/Drawing invalidation.
- AC-EXT-025: Extension dependency failure propagation remains unchanged when the real bridge set is installed.
