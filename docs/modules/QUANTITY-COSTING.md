# Quantity & Costing Platform

Status: Proposed v1  
Module IDs: `constructflow.quantity`, `constructflow.costing`

## Mission

Aggregate normalized quantity providers from domain modules and apply project/company pricing rules without duplicating domain construction formulas.

## Dependencies

Required:

- Core smart-object identity;
- Quantity Provider contract.

Optional:

- Library/catalog product metadata;
- Revision/issue snapshots;
- export adapters.

## Owns

Quantity:

- QuantityResultSet
- QuantityItem cache/index
- QuantityGrouping
- QuantitySnapshot

Costing:

- RateLibrary
- RateItem
- LaborRate
- WastePolicy
- CostEstimate
- EstimateSnapshot

## Provider rule

Domains own formulas.

Examples:

- Structure → concrete/rebar/steel/formwork;
- Roof → covering/flashing/gutter;
- Surface → paving/borders/cuts;
- Interior → parts/edge band/hardware;
- Drainage → pipe/manholes.

Quantity platform must not re-measure raw faces as a hidden substitute when semantic provider exists.

## Normalization

Quantity items include:

- source object ID(s);
- provider/module;
- classification;
- description;
- measure;
- value/unit;
- phase scope;
- material/catalog reference;
- formula version;
- preliminary/calculated/verified status.

Canonical outputs use m, m², m³, kg, pcs, pair, sheet, set as appropriate.

## Phase grouping

Support separate views:

- Existing informational;
- Demolition;
- New Construction;
- combined/project summary.

Relocation can produce both demolition and new-work items.

## Dirty/recalculate

Relevant model events mark provider results dirty. UI must show stale state.

`RecalculateQuantities` queries only affected/all providers depending command scope.

## Waste policy

Priority:

1. actual layout/fabrication calculation;
2. product/assembly configured waste;
3. project/company default.

Never stack waste unknowingly. Track net, waste and gross separately when applicable.

## Rate library

Rates can include:

- material;
- labor;
- equipment/subcontract;
- unit;
- currency;
- effective date/version;
- source/notes.

Thailand-first default currency can be THB, but currency is project-configurable.

## Cost estimate

Costing applies rates to quantity lines and groups by work category/phase.

Example:

```text
Tile material 45.73 m² × rate
Tile labor    42.50 m² × labor rate
Adhesive      8 bag × rate
Border        18.2 m × rate
```

## Traceability

User can drill:

`Estimate line → Quantity line → Source object(s) → formula/provider`

This is mandatory for trust and debugging.

## Snapshot / issue

An issued estimate should be reproducible. Rate updates do not silently rewrite historical issued estimates. Create snapshots with source model revision/rate library version.

## Commands

- `RecalculateQuantities`
- `CreateQuantitySnapshot`
- `CreateRateLibrary`
- `UpdateRateItem`
- `ApplyRateLibrary`
- `GenerateCostEstimate`
- `CreateEstimateSnapshot`
- `ExportBOQ`

## Output

- BOQ grouped by category/phase;
- material schedule;
- demolition scope;
- cost estimate;
- CSV/XLSX-style export;
- source traceability references.

## QA

- stale quantity result;
- missing formula/provider;
- unit mismatch;
- rate unit incompatible with quantity unit;
- duplicate waste application;
- source object missing;
- formula/provider version unsupported;
- issued estimate references changed source without snapshot.

## Acceptance criteria

- AC-QC-001: aggregate quantity items from at least two unrelated domain modules without module-specific switch logic in core aggregator.
- AC-QC-002: every BOQ line can trace to source object/provider/formula version.
- AC-QC-003: Existing/Demolition/New quantities are separable.
- AC-QC-004: source geometry/parameter change makes affected result visibly dirty.
- AC-QC-005: rate-library update does not alter an issued estimate snapshot.
- AC-QC-006: actual paving/fabrication waste overrides default factor without double application.
- AC-QC-007: incompatible rate/quantity unit is rejected or explicitly converted under configured rule.