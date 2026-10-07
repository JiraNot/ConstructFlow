# Canonical Schema Mapping Specification (F02)

> **Document Status:** Accepted Platform Standard  
> **Traceability:** Master Specification F02 / ADR-0006 / Core Contracts  
> **Canonical Source of Truth:** ConstructFlow `.cfproj` JSON Document (RFC-4122 UUIDs, Millimeter Units, Right-Handed Cartesian Coordinates with +Z Up)

---

## 1. Executive Overview

ConstructFlow operates on a **Standalone-First** architecture where the canonical TypeScript project model (`@constructflow/project-model`) is the Single Source of Truth (SSOT). External CAD/BIM tools (SketchUp Ruby Extension, AutoCAD DXF/DWG, and OpenBIM IFC 4.3 / Revit) are downstream synchronization adapters.

This specification provides the authoritative, bidirectional schema mapping between:
1. **Canonical `.cfproj`** (ConstructFlow Native Model)
2. **SketchUp Ruby Bridge** (Observer & Command Bus Attributes)
3. **AutoCAD DWG / DXF** (AIA / วสท. Layer Standards, Entities & Handles)
4. **OpenBIM IFC 4.3 & Revit** (buildingSMART STEP Entities, 22-char GUIDs & Psets)

---

## 2. Global Identity & Coordinate System Normalization

| Concept | Canonical `.cfproj` | SketchUp Ruby Bridge | AutoCAD DXF | OpenBIM IFC 4.3 | Autodesk Revit |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Object ID** | RFC-4122 UUID string (`cf_<uuid>` or standard UUID) | Attribute `cf_id` on Group/Component | Entity Handle (`HEX`, e.g. `2A1B`) | 22-character IFC Base64 GUID (`uuidToIfcGuid`) | `UniqueId` (UUID string) |
| **Type ID** | `type_id` (UUID) | Attribute `cf_type_id` | Block Name (`AcDbBlockReference`) | `IfcTypeProduct.GlobalId` | `FamilySymbol.UniqueId` |
| **Type Mark** | `mark` (e.g. `C1`, `B1`, `W1`) | Attribute `cf_mark` | Attribute Tag / Layer Mark | `IfcProduct.Name` | `Type Mark` Parameter |
| **Length Unit** | Millimeter (`mm`) | Millimeter / Inch (converted via API) | Millimeter (`$INSUNITS = 4`) | Millimeter (`IFCSIUNIT(MILLI, METRE)`) | Millimeter (`mm`) / Feet |
| **Angle Unit** | Degrees (`0°` - `360°`, CCW) | Radians / Degrees | Degrees (CCW from +X) | Radians (`IFCSIUNIT(RADIAN)`) | Degrees |
| **Coordinates** | Right-handed (+X East, +Y North, +Z Up) | Right-handed (Red=+X, Green=+Y, Blue=+Z) | WCS (+X Right, +Y Up, +Z Screen) | World Coordinate System (+Z Up) | Project Base Point (+Z Elevation) |

---

## 3. Renovation Phasing & Lifecycle Mapping

ConstructFlow strictly separates **Renovation Lifecycle Phases** (`created_phase` and `removed_phase`) into 3 distinct operational dimensions:

| Canonical Phase | `removed_phase` | Meaning | SketchUp Tag / Layer | AutoCAD AIA / วสท. Layer | IFC 4.3 PropertySet (`Pset_ElementPhase`) | Revit Phase Parameter |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `existing` | `undefined` | อาคารเดิม (คงอยู่) | `Phase::Existing` | `*-EXST` (Color 8, Continuous, 0.25mm) | `PhaseCreated = "Existing"`, `PhaseDemolished = ""` | `Phase Created = "Existing"`, `Phase Demolished = "None"` |
| `existing` | `'demolition'` | อาคารเดิม (ส่วนรื้อถอน) | `Phase::Demolition` | `*-DEMO` (Color 10 Red, Dashed, 0.35mm) | `PhaseCreated = "Existing"`, `PhaseDemolished = "Demolition"` | `Phase Created = "Existing"`, `Phase Demolished = "Demolition"` |
| `demolition` | `undefined` | ส่วนรื้อถอน (Direct Mark) | `Phase::Demolition` | `*-DEMO` (Color 10 Red, Dashed, 0.35mm) | `PhaseCreated = "Existing"`, `PhaseDemolished = "Demolition"` | `Phase Created = "Existing"`, `Phase Demolished = "Demolition"` |
| `new_construction`| `undefined` | ส่วนสร้างใหม่ / ต่อเติม | `Phase::New` | `*-NEWW` (Bold Color, Continuous, 0.50mm) | `PhaseCreated = "New Construction"`, `PhaseDemolished = ""` | `Phase Created = "New Construction"`, `Phase Demolished = "None"` |

---

## 4. Domain Smart Objects Mapping Matrix

### 4.1 Structural Discipline (Structure Domain)

| Domain Object | Canonical Family | Canonical Fields | Ruby Definition Class | AutoCAD DXF Layer | IFC 4.3 Entity | Revit Category |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **RC Column** | `column` | `location_mm`, `section_mm`, `base_level_id`, `top_level_id`, `material` | `Structure::ColumnDefinition` | `S-COLN-NEWW`<br>`S-COLN-EXST` | `IfcColumn` | `OST_Columns` |
| **Steel Column** | `column` | `profile_code`, `section_mm`, `material: 'steel'` | `Structure::ColumnDefinition` | `S-COLN-NEWW` | `IfcColumn` | `OST_StructuralColumns` |
| **RC Beam** | `beam` | `start_point_mm`, `end_point_mm`, `section_mm`, `span_mm`, `drop_mm` | `Structure::BeamDefinition` | `S-BEAM-NEWW`<br>`S-BEAM-EXST` | `IfcBeam` | `OST_StructuralFraming` |
| **Footing / Pile Cap** | `foundation` | `center_mm`, `size_mm`, `foundation_type`, `pile_type`, `pile_offsets_mm` | `Structure::FoundationDefinition` | `S-FNDN-NEWW` | `IfcFooting` | `OST_StructuralFoundation` |
| **Micro-pile** | `pile` | `pile_type`, `pile_length_mm`, `top_elevation_mm` | `Structure::PileDefinition` | `S-FNDN-PILE` | `IfcPile` | `OST_StructuralFoundation` |
| **Structural Slab** | `slab` | `boundary_polygon_mm`, `thickness_mm`, `slab_type`, `mesh_code` | `Structure::SlabDefinition` | `S-SLAB-NEWW` | `IfcSlab` | `OST_Floors` |
| **Grid Line** | `grid` | `tag`, `orientation`, `position_mm`, `extent_mm` | `Structure::GridDefinition` | `S-GRID-LINE` | `IfcGrid` | `OST_Grids` |
| **Reinforcement (BBS)**| `rebar_set` | `bar_mark`, `diameter_mm`, `shape_code`, `count`, `length_mm` | `Structure::RebarSetDefinition` | `S-REBR-NEWW` | `IfcReinforcingBar` | `OST_Rebar` |

### 4.2 Architectural Discipline (Architecture & Openings Domain)

| Domain Object | Canonical Family | Canonical Fields | Ruby Definition Class | AutoCAD DXF Layer | IFC 4.3 Entity | Revit Category |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Smart Wall** | `wall` | `start_point_mm`, `end_point_mm`, `thickness_mm`, `height_mm`, `material` | `Architecture::WallDefinition` | `A-WALL-NEWW`<br>`A-WALL-EXST`<br>`A-WALL-DEMO` | `IfcWallStandardCase` | `OST_Walls` |
| **Hosted Door** | `door` | `host_wall_id`, `offset_along_wall_mm`, `width_mm`, `height_mm`, `handing` | `DoorWindow::DoorDefinition` | `A-DOOR-NEWW` | `IfcDoor` | `OST_Doors` |
| **Hosted Window** | `window` | `host_wall_id`, `offset_along_wall_mm`, `width_mm`, `height_mm`, `sill_height_mm` | `DoorWindow::WindowDefinition` | `A-WIND-NEWW` | `IfcWindow` | `OST_Windows` |
| **Footprint Roof** | `roof` | `boundary_polygon_mm`, `void_polygons_mm`, `edge_slopes`, `slope_deg` | `Roof::RoofDefinition` | `A-ROOF-NEWW` | `IfcRoof` | `OST_Roofs` |
| **Stair Flight & Landing**| `stair` | `stair_type`, `total_rise_mm`, `tread_depth_mm`, `riser_height_mm`, `width_mm` | `Architecture::StairDefinition` | `A-STRS-NEWW` | `IfcStair` / `IfcStairFlight` | `OST_Stairs` |
| **Handrail / Railing** | `railing` | `path_points_mm`, `height_mm`, `baluster_spacing_mm`, `post_profile` | `Architecture::RailingDefinition`| `A-RAIL-NEWW` | `IfcRailing` | `OST_Railings` |
| **Ceiling Tile / RCP** | `ceiling` | `boundary_polygon_mm`, `tile_size_mm: [600, 600]`, `height_mm` | `Architecture::CeilingDefinition`| `A-CLNG-NEWW` | `IfcCovering(CEILING)` | `OST_Ceilings` |
| **3D Sweep Moulding** | `moulding` | `path_points_mm`, `profile_code`, `moulding_type: 'skirting'|'cornice'` | `Decorative::MouldingDefinition` | `A-FINS-NEWW` | `IfcCovering(MOULDING)` | `OST_Cornices` |

### 4.3 MEP Disciplines (Plumbing, Drainage & Electrical)

| Domain Object | Canonical Family | Canonical Fields | Ruby Definition Class | AutoCAD DXF Layer | IFC 4.3 Entity | Revit Category |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Drainage Manhole** | `manhole` | `center_mm`, `invert_level_mm`, `ground_level_mm`, `size_code` | `Drainage::ManholeDefinition` | `M-DRAN-MANH` | `IfcDistributionChamberElement` | `OST_PlumbingFixtures` |
| **Gravity Drain Pipe** | `drain_pipe` | `start_point_mm`, `end_point_mm`, `slope_ratio`, `diameter_mm`, `invert_in_mm` | `Drainage::PipeDefinition` | `M-PLMB-WAST` | `IfcPipeSegment` | `OST_PipeCurves` |
| **Septic Tank** | `septic_tank` | `center_mm`, `pe_capacity`, `model_code`, `volume_liters` | `Drainage::SepticDefinition` | `M-DRAN-SEPT` | `IfcDistributionChamberElement` | `OST_PlumbingFixtures` |
| **Cold Water Pipe** | `water_pipe` | `path_points_mm`, `diameter_mm`, `system: 'cold_water'` | `Plumbing::PipeDefinition` | `M-PLMB-COLD` | `IfcPipeSegment` | `OST_PipeCurves` |
| **Pump 3-Valve Bypass**| `pump_bypass` | `pump_model`, `pipe_size_mm`, `bypass_valve_state`, `suction_tank_id` | `Plumbing::PumpBypassDefinition` | `M-PUMP-BYPS` | `IfcPump` | `OST_MechanicalEquipment` |
| **Electrical Panel** | `panelboard` | `panel_name`, `mains_rating_at`, `busbar_phases: 3`, `circuits` | `Electrical::PanelDefinition` | `E-POWR-PANL` | `IfcElectricDistributionBoard` | `OST_ElectricalEquipment` |
| **Lighting Luminaire**| `luminaire` | `center_mm`, `wattage`, `circuit_id`, `mounting_height_mm` | `Electrical::LuminaireDefinition` | `E-LGHT-NEWW` | `IfcLightFixture` | `OST_LightingFixtures` |

---

## 5. Bidirectional Transformation Functions

In `@constructflow/project-model`, the conversion mappings are formalized via helper contracts:

```typescript
// Canonical to CAD Layer
export function resolveCadLayerForSmartObject(object: SmartObject): string {
  const discipline = resolveDisciplinePrefix(object.family);
  const code = resolveElementCode(object.family);
  const phaseSuffix = object.removed_phase === 'demolition' || object.created_phase === 'demolition'
    ? 'DEMO'
    : object.created_phase === 'existing'
    ? 'EXST'
    : 'NEWW';
  return `${discipline}-${code}-${phaseSuffix}`;
}

// Canonical UUID to IFC GUID (22-character Base64)
export function canonicalToIfcGuid(uuid: string): string {
  return uuidToIfcGuid(uuid);
}

// Canonical to Revit Category
export function resolveRevitCategory(family: string): string {
  // e.g. 'wall' -> 'OST_Walls', 'column' -> 'OST_Columns'
}
```

---

## 6. Verification and Acceptance Criteria

1. **AC-MAP-001 (Identity Roundtrip):** Every valid RFC-4122 UUID must convert deterministically to a 22-character IFC GUID and preserve entity tracking across export-import cycles.
2. **AC-MAP-002 (Phase Layer Coherence):** Any object with `removed_phase: 'demolition'` must map to `*-DEMO` in CAD, `PhaseDemolished = "Demolition"` in IFC, and red dashed linework in 2D vector outputs.
3. **AC-MAP-003 (Type Catalog Binding):** Type changes in Canonical Project Model must propagate to Block Names in DXF, `IfcTypeProduct` in IFC, and Component Definitions in SketchUp without breaking instance UUIDs.
