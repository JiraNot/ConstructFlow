# ConstructFlow — AutoCAD / DWG Integration Direction

## 1. Context & Business Need

In real residential construction practices (especially in Southeast Asia / Thailand), 2D architectural surveys, engineering plans, and municipal submissions originate in **AutoCAD / DWG** format.

Rather than attempting to replace AutoCAD or pivot ConstructFlow into a heavyweight CAD drafting engine, ConstructFlow treats AutoCAD / DWG as an essential **input and output workflow partner**.

```text
2D DWG / Survey File
         │
         ▼
   DWG Ingestion
 (Layers, Blocks, Lines)
         │
         ▼
  Candidate Detection
 (Walls, Doors, Columns)
         │
         ▼
  User Confirmation UI
         │
         ▼
  Semantic CommandBus
 (CreateWall, PlaceDoor)
         │
         ▼
   Smart Object Model
 (3D SketchUp + Plan + BOQ)
```

## 2. Ingestion & Analysis Architecture

### 2.1 Layer Classification
CAD drawings typically follow organizational layer naming conventions. ConstructFlow maps layer patterns to candidate domain types:

| Standard Layer Pattern | Candidate Domain Entity |
|---|---|
| `A-WALL*`, `*WALL*`, `ผนัง*` | Wall Candidate |
| `A-DOOR*`, `*DOOR*`, `ประตู*` | Door Opening Candidate |
| `A-WIND*`, `*WIND*`, `หน้าต่าง*` | Window Opening Candidate |
| `S-COL*`, `*COL*`, `เสา*` | Structural Column Candidate |
| `S-BEAM*`, `*BEAM*`, `คาน*` | Structural Beam Candidate |
| `A-DEMO*`, `*DEMO*`, `รื้อถอน*` | Demolition Phase Filter |
| `A-NEW*`, `*NEW*` | New Construction Phase Filter |

### 2.2 Block Name Mapping
Standard architectural door and window symbols in DWG files are represented as blocks:
- Block `D01`, `D-01`, `DOOR-SLIDING-2` -> Map to Type `D-SL2` in Door/Window Catalog.
- Block `W01`, `W-01`, `WINDOW-AWNING` -> Map to Type `W-AW1`.

### 2.3 Candidate Detection vs Blind Conversion
ConstructFlow **does not blindly convert every CAD line into a 3D object**.
A raw CAD drawing contains text, hatching, titleblocks, and electrical schematics. Blind conversion produces cluttered, corrupted geometry.

Instead:
1. **Candidate Analyzer**:
   - Analyzes parallel lines on wall layers to identify wall thickness (e.g. 100mm, 150mm, 200mm) and centerlines.
   - Identifies column bounding boxes.
   - Identifies door arc swings and opening gaps.
2. **Interactive Confirmation UI**:
   - Displays detected candidate objects with confidence ratings.
   - User reviews, adjusts wall types, toggles phases (`existing` vs `new`), and confirms.
3. **Command Generation**:
   - Emits standard `CreateWall`, `CreateOpening`, `CreateColumn` commands into `CommandBus`.

## 3. Implementation Phasing

1. **Phase 1 (DXF / Polylines Ingestion Engine)**:
   - Pure Ruby parser for ASCII DXF format (entity iteration: `LINE`, `LWPOLYLINE`, `INSERT`, `TEXT`).
2. **Phase 2 (Wall & Opening Recognition Heuristics)**:
   - Centerline detection from parallel double lines.
   - Block insertion point and bounding dimension extraction.
3. **Phase 3 (Interactive Inspector Dialog)**:
   - Preview candidates in SketchUp viewport using `Core::GhostPreview`.
   - Single-click confirmation to generate production Smart Objects.
4. **Phase 4 (DWG Export)**:
   - Export 2D plan and section representations back to layered DXF/DWG for AutoCAD users.
