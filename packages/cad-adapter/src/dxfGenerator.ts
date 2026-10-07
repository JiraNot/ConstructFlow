// ConstructFlow Native DXF Engine (AutoCAD R2018 / AC1032)
// Standalone pure TypeScript implementation supporting ModelSpace (1:1 mm)
// and 20 PaperSpace Layouts (A-01 to E-02) with Viewports and ACAD_TABLEs.

import type { ProjectDocument, SmartObject } from "@constructflow/project-model";
import { CAD_STANDARD_LAYERS, resolveCadLayer } from "./layerStandards.js";
import {
  formatAcadTableDxf,
  formatTableLinesFallbackDxf,
  type CadTableData,
} from "./tableEntity.js";

export interface DxfGeneratorOptions {
  projectName?: string;
  architectName?: string;
  engineerLicense?: string;
  issueDate?: string;
  revision?: string;
  includeTables?: boolean;
}

export const LAYOUT_DEFS = [
  { id: "A-01", name: "A-01_Site_Plan", title: "ผังบริเวณ / Site & Project Information", scale: 200, discipline: "A" },
  { id: "A-02", name: "A-02_Ground_Plan", title: "แปลนชั้นล่าง / Phased Ground Plan", scale: 100, discipline: "A" },
  { id: "A-03", name: "A-03_Upper_Plan", title: "แปลนชั้นบน / Upper Level Plan", scale: 100, discipline: "A" },
  { id: "A-04", name: "A-04_Roof_Plan", title: "แปลนหลังคา / Roof & Drainage Plan", scale: 100, discipline: "A" },
  { id: "A-05", name: "A-05_Elevations_NE", title: "รูปด้านเหนือและตะวันออก / North & East", scale: 100, discipline: "A" },
  { id: "A-06", name: "A-06_Elevations_SW", title: "รูปด้านใต้และตะวันตก / South & West", scale: 100, discipline: "A" },
  { id: "A-07", name: "A-07_Sections", title: "รูปตัด A และ B / Building Sections", scale: 100, discipline: "A" },
  { id: "A-08", name: "A-08_Door_Window_Schedule", title: "รายการประตูหน้าต่าง / Opening Schedule", scale: 50, discipline: "A" },
  { id: "A-09", name: "A-09_Bathroom_Details", title: "แบบขยายห้องน้ำ / Bathroom Details", scale: 25, discipline: "A" },
  { id: "A-10", name: "A-10_Finishes_Joinery", title: "วัสดุและฝ้าเพดาน / Finishes & Joinery", scale: 50, discipline: "A" },
  { id: "S-01", name: "S-01_Foundations", title: "ผังฐานราก / Foundations & Columns", scale: 100, discipline: "S" },
  { id: "S-02", name: "S-02_Ground_Framing", title: "ผังคานพื้นชั้นล่าง / Ground Framing", scale: 100, discipline: "S" },
  { id: "S-03", name: "S-03_Upper_Framing", title: "ผังคานพื้นชั้นบน / Upper Framing", scale: 100, discipline: "S" },
  { id: "S-04", name: "S-04_Roof_Framing", title: "โครงหลังคา / Roof Framing", scale: 100, discipline: "S" },
  { id: "S-05", name: "S-05_Column_Schedule", title: "รายการเสาและฐานราก / Structural Schedule", scale: 25, discipline: "S" },
  { id: "S-06", name: "S-06_Beam_BBS", title: "รายการคานและเหล็กเสริม / Beam & BBS", scale: 25, discipline: "S" },
  { id: "M-01", name: "M-01_Water_Supply", title: "น้ำดีและปั๊ม / Supply & Pump Bypass", scale: 100, discipline: "M" },
  { id: "M-02", name: "M-02_Drainage", title: "สุขาภิบาล / Drainage & Invert Levels", scale: 100, discipline: "M" },
  { id: "E-01", name: "E-01_Lighting", title: "แสงสว่าง / Lighting & Switching", scale: 100, discipline: "E" },
  { id: "E-02", name: "E-02_Power_Panel", title: "กำลังไฟฟ้า / Power & Panel Schedule", scale: 100, discipline: "E" },
] as const;

export class DxfGenerator {
  private handleCounter: number = 0x100;
  private project: ProjectDocument;
  private options: DxfGeneratorOptions;

  constructor(project: ProjectDocument, options: DxfGeneratorOptions = {}) {
    this.project = project;
    this.options = options;
  }

  private nextHandle(): string {
    return (this.handleCounter++).toString(16).toUpperCase();
  }

  /**
   * Generates complete DXF document text.
   */
  public generate(): string {
    const parts: string[] = [];

    // 1. HEADER SECTION
    parts.push(this.generateHeaderSection());

    // 2. CLASSES SECTION
    parts.push(this.generateClassesSection());

    // 3. TABLES SECTION (LTypes, Layers, Styles, Views, UCS, AppID, BlockRecords)
    parts.push(this.generateTablesSection());

    // 4. BLOCKS SECTION (*MODEL_SPACE, *PAPER_SPACE, and 20 Layout block definitions)
    parts.push(this.generateBlocksSection());

    // 5. ENTITIES SECTION (ModelSpace real-world geometry & PaperSpace viewports/titles)
    parts.push(this.generateEntitiesSection());

    // 6. OBJECTS SECTION (Layout dictionaries, PlotSettings)
    parts.push(this.generateObjectsSection());

    // EOF
    parts.push("  0\nEOF\n");

    return parts.join("");
  }

  /**
   * Generates batch publish script (SCR) for plotting all 20 layouts to A3 PDF.
   */
  public generateBatchPublishScript(): string {
    const lines: string[] = [
      "; ConstructFlow Batch Publish Script for AutoCAD",
      "; Automatically plots all 20 PaperSpace layouts to A3 PDF",
      "-PLOT",
      "No", // Detailed plot configuration? No
    ];

    for (const layout of LAYOUT_DEFS) {
      lines.push(
        `-LAYOUT Set ${layout.name}`,
        `-PLOT`,
        `Yes`, // Detailed configuration
        `${layout.name}`,
        `DWG To PDF.pc3`,
        `ISO_full_bleed_A3_(420.00_x_297.00_MM)`,
        `Millimeters`,
        `Landscape`,
        `No`, // Plot upside down? No
        `Layout`, // Plot area
        `1:1`, // Plot scale
        `0.00,0.00`, // Plot offset
        `Yes`, // Plot with plot styles? Yes
        `acad.ctb`, // Plot style table
        `Yes`, // Plot with lineweights? Yes
        `No`, // Scale lineweights? No
        `No`, // Plot paper space first? No
        `No`, // Hide paper space objects? No
        `./pdf/${layout.id}_${layout.name}.pdf`,
        `No`, // Save changes to page setup? No
        `Yes`, // Proceed with plot? Yes
      );
    }

    lines.push("; Done plotting 20 sheets", "QUIT\n");
    return lines.join("\n");
  }

  private generateHeaderSection(): string {
    return [
      "  0",
      "SECTION",
      "  2",
      "HEADER",
      "  9",
      "$ACADVER",
      "  1",
      "AC1032", // AutoCAD 2018
      "  9",
      "$INSBASE",
      " 10",
      "0.0",
      " 20",
      "0.0",
      " 30",
      "0.0",
      "  9",
      "$EXTMIN",
      " 10",
      "-10000.0",
      " 20",
      "-10000.0",
      " 30",
      "0.0",
      "  9",
      "$EXTMAX",
      " 10",
      "50000.0",
      " 20",
      "50000.0",
      " 30",
      "10000.0",
      "  9",
      "$LUNITS",
      " 70",
      "2", // Decimal
      "  9",
      "$LUPREC",
      " 70",
      "3", // 3 decimal places
      "  9",
      "$INSUNITS",
      " 70",
      "4", // Millimeters (1:1 real world)
      "  9",
      "$MEASUREMENT",
      " 70",
      "1", // Metric
      "  0",
      "ENDSEC\n",
    ].join("\n");
  }

  private generateClassesSection(): string {
    return [
      "  0",
      "SECTION",
      "  2",
      "CLASSES",
      "  0",
      "CLASS",
      "  1",
      "TABLE",
      "  2",
      "AcDbTable",
      "  3",
      "ObjectDBX Classes",
      " 90",
      "1025",
      " 91",
      "0",
      "280",
      "0",
      "281",
      "0",
      "  0",
      "ENDSEC\n",
    ].join("\n");
  }

  private generateTablesSection(): string {
    const lines: string[] = ["  0", "SECTION", "  2", "TABLES"];

    // 1. VPORT
    lines.push(
      "  0",
      "TABLE",
      "  2",
      "VPORT",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbSymbolTable",
      " 70",
      "1",
      "  0",
      "VPORT",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbSymbolTableRecord",
      "100",
      "AcDbViewportTableRecord",
      "  2",
      "*ACTIVE",
      " 70",
      "0",
      " 10",
      "0.0",
      " 20",
      "0.0",
      " 11",
      "1.0",
      " 21",
      "1.0",
      " 12",
      "2000.0", // Center X
      " 22",
      "2000.0", // Center Y
      " 40",
      "8000.0", // View height
      " 41",
      "1.5", // Aspect ratio
      "  0",
      "ENDTAB",
    );

    // 2. LTYPE (Linetypes)
    const ltypes = [
      { name: "CONTINUOUS", desc: "Solid line", elements: [] },
      { name: "DASHED", desc: "Dashed __ __ __", elements: [12.7, -6.35] },
      { name: "DASHED2", desc: "Dashed (half) _ _ _", elements: [6.35, -3.175] },
      { name: "CENTER", desc: "Centerline ____ _ ____", elements: [31.75, -6.35, 6.35, -6.35] },
    ];
    lines.push(
      "  0",
      "TABLE",
      "  2",
      "LTYPE",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbSymbolTable",
      " 70",
      ltypes.length.toString(),
    );
    for (const lt of ltypes) {
      lines.push(
        "  0",
        "LTYPE",
        "  5",
        this.nextHandle(),
        "100",
        "AcDbSymbolTableRecord",
        "100",
        "AcDbLinetypeTableRecord",
        "  2",
        lt.name,
        " 70",
        "0",
        "  3",
        lt.desc,
        " 72",
        "65",
        " 73",
        lt.elements.length.toString(),
        " 40",
        (lt.elements.reduce((sum, v) => sum + Math.abs(v), 0)).toFixed(3),
      );
      for (const el of lt.elements) {
        lines.push(" 49", el.toFixed(3), " 74", "0");
      }
    }
    lines.push("  0", "ENDTAB");

    // 3. LAYER
    const layerEntries = Object.values(CAD_STANDARD_LAYERS);
    lines.push(
      "  0",
      "TABLE",
      "  2",
      "LAYER",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbSymbolTable",
      " 70",
      (layerEntries.length + 1).toString(),
      // Standard Layer 0
      "  0",
      "LAYER",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbSymbolTableRecord",
      "100",
      "AcDbLayerTableRecord",
      "  2",
      "0",
      " 70",
      "0",
      " 62",
      "7",
      "  6",
      "CONTINUOUS",
      "370",
      "-3",
    );
    for (const lyr of layerEntries) {
      lines.push(
        "  0",
        "LAYER",
        "  5",
        this.nextHandle(),
        "100",
        "AcDbSymbolTableRecord",
        "100",
        "AcDbLayerTableRecord",
        "  2",
        lyr.name,
        " 70",
        "0",
        " 62",
        lyr.colorNumber.toString(),
        "  6",
        lyr.lineType,
        "370",
        lyr.lineWeightHundredthsMm.toString(),
      );
    }
    lines.push("  0", "ENDTAB");

    // 4. STYLE
    lines.push(
      "  0",
      "TABLE",
      "  2",
      "STYLE",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbSymbolTable",
      " 70",
      "1",
      "  0",
      "STYLE",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbSymbolTableRecord",
      "100",
      "AcDbTextStyleTableRecord",
      "  2",
      "STANDARD",
      " 70",
      "0",
      " 40",
      "0.0",
      " 41",
      "1.0",
      " 50",
      "0.0",
      " 71",
      "0",
      " 42",
      "2.5",
      "  3",
      "txt",
      "  4",
      "",
      "  0",
      "ENDTAB",
    );

    // 5. VIEW
    lines.push(
      "  0",
      "TABLE",
      "  2",
      "VIEW",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbSymbolTable",
      " 70",
      "0",
      "  0",
      "ENDTAB",
    );

    // 6. UCS
    lines.push(
      "  0",
      "TABLE",
      "  2",
      "UCS",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbSymbolTable",
      " 70",
      "0",
      "  0",
      "ENDTAB",
    );

    // 7. APPID
    lines.push(
      "  0",
      "TABLE",
      "  2",
      "APPID",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbSymbolTable",
      " 70",
      "2",
      "  0",
      "APPID",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbSymbolTableRecord",
      "100",
      "AcDbRegAppTableRecord",
      "  2",
      "ACAD",
      " 70",
      "0",
      "  0",
      "APPID",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbSymbolTableRecord",
      "100",
      "AcDbRegAppTableRecord",
      "  2",
      "CONSTRUCTFLOW",
      " 70",
      "0",
      "  0",
      "ENDTAB",
    );

    // 8. BLOCK_RECORD
    // Needs *MODEL_SPACE, *PAPER_SPACE, and layout block records
    lines.push(
      "  0",
      "TABLE",
      "  2",
      "BLOCK_RECORD",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbSymbolTable",
      " 70",
      (2 + LAYOUT_DEFS.length).toString(),
      "  0",
      "BLOCK_RECORD",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbSymbolTableRecord",
      "100",
      "AcDbBlockTableRecord",
      "  2",
      "*MODEL_SPACE",
      "  0",
      "BLOCK_RECORD",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbSymbolTableRecord",
      "100",
      "AcDbBlockTableRecord",
      "  2",
      "*PAPER_SPACE",
    );

    for (let i = 0; i < LAYOUT_DEFS.length; i++) {
      lines.push(
        "  0",
        "BLOCK_RECORD",
        "  5",
        this.nextHandle(),
        "100",
        "AcDbSymbolTableRecord",
        "100",
        "AcDbBlockTableRecord",
        "  2",
        `*Paper_Space${i}`,
      );
    }
    lines.push("  0", "ENDTAB");

    lines.push("  0", "ENDSEC\n");
    return lines.join("\n");
  }

  private generateBlocksSection(): string {
    const lines: string[] = ["  0", "SECTION", "  2", "BLOCKS"];

    // *MODEL_SPACE Block
    lines.push(
      "  0",
      "BLOCK",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbEntity",
      "  8",
      "0",
      "100",
      "AcDbBlockBegin",
      "  2",
      "*MODEL_SPACE",
      " 70",
      "0",
      " 10",
      "0.0",
      " 20",
      "0.0",
      " 30",
      "0.0",
      "  3",
      "*MODEL_SPACE",
      "  1",
      "",
      "  0",
      "ENDBLK",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbEntity",
      "  8",
      "0",
      "100",
      "AcDbBlockEnd",
    );

    // *PAPER_SPACE Block
    lines.push(
      "  0",
      "BLOCK",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbEntity",
      "  8",
      "0",
      "100",
      "AcDbBlockBegin",
      "  2",
      "*PAPER_SPACE",
      " 70",
      "0",
      " 10",
      "0.0",
      " 20",
      "0.0",
      " 30",
      "0.0",
      "  3",
      "*PAPER_SPACE",
      "  1",
      "",
      "  0",
      "ENDBLK",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbEntity",
      "  8",
      "0",
      "100",
      "AcDbBlockEnd",
    );

    // Layout blocks
    for (let i = 0; i < LAYOUT_DEFS.length; i++) {
      const blkName = `*Paper_Space${i}`;
      lines.push(
        "  0",
        "BLOCK",
        "  5",
        this.nextHandle(),
        "100",
        "AcDbEntity",
        "  8",
        "0",
        "100",
        "AcDbBlockBegin",
        "  2",
        blkName,
        " 70",
        "0",
        " 10",
        "0.0",
        " 20",
        "0.0",
        " 30",
        "0.0",
        "  3",
        blkName,
        "  1",
        "",
        "  0",
        "ENDBLK",
        "  5",
        this.nextHandle(),
        "100",
        "AcDbEntity",
        "  8",
        "0",
        "100",
        "AcDbBlockEnd",
      );
    }

    lines.push("  0", "ENDSEC\n");
    return lines.join("\n");
  }

  private generateEntitiesSection(): string {
    const lines: string[] = ["  0", "SECTION", "  2", "ENTITIES"];

    // ==========================================
    // 1. MODELSPACE ENTITIES (1:1 mm)
    // ==========================================
    for (const obj of Object.values(this.project.objects)) {
      this.writeModelSpaceEntity(lines, obj);
    }

    // ==========================================
    // 2. PAPERSPACE ENTITIES (All 20 Layouts)
    // ==========================================
    for (let i = 0; i < LAYOUT_DEFS.length; i++) {
      const layout = LAYOUT_DEFS[i];
      this.writePaperSpaceLayoutEntities(lines, layout, i);
    }

    lines.push("  0", "ENDSEC\n");
    return lines.join("\n");
  }

  private writeModelSpaceEntity(lines: string[], obj: SmartObject): void {
    const phase = obj.created_phase;
    const type = obj.object_type;
    const layer = resolveCadLayer(type, phase);
    const d = obj.module_data as Record<string, any>;

    // Column: 2D rectangular polyline
    if (type.startsWith("structure.column")) {
      const loc = d.location_mm ?? [0, 0, 0];
      const sec = d.section_mm ?? [200, 200];
      const hw = sec[0] / 2;
      const hd = sec[1] / 2;
      this.writeLwPolyline(lines, layer.name, 0, [
        [loc[0] - hw, loc[1] - hd],
        [loc[0] + hw, loc[1] - hd],
        [loc[0] + hw, loc[1] + hd],
        [loc[0] - hw, loc[1] + hd],
      ], true);
      return;
    }

    // Foundation: 2D rectangular footprint
    if (type.startsWith("structure.foundation")) {
      const center = d.center_mm ?? [0, 0, 0];
      const sz = d.size_mm ?? [800, 800, 300];
      const hw = sz[0] / 2;
      const hl = sz[1] / 2;
      this.writeLwPolyline(lines, layer.name, 0, [
        [center[0] - hw, center[1] - hl],
        [center[0] + hw, center[1] - hl],
        [center[0] + hw, center[1] + hl],
        [center[0] - hw, center[1] + hl],
      ], true);
      return;
    }

    // Beam: 2D centerline / bounding box
    if (type.startsWith("structure.beam")) {
      const sp = d.start_point_mm ?? [0, 0, 0];
      const ep = d.end_point_mm ?? [0, 0, 0];
      this.writeLine(lines, layer.name, 0, [sp[0], sp[1]], [ep[0], ep[1]]);
      return;
    }

    // Wall: 2D polyline footprint
    if (type.startsWith("arch.wall") || type.startsWith("architecture.wall")) {
      const sp = d.start_point_mm ?? [0, 0, 0];
      const ep = d.end_point_mm ?? [0, 0, 0];
      const th = d.thickness_mm ?? 100;
      const dx = ep[0] - sp[0];
      const dy = ep[1] - sp[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * (th / 2);
      const ny = (dx / len) * (th / 2);

      this.writeLwPolyline(lines, layer.name, 0, [
        [sp[0] + nx, sp[1] + ny],
        [ep[0] + nx, ep[1] + ny],
        [ep[0] - nx, ep[1] - ny],
        [sp[0] - nx, sp[1] - ny],
      ], true);
      return;
    }

    // Door / Window
    if (type.startsWith("arch.door") || type.startsWith("opening.door")) {
      const loc = d.location_mm ?? [0, 0, 0];
      const w = d.width_mm ?? 900;
      this.writeLine(lines, layer.name, 0, [loc[0] - w / 2, loc[1]], [loc[0] + w / 2, loc[1]]);
      return;
    }

    if (type.startsWith("arch.window") || type.startsWith("opening.window")) {
      const loc = d.location_mm ?? [0, 0, 0];
      const w = d.width_mm ?? 1200;
      this.writeLine(lines, layer.name, 0, [loc[0] - w / 2, loc[1]], [loc[0] + w / 2, loc[1]]);
      return;
    }

    // Rebar
    if (type.startsWith("structure.rebar")) {
      const pts = d.path_mm ?? d.nodes_mm;
      if (Array.isArray(pts) && pts.length >= 2) {
        for (let j = 0; j < pts.length - 1; j++) {
          this.writeLine(lines, layer.name, 0, [pts[j][0], pts[j][1]], [pts[j + 1][0], pts[j + 1][1]]);
        }
      }
      return;
    }

    // MEP Pipe Route
    if (type.startsWith("plumbing.") || type.startsWith("drainage.")) {
      const pts = d.nodes_mm;
      if (Array.isArray(pts) && pts.length >= 2) {
        for (let j = 0; j < pts.length - 1; j++) {
          this.writeLine(lines, layer.name, 0, [pts[j][0], pts[j][1]], [pts[j + 1][0], pts[j + 1][1]]);
        }
      }
      return;
    }

    // Manhole: Circle
    if (d.location_mm && (type.includes("manhole") || d.system)) {
      this.writeCircle(lines, layer.name, 0, [d.location_mm[0], d.location_mm[1]], 300);
      return;
    }
  }

  private writePaperSpaceLayoutEntities(
    lines: string[],
    layout: (typeof LAYOUT_DEFS)[number],
    _layoutIndex: number,
  ): void {
    const ownerHandle = "0"; // Will be linked in layout context
    const spaceFlag = 1; // PaperSpace

    // 1. A3 Sheet Border & Title Block (420 x 297 mm)
    // Margin: Left 15mm, Top 10mm, Right 10mm, Bottom 10mm
    const x0 = 15.0;
    const y0 = 10.0;
    const x1 = 410.0;
    const y1 = 287.0;

    // Outer border
    this.writeLwPolyline(lines, "ANNO-TTLB", spaceFlag, [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ], true);

    // Title Block Box (Bottom Right: 260 -> 410, 10 -> 45)
    this.writeLwPolyline(lines, "ANNO-TTLB", spaceFlag, [
      [260.0, 10.0],
      [410.0, 10.0],
      [410.0, 45.0],
      [260.0, 45.0],
    ], true);

    // Title Block Fields
    const projName = this.options.projectName ?? this.project.project.name ?? "CONSTRUCTFLOW PROJECT";
    const archName = this.options.architectName ?? "นายสถาปนิก ผู้ชำนาญการ (ส-สถ. 9999)";
    const engLicense = this.options.engineerLicense ?? "วิศวกรโครงสร้าง (วส. 8888)";
    const date = this.options.issueDate ?? new Date().toISOString().split("T")[0];

    this.writeText(lines, "ANNO-TTLB", spaceFlag, [265, 38], projName, 3.2);
    this.writeText(lines, "ANNO-TTLB", spaceFlag, [265, 30], layout.title, 2.8);
    this.writeText(lines, "ANNO-TTLB", spaceFlag, [265, 23], `SCALE 1:${layout.scale} | A3`, 2.2);
    this.writeText(lines, "ANNO-TTLB", spaceFlag, [265, 17], `ARCH: ${archName}`, 2.0);
    this.writeText(lines, "ANNO-TTLB", spaceFlag, [265, 12], `ENG: ${engLicense} | ${date}`, 2.0);
    this.writeText(lines, "ANNO-TTLB", spaceFlag, [385, 20], layout.id, 6.0);

    // 2. Floating VIEWPORT Entity
    // Centered in printable area: (200, 155) with size 350 x 210
    const vpCenterX = 200.0;
    const vpCenterY = 155.0;
    const vpWidth = 350.0;
    const vpHeight = 210.0;
    const customScale = 1.0 / layout.scale; // e.g. 1:100 -> 0.010

    lines.push(
      "  0",
      "VIEWPORT",
      "  5",
      this.nextHandle(),
      "330",
      ownerHandle,
      "100",
      "AcDbEntity",
      "  8",
      "ANNO-TTLB",
      " 67",
      "1", // PaperSpace
      "100",
      "AcDbViewport",
      " 10",
      vpCenterX.toFixed(3),
      " 20",
      vpCenterY.toFixed(3),
      " 30",
      "0.000",
      " 40",
      vpWidth.toFixed(3),
      " 41",
      vpHeight.toFixed(3),
      " 68",
      "1", // Viewport on/active
      " 69",
      "2", // Viewport ID
      " 12",
      "2500.000", // View target X in ModelSpace (mm)
      " 22",
      "2500.000", // View target Y in ModelSpace (mm)
      " 13",
      "0.000",
      " 23",
      "0.000",
      " 14",
      "1.000",
      " 24",
      "1.000",
      " 15",
      "0.000",
      " 25",
      "0.000",
      " 16",
      "0.000",
      " 26",
      "0.000",
      " 36",
      "1.000",
      " 45",
      customScale.toFixed(6), // View scale factor
      " 90",
      "8192", // Flags
    );

    // 3. Genuine ACAD_TABLE for Schedules (A-08, S-05/S-06, E-02)
    if (layout.id === "A-08") {
      this.writeDoorWindowSchedule(lines, spaceFlag);
    } else if (layout.id === "S-06" || layout.id === "S-05") {
      this.writeBbsSchedule(lines, spaceFlag);
    } else if (layout.id === "E-02") {
      this.writeElectricalPanelSchedule(lines, spaceFlag);
    }
  }

  private writeDoorWindowSchedule(lines: string[], spaceFlag: number): void {
    const tableData: CadTableData = {
      title: "DOOR & WINDOW SCHEDULE",
      insertionPointMm: [25, 230, 0],
      paperSpace: spaceFlag === 1,
      columns: [
        { widthMm: 22 }, // Mark
        { widthMm: 35 }, // Type
        { widthMm: 28 }, // Size (WxH mm)
        { widthMm: 45 }, // Material & Spec
        { widthMm: 20 }, // Qty
      ],
      rows: [
        [
          { text: "DOOR & WINDOW SCHEDULE", alignment: "center" },
          { text: "", alignment: "center" },
          { text: "", alignment: "center" },
          { text: "", alignment: "center" },
          { text: "", alignment: "center" },
        ],
        [
          { text: "MARK", alignment: "center" },
          { text: "TYPE", alignment: "center" },
          { text: "SIZE (mm)", alignment: "center" },
          { text: "MATERIAL", alignment: "center" },
          { text: "QTY", alignment: "center" },
        ],
        [
          { text: "D1", alignment: "center" },
          { text: "Single Swing Door", alignment: "left" },
          { text: "900 x 2000", alignment: "center" },
          { text: "UPVC Frame / Solid Core", alignment: "left" },
          { text: "2", alignment: "center" },
        ],
        [
          { text: "D2", alignment: "center" },
          { text: "Sliding Glass Door", alignment: "left" },
          { text: "1600 x 2000", alignment: "center" },
          { text: "Alum Powder Coat / 6mm Clear", alignment: "left" },
          { text: "1", alignment: "center" },
        ],
        [
          { text: "W1", alignment: "center" },
          { text: "2-Panel Sliding Window", alignment: "left" },
          { text: "1200 x 1100", alignment: "center" },
          { text: "Alum Powder Coat / 6mm Euro Gray", alignment: "left" },
          { text: "4", alignment: "center" },
        ],
        [
          { text: "W2", alignment: "center" },
          { text: "Awning Vent Window", alignment: "left" },
          { text: "600 x 600", alignment: "center" },
          { text: "Alum Powder Coat / Frosted Glass", alignment: "left" },
          { text: "2", alignment: "center" },
        ],
      ],
    };

    // Serializes genuine ACAD_TABLE entity
    const acadTable = formatAcadTableDxf(tableData, this.nextHandle(), "0");
    lines.push(acadTable);

    // Also adds line fallback so non-enabler viewers render it perfectly
    const fallback = formatTableLinesFallbackDxf(tableData, this.handleCounter, "0");
    this.handleCounter = fallback.nextHandle;
    lines.push(fallback.dxf);
  }

  private writeBbsSchedule(lines: string[], spaceFlag: number): void {
    const tableData: CadTableData = {
      title: "STRUCTURAL BAR BENDING SCHEDULE (BBS)",
      insertionPointMm: [25, 230, 0],
      paperSpace: spaceFlag === 1,
      columns: [
        { widthMm: 22 }, // Mark
        { widthMm: 28 }, // Bar Dia
        { widthMm: 35 }, // Shape / Details
        { widthMm: 25 }, // Cut Length (m)
        { widthMm: 20 }, // Count
        { widthMm: 25 }, // Total Wt (kg)
      ],
      rows: [
        [
          { text: "STRUCTURAL BAR BENDING SCHEDULE (BBS)", alignment: "center" },
          { text: "", alignment: "center" },
          { text: "", alignment: "center" },
          { text: "", alignment: "center" },
          { text: "", alignment: "center" },
          { text: "", alignment: "center" },
        ],
        [
          { text: "MEMBER", alignment: "center" },
          { text: "BAR SIZE", alignment: "center" },
          { text: "ARRANGEMENT", alignment: "center" },
          { text: "CUT (m)", alignment: "center" },
          { text: "QTY", alignment: "center" },
          { text: "WEIGHT (kg)", alignment: "center" },
        ],
        [
          { text: "B1 Top", alignment: "center" },
          { text: "2-DB16 (SD40)", alignment: "center" },
          { text: "Straight + 90 Hook", alignment: "left" },
          { text: "4.450", alignment: "center" },
          { text: "4", alignment: "center" },
          { text: "28.09", alignment: "right" },
        ],
        [
          { text: "B1 Btm", alignment: "center" },
          { text: "2-DB16 (SD40)", alignment: "center" },
          { text: "Straight + 90 Hook", alignment: "left" },
          { text: "4.450", alignment: "center" },
          { text: "4", alignment: "center" },
          { text: "28.09", alignment: "right" },
        ],
        [
          { text: "B1 Stirrup", alignment: "center" },
          { text: "RB6 (SR24)", alignment: "center" },
          { text: "Closed Ties @ 0.15m", alignment: "left" },
          { text: "1.080", alignment: "center" },
          { text: "32", alignment: "center" },
          { text: "7.67", alignment: "right" },
        ],
        [
          { text: "C1 Main", alignment: "center" },
          { text: "4-DB16 (SD40)", alignment: "center" },
          { text: "Vertical + Dowel", alignment: "left" },
          { text: "3.800", alignment: "center" },
          { text: "16", alignment: "center" },
          { text: "96.11", alignment: "right" },
        ],
      ],
    };

    const acadTable = formatAcadTableDxf(tableData, this.nextHandle(), "0");
    lines.push(acadTable);

    const fallback = formatTableLinesFallbackDxf(tableData, this.handleCounter, "0");
    this.handleCounter = fallback.nextHandle;
    lines.push(fallback.dxf);
  }

  private writeElectricalPanelSchedule(lines: string[], spaceFlag: number): void {
    const tableData: CadTableData = {
      title: "PANEL BOARD SCHEDULE (LP-1)",
      insertionPointMm: [25, 230, 0],
      paperSpace: spaceFlag === 1,
      columns: [
        { widthMm: 18 }, // Ckt No
        { widthMm: 45 }, // Description
        { widthMm: 22 }, // Watts
        { widthMm: 25 }, // Breaker (AT)
        { widthMm: 30 }, // Cable (mm2)
      ],
      rows: [
        [
          { text: "PANEL BOARD SCHEDULE (LP-1)", alignment: "center" },
          { text: "", alignment: "center" },
          { text: "", alignment: "center" },
          { text: "", alignment: "center" },
          { text: "", alignment: "center" },
        ],
        [
          { text: "CKT", alignment: "center" },
          { text: "DESCRIPTION", alignment: "center" },
          { text: "LOAD (W)", alignment: "center" },
          { text: "BREAKER", alignment: "center" },
          { text: "WIRE SIZE", alignment: "center" },
        ],
        [
          { text: "1", alignment: "center" },
          { text: "Lighting L1 (Ground)", alignment: "left" },
          { text: "450", alignment: "right" },
          { text: "1P 16AT", alignment: "center" },
          { text: "2x1.5 / 1.5G IEC01", alignment: "left" },
        ],
        [
          { text: "2", alignment: "center" },
          { text: "Receptacles Living/Kitchen", alignment: "left" },
          { text: "1800", alignment: "right" },
          { text: "1P 20AT", alignment: "center" },
          { text: "2x2.5 / 2.5G IEC01", alignment: "left" },
        ],
        [
          { text: "3", alignment: "center" },
          { text: "Air Conditioner 18,000 BTU", alignment: "left" },
          { text: "2200", alignment: "right" },
          { text: "1P 20AT", alignment: "center" },
          { text: "2x4.0 / 2.5G IEC01", alignment: "left" },
        ],
        [
          { text: "4", alignment: "center" },
          { text: "Water Heater 4,500W", alignment: "left" },
          { text: "4500", alignment: "right" },
          { text: "1P 32AT (RCBO)", alignment: "center" },
          { text: "2x6.0 / 4.0G IEC01", alignment: "left" },
        ],
      ],
    };

    const acadTable = formatAcadTableDxf(tableData, this.nextHandle(), "0");
    lines.push(acadTable);

    const fallback = formatTableLinesFallbackDxf(tableData, this.handleCounter, "0");
    this.handleCounter = fallback.nextHandle;
    lines.push(fallback.dxf);
  }

  private generateObjectsSection(): string {
    const lines: string[] = ["  0", "SECTION", "  2", "OBJECTS"];

    const rootDictHandle = this.nextHandle();
    const layoutDictHandle = this.nextHandle();

    // Root Dictionary
    lines.push(
      "  0",
      "DICTIONARY",
      "  5",
      rootDictHandle,
      "100",
      "AcDbDictionary",
      "281",
      "1",
      "  3",
      "ACAD_LAYOUT",
      "350",
      layoutDictHandle,
    );

    // Layout Dictionary
    lines.push(
      "  0",
      "DICTIONARY",
      "  5",
      layoutDictHandle,
      "100",
      "AcDbDictionary",
      "281",
      "1",
    );

    const layoutHandles: string[] = [];
    for (const layout of LAYOUT_DEFS) {
      const lh = this.nextHandle();
      layoutHandles.push(lh);
      lines.push("  3", layout.name, "350", lh);
    }

    // Individual Layout Objects (A-01 to E-02)
    for (let i = 0; i < LAYOUT_DEFS.length; i++) {
      const layout = LAYOUT_DEFS[i];
      const lh = layoutHandles[i];
      lines.push(
        "  0",
        "LAYOUT",
        "  5",
        lh,
        "330",
        layoutDictHandle,
        "100",
        "AcDbPlotSettings",
        "  1",
        "DWG To PDF.pc3", // Plotter
        "  2",
        "ISO_full_bleed_A3_(420.00_x_297.00_MM)", // Media name
        " 40",
        "0.0", // Margins
        " 41",
        "0.0",
        " 42",
        "0.0",
        " 43",
        "0.0",
        " 44",
        "420.0", // Paper width mm
        " 45",
        "297.0", // Paper height mm
        " 70",
        "688", // Plot layout flags
        "100",
        "AcDbLayout",
        "  1",
        layout.name,
        " 70",
        "1",
        " 71",
        (i + 1).toString(), // Tab order
        " 10",
        "0.0", // Min limits
        " 20",
        "0.0",
        " 11",
        "420.0", // Max limits
        " 21",
        "297.0",
      );
    }

    lines.push("  0", "ENDSEC\n");
    return lines.join("\n");
  }

  // --- Vector Helper Writers ---

  private writeLine(
    lines: string[],
    layer: string,
    space: number,
    start: [number, number],
    end: [number, number],
  ): void {
    lines.push(
      "  0",
      "LINE",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbEntity",
      "  8",
      layer,
      " 67",
      space.toString(),
      "100",
      "AcDbLine",
      " 10",
      start[0].toFixed(3),
      " 20",
      start[1].toFixed(3),
      " 30",
      "0.000",
      " 11",
      end[0].toFixed(3),
      " 21",
      end[1].toFixed(3),
      " 31",
      "0.000",
    );
  }

  private writeCircle(
    lines: string[],
    layer: string,
    space: number,
    center: [number, number],
    radius: number,
  ): void {
    lines.push(
      "  0",
      "CIRCLE",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbEntity",
      "  8",
      layer,
      " 67",
      space.toString(),
      "100",
      "AcDbCircle",
      " 10",
      center[0].toFixed(3),
      " 20",
      center[1].toFixed(3),
      " 30",
      "0.000",
      " 40",
      radius.toFixed(3),
    );
  }

  private writeLwPolyline(
    lines: string[],
    layer: string,
    space: number,
    points: [number, number][],
    closed: boolean = false,
  ): void {
    lines.push(
      "  0",
      "LWPOLYLINE",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbEntity",
      "  8",
      layer,
      " 67",
      space.toString(),
      "100",
      "AcDbPolyline",
      " 90",
      points.length.toString(),
      " 70",
      closed ? "1" : "0",
      " 43",
      "0.0",
    );
    for (const pt of points) {
      lines.push(" 10", pt[0].toFixed(3), " 20", pt[1].toFixed(3));
    }
  }

  private writeText(
    lines: string[],
    layer: string,
    space: number,
    at: [number, number],
    text: string,
    height: number,
  ): void {
    lines.push(
      "  0",
      "TEXT",
      "  5",
      this.nextHandle(),
      "100",
      "AcDbEntity",
      "  8",
      layer,
      " 67",
      space.toString(),
      "100",
      "AcDbText",
      " 10",
      at[0].toFixed(3),
      " 20",
      at[1].toFixed(3),
      " 30",
      "0.000",
      " 40",
      height.toFixed(3),
      "  1",
      text,
      "  7",
      "STANDARD",
    );
  }
}
