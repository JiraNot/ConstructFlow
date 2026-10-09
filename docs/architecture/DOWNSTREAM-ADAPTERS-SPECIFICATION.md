# DOWNSTREAM-ADAPTERS-SPECIFICATION.md — Downstream Adapters Architecture & Contracts

> **Standard:** ConstructFlow Downstream Integration Specification  
> **Status:** Accepted Technical Architecture Standard  
> **Target Downstream Targets:** Trimble SketchUp 2024+, SketchUp LayOut 2024+, Autodesk AutoCAD (DWG/DXF R2018+), Autodesk Revit 2024+, OpenBIM IFC 4.3 (ISO 16739-1:2024), and Native Vector PDF.

---

## 1. Architectural Overview & Guiding Principles

ConstructFlow implements a **Standalone-First, Adapters-Second** architecture. The core application contains all domain logic, geometry generation, spatial indexing, rebar schedules, hydraulic slope calculations, and vector compilation natively. Downstream CAD/BIM ecosystems are treated as non-destructive consumers and documentation targets.

```
+-----------------------------------------------------------------------------------+
|                        CONSTRUCTFLOW CORE BIM PLATFORM                           |
|  - Standalone Single Source of Truth (SSOT) Project Model                         |
|  - Universal Renovation Phasing Engine (Existing / Demolition / New)              |
|  - Interactive Type Catalog Manager (Global Cascading Updates)                    |
|  - 20-Sheet A3 Master Drawing Compiler & Phased BOQ Takeoff Engine                |
+-----------------------------------------------------------------------------------+
                                         │
     ┌───────────────────┬───────────────┴───────────────┬───────────────────┐
     ▼                   ▼                               ▼                   ▼
┌───────────────┐ ┌───────────────┐             ┌─────────────────┐ ┌─────────────────┐
│   Adapter 1:  │ │   Adapter 2:  │             │   Adapter 3:    │ │   Adapter 4:    │
│ SketchUp Live │ │  Native CAD   │             │   OpenBIM IFC   │ │  Native Vector  │
│  & LayOut API │ │  DWG / DXF    │             │   4.3 & Revit   │ │  PDF / SVG Set  │
└───────────────┘ └───────────────┘             └─────────────────┘ └─────────────────┘
```

### Core Non-Destructive Invariants
1. **Persistent RFC-4122 UUID Identity:** Every element is identified across all platforms by an immutable UUID. Downstream software entity IDs (e.g. SketchUp EntityID, AutoCAD Handle, Revit ElementId) must never be used as primary keys.
2. **Differential Synchronization (Diff & Patch):** Synchronization must never erase and regenerate the downstream drawing or model (`entities.clear()` is prohibited). Adapters perform differential patching, preserving downstream user overrides, textures, render tags (V-Ray/Enscape), and dimension ties.
3. **Canonical Millimeter Precision:** All internal coordinates and lengths are stored in millimeters (`mm`). Unit transformations (e.g. to inches in LayOut or meters in IFC) occur strictly at the adapter boundary.

---

## 2. Adapter 1: SketchUp Live Bridge & Native LayOut Adapter

* **Target Applications:** Trimble SketchUp Pro 2021–2024+, SketchUp LayOut 2024+
* **Module Location:** `apps/sketchup-extension/` and `packages/module-sdk/`
* **Transport:** Local IPC via WebSocket (`ws://localhost:9876`) or File Watcher Bridge (`.cfproj` sync).

### 2.1 Non-Destructive Differential Sync Algorithm
```ruby
# Pseudo-implementation of Differential Synchronizer
module ConstructFlow::Core::Sync
  def self.sync_smart_object(model, cf_object)
    uuid = cf_object[:id]
    existing = find_entity_by_uuid(model, uuid)

    if existing
      if geometry_hash_matches?(existing, cf_object)
        # 1. NO-OP: Geometry is identical, preserve user-painted materials & tags
        return existing
      else
        # 2. IN-PLACE UPDATE: Modify transform or definition without recreation
        update_component_transform_and_definition(existing, cf_object)
        return existing
      end
    else
      # 3. CREATE: New smart object instance
      create_component_instance(model, cf_object)
    end
  end

  def self.find_entity_by_uuid(model, uuid)
    model.entities.grep(Sketchup::ComponentInstance).find do |inst|
      inst.get_attribute("constructflow", "uuid") == uuid
    end
  end
end
```

### 2.2 Layer & Tag Taxonomy (Hierarchical Tags)
Tags are configured automatically with standard colors to support SketchUp's **Color by Tag** visual mode:
* `CF_Structure::Columns` (`#3b82f6` Blue)
* `CF_Structure::Beams` (`#2563eb` Royal Blue)
* `CF_Structure::Footings` (`#1d4ed8` Navy)
* `CF_Structure::Slabs` (`#60a5fa` Light Blue)
* `CF_Arch::Walls_Existing` (`#94a3b8` Muted Slate)
* `CF_Arch::Walls_Demolition` (`#ef4444` Red)
* `CF_Arch::Walls_New` (`#0f172a` Charcoal)
* `CF_Arch::Doors` (`#f59e0b` Amber)
* `CF_Arch::Windows` (`#06b6d4` Cyan)
* `CF_Arch::Roof` (`#84cc16` Lime)
* `CF_Arch::Moldings` (`#d97706` Orange)
* `CF_MEP::Plumbing_ColdWater` (`#0284c7` Sky Blue)
* `CF_MEP::Plumbing_Soil` (`#78350f` Brown)
* `CF_MEP::Plumbing_Waste` (`#6b7280` Gray)
* `CF_MEP::Drainage_Manholes` (`#475569` Slate)
* `CF_Interior::Builtin_Carcass` (`#a855f7` Purple)
* `CF_Interior::Builtin_Doors` (`#c084fc` Lavender)
* `CF_Interior::LED_Lighting` (`#eab308` Yellow)

### 2.3 Automated Scene Tabs & Orthographic Views
The adapter generates official scenes in the `.skp` file configured for direct viewport binding in LayOut:
1. **`Plan_L1_Ground`:** Camera at top orthographic projection, SectionPlane placed at $+1.20$ m elevation with `SectionCutFilled = true` and `DisplaySectionPlanes = false`.
2. **`Plan_L2_Upper`:** Camera at top orthographic projection, SectionPlane placed at $+4.70$ m elevation.
3. **`Plan_Roof`:** Camera at top orthographic projection without horizontal section cuts.
4. **`Elevation_North`, `Elevation_East`, `Elevation_South`, `Elevation_West`:** Parallel projection aligned along cardinal axes.
5. **`Section_A_Longitudinal`, `Section_B_Transverse`:** Vertical SectionPlanes cutting through wet zones and stairs.
6. **`Structure_Foundation`, `Structure_Framing`:** Scenes with architectural and interior tags hidden.

### 2.4 Native LayOut Ruby API Bridge
* **Paper Dimension Conversion:**
  $$\text{LayOut Inches} = \frac{\text{Millimeters}}{25.4}$$
  A3 Sheet size ($420\times 297$ mm) becomes $16.5354 \times 11.6929$ inches.
* **Viewport Scale Math:**
  $$\text{Scale Ratio } 1:100 \longrightarrow 0.0100, \quad 1:50 \longrightarrow 0.0200, \quad 1:25 \longrightarrow 0.0400$$
* **Render Mode Binding:**
  Explicitly sets `Layout::SketchUpModel::VECTOR_RENDER` for razor-sharp vector lines, or `HYBRID_RENDER` when textured finishes are present.

---

## 3. Adapter 2: Native AutoCAD DWG / DXF Exporter & PaperSpace Engine

* **Target Applications:** Autodesk AutoCAD 2018–2025+, GstarCAD, BricsCAD, ZWCAD
* **Module Location:** `packages/cad-adapter/`
* **Technology:** 100% Native TypeScript Vector DXF/DWG Serializer (no external CAD runtime required).

### 3.1 ModelSpace Architecture (1:1 mm WCS)
All entities are drawn at real-world coordinates in millimeters:
* `$LUNITS = 2` (Decimal units)
* `$INSUNITS = 4` (Millimeters)
* Standard CAD Layering and ACI Color Codes:
  * **Existing (อาคารเดิม):** Color 8 / 250 (Gray), Lineweight 0.25mm, Linetype `CONTINUOUS`
  * **Demolition (ส่วนรื้อถอน):** Color 10 (Red), Lineweight 0.35mm, Linetype `DASHED2`
  * **New Construction (สร้างใหม่):** Color 7 (White/Black), Lineweight 0.50mm, Linetype `CONTINUOUS`
  * **Openings & Glass:** Color 4 (Cyan), Lineweight 0.30mm
  * **Dimensions & Annotations:** Color 1 (Red/Magenta), Lineweight 0.18mm
  * **Hatch Patterns:** Color 8 (Light Gray), Lineweight 0.13mm

### 3.2 20 PaperSpace Layout Tabs (`A-01` to `E-02`)
The exporter writes the 20 standard PaperSpace layouts from the `PermitDrawingSet` page-space vector primitives, the same compiled source used by PDF. Every entity carries its layout name so A-05/A-06 receive their elevation vectors rather than a repeated top-plan viewport. Text, fills, phase color, lineweight, and demolition dash style are translated into editable DXF entities in discipline view layers. Original Smart Object geometry remains in ModelSpace on semantic object layers. Page vectors use millimeters in PaperSpace; their compiled positions already include sheet scale and printable-frame placement.

### 3.3 Schedule and Native CAD Acceptance
Schedule sheets currently export as editable page-space vectors from the same compiler as PDF. Native `ACAD_TABLE` generation is not connected to project-derived schedule data yet; the legacy formatting helper alone is not evidence of a live table workflow. Opening and plotting the 20 layouts in AutoCAD/LibreCAD, including font/background behavior, remains a required native-app acceptance step.
### 3.4 AutoLISP & Script Automation
* Generates a batch plot script (`batch_publish.scr`) that automatically plots all 20 PaperSpace layouts to A3 PDF in a single command.

---

## 4. Adapter 3: OpenBIM IFC 4.3 & Revit Direct Bridge

* **Target Applications:** Autodesk Revit 2024+, Graphisoft ArchiCAD 27+, Solibri, Navisworks
* **Module Location:** `packages/bim-adapter/`
* **Standards:** ISO 16739-1:2024 (IFC 4.3 ADD2), buildingSMART Standards.

### 4.1 Schema Mapping Table
| ConstructFlow Smart Object | IFC 4.3 Entity Class | PredefinedType | IFC Representation |
| :--- | :--- | :--- | :--- |
| Structural Column (`C1`, `C2`) | `IfcColumn` | `COLUMN` | `IfcExtrudedAreaSolid` (Rectangle/Circle) |
| Structural Beam (`B1`, `B2`) | `IfcBeam` | `BEAM`, `JOIST` | `IfcExtrudedAreaSolid` (Rectangular / T-section) |
| Drop Beam (คานลดระดับ) | `IfcBeam` | `BEAM` | `IfcExtrudedAreaSolid` with Z-offset |
| Footing & Pile Cap (`F1`, `F2`) | `IfcFooting` | `PAD_FOOTING`, `PILE_CAP` | `IfcExtrudedAreaSolid` |
| Micro-pile (เสาเข็มไมโครไพล์) | `IfcPile` | `BORED`, `DRIVEN` | `IfcExtrudedAreaSolid` (I-Shape Profile) |
| Structural Slab (`S1`, `GS1`) | `IfcSlab` | `FLOOR`, `BASESLAB` | `IfcExtrudedAreaSolid` |
| Wall (`W1`, `W2`, `W3`) | `IfcWall` | `SOLIDWALL`, `STANDARD` | `IfcExtrudedAreaSolid` on Base Curve |
| Door / Window | `IfcDoor` / `IfcWindow` | `DOOR` / `WINDOW` | Hosted in `IfcOpeningElement` |
| Sanitary Pipe (ท่อประปา/ส้วม) | `IfcPipeSegment` | `CULVERT`, `GUTTER` | `IfcSweptDiskSolid` |
| Pipe Fitting (ข้องอ, สามทาง) | `IfcPipeFitting` | `BEND`, `JUNCTION` | `IfcFacetedBrep` |
| Rebar (เหล็กยืน, เหล็กปลอก) | `IfcReinforcingBar` | `ANCHORING`, `MAIN`, `RING`| `IfcSweptDiskSolid` with Bend Radius |
| Millwork & Built-in Joinery | `IfcFurnishingElement` | `CABINET` | `IfcExtrudedAreaSolid` / Composite Assembly |

### 4.2 Renovation Phasing Property Set (`Pset_ConstructionPhase`)
Every exported element includes a custom property set recognized by standard BIM phase filters:
```
PropertySet: Pset_ConstructionPhase
  - PhaseCreated: "Existing" | "Demolition" | "New_Construction"
  - DemolitionMethod: "Mechanical" | "Manual" (if PhaseCreated == Demolition)
  - JointTreatment: "Chemical_Dowel_Epoxy" | "Expansion_Joint" | "None"
```

### 4.3 Spatial Containment Hierarchy
```
IfcProject ("ConstructFlow Project")
  └── IfcSite ("Bangkok Property Plot", GPS Lat/Long WGS84, Deed Polygon)
        └── IfcBuilding ("Residential Extension")
              ├── IfcBuildingStorey ("Level 1 - Ground Floor", Elevation: 0.00m)
              │     ├── IfcFooting, IfcColumn, IfcBeam, IfcSlab, IfcWall
              │     └── IfcPipeSegment, IfcReinforcingBar
              ├── IfcBuildingStorey ("Level 2 - Upper Floor", Elevation: +3.50m)
              └── IfcBuildingStorey ("Roof Level", Elevation: +7.00m)
```

### 4.4 Revit Direct PyRevit / Dynamo Bridge
To bypass IFC translation losses when working in pure Autodesk Revit environments, ConstructFlow produces an intermediate JSON schema (`constructflow.revit_transfer.v1`). A lightweight PyRevit plugin parses this JSON to generate **Native Revit System Families**:
* Walls $\rightarrow$ Native `Wall.Create(doc, curve, wallType.Id, level.Id, height, offset, ...)`
* Floors $\rightarrow$ Native `Floor.Create(doc, curveLoop, floorType.Id, level.Id)`
* Columns/Beams $\rightarrow$ Native `FamilyInstance` placements with exact Type assignments.

---

## 5. Adapter 4: Native Vector PDF & SVG Sheet Compiler

* **Module Location:** `packages/sheet-engine/`
* **Technology:** Pure TypeScript / WebGL / Canvas / PDFKit Vector Compiler.
* **Primary Role:** Instant, 1-click A3 permit drawing package creation directly inside ConstructFlow.

### 5.1 Thai Legal Submission Compliance (แบบ อ.1)
* **A3 Vector Standard:** $420\times 297$ mm rendered at 300+ DPI vector accuracy.
* **Embedded Thai Typography:** Embeds full OpenType subsets of official fonts:
  * `TH Sarabun PSK` / `Sarabun` (Official Thai government standard)
  * `Prompt` (Modern architectural annotation)
  * `Cordia New` (Traditional engineering CAD standard)
* **Thai Glyphs Normalization:**
  Eliminates floating or clipped tone marks (แก้ปัญหาวรรณยุกต์และสระจม/ลอย) using zero-width glyph remapping algorithms to ensure legally binding documents.

### 5.2 Dynamic Viewport Clipping & Annotation Engine
* **Polygon Crop Bounds:** Dynamic clipping polygons allowing split views and detail callouts without rendering outside the viewport frame.
* **Vector Hatch Library:** Deterministic procedural hatching for Reinforced Concrete (dots & triangles), Brickwork (diagonal hatching), Earth (cross hatch), and Waterproofing membrane.
* **Auto-Dimension Strings:** Chain dimension strings with snap points to gridlines, column faces, wall centers, and opening jambs.

---

## 6. Adapter 5: AI Orchestration & MCP Server Adapter

* **Module Location:** `apps/mcp-server/`
* **Protocol:** Anthropic / Model Context Protocol (MCP) JSON-RPC 2.0 Specification.
* **Primary Role:** Exposes all ConstructFlow BIM operations to autonomous AI agents (Claude, Codex, Antigravity).

### 6.1 Tool Registry
| Tool Name | Input Parameters | Return Value | Description |
| :--- | :--- | :--- | :--- |
| `cf_query_model` | `phase?: Phase`, `level_id?: string`, `category?: string`, `bbox?: BoundingBox` | `SmartObject[]` | Inspect elements within the model |
| `cf_mutate_geometry` | `commands: CQRSCommand[]` | `{ success: boolean, tx_id: string }` | Execute transactional geometry edits |
| `cf_validate_compliance` | `project_id: string` | `ComplianceReport` (Setbacks, OSR/FAR) | Verify Thai Building Code rules |
| `cf_run_clash` | `discipline_a: string`, `discipline_b: string` | `ClashReport[]` (Point, Clearance) | Spatial intersection analysis |
| `cf_export_sheets` | `format: 'pdf' \| 'dxf'`, `sheet_ids: string[]` | `{ file_uri: string }` | Trigger batch sheet compilation |
| `cf_sync_sketchup` | `options: { mode: 'incremental' \| 'full' }` | `{ synced_count: number }` | Live push to SketchUp extension |
| `cf_export_dxf` | `version: '2018'`, `layouts: boolean` | `{ dxf_path: string }` | Generate 20-layout CAD package |

---

## 7. Verification & Conformance Protocol

Every adapter must satisfy the following automated acceptance criteria:
1. **Round-Trip Identity Verification:** An element exported through any adapter must retain its exact UUID upon re-inspection.
2. **Unit Conversion Accuracy:** $1,000$ mm in ConstructFlow must measure exactly $1,000$ mm in ModelSpace CAD, $1.000$ m in IFC, and $39.3701$ inches in SketchUp/LayOut.
3. **Zero Orphan State:** Changing a Type Catalog entry in ConstructFlow must propagate to downstream models within a single synchronization transaction.
4. **Non-Destructive Diff Test:** Modifying a beam span in ConstructFlow must update the existing SketchUp component instance without resetting custom paint materials applied to that component.
