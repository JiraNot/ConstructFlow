# Extension Attachment Infill

Status: Accepted v1 foundation contract.

## Purpose

Define the safe Door/Window step that may follow an explicit Extension attachment opening. An Extension attached to an existing building does **not** imply that a door or window should be invented. Infill generation is opt-in and remains owned by `constructflow.door_window`.

The dependency chain is:

`Extension attachment host → explicit attachment Opening → optional Door/Window infill`

The same Opening and Door/Window Smart Objects feed geometry, quantity, plan representation and the construction issue set. No duplicate 2D semantic model is introduced.

## Public command

The Extension orchestrator may dispatch:

`GenerateOrUpdateDoorWindowFromExtension`

The command is owned by `constructflow.door_window`. Extension supplies effective construction intent only; it does not create or mutate Door/Window geometry directly.

## Opt-in semantics

The Generator default for `door_window.enabled` is unset. Therefore attachment-host presence and attachment-opening presence alone perform no Door/Window action.

Generation requires:

- `door_window.enabled: true`;
- a current generated Extension attachment Opening with stable slot `attachment_opening`;
- either a registered `type_id`, or explicit `category` and `operation` sufficient to define a project-local type.

If a registered `type_id` is supplied, that type is authoritative and must fit the Opening under the normal `opening.infill_host` validation contract.

If a project-local type is built from intent, its width and height are taken from the current attachment Opening so the generated infill cannot silently resize the host cut. `category` and `operation` are required. Frame material and panel style may use visible preliminary defaults, but the generated object remains `source_state: assumed` until both are explicit. A final construction issue must not treat those assumptions as confirmed specification.

## Stable identity and provenance

The generated Door/Window Smart Object uses:

- object type: `door_window.instance`;
- owner: `constructflow.door_window`;
- `generated_from` target: source `extension.zone`;
- generated slot: `attachment_infill`;
- normal `host` relationship target: current attachment Opening;
- host role: `opening_infill`.

Re-running the same intent updates the existing generated instance rather than creating a duplicate. Changing type, operation, frame system or schedule mark preserves the Smart Object identity when the host Opening identity remains the same.

The Door/Window Type/Instance contract remains unchanged: a type change is not demolition and does not create replacement construction history by itself.

## Rehost safety

If the generated attachment Opening identity changes, an existing generated infill must not silently move to the new Opening. The transition requires explicit `door_window.rehost: true`.

A rehost operation:

1. detaches the current infill reference from the previous Opening;
2. updates the Door/Window `host` relationship;
3. rebuilds the same Door/Window Smart Object against the new Opening;
4. attaches the same infill ID to the new Opening;
5. dirties quantity/drawing/schedule outputs as appropriate.

The new Opening must still pass the normal Door/Window fit validator.

## Disable and reconciliation

Omitting `door_window` intent is not deletion.

Only explicit:

`door_window.enabled: false`

may reconcile the generated `attachment_infill` created from this Extension. Reconciliation detaches the Opening infill reference and erases only the generated new-work Door/Window Smart Object. It does not remove the attachment Opening, restore the host wall, or delete unrelated/manual infills.

This is source-intent reconciliation, not field demolition. Existing/as-built Door/Window replacement continues to use normal lifecycle/replacement semantics.

## Quantity and drawing propagation

The generated instance is an ordinary Door/Window Smart Object downstream:

- `DoorWindowQuantityProvider` supplies unit/frame/panel/glazing quantities;
- `ConstructionTakeoff` aggregates those provider items through `generated_from` provenance;
- the Architecture construction sheet consumes the existing Door/Window plan representation;
- `ConstructionIssueSetFactory` includes generated Architecture/Opening/DoorWindow context only for the selected Extension and excludes generated context belonging to another Extension.

Generation, update or reconciliation dirties the corresponding quantity, drawing and schedule outputs. Currentness and output settlement use Smart Object IDs rather than inferring infill from raw geometry.

## Construction intent persistence

Durable Door/Window choices may be stored in Extension Construction Intent, for example:

```yaml
domains:
  door_window:
    enabled: true
    type_id: company.door.d01
    schedule_mark: D01
```

or:

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

Persisted intent does not bypass Opening fit validation, host identity checks, source-confidence rules or construction QA.

## Failure propagation

`door_window` depends on `opening` in Extension orchestration. If Opening generation/reconciliation is rejected or fails, Door/Window generation is dependency-blocked and is included in dirty-domain propagation. Independent Structure/Surface/Roof branches may continue according to the normal orchestration graph.

## Acceptance criteria

- AC-EAI-001: attachment-host or attachment-opening presence alone never generates a Door/Window.
- AC-EAI-002: enabled attachment infill requires a current generated `attachment_opening` and valid Door/Window type intent.
- AC-EAI-003: the generated `door_window.instance` carries `generated_from` slot `attachment_infill` plus the normal Opening host relationship.
- AC-EAI-004: regeneration/type changes preserve the generated Door/Window Smart Object identity while the host Opening remains the same.
- AC-EAI-005: changing the host Opening requires explicit `rehost: true` and normal fit validation.
- AC-EAI-006: explicit `enabled: false` detaches and reconciles only the generated attachment infill; omitted intent is non-destructive.
- AC-EAI-007: generated Door/Window quantities flow through `DoorWindowQuantityProvider` into Extension ConstructionTakeoff with source-object and phase traceability.
- AC-EAI-008: Architecture plan/currentness scope includes the selected Extension's generated infill and excludes generated infills belonging to another Extension.
- AC-EAI-009: project-local inferred frame/panel defaults remain `assumed`; registered or fully explicit construction data can be `confirmed`.
- AC-EAI-010: command validation is side-effect free; project-local type persistence occurs only inside successful command execution.
