# Model, Catalog & Assembly Library

Status: Proposed v1  
Module ID: `constructflow.library`

## Mission

Provide a project-safe construction catalog for reusable models, parametric types, assemblies, profiles, details and manufacturer products. It is not merely a folder of `.skp` components.

## Asset classes

1. **Fixed Asset** — furniture, sanitary fixture, luminaire, appliance, plant.
2. **Parametric Asset** — door/window, cabinet, railing, slat, moulding/profile-based object.
3. **Assembly** — roof system, fascia system, wall build-up, paving assembly, kitchen/wardrobe preset.
4. **Detail** — construction/detail drawing resource associated with object/assembly families.
5. **Material/Product** — board, tile, paint, glass, polycarbonate, steel profile etc.

## Owns

- LibraryFolder
- CatalogAsset
- AssetVariant
- AssemblyPreset
- ProfileAsset
- DetailAsset
- MaterialAsset
- ManufacturerReference
- ProjectAssetSnapshot
- CompatibilityRule metadata

## Library scopes

### Company Library

Reusable approved/default assets and assemblies.

### Project Library

Assets actually used/snapshotted for a project plus project-specific custom types.

Projects must remain readable if Company/remote library is unavailable.

## Folder/search

Support:

- folders/subfolders;
- categories;
- tags;
- text search;
- favorites;
- recent;
- approved/project status;
- manufacturer filters;
- dimensions/compatibility filters.

## Asset metadata

Canonical fields can include:

- asset ID;
- asset version;
- category/subcategory;
- provider/owner module;
- family/type;
- variant;
- dimensions/parameter schema;
- host capability;
- connector capabilities;
- manufacturer/product/SKU;
- material/specification;
- quantity unit/cost reference;
- LOD/proxy representations;
- thumbnail/preview;
- datasheet/detail references.

## Placement

`PlaceCatalogAsset` creates a smart object or invokes the owner module's creation command. Library does not bypass domain construction logic.

Example:

- placing a fixed chair may instantiate a Library-owned fixed asset;
- placing a parametric window invokes Door/Window domain object creation with catalog reference;
- placing a fascia assembly invokes Roof assembly configuration.

## Swap Type

Semantic type/variant substitution that preserves construction identity where allowed.

Must preserve when compatible:

- stable smart-object ID;
- phase/lifecycle;
- placement;
- host;
- instance-specific metadata.

May update:

- dimensions;
- geometry;
- material/product;
- connectors if compatibility remains valid;
- quantities/drawings.

If opening/host resize is necessary, preview and confirm.

## Replace Construction

Different from Swap Type.

Used when actual existing construction is removed and a new object is installed:

- old object demolition lifecycle;
- new object ID/New Construction;
- replacement relationship;
- reconnection/host rules.

## Update asset version

A source asset update must not silently mutate placed project instances. User/project policy can:

- keep current snapshot;
- review diff;
- update selected/all compatible instances;
- pin version.

## Generic → Manufacturer

Design can begin with generic types, then resolve to manufacturer products later.

Example:

`Generic Downlight 9W → Manufacturer Model X 9W 3000K`

Semantic fixture identity may remain if this is a Type swap. Product metadata/cost/schedule updates.

## Compatibility

Alternatives should be classified:

- Exact Fit;
- Compatible with parameter update;
- Resize Required;
- Connector/host incompatible;
- Not compatible.

Compatibility is registered by owner module/capabilities rather than Library guessing domain rules.

## LOD/proxy

One asset can reference:

- symbol/2D;
- low-poly 3D;
- design 3D;
- high-detail/presentation;
- construction/fabrication representation where appropriate.

## Project-safe snapshot

A placed asset stores essential metadata/geometry/reference necessary for the project to survive source catalog loss.

Must include enough information for:

- reopen;
- display;
- semantic type recognition;
- quantities/specification already used;
- later replacement/update decision.

## Commands

- `CreateLibraryFolder`
- `RegisterCatalogAsset`
- `PlaceCatalogAsset`
- `SaveParametricType`
- `SaveAssemblyPreset`
- `SaveProfileAsset`
- `SwapCatalogAsset`
- `ReplaceCatalogConstruction`
- `UpdateCatalogAssetVersion`
- `PinAssetVersion`
- `AddToProjectLibrary`

## Phase behavior

Library does not override lifecycle. Placement command receives active phase/domain intent. Swap preserves lifecycle. Replace Construction invokes lifecycle replacement.

## Quantity/cost

Library contributes product/spec/rate references, but domain provider owns quantities. A product may define unit/package data used by costing.

## Drawing

Library can provide:

- 2D symbols;
- detail assets;
- product/spec labels;
- thumbnails.

Drawing platform decides placement and issue state.

## QA

- missing source snapshot;
- owner module unavailable;
- incompatible host;
- incompatible connector after asset swap;
- asset version/schema unsupported;
- missing required manufacturer parameter;
- high-detail asset exceeding configured proxy policy warning.

## Acceptance criteria

- AC-LIB-M01: create folders/subfolders and search assets by category/tag/text.
- AC-LIB-M02: placed asset reopens correctly when source catalog is offline/unavailable.
- AC-LIB-M03: Swap Type preserves ID/phase/host when compatible.
- AC-LIB-M04: Replace Construction creates old/new lifecycle rather than changing one object in place.
- AC-LIB-M05: updating company asset does not silently rewrite project snapshot.
- AC-LIB-M06: Generic asset can be replaced by manufacturer variant with schedule/quantity metadata update.
- AC-LIB-M07: owner module defines compatibility; Library does not hard-code every domain family.
- AC-LIB-M08: proxy/high-detail switch preserves semantic asset identity.