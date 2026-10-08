# AGENTS.md — ConstructFlow Engineering & Agent Operating Blueprint

> **System Identity:** ConstructFlow (by JiraNot)  
> **Platform Vision:** Autonomous, Self-Contained BIM, Architectural/Structural/MEP Modeler, Drafting Engine, and Phased Construction Takeoff Platform.  
> **Target Standard:** Thai Building Code (กฎกระทรวงฉบับที่ 55 พ.ศ. 2543), BMA Municipal Regulations (ข้อบัญญัติ กทม.), Engineering Institute of Thailand (EIT / วสท.), and 20-Sheet A3 Permit Construction Set (แบบขออนุญาตก่อสร้าง อ.1).

---

## 1. Executive Summary & Core Architectural Principle

ConstructFlow is **not merely a plugin or extension for CAD software**. It is an **autonomous, standalone BIM & Construction CAD engine** capable of executing a complete project lifecycle:
$$\text{Deed / AI Sketch} \longrightarrow \text{Parametric BIM} \longrightarrow \text{Thai Law Check} \longrightarrow \text{20-Sheet A3 Set} \longrightarrow \text{Phased BOQ}$$

### Standalone-First, Adapters-Second Principle
```
+-----------------------------------------------------------------------------------+
|                        CONSTRUCTFLOW CORE BIM PLATFORM                           |
|  - Standalone Web/Desktop Engine (React + TypeScript + Canvas/WebGL + Rust/WASM)   |
|  - Single Source of Truth (SSOT) Project Model                                    |
|  - Spatial R-Tree Index & Clash Engine                                            |
|  - Universal Renovation Phasing Engine (Existing / Demolition / New)              |
|  - Multi-Page Sheet & Vector Layout Compiler (20-Sheet A3 Drawings)              |
|  - Quantitative Takeoff & Phased BOQ Calculator                                   |
+-----------------------------------------------------------------------------------+
                                         |
     +-----------------------------------+-----------------------------------+
     | Downstream Exporters & Sync Adapters (Non-Destructive UUID Matching)  |
     v                                   v                                   v
+------------------------+  +------------------------+  +------------------------+
| SketchUp Sync Bridge   |  | AutoCAD DWG / DXF      |  | Revit / IFC 4.3        |
| (Ruby Command Bus API) |  | Native Vector Exporter |  | OpenBIM Exporter       |
+------------------------+  +------------------------+  +------------------------+
```

1. **Self-Contained Computation:** ConstructFlow performs all geometry generation, spatial queries, clearance validation, rebar detailing, hydraulic slope calculation, and vector PDF compilation natively. External CAD/BIM tools are optional downstream rendering and documentation targets.
2. **Non-Destructive Synchronization:** Downstream bridges (SketchUp, AutoCAD, Revit) preserve exact Smart Object UUIDs and non-destructively sync geometry and metadata without breaking user customizations.
3. **Dual Execution Surface:** Autonomous AI agents and human users interact through the exact same Command Bus (CQRS) interface.

---

## 2. Monorepo Structure & Package Responsibilities

The ConstructFlow codebase is organized as a clean, modular monorepo:

```
ConstructFlow/
├── apps/
│   ├── plan-editor/           # Standalone Web/Desktop 2D/3D BIM Workbench (React, Canvas/WebGL, Vite)
│   ├── sketchup-extension/    # Ruby Bridge for live SketchUp bi-directional synchronization
│   └── mcp-server/            # Model Context Protocol server exposing BIM tools to AI agents
├── packages/
│   ├── project-model/         # Canonical Domain Models, Smart Objects, Type Catalog & Serializers
│   ├── geometry-kernel/       # Reusable, renderer-neutral geometry primitives and algorithms
│   ├── snapping-engine/       # BIM-aware geometric snap candidates, ranking and hosted-opening snaps
│   ├── command-schema/        # CQRS Mutation Commands, Validation Rules, Undo/Redo Transactions
│   ├── clash-engine/          # Spatial R-Tree, Hard/Soft Clash Detection & Legal Setback Analyzer
│   ├── takeoff-engine/        # Phased BOQ, Area/Volume/Length formulas, Rebar Tonnage Calculator
│   ├── sheet-engine/          # Dynamic Viewports, Auto-Dimensioning, Annotations & Vector PDF Compiler
│   ├── cad-adapter/           # Native AutoCAD DWG/DXF Exporter, PaperSpace & ACAD_TABLE Generator
│   ├── bim-adapter/           # OpenBIM IFC 4.3 & Revit Direct Bridge Serializer
│   └── module-sdk/            # Modular Plugin API & Extension Contracts
├── docs/                      # Authoritative Technical Specifications & Architectural Decision Records
└── AGENTS.md                  # This file: Agent Guidelines, Scope, Architecture, and Operating Rules
```

### Module Boundary Rules (Mandatory)
* **Domain Isolation:** Never place domain-specific logic (e.g., rebar formulas, septic sizing) inside generic UI containers or Core infrastructure. Domain behavior belongs in its respective domain package.
* **UI Purity:** React components in `apps/plan-editor` are strictly for presentation and user orchestration. Geometric algorithms, validation formulas, and pricing logic must reside in domain packages.
* **Interactive Geometry:** BIM-aware geometric snapping belongs in `packages/snapping-engine`; keep canvas components as orchestration and rendering surfaces.
* **Stable Identity:** Never use runtime memory pointers or CAD internal entity IDs as primary keys. All entities are keyed by persistent, RFC-4122 UUIDs.

---

## 3. Universal Renovation Phasing Paradigm

Renovation and extension projects represent over 70% of real-world residential work in Thailand. Every single entity across ALL domains (Structure, Architecture, Openings, MEP, Built-in, Moldings) must carry a mandatory `created_phase` property:

```typescript
export type Phase = 'existing' | 'demolition' | 'new_construction';
```

### 1. Visual 2D Drafting Standards
| Phase | Thai Designation | Line Weight & Style | Color Hex | Fill & Hatch Pattern |
| :--- | :--- | :--- | :--- | :--- |
| **Existing** | อาคารเดิม / โครงสร้างเดิม | Solid 1px (0.25 mm) | `#94a3b8` (Slate 400) | Muted solid fill (40% opacity) |
| **Demolition** | ส่วนรื้อถอน / ทุบทำลาย | Dashed 1.5px (Dash 6, Space 3) | `#ef4444` (Red 500) | $45^\circ$ diagonal strike-through hatch |
| **New Construction** | ส่วนสร้างใหม่ / ต่อเติม | Bold Solid 2px (0.50 mm) | `#0f172a` (Slate 900) | Crisp material hatch (Concrete, Brick, Steel) |

### 2. Phased BOQ Segregation (3 Discrete Estimates)
The Takeoff Engine must never dump renovation quantities into a single unsegregated pile. Every estimate is cleanly divided into three distinct cost centers:
1. **งานรื้อถอนและเตรียมพื้นที่ (Demolition & Site Prep):** ค่าแรงสกัดคานเดิม, ทุบผนังอิฐเดิม ($m^2$), ตัดท่อเดิม, ขนย้ายซากปรักหักพังไปทิ้งภายนอกโครงการ, งานค้ำยันชั่วคราว (Shoring).
2. **งานโครงสร้าง สถาปัตย์ และระบบสร้างใหม่ (New Construction):** เสาเข็มไมโครไพล์, ฐานราก, เสา, คาน, ผนังเบา/อิฐมวลเบา, งานหลังคา, งานประปา-สุขาภิบาล, ไฟฟ้าสร้างใหม่.
3. **งานเชื่อมต่อรอยต่อเดิม-ใหม่ (Remodeling & Joint Treatment):** สกัดคอนกรีตเดิมเพื่อเจาะเสียบเหล็กโครงสร้างด้วยน้ำยาเคมี (Chemical Dowel Epoxy), Expansion joint sealant, Flashing เชื่อมระหว่างรางน้ำเดิมและหลังคาใหม่.

---

## 4. Interactive Type Catalog Pattern & Cascading Updates

ConstructFlow strictly separates **Instance Data** (position, rotation, host relation) from **Type Catalog Data** (cross-section dimensions, structural reinforcement, materials, unit cost).

```
+--------------------------------------------------------------------------------+
|                             TYPE CATALOG REGISTRY                              |
|  - Beam Types:      B1 (200x400), B2 (150x350), RB1 (Roof Beam)                |
|  - Slab Types:      S1 (Topping on Precast Plank), GS (Ground Slab on Peat)    |
|  - Column Types:    C1 (200x200 RC), SC1 (150x150x4.5 Thai TIS H-Beam)         |
|  - Wall Types:      W1 (100mm Brick), W2 (75mm AAC Block + Plaster), W3 (Drywall)|
|  - Opening Types:   D1 (900x2000 Swing), W1 (1800x1200 Sliding 2-panel)       |
+--------------------------------------------------------------------------------+
                                        |
                  [Global Cascading Update upon Type Modification]
                                        |
       +-----------------+--------------+-----------------+-----------------+
       v                 v                                v                 v
+--------------+  +--------------+                 +--------------+  +--------------+
| Plan Canvas  |  | 3D WebGL     |                 | Structural   |  | BOQ Takeoff  |
| (Viewports)  |  | Mesh Sync    |                 | Schedules    |  | Quantities   |
+--------------+  +--------------+                 +--------------+  +--------------+
```

### Global Cascading Propagation Rule
When a user or agent modifies a Type Catalog entry (e.g. changing beam `B1` depth from `400mm` to `500mm`, or altering its top rebars from `2-DB16` to `3-DB20`):
1. **Zero Orphan States:** Every instance referencing `type_id: "B1"` immediately inherits the new geometry and material properties.
2. **Automatic Recalculation:** Downstream structural schedules, 3D WebGL meshes, LayOut section viewports, and rebar tonnage calculations update in a single transaction.

---

### 4.1 1-Click Parametric Extension Assembly Presets (ระบบสั่งสร้างส่วนต่อเติมสำเร็จรูป)

แทนที่ผู้ใช้หรือ AI จะต้องวาดเสา 4 ต้น ฐานราก 4 ฐาน คาน 4 ช่วง ผนัง และช่องเปิดทีละชิ้น ConstructFlow มีระบบ **Parametric Macro Assemblies** ที่สร้างโครงสร้างและงานสถาปัตย์แบบครบชุดใน 1 คลิก พร้อมระบุขนาดเป็น **หน่วยเมตร (m)**:

```
[ผู้ใช้เลือกพิกัด X, Y และขนาด กว้าง x ยาว ในหน่วยเมตร]
                         │
                         ▼
+─────────────────────────────────────────────────────────────+
|               PARAMETRIC EXTENSION GENERATOR                |
+─────────────────────────────────────────────────────────────+
         │                       │                       │
         ▼                       ▼                       ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ 1. โรงจอดรถ       │    │ 2. ครัวไทยหลังบ้าน │    │ 3. เทอเรสไม้เทียม │
│    โครงเหล็ก SOG │    │    แยกโครงสร้าง   │    │    WPC Deck      │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

1. **โรงจอดรถหน้าบ้าน (Modern Steel Carport Preset):**
   * สร้างเสาเหล็ก SC1 (150×150 มม.) 4 ต้น + ฐานราก F1 (800×800) + คานเหล็ก B1 (200×400) 4 ช่วง + พื้น Slab on Ground หนา 12 ซม. สโลป 1:100 + โครงหลังคาเมทัลชีทบุฉนวน PU 1"
   * เหมาะกับระยะมาตรฐาน $5.00 \times 5.50$ ม.
2. **ครัวไทยต่อเติมหลังบ้าน (Rear Kitchen Extension Preset):**
   * ออกแบบตามหลัก **Settlement Isolation** (แยกโครงสร้างขาดจากตัวบ้านเดิม 100% ป้องกันการทรุดตัวดึงบ้านเดิมแตกร้าว)
   * สร้างเสา C1 4 ต้น + ฐานรากเข็มไมโครไพล์ F1 + คาน B1 + ผนังอิฐมวลเบา W1 หนา 10 ซม. (3 หรือ 4 ด้าน) + ประตูบานเปิด D1 (0.90 ม.) + หน้าต่างระบายอากาศ W1 (1.20 ม.) + แฟลชชิ่งกันซึม
   * เหมาะกับระยะมาตรฐาน $4.00 \times 2.50$ ม.
3. **เทอเรสระเบียงไม้เทียม (Outdoor WPC Deck Terrace Preset):**
   * สร้างตอม่อ คสล. C1 6 จุด + ฐานราก F1 + คานตงเหล็กกัลวาไนซ์ B1/B2 ระยะ 1.50 ม. + ไม้พื้น WPC หนา 25 มม. ระบบคลิปล็อกซ่อนสกรู + สเต็ปบันไดทางขึ้น 1–2 ขั้น (ระดับความสูง $+0.45$ ม.)
   * เหมาะกับระยะมาตรฐาน $3.00 \times 4.00$ ม.

#### คุณลักษณะสำคัญของการสร้างแบบ Macro Assembly:
* **Atomic Transaction:** คำสั่งทั้งหมดถูกส่งผ่าน `CommandBus` ในรอบเดียว มี Undo/Redo รองรับสมบูรณ์
* **Universal Phasing Enforcement:** ชิ้นงานทั้งหมดที่ถูกสร้างได้รับ `created_phase: 'new_construction'` โดยอัตโนมัติ
* **Non-Destructive & Fully Editable:** หลังสร้างเสร็จ ชิ้นงานทุกชิ้นมี Persistent UUID ผู้ใช้สามารถคลิกขยับเสา ยืดผนัง ปรับหน้าตัด หรือสลับชนิดประตู-หน้าต่างต่อได้อย่างอิสระ ไม่ใช่กล่องตัน (Dumb Mesh)
* **Instant Takeoff & Schedules:** อัปเดตยอดเสา, คาน, ผนัง, ช่องเปิด และถอดปริมาณใน BOQ ทันทีในเสี้ยววินาที

---

## 5. Scope of Work across the 6 Engineering Domains

### Domain 1: Land Deed, Site Survey & Thai Legal Compliance
* **Title Deed (โฉนดที่ดิน น.ส.4 จ.) Processing:** Support boundary pegs (หลักเขต), bearing angles, boundary line lengths, and coordinate inputs.
* **Thai Land Measurement Units:** Native conversion between ตารางวา (Sq. Wa), งาน (Ngan), ไร่ (Rai), and ตารางเมตร ($m^2$):
  $$1\text{ ไร่} = 4\text{ งาน} = 400\text{ ตร.ว.} = 1,600\text{ ตร.ม.}$$
* **Thai Building Code Compliance Engine (กฎกระทรวงฉบับที่ 55 พ.ศ. 2543 & ข้อบัญญัติ กทม.):**
  * **Setback Validation (ระยะร่นแนวอาคาร):**
    * อาคารสูงไม่เกิน 9.00 ม. ผนังที่มีช่องเปิด ประตู หน้าต่าง ระเบียง ต้องร่นห่างแนวเขตที่ดิน $\ge 2.00$ ม.
    * ผนังทึบ ร่นห่างแนวเขตที่ดิน $\ge 0.50$ ม.
    * ผนังทึบสร้างชิดแนวเขตที่ดิน ($0.00$ ม.) ได้เฉพาะเมื่อมีหนังสือยินยอมเป็นลายลักษณ์อักษรจากเจ้าของที่ดินข้างเคียง.
  * **Town Planning Zoning (ผังเมืองรวม กทม. ย.1 - ย.10):** FAR (Floor Area Ratio) และ OSR (Open Space Ratio) validation พร้อมตรวจสัดส่วนพื้นที่ว่างน้ำซึมผ่านได้ $\ge 50$% ของพื้นที่ว่างเปิดโล่ง.

### Domain 2: Structural Engineering & Detail Schedules
* **Substructure & Foundation:**
  * ฐานรากแผ่ (Isolated Spread Footing), ฐานรากเสาเข็มไมโครไพล์เจาะกด (Micro-pile $I-18, I-22$, Spun Micro-pile $\varnothing 20, \varnothing 25$), ฐานรากเสาเข็มเจาะ (Bored Pile).
  * Footing Reinforcement Detailing Template (`ConfigureFoundationReinforcement`): ตะแกรงเหล็กเสริมฐานราก 2 ทิศทาง (Bottom Mat X/Y เช่น DB12@0.15m, DB16@0.15m), เหล็กหนวดกุ้งเดือยเสา (Starter Dowels).
* **Superstructure (Reinforced Concrete & Steel):**
  * เสา (RC Columns), คาน (RC Beams), คานลดระดับ (Drop Beams) สำหรับห้องน้ำและระเบียงซักล้าง (Drop 50–100 mm).
  * Column Reinforcement Detailing Template (`ConfigureColumnReinforcement`): เหล็กยืนแกนหลัก (Main Bars เช่น 4-DB16, 6-DB20), เหล็กปลอกรัด (Ties / Stirrups RB6, RB9) พร้อมการแบ่งโซนระยะเรียงช่วงปลายหนาแน่น @0.10 ม. และช่วงกลาง @0.15–@0.20 ม.
  * พื้นโครงสร้าง: พื้นหล่อในที่ (Slab on Beam), พื้นคอนกรีตสำเร็จรูปท้องเรียบ (Precast Solid Plank / Hollow Core) พร้อมคอนกรีตทับหน้า (Topping 50 mm + Wire Mesh $\varnothing 4$ @0.20 ม.), พื้นวางบนดิน (Slab on Ground พร้อมแผ่นพลาสติกกันชื้น PE sheet).
  * โครงสร้างเหล็กรูปพรรณ (Structural Steel): Thai TIS standard H-Beam, I-Beam, C-Channel (แปเหล็ก), แผ่นเหล็ก Base plate ยึด Chemical Anchor เข้ากับเสา/คานเดิม.
* **Rebar Detailing & Bar Bending Schedules (BBS):**
  * เหล็กยืน (Main Longitudinal Bars): DB12, DB16, DB20, DB25 (SD40 / SD50).
  * เหล็กปลอก (Stirrups / Ties): RB6, RB9 (SR24) กำหนดระยะเรียง @0.10 ม. (ช่วงปลายคาน/เสา) และ @0.15–@0.20 ม. (ช่วงกลางคาน).
  * ตารางรายการคำนวณและตัดดัดเหล็ก: คำนวณระยะทาบ (Lap Splice Length $\ge 40 d_b$), ระยะงอขอ (Standard Hooks $90^\circ, 135^\circ$), หักระยะคอนกรีตหุ้ม (Concrete Cover 25–40 mm) และน้ำหนักเหล็กอัตโนมัติ (Tonnage Takeoff).

### Domain 3: Architectural Envelope & Finish Detailing
* **Revit-Style Footprint Roof Modeler:**
  * วาดแนวขอบชายคา (Roof Boundary Polygon) พร้อมช่องเปิด/ช่องเจาะ (Void Polygons) กำหนด Slope angle ($^\circ$), Defines Slope (มี/ไม่มีความลาดเอียง) ต่อเส้นขอบ เพื่อสร้างทรงจั่ว (Gable), ปั้นหยา (Hip), เพิงหมาแหงน (Lean-to/Shed) หรือหลังคาแบน (Flat Slab).
  * องค์ประกอบครบวงจร: เชิงชาย (Fascia board), ฝ้าชายคาระบายอากาศ (Vented soffit), รางน้ำสแตนเลส/ไวนิล (Box Gutters), แผ่นครอบสันหลังคา (Ridge capping), แฟลชชิ่งกันซึม (Flashing), ฉนวนกันความร้อน (PU / Glasswool).
* **Continuous 3D Sweep Moldings (งานกรุคิ้วบัวตกแต่ง):**
  * บัวเชิงผนัง (Skirting 80–100 mm), บัวฝ้าเพดาน (Cornice 75–120 mm), บัวกลางผนัง (Dado / Chair rail 45–60 mm), บัวกรอบประตู-หน้าต่าง (Architrave 50–70 mm).
  * ระบบตัดมุมเฉียงเข้ามุมอัตโนมัติ (Automated $45^\circ$ Compound Mitering) วิ่งต่อเนื่องรอบห้องและรอบขอบเสา.
* **Parametric Portals & Decorative Openings:**
  * บานประตูซุ้มโค้ง (Roman Arch, Segmental Arch, Fillet Corners), ช่องแสงกระจกทึบ/โปร่ง (Transoms & Sidelights), หน้าต่างบานเล่อน, บานเปิด, บานกระทุ้ง, บานเกล็ด.
  * ควบคุม 4-Quadrant Swing Handing (`left_in`, `left_out`, `right_in`, `right_out`) พร้อมหักช่องเปิดบนผนังแบบ Dynamic Cutout.
* **Decorative Wall Cladding & Wainscoting:**
  * คิ้วผนังลูกฟักสไตล์คลาสสิก (Wainscoting Panels), ไม้ระแนง (Flute Slats), ผนังกรุกระเบื้อง/หินอ่อนซ่อนไฟ (Stone Cladding).
* **Surface Tiling & Borderlines (งานปูกระเบื้องและแนวขอบ):**
  * ปรับจุดเริ่มต้นแนวปู (Tile Grid Origin & Rotation) เพื่อจัดระยะตัดเศษกระเบื้อง (Tile Cuts), งานปูแถบขอบ (Borderline Courses), คิ้วอลูมิเนียม/สเตนเลสเก็บขอบ, สโลปพื้นลดระดับห้องน้ำและโซนเปียก.
* **Interactive Stair & Railing Tool (ระบบบันไดและราวกันตก):**
  * เครื่องมือวางบันไดแบบโต้ตอบบน Plan Canvas (คีย์ลัด `T`): ลากจุดเริ่มและจุดจบ คำนวณลูกนอน (Treads $\ge 22$ ซม.) และลูกตั้ง (Risers $\le 20$ ซม.) ตาม พ.ร.บ. ควบคุมอาคาร อัตโนมัติ.
  * กราฟิกเขียนแบบ 2D มาตรฐาน: เส้นบอกแนวเดิน (Walkline) พร้อมหัวลูกศรทิศทาง UP, ตัวเลขลำดับขั้น, เส้นตัดทแยงมุมแสดงการขึ้นสู่ชั้นบน (Diagonal Cut Line บนแผ่น A-02/A-03).
  * บันไดแม่บันได คสล. / เหล็ก, ชานพัก (Landings), จมูกบันได (Nosing).
  * ราวบันไดปรับแต่งได้: ราวเหล็กดัดอิตาลี (Italian Wrought Iron Balusters), ราวกระจกไร้กรอบ (Frameless Glass), ราวไม้กลึง.

### Domain 4: Interior Millwork & Bespoke Joinery
* **Parametric Cabinetry & Built-in Joinery:**
  * โครงสร้างตู้ (Carcass): ฐานตู้ (Plinth / Toe-kick 80–100 mm), แผงข้าง (End panels 18 mm), แผงหลัง (Back panel 6–9 mm), รางแขวน/ปรับระดับ.
  * องค์ประกอบภายใน: แผ่นชั้นปรับระดับ (Adjustable Shelves), ราวแขวนเสื้อสแตนเลส (Hanging Rods), ลิ้นชัก Soft-close พร้อมความลึกมาตรฐาน.
* **Micro-Zone Material Assignment:**
  * กำหนดวัสดุแยกชิ้นส่วนอย่างแม่นยำ: หน้าบานกระจกใสลอน/บานทึบปิดผิวลามิเนต (Laminate Veneer), ผนังหลังตู้กรุกระจกเงา (Mirror), ท็อปหินควอตซ์/หินสังเคราะห์ (Calacatta Quartz).
* **Concealed LED Lighting Channels (งานไฟซ่อน):**
  * รางอลูมิเนียมโปรไฟล์ไฟซ่อน $45^\circ$ พร้อมฝาครอบอะคริลิกกระจายแสง (Silicone Diffuser).
  * กำหนดตำแหน่งได้ทุกจุด: ซ่อนใต้ตู้ลอย (Under-cabinet), ซ่อนใต้ชั้นวางของ (Under-shelf), ซ่อนขอบบัวเพดาน (Cove lighting), ซ่อนไฟฐานตู้ (Toe-kick glow).
  * ถอดปริมาณความยาวเส้นไฟ LED Strip (เมตร) และคำนวณขนาดหม้อแปลง Driver (Watts) อัตโนมัติ.

### Domain 5: MEP Engineering (Sanitary, Stormwater, Electrical)
* **Sanitary Plumbing (ระบบสุขาภิบาล):**
  * ท่อน้ำดี (Cold Water): ท่อ PVC ฟ้า ชั้น 13.5 หรือท่อ PPR เชื่อมความร้อน.
  * ท่อน้ำเสีย (Waste Pipe): ท่อ PVC เทา/ฟ้า ขนาด 2" เดินสโลป $\ge 1:100$ พร้อม Floor drain ดักกลิ่น (P-Trap).
  * ท่อโสโครก (Soil Pipe): ท่อ PVC เทา/ฟ้า ขนาด 4" เดินสโลป $\ge 1:50$ ตรงสู่ถังบำบัด.
  * ท่ออากาศ (Vent Pipe): ท่อระบายอากาศขนาด 1.5"–2" (Stack vent / Loop vent) ป้องกันการสูญเสียดักน้ำใน P-Trap.
* **Stormwater & Rain Drainage (ระบบระบายน้ำฝน):**
  * รางน้ำฝนชายคา (Gutters), ท่อระบายน้ำฝนดิ่ง (Rainwater Downspouts), ถังเก็บน้ำฝน, ระบบระบายน้ำผิวดิน (Surface swale & trench drain).
* **External Underground Network & Auto-Slope Solver:**
  * ถังบำบัดน้ำเสียสำเร็จรูป (Septic Tank DOS/Sanko) คำนวณขนาดลิตรตามจำนวนผู้ใช้อาคาร (PE - Person Equivalent).
  * ถังดักไขมัน (Grease Trap) สำหรับพื้นที่ครัว.
  * บ่อพักคอนกรีตสำเร็จรูป (Precast Concrete Manholes): ขนาด $30\times 40$, $40\times 50$, $60\times 80$ ซม. พร้อมฝาคอนกรีต/เหล็กหล่อ.
  * Gravity Drainage Auto-Slope Solver (`solveGravityInverts`): คำนวณระดับความลึกก้นท่อ Invert Elevation (IL) อัตโนมัติตามสโลป 1:100 และเชื่อมโยงส่งต่อระดับความลึกไปยังบ่อพักระบายน้ำแต่ละจุดอย่างแม่นยำ.
* **Water Supply, Storage & Pump Bypass System:**
  * มิเตอร์น้ำประปา, ถังเก็บน้ำบนดิน/ใต้ดิน (Water Storage Tank).
  * ปั๊มน้ำอัตโนมัติ (Booster Pump) พร้อมระบบท่อ 3-Valve Bypass (วาล์ว Bypass เมนตรง, วาล์วหน้าปั๊ม, วาล์วหลังปั๊ม และ Check Valve กันน้ำย้อน).
* **Bathroom Detail Expansion (แบบขยายห้องน้ำสร้างใหม่):**
  * ความลาดชันพื้น (Slope 1:50 ไปยัง Floor drain), คานลดระดับพื้น (Drop slab 5–10 ซม.), แนวบล็อกกั้นโซนเปียก-แห้ง (Shower curb drop 3–5 ซม.).
  * รายละเอียดตัดกระเบื้องพื้น-ผนัง, แนวทาน้ำยากันซึม (Waterproofing membrane) สูงขึ้นผนัง $\ge 30$ ซม. (โซนเปียกสูง $\ge 180$ ซม.).
  * ระยะติดตั้งสุขภัณฑ์ (Rough-in Dimensions): โถสุขภัณฑ์ (Center 305 mm จากผนัง), อ่างล้างหน้า, ฝักบัว.
* **Electrical & Lighting Systems (มาตรฐาน วสท. / EIT):**
  * ดวงโคม, สวิตช์ไฟ 1 ทาง / 2 ทาง (สลับบันได) / 3 ทาง, เต้ารับไฟฟ้าพร้อมสายดิน (Grounding).
  * ตู้ควบคุมไฟฟ้า (Consumer Unit / MDB), วงจรย่อย (Sub-circuits), ท่อร้อยสายไฟ (EMT / PVC).
  * Electrical Phase Balancing (`balanceCircuitsPhase`): คำนวณกระจายโหลดไฟฟ้า 3 เฟส (Phase A, B, C) ตรวจสอบความไม่สมดุลของเฟส (Phase Unbalance $\le 15\%$) ตามมาตรฐาน วสท.
  * Breaker & Wire Sizing (`recommendEITBreakerAndWire`): แนะนำขนาดเซอร์กิตเบรกเกอร์ (AT/AF) และขนาดสายทองแดง THW / IEC01 ($mm^2$) ตามพิกัดกระแสปลอดภัย.
  * กำหนดระดับความสูงติดตั้งมาตรฐาน (Mounting Elevations): สวิตช์ +1.20 ม., เต้ารับทั่วไป +0.30 ม., เต้ารับเคาน์เตอร์ครัว +1.10 ม.

### Domain 6: Multi-Sheet LayOut Engine & 20-Sheet Permit Package
ConstructFlow compiles vector drawings directly into a standardized 20-Sheet A3 Drawing Package (ชุดแบบขออนุญาตก่อสร้าง อ.1 และแบบก่อสร้างจริง):

```
+-----------------------------------------------------------------------------------+
|                        CONSTRUCTFLOW 20-SHEET MASTER INDEX                        |
+--------+-------------------------------------------------------------+------------+
| Sheet  | Sheet Name & Contents                                       | Scale      |
+--------+-------------------------------------------------------------+------------+
| A-01   | Cover Sheet, Title Deed, Site Plan, Legal Setbacks & OSR/FAR| 1:200/1:500|
| A-02   | Phased Floor Plan - Ground Level (Existing/Demo/New Overlay)| 1:100      |
| A-03   | Phased Floor Plan - Upper Levels & Mezzanine                | 1:100      |
| A-04   | Roof Plan, Pitch Slopes, Drainage & Gutters                 | 1:100      |
| A-05   | Building Elevations 1 & 2 (North / East)                    | 1:100      |
| A-06   | Building Elevations 3 & 4 (South / West)                    | 1:100      |
| A-07   | Longitudinal & Transverse Building Sections (Section A & B) | 1:100      |
| A-08   | Door & Window Schedule & Elevation Types (D1-D3, W1-W3)     | 1:50       |
| A-09   | Detailed Bathroom Plan & Section Callouts (Drop & Slope)    | 1:25 / 1:20|
| A-10   | Architectural Finishes, Ceiling Plans & Continuous Moldings | 1:100/1:50 |
| S-01   | Foundation & Column Grid Plan (Spread & Micro-piles)        | 1:100      |
| S-02   | Ground Floor Beam & Structural Slab Framing Plan            | 1:100      |
| S-03   | Upper Floor Beam & Structural Slab Framing Plan             | 1:100      |
| S-04   | Roof Framing Plan (Steel Truss / Purlins / Chemical Dowels) | 1:100      |
| S-05   | Structural Schedule: Column, Footing & Retaining Details    | 1:25 / 1:20|
| S-06   | Structural Schedule: RC Beam Sections & Rebar Schedule (BBS)| 1:25 / 1:20|
| M-01   | Water Supply & Pump Bypass Isometric Diagram                | 1:100/NTS  |
| M-02   | Drainage, Waste, Soil & Vent Pipe Layout & Manhole Slopes   | 1:100      |
| E-01   | Lighting & Switching Circuit Layout                         | 1:100      |
| E-02   | Power Receptacle Layout, Single Line Diagram & Consumer Unit| 1:100/NTS  |
+--------+-------------------------------------------------------------+------------+
```

---

## 6. Coding & Architectural Guidelines for AI Agents

All coding agents working on ConstructFlow must strictly adhere to the following contracts:

### 1. CQRS Command Mutator Pattern
* **No Direct State Hacks:** Never mutate project objects directly in UI event listeners. All modifications must dispatch a typed command defined in `packages/command-schema`.
* **Atomic Transactions & Rollback:** Every command execution must support full undo and redo. If a downstream validation fails, the entire transaction rolls back cleanly.

```typescript
// Correct: Dispatching through the Command Bus
dispatchCommand({
  type: 'project.beam.create',
  payload: {
    mark: 'B1',
    start_point_mm: [0, 0, 3000],
    end_point_mm: [4000, 0, 3000],
    type_id: 'b1-type-uuid',
    created_phase: 'new_construction',
    level_id: 'level-1-uuid'
  }
});
```

### 2. Strict Type Safety & Dual-Layer Unit System (Meter-First Standard)
ConstructFlow uses a deliberate **Dual-Layer Unit Architecture** designed for professional architectural & engineering practice:

```
+-----------------------------------------------------------------------------------+
|               PRESENTATION & WORKING LAYER (USER UI & DRAWINGS)                   |
|  - Primary Working Unit: Meters (m)                                              |
|  - Architectural Dimensions & Spans: 2 decimal places (e.g., 4.00 m, 3.50 m)     |
|  - Site Survey, Datum Levels & Invert Elevations: 3 decimal places                |
|    (e.g., +0.000 m, +1.200 m, IL -0.850 m, X: 4.250 m, Y: 8.000 m)              |
|  - Smart Input: Typing "4", "4.0", "4.00", or "4.25" interprets directly as METERS |
+-----------------------------------------------------------------------------------+
                                         │  (Seamless UI Conversion)
                                         ▼
+-----------------------------------------------------------------------------------+
|               CANONICAL DATA & STORAGE LAYER (SSOT DOMAIN TIER)                   |
|  - Storage Standard: Integers / Numbers in Millimeters (mm)                        |
|  - Prevents floating-point precision drift across geometry and clash operations    |
|  - Native compatibility with DXF/DWG ($INSUNITS=4), IFC 4.3, and SketchUp Ruby API|
+-----------------------------------------------------------------------------------+
```

* **Working Unit (Meters / เมตร):** All user-facing dialogues, canvas dimension labels, status bars, coordinate inspectors, and permit sheet annotations default to **Meters (`m`) with 2 or 3 decimal places**.
* **Canonical Storage (Millimeters / มม.):** All internal coordinates, property values in `packages/project-model/src/types.ts`, and CQRS command payloads store exact numbers in **`mm`** to eliminate floating-point rounding errors.
* **Smart Input Parsing:** Any length/offset input field in the UI accepts values in meters by default (e.g. `4.5` $\rightarrow 4,500$ mm). If a user enters an explicit suffix like `200mm` or `20cm`, the parser converts it correctly.
* **Angle Standard:** All rotations and slopes are in **degrees (`deg`)**, or standard Thai drainage slopes (`1:50`, `1:100`).
* **TypeScript Strictness:** No `any` types in public module contracts. Define comprehensive interfaces in `packages/project-model/src/types.ts`.

### 3. Non-Destructive Downstream Adapter Rule
* When syncing with SketchUp, AutoCAD, or Revit, **match existing entities via their persistent UUID**.
* Update entity transform and attributes non-destructively; do not delete and recreate entities indiscriminately, which would destroy user layers, materials, or downstream viewport links.

### 4. Deterministic Calculations
* Never delegate mathematical calculations (e.g. slope drops, rebar lengths, takeoff areas) to generative AI guesses.
* Calculations must be executed by pure TypeScript functions with unit test coverage.

---

## 7. Deep Specification of Downstream Exporters & Sync Adapters

ConstructFlow maintains dedicated adapters to ensure flawless bi-directional synchronization with industry-standard CAD, BIM, and LayOut ecosystems:

```
                                  +---------------------------------------+
                                  |   ConstructFlow SSOT Project Model    |
                                  |   (UUIDs, Phases, Types, Catalogs)    |
                                  +---------------------------------------+
                                                      |
         +--------------------+-----------------------+-----------------------+--------------------+
         |                    |                       |                       |                    |
         v                    v                       v                       v                    v
+------------------+ +------------------+   +-------------------+   +--------------------+ +-----------------+
| Adapter 1:       | | Adapter 2:       |   | Adapter 3:        |   | Adapter 4:         | | Adapter 5:      |
| SketchUp &       | | AutoCAD DWG/DXF  |   | OpenBIM IFC 4.3 & |   | Native Vector PDF  | | AI MCP Server   |
| Native LayOut    | | 20-Layout Paper  |   | Revit PyRevit     |   | & SVG LayOut Set   | | Orchestrator    |
| (apps/sketchup-  | | (packages/cad-   |   | (packages/bim-    |   | (packages/sheet-   | | (apps/mcp-      |
|  extension)      | |  adapter)        |   |  adapter)         |   |  engine)           | |  server)        |
+------------------+ +------------------+   +-------------------+   +--------------------+ +-----------------+
```

### 7.1 Adapter 1: SketchUp Live Bridge & Native LayOut Adapter (`apps/sketchup-extension`)
* **Primary Role:** Seamless 3D viewing, client presentation, photorealistic rendering (V-Ray, Enscape, D5 Render), and LayOut drafting synchronization.
* **Bi-Directional IPC Communication:**
  * Local WebSocket Server / JSON File Bridge (`Core::PlanEditorSync`, `Core::Host::*`).
  * 1-Click Sync or Auto-Sync on Save without interrupting user workflow.
* **Non-Destructive Entity Matching & Diff Engine:**
  * Every entity is stamped with an RFC-4122 UUID: `entity.set_attribute("constructflow", "uuid", uuid)`.
  * **Differential Sync Algorithm:**
    1. **Unchanged Entities:** If geometry hash and transform are unchanged, skip modification completely. This preserves user-assigned custom materials, photorealistic render tags, and nested custom objects.
    2. **Modified Entities:** If position, dimensions, or cross-sections change, update the existing `Sketchup::ComponentInstance` transform or replace its definition in-place. Never drop and recreate the entity.
    3. **New Entities:** Instantiate new `ComponentInstance` and tag with persistent UUID.
    4. **Deleted Entities:** Selectively erase removed entities without clearing the entire model (`entities.clear` is strictly prohibited).
* **Automated Scene Tabs & Orthographic Views:**
  * Automatically creates standard Scene tabs matching drawing sheets:
    * `Plan_L1_Ground` (Cut at +1.20m, Parallel Projection, Two-Point Perspective)
    * `Plan_L2_Upper` (Cut at +4.70m)
    * `Plan_Roof` (Top view)
    * `Elevation_North`, `Elevation_East`, `Elevation_South`, `Elevation_West`
    * `Section_A_Longitudinal`, `Section_B_Transverse`
    * `Structure_Foundation`, `Structure_Framing`
  * Active `Sketchup::SectionPlane` placed at standard cut heights with `SectionCutFilled = true` and `DisplaySectionPlanes = false`.
* **Hierarchical Tag Taxonomy & Phase Color-By-Tag:**
  * Tags organized strictly by domain and phase:
    * `CF_Structure::Columns`, `CF_Structure::Beams`, `CF_Structure::Footings`, `CF_Structure::Slabs`
    * `CF_Arch::Walls_Existing`, `CF_Arch::Walls_Demolition`, `CF_Arch::Walls_New`
    * `CF_Arch::Doors`, `CF_Arch::Windows`, `CF_Arch::Roof`, `CF_Arch::Moldings`
    * `CF_MEP::Plumbing_ColdWater`, `CF_MEP::Plumbing_Soil`, `CF_MEP::Plumbing_Waste`, `CF_MEP::Drainage_Manholes`
    * `CF_Interior::Builtin_Carcass`, `CF_Interior::Builtin_Doors`, `CF_Interior::LED_Lighting`
* **Dynamic Wall Openings & Infill Assemblies:**
  * Real-time boolean cutouts on hosted walls for doors and windows with parametric casing and frame infills.
* **Native LayOut Bridge (`Layout::*` Ruby API):**
  * Consumes `constructflow.layout_export_plan.v1` and maps into native `Layout::Document`.
  * Configures A3 Paper size ($420\times 297$ mm converted to inches via `mm / 25.4`).
  * Binds exact named scenes from `.skp` file.
  * Sets Vector Render mode (`Layout::SketchUpModel::VECTOR_RENDER`) and orthographic scale (`1:100` $\rightarrow 0.01$, `1:50` $\rightarrow 0.02$).
* **Cross-Platform Extension Packaging (`output/constructflow.rbz`):**
  * Automated builder script `npm run package:sketchup` (via `scripts/package_sketchup_rbz.mjs`).
  * Bundles all extension files directly into an installable `.rbz` distribution package without requiring bash or system-level zip utilities.

---

### 7.2 Adapter 2: Native AutoCAD DWG / DXF Exporter & PaperSpace Engine (`packages/cad-adapter`)
* **Primary Role:** Self-contained, pure TypeScript vector CAD generator exporting full DWG/DXF sets without requiring AutoCAD to be installed.
* **ModelSpace Coordinate Architecture (1:1 mm):**
  * World Coordinate System (WCS) strictly in millimetres (`$LUNITS = 2`, `$INSUNITS = 4`).
  * Layer separation matching Thai & International CAD Standards (AIA / วสท.):
    * Structure: `S-COL`, `S-BEAM`, `S-FND`, `S-SLAB`, `S-REBAR`
    * Architecture: `A-WALL-EXIST`, `A-WALL-DEMO`, `A-WALL-NEW`, `A-DOOR`, `A-WIND`, `A-ROOF`, `A-MOLD`
    * MEP: `M-PLUMB-COLD`, `M-PLUMB-SOIL`, `M-PLUMB-WASTE`, `M-DRAIN-MANHOLE`
    * Electrical: `E-LIGHT`, `E-POWER`, `E-SWITCH-CIRCUIT`
  * Standard AutoCAD Color Index (ACI) and lineweights:
    * **Existing:** Color 8 / 250 (Gray, 0.25mm lineweight)
    * **Demolition:** Color 10 (Red, Linetype `DASHED2`, 0.35mm lineweight)
    * **New Construction:** Color 7 (White/Black, 0.50mm lineweight) / Color 4 (Cyan, 0.35mm lineweight)
* **20 PaperSpace Layout Tabs (`A-01` to `E-02`):**
  * Generates 20 distinct PaperSpace Layouts in a single DXF/DWG file matching the 20-Sheet Master Index.
  * Embeds A3 Title Block block reference (`INSERT`) with parameterized attributes (Project Title, Sheet No, Date, Revision, Architect/Engineer seals).
  * Floating Viewport Entities (`VIEWPORT`):
    * Configured with exact architectural scales (`CustomScale = 0.01` for 1:100, `0.02` for 1:50, `0.04` for 1:25).
    * **Viewport Layer Freeze (`VPLAYER`):** Each sheet independently freezes unneeded layers (e.g. Structural sheets freeze Arch/MEP layers; MEP sheets freeze structural rebar layers).
* **Native `ACAD_TABLE` Generation:**
  * Generates genuine `ACAD_TABLE` entities for:
    * Door & Window Schedules
    * Structural Column & Beam Schedules
    * Bar Bending Schedules (BBS)
    * Electrical Panel Load Schedules
  * Zero exploded text/lines — tables remain editable spreadsheets directly inside AutoCAD.
* **AutoLISP & Batch Command Scripts:**
  * Generates automated batch plot scripts (`.scr`) for 1-click PDF publishing in AutoCAD.
  * Supports real-time command streaming via `autocadmcp` or AutoCAD COM API.

---

### 7.3 Adapter 3: OpenBIM IFC 4.3 & Revit Direct Bridge (`packages/bim-adapter`)
* **Primary Role:** Enterprise OpenBIM data exchange with Autodesk Revit, ArchiCAD, Navisworks, and Solibri.
* **ISO 16739-1:2024 (IFC 4.3 ADD2) Serializer:**
  * Pure TypeScript STEP file serializer generating certified OpenBIM IFC models.
* **Smart Object to IFC Entity Class Mapping:**
  * Columns $\rightarrow$ `IfcColumn` (PredefinedType: `COLUMN`)
  * Beams & Drop Beams $\rightarrow$ `IfcBeam` (PredefinedType: `BEAM`, `JOIST`)
  * Footings & Micro-piles $\rightarrow$ `IfcFooting` (PredefinedType: `PAD_FOOTING`, `PILE_CAP`)
  * Structural Slabs $\rightarrow$ `IfcSlab` (PredefinedType: `FLOOR`, `BASESLAB`, `ROOF`)
  * Walls $\rightarrow$ `IfcWall` (PredefinedType: `SOLIDWALL`, `STANDARD`)
  * Doors & Windows $\rightarrow$ `IfcDoor`, `IfcWindow` hosted in `IfcOpeningElement`
  * MEP Pipes & Fittings $\rightarrow$ `IfcPipeSegment`, `IfcPipeFitting`
  * Rebars & Stirrups $\rightarrow$ `IfcReinforcingBar`
  * Millwork & Built-in Joinery $\rightarrow$ `IfcFurnishingElement`
* **Universal Renovation Property Set (`Pset_ConstructionPhase`):**
  * Every element carries `Pset_ConstructionPhase.PhaseCreated` = `Existing` | `Demolition` | `New_Construction`, enabling instant Revit Phase Filters and Graphic Overrides.
* **Spatial Hierarchy:**
  * `IfcProject` $\rightarrow$ `IfcSite` (WGS84 GPS coordinates, Deed polygon boundary) $\rightarrow$ `IfcBuilding` $\rightarrow$ `IfcBuildingStorey` (Datum levels) $\rightarrow$ Hosted Spatial Elements.
* **Revit Direct Intermediary Bridge:**
  * Exports JSON payloads consumed by PyRevit / Dynamo to instantiate native Autodesk Revit System Families (Walls, Floors, Roofs) and Loadable Families without IFC translation distortion.

---

### 7.4 Adapter 4: Native Vector PDF & SVG Sheet Compiler (`packages/sheet-engine`)
* **Primary Role:** Autonomous, 1-click A3 PDF publishing directly from ConstructFlow without external CAD software.
* **Thai Municipality Permit Compliance (อบต. / เทศบาล / กทม.):**
  * High-resolution vector compiler (300+ DPI vector line rendering on A3 $420\times 297$ mm).
  * Embedded Thai Standard Fonts (`Sarabun`, `Prompt`, `Cordia New`) with full Unicode glyph support.
  * Solves Thai vowel and tone mark positioning (สระและวรรณยุกต์ ไม่จม ไม่ลอย) for official legal submission.
* **Vector Hatching & Annotation Engine:**
  * Vector material hatch patterns (Concrete, Brick, Earth, Water, Insulation).
  * Auto-dimension strings, level datum marks, section callouts, and revision clouds.

---

### 7.5 Adapter 5: AI Orchestration & MCP Server Adapter (`apps/mcp-server`)
* **Primary Role:** Exposes ConstructFlow BIM engine capabilities to autonomous AI agents via the Model Context Protocol (MCP).
* **BIM Tool Suite:**
  * `cf_query_model`: Query smart objects by phase, level, discipline, or bounding box.
  * `cf_mutate_geometry`: Execute typed CQRS commands (create/edit beams, walls, doors, pipes).
  * `cf_validate_compliance`: Validate Thai Building Code (กฎกระทรวงฉบับที่ 55) and Bangkok zoning setbacks.
  * `cf_run_clash`: Run spatial clash detection between structural framing and MEP gravity pipes.
  * `cf_export_sheets`: Trigger 20-sheet batch PDF compilation.
  * `cf_sync_sketchup`: Push live updates to SketchUp Ruby bridge.
  * `cf_export_dxf`: Export AutoCAD DWG/DXF with 20 PaperSpace layouts.
* **Dual Execution Surface:** Ensures AI agents interact with the model via the exact same Command Bus contracts and transaction rollbacks as human users.

---

## 8. Development Roadmap & Implementation Sequence

Agents must execute tasks according to the following phased roadmap:

```
[Phase 1] Type Catalog & Phasing Foundation
   ├── BeamCatalogModal & SlabCatalogModal in apps/plan-editor
   ├── Global Cascading Update listener on Type changes
   └── Phase-aware Canvas 2D rendering (Existing / Demolition / New)

[Phase 2] Structural Detailing & Rebar Schedules
   ├── Rebar configuration models (Top/Bottom bars, Stirrup spacing)
   ├── Automatic Bar Bending Schedule (BBS) generator
   └── Drop beam offsets for wet areas & balconies

[Phase 3] Architectural Envelope & Interior Sweeps
   ├── Revit-style Roof Footprint polygon editor & hip/gable solver
   ├── 3D Continuous Sweep Miter engine (Skirting, Cornice, Architrave)
   └── Wainscoting & decorative wall panel builder

[Phase 4] MEP Systems & Site Civil Networks
   ├── Sanitary pipe slope & invert level (IL) solver
   ├── Precast manhole network & fall calculator (30x40 to 60x80)
   ├── 3-Valve Water Tank & Pump Bypass diagram
   └── Detailed Bathroom Plan & Section generator (1:25)

[Phase 5] Interior Millwork & Built-in Joinery
   ├── Parametric Cabinetry carcass & division builder
   ├── Micro-zone material assignment (Glass, Laminate, Quartz)
   └── Concealed LED profile placement & wattage calculation

[Phase 6] Multi-Page Sheet & Permit Set Engine
   ├── Vector LayOut compiler & 20-Sheet Master Index
   ├── Dynamic Viewport crop & scale controllers (1:100, 1:50, 1:25)
   └── Auto-dimensioning strings, level markers & title blocks

[Phase 7] Comprehensive Downstream Adapters Suite
   ├── 7.1 SketchUp Live Bridge: Non-destructive UUID sync & automated Scene/Section tabs
   ├── 7.2 Native LayOut Adapter: Viewport binding, scale translation & vector render
   ├── 7.3 AutoCAD DXF/DWG Exporter: ModelSpace 1:1, 20 PaperSpace Layouts & ACAD_TABLE
   ├── 7.4 OpenBIM IFC 4.3 & Revit Bridge: ISO 16739-1 serializer & PyRevit JSON bridge
   └── 7.5 Model Context Protocol (MCP) Server: Expose BIM tools for autonomous AI agents
```

---

## 9. Completion & Verification Protocol

When handing off an implementation step, the agent must provide:
1. **Summary of Changed Files:** Exact file paths created or modified.
2. **Contract Compliance:** Confirmation that `types.ts`, `command-schema`, and universal phasing rules were respected.
3. **Verification Command & Output:** Clean execution of `npm run build` or automated test suites.
4. **Next Immediate Step:** The next logical roadmap milestone ready for execution.
