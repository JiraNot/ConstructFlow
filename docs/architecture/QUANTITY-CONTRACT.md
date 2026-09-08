# Quantity, BOQ and Costing Contract

Status: Accepted foundation contract.

## Principle

Domain modules own quantity formulas because they own construction semantics. The Quantity platform aggregates normalized quantity items. The Costing platform applies rates, waste and labor rules on top of quantities.

BOQ must never reverse-engineer domain quantities from arbitrary SketchUp geometry when a domain provider exists.

## Quantity item envelope

```yaml
quantity_item:
  id: qty_<uuid>
  source_object_id: cf_<uuid>
  source_module: constructflow.roof
  classification: roof.polycarbonate.panel
  description: Polycarbonate roof panel
  measure: area
  value: 26.4
  unit: m2
  phase_scope: new_construction
  material_ref: optional
  catalog_ref: optional
  formula_version: 1
  breakdown: {}
  confidence: confirmed
```

## Canonical measures

At minimum:

- length: `m`
- area: `m2`
- volume: `m3`
- mass: `kg`
- count: `pcs`
- pair: `pair`
- sheet: `sheet`
- set: `set`

Internal geometry units can differ, but provider output must normalize to the declared quantity unit.

## Domain ownership examples

### Structure

- concrete volume;
- formwork area;
- rebar mass/length/count;
- structural steel profile length/mass/count;
- pile count/length;
- slab area/volume.

### Roof

- roof covering area/panel count;
- rafters/purlins/truss members;
- fascia/soffit area;
- flashing/gutter/downpipe length;
- fastener/seal quantities where rules are sufficiently defined.

### Surface

- finish area;
- full/cut tile or paver pieces when layout exists;
- borders by length/area/piece;
- concrete/subbase/screed volume;
- mesh area;
- calculated waste from layout where feasible.

### Interior

- panels/parts;
- board sheets;
- edge-band length;
- glass area/pieces;
- hardware counts;
- countertop area/length;
- cut-list parts.

### Drainage

- pipe lengths by diameter/system;
- manholes/drains/fittings where modeled or rule-derived;
- excavation/backfill only when a defined earthwork rule exists.

## Phase-aware quantities

Every quantity item must be classifiable by construction scope.

Examples:

- Existing-to-remain quantities normally do not enter new-work BOQ.
- Demolition quantities enter demolition scope.
- New objects enter new-construction scope.
- Relocation may generate demolition + new-work items.

A relocated manhole can produce:

```text
Demolition
- remove/abandon existing manhole
- remove affected existing pipe

New work
- new manhole
- new pipe route
- excavation/backfill/repair if rule set is enabled
```

## Formula traceability

Every derived quantity must be traceable to:

- source smart object(s);
- provider/module;
- formula version;
- input parameters or geometry basis;
- waste factor if applied.

Users must be able to inspect why a quantity exists.

## Waste

Waste can come from three levels:

1. actual layout/cut optimization, preferred when available;
2. assembly/product-specific configured factor;
3. project/company default factor.

The system must not apply two waste factors accidentally. Quantity output should distinguish `net`, `waste`, and `gross` where applicable.

Example:

```yaml
net: 42.50
waste: 3.23
gross: 45.73
unit: m2
```

## Paving layout

When actual paving geometry/layout is locked, provider may count full/cut pieces and reusable offcuts. Before layout is locked, area-based provisional quantities are acceptable if clearly marked preliminary.

## Rebar

Rebar quantity may be computed from reinforcement-set metadata without generating all 3D bars. Physical rebar is a presentation/fabrication LOD, not a prerequisite for quantity.

## Joinery fabrication

Furniture/joinery provider must support, when fabrication mode is enabled:

- part ID;
- material/thickness;
- cut size;
- quantity;
- grain direction;
- edge band by edge;
- hardware schedule;
- board/sheet optimization as a later optional calculation.

## Cost item

Costing consumes quantity items and rate references:

```yaml
cost_item:
  quantity_item_id: qty_001
  material_rate: 850
  labor_rate: 220
  rate_unit: m2
  currency: THB
  subtotal_material: ...
  subtotal_labor: ...
```

Rates are not part of domain geometry. They belong to project/company/catalog cost libraries.

## Price versioning

A project estimate should be reproducible. Rate libraries need version/effective-date metadata or a project snapshot. Updating company rates must not silently rewrite an issued historical estimate without user action.

## Rounding

- Store sufficient precision internally.
- Round only at presentation/BOQ boundaries according to measure-specific project settings.
- Never repeatedly round intermediate calculations.

## Dirty-state propagation

Geometry, parameter, catalog, phase, or route changes that affect quantities mark related provider results dirty. BOQ should indicate stale values until recalculation succeeds.

## Confidence/status

Quantity items may be:

- `preliminary`
- `calculated`
- `verified`
- `unknown`

Existing-condition uncertainty propagates where relevant.

## Acceptance baseline

A quantity implementation is acceptable only when a user can select a BOQ line and trace it back to source smart objects and formula/version metadata.