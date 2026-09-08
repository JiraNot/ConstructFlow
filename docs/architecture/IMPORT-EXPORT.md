# Import, Convert and Export Contract

Status: Accepted foundation contract.

## Principle

ConstructFlow must work with existing project material and legacy SketchUp models. Import does not automatically imply semantic understanding; conversion into smart objects is an explicit, validated step.

## Input classes

Initial/relevant inputs:

- existing `.skp` geometry;
- DWG/DXF references where SketchUp/runtime support exists;
- PDF/image references for tracing;
- CSV/structured schedules or rate data;
- catalog/component assets;
- survey/reference data in supported formats.

Future inputs may include scan/measurement sources, but are not foundation requirements.

## Reference vs conversion

### Reference

Imported geometry/file is used as background/context only. It is not automatically a ConstructFlow smart object.

### Convert

User selects supported geometry and invokes a conversion command:

- face/path → wall/floor/surface/roof candidate;
- group/component → catalog/generic smart object;
- component → existing fixture/manhole/asset;
- closed boundary → paving/surface;
- legacy cabinet geometry → optional future joinery conversion.

Conversion must preview:

- inferred type;
- geometry to be owned;
- phase/level defaults;
- known parameters;
- unresolved parameters;
- uncertainty state.

## Non-destructive conversion

Where feasible conversion reuses/wraps selected geometry instead of destructively redrawing it immediately. The owner module may regenerate geometry later only under a documented parametric conversion mode.

## Existing-condition uncertainty

Imported/converted objects can be marked:

- measured;
- confirmed;
- assumed;
- unknown;
- verify-on-site.

No importer may invent invert levels, structural sizes or hidden assemblies simply because a field is missing.

## Unit handling

Import adapters must explicitly detect/require source units and normalize to Core units. Ambiguous unitless data must trigger user confirmation rather than silent scaling.

## Export classes

### Model

- `.skp` remains primary model container;
- optional neutral/geometry exports through adapters as implemented.

### Drawings

- LayOut document integration;
- PDF drawing set;
- DWG/DXF drawing export where supported;
- raster preview/export.

### Data

- CSV/XLSX-style quantity/BOQ/schedule output;
- BBS/cut-list/hardware schedules;
- future structured JSON/API export through versioned contracts.

### Fabrication

Future adapters may support:

- DXF part outlines;
- CNC-oriented files;
- cutting optimization exports;
- steel/rebar fabrication formats.

Fabrication exports stay behind domain/provider contracts and must not contaminate Core geometry assumptions.

## Traceability

Exported structured data should include stable smart-object IDs where useful so BOQ/schedules can be traced back to the model.

## Dirty-state behavior

Export orchestration must inspect source state:

- stale quantity exports warn/refuse according to policy;
- stale drawing views warn/refuse for issued sets;
- failed regeneration does not silently produce a supposedly current deliverable.

## Versioning

Structured exports declare schema/export version. Breaking changes create a new export version.

## External round-trip

ConstructFlow does not assume arbitrary external edits can round-trip safely. An adapter may support controlled round-trip updates only when object identity and field ownership are explicit.

Example: importing updated rates is reasonable; importing arbitrary edited geometry as if it were guaranteed to preserve smart-object relationships is not.

## Security/safety

Importers must treat external files/data as untrusted input. Validate paths, sizes, encodings and schemas where applicable. Import must not execute arbitrary scripts embedded in external catalog metadata.

## Acceptance baseline

Foundation import/export is successful when:

1. legacy SketchUp geometry can remain as reference or be converted through an explicit command;
2. conversion persists smart-object metadata;
3. units/phase/level assumptions are visible;
4. CSV-style quantity data can retain source IDs;
5. drawing/data export surfaces stale-state warnings.