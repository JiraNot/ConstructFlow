# Extension Construction Intent

Status: Accepted v1 foundation contract

## Purpose

Persist durable construction-generation choices for an `extension.zone` inside the SketchUp project so later regeneration, boundary edits and workflow reruns do not depend on chat history or one-off command arguments.

The persisted construction intent belongs to the Extension module. It configures sibling-domain public generation commands but does not transfer ownership of Structure, Surface, Roof, Drainage, Interior or Electrical Smart Objects to Extension.

## Storage

The v1 payload is stored on the Extension Smart Object entity under:

- attribute dictionary: `constructflow.extension`
- key: `construction_intent`
- schema version: `1`

Logical shape:

```yaml
schema_version: 1
domains:
  structure: {}
  surface: {}
  roof: {}
  drainage: {}
  interior: {}
  electrical: {}
```

Only domains with explicit project intent need to be present. Absence of the key is read as an empty schema-v1 payload so legacy projects remain compatible without a destructive migration.

## Precedence

Final domain generation configuration resolves in this order, lowest to highest precedence:

1. Extension Generator defaults;
2. persisted `construction_intent.domains` overrides;
3. per-run `RunExtensionConstructionWorkflow.domains` overrides.

Per-run overrides are ephemeral. They affect that invocation only and must not silently modify persisted construction intent.

Persisted values remain authoritative for later runs until changed through an explicit Extension construction-intent command.

## Public command

`SetExtensionConstructionIntent` is the v1 mutation boundary.

Input:

- `object_id` or Extension entity;
- `domains` hash containing one or more allowed domain configs;
- optional `replace: true` to replace the complete persisted domain map rather than deep-merge it.

The command marks Extension dependents, quantity and drawing outputs dirty and emits `ExtensionConstructionIntentChanged`.

Unknown domain names or non-hash domain configurations are rejected rather than stored as opaque behavior.

## Durable Drainage intent

Drainage endpoints are the primary reason this contract is required. When a user has explicitly selected compatible start/end connectors, the IDs may be persisted under:

```yaml
domains:
  drainage:
    enabled: true
    start_connector_id: <connector-id>
    end_connector_id: <connector-id>
    routing_mode: semi_auto
    diameter_mm: 100
```

A later Extension boundary or roof change can then regenerate the route using the same explicit endpoint identity without requiring the user to re-enter one-off workflow options.

The system must never invent connector IDs or network destinations. Missing persisted endpoints remain unresolved and continue to be handled by Drainage QA.

## Explicit disable and removal semantics

Missing keys do not mean deletion. In particular, omission of Drainage endpoint fields from a later run is not permission to erase or reconnect an existing generated route.

A domain disable/removal transition must be represented explicitly, for example with `enabled: false`, and the owning domain bridge must define the reconciliation/lifecycle behavior before destructive action occurs.

Endpoint identity changes also require explicit reconnect semantics. Persisting a different connector ID must not silently rewrite an already connected route unless the owning Drainage command explicitly supports that transition.

## Other domain examples

The same payload may persist deterministic project choices such as:

- Structure foundation policy/type/size and engineering-status intent;
- Surface system/material options;
- Roof generation options;
- Interior automatic preliminary joinery policy;
- Electrical automatic preliminary lighting policy.

Persisting a choice does not turn a preliminary generated object into approved engineering/design information. Existing QA and source-confidence rules still apply.

## Persistence and recovery

The construction intent is model-local semantic data and must survive `.skp` save/reopen with the Extension Smart Object. It is separate from external project databases and chat/session state.

The payload uses its own schema version. Future incompatible changes require deterministic migration rules under the normal Persistence/Migration contract.

## Workflow traceability

`ConstructionWorkflowRunner` exposes:

- persisted domain intent used for the run;
- ephemeral run overrides;
- effective domain overrides after merge.

This trace is evidence of how generation was configured. It does not duplicate the resulting domain Smart Object definitions.

## Acceptance criteria

- AC-ECI-001: an Extension with no persisted construction intent reads as an empty schema-v1 intent and remains usable.
- AC-ECI-002: `SetExtensionConstructionIntent` persists only allowed domain configuration and dirties dependent outputs.
- AC-ECI-003: persisted domain config survives independent workflow invocations and is consumed when no run override is supplied.
- AC-ECI-004: run overrides win for that invocation but do not mutate the persisted payload.
- AC-ECI-005: persisted Drainage start/end connector IDs are reused on later regeneration rather than being invented or forgotten.
- AC-ECI-006: omission of a field is never interpreted as destructive disable/removal; destructive transitions require explicit semantics.
