# Extension Construction Intent

Status: Accepted v1 foundation contract

## Purpose

Persist durable construction-generation choices for an `extension.zone` inside the SketchUp project so later regeneration, boundary edits and workflow reruns do not depend on chat history or one-off command arguments.

The persisted construction intent belongs to the Extension module. It configures sibling-domain public generation commands but does not transfer ownership of Architecture, Opening, Door/Window, Structure, Surface, Roof, Drainage, Interior or Electrical Smart Objects to Extension.

## Storage

The v1 payload is stored on the Extension Smart Object entity under:

- attribute dictionary: `constructflow.extension`
- key: `construction_intent`
- schema version: `1`

Logical shape:

```yaml
schema_version: 1
domains:
  architecture: {}
  opening: {}
  door_window: {}
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

Drainage endpoints are a primary reason this contract is required. When a user has explicitly selected compatible start/end connectors, the IDs may be persisted under:

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

## Durable attachment-opening intent

An Extension attachment host does not imply that the existing wall should be cut. Attachment opening intent is therefore opt-in and may be persisted only as explicit Opening-domain configuration, for example:

```yaml
domains:
  opening:
    enabled: true
    confirm_modify_existing_host: true
    width_mm: 900
    height_mm: 2100
    sill_mm: 0
```

Persisting `opening.enabled: true` does not bypass the Opening validator or the Extension Attachment Host resolver. Every workflow run still validates the host wall, shared edge, opening bounds and overlap rules through the owning domain contracts.

Omitting the `opening` domain, or leaving its default enabled state unset, means no attachment-opening action. It must not be treated as deletion. A previously generated `attachment_opening` is reconciled only through explicit `opening.enabled: false`.

Changing the attachment host of an already generated opening requires explicit `rehost: true` in addition to the normal host validation. Persisted configuration never grants implicit permission to move a destructive host modification to another wall.

## Durable attachment-infill intent

A generated attachment Opening still does not imply a door or window. Door/Window infill is independently opt-in and may be persisted under `door_window`, for example:

```yaml
domains:
  door_window:
    enabled: true
    type_id: company.door.d01
    schedule_mark: D01
```

or with explicit project-local type intent:

```yaml
domains:
  door_window:
    enabled: true
    category: door
    operation: swing
    frame_material: wood
    panel_style: solid
    handing: right
```

The Door/Window bridge still requires the current generated `attachment_opening` and normal Opening-infill validation. Persisted intent never authorizes implicit opening creation or host-wall modification.

Omitted `door_window` intent is non-destructive. Only explicit `door_window.enabled: false` may reconcile the generated `attachment_infill`. If the attachment Opening identity changes, moving an existing generated infill requires explicit `door_window.rehost: true`.

A registered `type_id` is treated as explicit type selection. A project-local type built from category/operation may use preliminary frame/panel defaults, but those defaults remain `source_state: assumed` until the construction data is explicit; persistence does not upgrade confidence.

## Explicit disable and removal semantics

Missing keys do not mean deletion. In particular, omission of Drainage endpoint fields from a later run is not permission to erase or reconnect an existing generated route, omission of Opening intent is not permission to fill/remove a generated attachment opening, and omission of Door/Window intent is not permission to remove a generated attachment infill.

A domain disable/removal transition must be represented explicitly, for example with `enabled: false`, and the owning domain bridge must define the reconciliation/lifecycle behavior before destructive action occurs.

Endpoint or host identity changes also require explicit transition semantics. Persisting a different connector ID, attachment host ID or dependent Opening identity must not silently rewrite an existing network/host relationship unless the owning command explicitly supports that transition.

## Other domain examples

The same payload may persist deterministic project choices such as:

- Architecture wall type/thickness/height and explicit attachment-edge disambiguation;
- Opening attachment-opening dimensions/confirmation/rehost transition;
- Door/Window registered type or explicit category/operation/frame/panel/rehost intent;
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
- AC-ECI-007: persisted Opening intent remains opt-in, requires explicit host-modification confirmation/dimensions and does not derive permission from attachment-host presence alone.
- AC-ECI-008: explicit `opening.enabled: false` may reconcile the generated `attachment_opening`, while omitted Opening intent leaves current host modification state unchanged.
- AC-ECI-009: persisted Door/Window intent remains independently opt-in and requires a current generated attachment Opening plus valid type intent.
- AC-ECI-010: explicit `door_window.enabled: false` may reconcile only the generated `attachment_infill`; omission leaves current infill state unchanged.
- AC-ECI-011: changing an existing generated infill to a different Opening requires explicit `door_window.rehost: true` and normal fit validation.
