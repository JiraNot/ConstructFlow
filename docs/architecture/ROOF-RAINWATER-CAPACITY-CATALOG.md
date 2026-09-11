# Roof Rainwater Capacity Catalog

Status: Accepted v1 foundation contract  
Owners: `constructflow.library` (asset/version storage) + `constructflow.roof` (hydraulic planning consumption)

## Purpose

Allow preliminary roof-rainwater planning to consume a versioned, traceable outlet-capacity value without inventing hydraulic capacity or creating a second catalog system.

ConstructFlow reuses the existing Library `CatalogAssetDefinition` and `library.catalog` public capability. Roof does not read Library persistence directly.

## Catalog asset contract

A rainwater capacity profile is a normal Library catalog asset with:

- `category: roof.rainwater_capacity`;
- any supported Library asset class appropriate to the source product/profile;
- a stable `asset_id`;
- an explicit `version`;
- optional manufacturer/product/SKU fields;
- hydraulic evidence in `metadata.hydraulic`.

Required hydraulic metadata:

```yaml
hydraulic:
  verification_status: verified
  basis_ref: datasheet:manufacturer-document-revision
  outlet_capacity_lps: 0.60
```

Optional metadata:

```yaml
hydraulic:
  downpipe_diameter_mm: 90
  gutter_profile_id: box.150
```

`basis_ref` is a traceability string to the company calculation, tested assembly, manufacturer datasheet or other reviewed capacity source. This foundation does not fetch or validate the external document itself.

## Verification rule

Only `verification_status: verified` catalog capacity assets may drive `PlanRoofRainwaterCatchment` through `capacity_asset_id`.

`assumed`, draft, missing or otherwise unverified capacity metadata is rejected. A catalog record is not automatically trustworthy merely because it exists.

The resolver also rejects:

- wrong catalog category;
- missing/non-positive `outlet_capacity_lps`;
- missing `basis_ref`;
- non-positive optional downpipe diameter;
- missing asset/version references.

## Planning input modes

`PlanRoofRainwaterCatchment` accepts exactly one capacity source:

1. `outlet_capacity_lps` — explicit manual/user-supplied planning input; or
2. `capacity_asset_id` plus optional `capacity_asset_version` — versioned verified Library capacity evidence.

Supplying both is rejected so the output cannot hide which capacity governed the calculation.

Manual input remains supported for early design but is labelled `manual_input` / `user_supplied` in plan evidence. It is not upgraded to verified catalog evidence.

## Result evidence

When a catalog profile is used, the catchment plan carries `capacity_source` containing at minimum:

- kind = `catalog_asset`;
- asset ID/version/name;
- manufacturer/product/SKU when present;
- verification status;
- basis ref;
- outlet capacity L/s;
- optional downpipe diameter;
- optional gutter profile ID.

This evidence is immutable within that returned planning result. A later catalog version does not silently rewrite an earlier plan result.

## Ownership and safety

- Library owns asset/version persistence and search.
- Roof owns interpretation of the `roof.rainwater_capacity` hydraulic metadata for catchment planning.
- Drainage does not consume the catalog asset merely because Roof planned with it.
- Planning remains non-mutating.
- A capacity profile does not create a gutter, outlet connector or downpipe.
- A capacity profile does not select a destination network.
- A capacity profile does not prove local code compliance.
- Catalog metadata must not silently replace project rainfall/runoff inputs.

## Project resilience

The current Library catalog is model-local and versioned. If future company/manufacturer catalog transport becomes remote, a reviewed project should pin/snapshot the exact capacity asset version before final issue so the project remains reproducible without the remote source.

## Relationship to final sizing

The v1 profile exposes a reviewed per-outlet capacity and optional product hints. It does not yet define a full hydraulic gutter/downpipe sizing engine.

Future final sizing may compare:

- catchment flow;
- gutter profile capacity at slope;
- outlet capacity;
- downpipe capacity/diameter;
- number and spacing of outlets;
- local code/manufacturer constraints.

That future engine must continue to use explicit catalog/code evidence rather than hidden constants.

## Acceptance criteria

- AC-RCC-001: Roof resolves capacity through the public `library.catalog` capability, not Library private storage.
- AC-RCC-002: only `roof.rainwater_capacity` assets with `verification_status: verified`, positive capacity and non-empty basis ref are accepted.
- AC-RCC-003: asset ID and requested/resolved version are preserved in planning evidence.
- AC-RCC-004: `PlanRoofRainwaterCatchment` accepts either one manual capacity or one catalog capacity source, never both.
- AC-RCC-005: manual capacity remains visibly user-supplied and is not represented as verified catalog evidence.
- AC-RCC-006: optional diameter/profile metadata is traceability/sizing intent only and does not mutate gutter/downpipe objects.
- AC-RCC-007: missing Library capability or missing asset fails visibly.
- AC-RCC-008: registering a newer catalog version does not silently alter a plan explicitly resolved against an older version.
