# Opening & Void Module

Status: Proposed v1  
Module ID: `constructflow.opening`

## Mission

Own semantic openings independent from what fills them. This keeps wall voids, arches, niches, service openings, glass-block areas and door/window hosts from being conflated.

## Owns

- RectangularOpening
- ArchOpening
- SegmentalArchOpening
- RoundOpening
- OvalOpening
- CustomProfileOpening
- FullHeightOpening
- Niche
- Recess
- ServiceOpening

## Dependencies

Required:

- Core;
- compatible host capability, typically Architecture wall/floor/ceiling.

Optional:

- Door & Window infill;
- Decorative trim;
- Library profiles/details.

## Host behavior

Opening persists a host relationship and local placement. It should follow supported host transformations/resizing within documented constraints.

If host becomes demolished/replaced, opening follows lifecycle/host-transfer rules rather than becoming silent loose geometry.

## Parametric shapes

Rectangular:

- width;
- height;
- sill/base offset.

Arch:

- width;
- total height;
- spring/rise;
- radius/mode.

Custom profile:

- source profile/control geometry;
- scalable parameters where possible;
- otherwise fixed-profile variant with explicit dimensions.

## Commands

- `CreateOpening`
- `ModifyOpening`
- `ConvertProfileToOpening`
- `AddNiche`
- `AttachOpeningInfill`
- `DetachOpeningInfill`

## Existing modification

Creating a new opening in an Existing wall is a `Modify Existing` workflow. The host wall remains existing-to-remain where appropriate; removed wall region becomes demolition scope representation/quantity according to Architecture/Openings agreed contract.

## Infill relationship

An opening may contain:

- none;
- Door/Window;
- glass block assembly;
- breeze/vent block assembly;
- grille/screen;
- other compatible infill module.

Opening owns void geometry; infill module owns its construction object.

## Glass/breeze block infill support

Opening should expose boundary and module-fill capability so a compatible infill can calculate fixed block module sizes, joints and non-cut rules.

Example:

```text
Opening width 2900
Block 200x200
Joint 10
```

The fill system must not stretch real block sizes merely to fit.

## Quantity

Opening can provide removed/gross opening area and geometry. Infill quantities belong to infill provider.

## Drawing

- opening outline/symbol;
- opening ID;
- head/jamb/sill reference points;
- opening schedule where used;
- section/detail callout anchors.

## QA

- opening outside host extents;
- invalid shape/self-intersection;
- negative/zero size;
- incompatible infill;
- opening collision/overlap rule violations;
- unresolved host.

## Acceptance criteria

- AC-OPEN-001: rectangular opening persists as hosted smart object.
- AC-OPEN-002: arch opening can resize parametrically without manual redraw.
- AC-OPEN-003: opening survives supported wall resize/move with relationship intact.
- AC-OPEN-004: new opening in Existing wall preserves Modify Existing lifecycle semantics.
- AC-OPEN-005: attaching/removing an infill does not destroy opening identity.
- AC-OPEN-006: custom profile conversion reports unsupported/non-closed profile errors clearly.