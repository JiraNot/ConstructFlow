# Extension Attachment Opening

Status: Accepted v1 foundation contract.

## Purpose

Define the safe command boundary for creating a deliberate passage/opening through an Extension attachment host wall. Attachment-edge resolution alone suppresses duplicate new wall geometry; it must never be interpreted as permission to cut the existing building automatically.

## Ownership

- Extension owns persisted construction intent and orchestration only.
- Architecture owns the host Smart Wall and host-surface capability.
- Opening owns the `opening.rectangular` Smart Object, marker geometry, hosted-void descriptor and opening quantity.
- Drawing/Quantity consume the same semantic objects; no duplicate drawing-only opening model is created.

The executable command is:

`GenerateOrUpdateOpeningFromExtension`

Owner: `constructflow.opening`.

## Opt-in safety contract

Attachment opening generation is disabled by default. A workflow may modify the attachment host only when all of the following are explicit:

- `opening.enabled: true`;
- `opening.confirm_modify_existing_host: true`;
- `opening.width_mm`;
- `opening.height_mm`;
- a valid `extension.zone.attachment_host_id` that resolves through the accepted Extension Attachment Host contract.

Optional controls:

- `sill_mm` (default 0);
- `attachment_edge_index` when the shared Extension edge is ambiguous;
- `host_start_offset_mm` for explicit placement along the host wall;
- `rehost: true` when an already generated opening must move to another attachment host.

Omission is not destructive intent. `opening.enabled: false` is the explicit reconciliation transition for a previously generated Extension attachment opening.

## Placement

When `host_start_offset_mm` is not supplied, v1 centers the opening on the resolved shared Extension edge by projecting that edge midpoint onto the host wall through `wall.host_surface`.

The normal Opening validator remains authoritative for host segment bounds, opening overlap and height checks. The Extension workflow does not bypass host validation.

## Identity and provenance

The generated opening uses one stable Extension source slot:

`attachment_opening`

It carries:

- `generated_from` → source Extension, role `extension_source`;
- `host` → Architecture wall, using the Opening module's normal host relationship semantics.

Regeneration with the same host updates the same Opening Smart Object. A changed host is rejected unless `rehost: true` is explicit.

## Reconciliation

Explicit `opening.enabled: false` must:

1. detach the hosted opening descriptor from the Architecture host through `wall.host_surface`;
2. rebuild the host without that generated opening cut;
3. erase the generated new-work Opening Smart Object as source reconciliation, not demolition history;
4. dirty affected quantity and drawing outputs.

Existing host construction itself is not erased or replaced.

## Quantity and drawing behavior

A generated attachment opening participates in Extension ConstructionTakeoff through `OpeningQuantityProvider`.

When its host is Existing construction, opening removed area is phase-scoped to Demolition. This quantity comes from the Opening domain provider rather than being recomputed by Extension.

The opening appears in the selected Extension's Architecture construction drawing scope through its `generated_from` relationship. Generated opening context from another Extension must not leak into the selected package.

## Failure behavior

Unsafe or incomplete intent must fail visibly rather than inventing construction:

- missing confirmation;
- missing width/height;
- missing or invalid attachment host;
- unresolved/ambiguous shared edge;
- invalid opening bounds/overlap;
- host change without explicit `rehost: true`.

Opening failure does not automatically block independent Structure/Surface/Roof generation. Downstream consumers may still mark the package blocked through QA/currentness when the requested opening has not been resolved.

## Acceptance criteria

- AC-OPEN-010: Extension attachment opening is opt-in and cannot be generated from attachment-host presence alone.
- AC-OPEN-011: explicit confirmed width/height intent creates one hosted `opening.rectangular` with stable `attachment_opening` provenance.
- AC-OPEN-012: rerunning the same intent updates the same Opening Smart Object instead of duplicating it.
- AC-OPEN-013: explicit disable detaches the host cut and reconciles the generated Opening Smart Object.
- AC-OPEN-014: a changed attachment host requires explicit rehost intent.
- AC-OPEN-015: Existing-host opening quantity is reported as demolition removed area through the Opening quantity provider.
- AC-OPEN-016: generated attachment opening drawing scope remains isolated to the selected Extension.
