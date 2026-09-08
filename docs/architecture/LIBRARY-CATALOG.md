# Model, Catalog, Assembly and Detail Library

ConstructFlow Library is a construction catalog, not only a folder of SKP components.

## Asset classes

### Fixed Asset
Examples: chair, sanitary fixture, luminaire, appliance, tree proxy.

### Parametric Asset
Examples: door, window, cabinet, slat, railing, moulding, gutter.

### Assembly
Examples: wall build-up, roof system, fascia system, kitchen run, wardrobe, paving build-up.

### Detail
Construction/detail representation associated with object or assembly families.

## Organization

Libraries may be organized as:

- Company Library
- Project Library
- Manufacturer Catalog
- Favorites
- Recent
- Folder/Subfolder trees
- Tags and search facets

Project files must remain usable if an external catalog becomes unavailable.

## Minimum catalog metadata

```text
asset_id
family
category
subcategory
provider_module
version
manufacturer?
product_name?
sku?
dimensions?
material_refs[]
unit?
price_ref?
host_types[]
connector_types[]
lod_variants[]
thumbnail_ref?
datasheet_ref?
detail_refs[]
```

## Placement

A catalog asset can define host behavior.

Examples:

- Window → Wall
- Downlight → Ceiling
- Gutter → Roof Edge
- Faucet → Counter/Wall
- Cabinet → Wall/Floor

The placement command resolves host, insertion frame, offsets and lifecycle phase automatically.

## Variant switching

Two distinct operations are required.

### Swap Type
Same construction object and lifecycle; only family/type/catalog selection changes.

Must preserve where appropriate:

- object ID
- host
- level
- phase
- orientation
- relationships

### Replace Construction
Existing construction is removed and a new construction object is created.

Example: replace existing aluminum window with a new window.

The old object is marked demolition and a new object is created in New Construction.

## Apply scope

Variant operations should support:

- this instance
- selected instances
- all instances of type
- project-wide replacement where valid

## Compatibility

Catalog alternatives can be grouped by:

- Exact Fit
- Resize Required
- Not Compatible

Compatibility considers host, dimensions, connectors and required clearances.

## Generic → manufacturer workflow

Early design may use generic assets such as `Generic Downlight 9W` or `Generic Sliding Window 1800x1200`.

At specification stage, those may be swapped to manufacturer products while preserving design intent and updating specification/BOQ metadata.

## LOD and proxies

An asset may offer:

- LOD 100 symbolic
- LOD 200 simplified model
- LOD 300 construction model
- LOD 400 fabrication representation

High-polygon trees/furniture should support proxy/high-detail switching.

## Assembly example: roof fascia

```text
Fascia Assembly
├ Main steel frame
├ Secondary stud/frame
├ Smartboard / fiber-cement board
├ Joint treatment
├ Exterior finish
├ Top flashing
├ Drip edge
└ Soffit interface
```

A single assembly selection may drive geometry, quantity, drawing details and specification.

## Interior catalogs

Joinery catalogs include:

- cabinet carcass types
- front styles
- solid/glass/aluminum-frame fronts
- drawers
- hinges
- drawer slides
- handles
- lift systems
- internal fittings
- board materials
- countertops
- appliances

## Versioning

Catalog assets and assemblies are versioned. Project instances keep the version used when inserted.

When a newer catalog version exists, the project may:

- keep current version
- review changes
- update selected instances
- update all compatible instances

No silent destructive updates.

## Search and AI

AI can search the catalog using intent and constraints, but selection still resolves to registered assets/assemblies. AI must not invent an unregistered production asset when a deterministic catalog-backed object is required.
