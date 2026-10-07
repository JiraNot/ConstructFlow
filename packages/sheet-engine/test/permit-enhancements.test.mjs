import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createEmptyProjectDocument,
} from "@constructflow/project-model";
import {
  compilePermitDrawingSet,
  compilePermitPdf,
} from "../dist/index.js";
import { PDFDocument } from "pdf-lib";

test("F04: drawTable handles overflow with multi-column auto-balance and header repetition", () => {
  const p = createEmptyProjectDocument("OVERFLOW-TEST", "อาคารทดสอบตารางล้น");

  // Add 40 door/window smart objects to populate schedule sheet A-08 (> 27 rows)
  for (let i = 1; i <= 40; i++) {
    const objId = `dw-${i}`;
    p.objects[objId] = {
      id: objId,
      object_type: i % 2 === 0 ? "door_window.swing_door" : "door_window.sliding_window",
      created_phase: "new_construction",
      level_refs: [],
      module_data: {
        mark: i % 2 === 0 ? `D${i}` : `W${i}`,
        type_id: i % 2 === 0 ? "D1" : "W1",
        width_mm: 900,
        height_mm: 2000,
      },
    };
  }

  const set = compilePermitDrawingSet(p);
  const a08 = set.sheets.find((s) => s.id === "A-08");
  assert.ok(a08, "Sheet A-08 should exist");

  // Verify that multi-column layout was created
  // Column 2 should have repeated header with "(ต่อ)"
  const textPrimitives = a08.primitives.filter((pr) => pr.kind === "text");
  const hasContinuationHeader = textPrimitives.some((t) => t.text.includes("(ต่อ)"));
  assert.ok(
    hasContinuationHeader,
    "Sheet A-08 should contain repeated table header with '(ต่อ)' in column 2",
  );

  // Verify headers have styled background fill
  const pathPrimitives = a08.primitives.filter((pr) => pr.kind === "path");
  const hasHeaderFills = pathPrimitives.some((p) => p.fill === "#f1f5f9");
  assert.ok(hasHeaderFills, "Table headers should have #f1f5f9 fill");

  // With 40 rows across 2 columns, it should NOT overflow onto secondary sheet yet
  assert.ok(
    !a08.warnings.some((w) => w.includes("Schedule overflow")),
    "40 rows should fit cleanly across 2 side-by-side columns without overflow warning",
  );
});

test("F04: drawTable handles extreme overflow (>70 rows) with continuation banner and warning", () => {
  const p = createEmptyProjectDocument("MASSIVE-TABLE", "อาคารทดสอบตารางยาวมาก");

  // Add 80 objects to exceed 2-column sheet capacity
  for (let i = 1; i <= 80; i++) {
    const objId = `col-${i}`;
    p.objects[objId] = {
      id: objId,
      object_type: "structure.column",
      created_phase: "new_construction",
      level_refs: [],
      module_data: {
        mark: `C${i}`,
        size_mm: [200, 200],
      },
    };
  }

  const set = compilePermitDrawingSet(p);
  const s05 = set.sheets.find((s) => s.id === "S-05");
  assert.ok(s05);

  // Check for continuation banner or secondary sheet warning
  const hasOverflowWarning = s05.warnings.some((w) => w.includes("Schedule overflow"));
  assert.ok(hasOverflowWarning, "Extreme table (>70 rows) should emit schedule overflow warning");

  const hasContinuationText = s05.primitives.some(
    (pr) => pr.kind === "text" && pr.text.includes("ตารางมีต่อในเอกสารแนบ"),
  );
  assert.ok(hasContinuationText, "Should render continuation banner on the sheet");
});

test("F04: Hidden-line solver and depth occlusion on elevations and section cuts", async () => {
  const p = createEmptyProjectDocument("HLS-TEST", "ทดสอบ Hidden-line solver");

  // Add front exterior wall at Y = 0 (foreground)
  p.objects["wall-front"] = {
    id: "wall-front",
    object_type: "architecture.wall",
    created_phase: "new_construction",
    level_refs: [],
    module_data: {
      mark: "W-FRONT",
      start_point_mm: [0, 0, 0],
      end_point_mm: [6000, 0, 0],
      thickness_mm: 150,
      height_mm: 3000,
    },
  };

  // Add interior column behind front wall at Y = 2000 (background)
  p.objects["col-interior"] = {
    id: "col-interior",
    object_type: "structure.column",
    created_phase: "new_construction",
    level_refs: [],
    module_data: {
      mark: "C-INT",
      location_mm: [3000, 2000, 0],
      section_mm: [200, 200],
      base_elevation_mm: 0,
      top_elevation_mm: 3000,
    },
  };

  const set = compilePermitDrawingSet(p);
  const a05 = set.sheets.find((s) => s.id === "A-05");
  assert.ok(a05, "Sheet A-05 (Elevation) should exist");

  // Check that front-facing surfaces have opaque surface masks with fill: "#ffffff"
  const paths = a05.primitives.filter((pr) => pr.kind === "path");
  const hasSurfaceMasks = paths.some((pr) => pr.fill === "#ffffff");
  assert.ok(hasSurfaceMasks, "Elevations should include opaque surface masks (fill: #ffffff)");

  // Check section sheet A-07
  const a07 = set.sheets.find((s) => s.id === "A-07");
  assert.ok(a07, "Sheet A-07 (Sections) should exist");

  // Verify that SVG string contains valid fill attributes
  assert.ok(a05.svg.includes('fill="#ffffff"'), "SVG should render fill attributes for surface masks");

  // Verify full PDF compilation succeeds with filled paths
  const fontBytes = readFileSync(new URL("../assets/Sarabun-Regular.ttf", import.meta.url));
  const pdfBytes = await compilePermitPdf(set, fontBytes);
  const pdf = await PDFDocument.load(pdfBytes);
  assert.equal(pdf.getPageCount(), 20, "20-page permit PDF should compile successfully");
});
