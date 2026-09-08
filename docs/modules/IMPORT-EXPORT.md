# Import / Export Adapter Platform

Status: Proposed v1  
Module ID: `constructflow.io`

## Mission

Provide adapter-based import/reference/conversion and export pathways without making domain modules depend on external file formats.

## Owns

- ImportAdapter registry
- ExportAdapter registry
- ImportJob / ExportJob metadata
- ConversionPreview metadata

## Imports

Initial classes:

- legacy/current SKP references/geometry;
- DWG/DXF reference where runtime supports;
- PDF/image tracing references;
- CSV/structured schedules/rates;
- catalog assets;
- survey data adapters.

Importing raw geometry does not make it semantic. Conversion uses owner-domain commands.

## Exports

- PDF drawing sets through Drawing adapter;
- CSV/XLSX-style quantities/schedules;
- DWG/DXF where implemented;
- raster previews;
- future fabrication adapters such as DXF/CNC data.

## Rules

- external data is untrusted and validated;
- ambiguous units require confirmation;
- source IDs/schema versions retained in structured output where useful;
- stale output warnings respected;
- external round-trip edits are supported only through explicit identity-aware contracts.

## Acceptance criteria

- AC-IO-001: import reference can remain non-semantic without accidental smart-object creation.
- AC-IO-002: supported geometry conversion delegates to owner module command.
- AC-IO-003: ambiguous unit import is not silently scaled.
- AC-IO-004: quantity export can include source smart-object IDs.
- AC-IO-005: adding a new export adapter does not require domain module source changes.

See `../architecture/IMPORT-EXPORT.md` for binding contract.