import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createEmptyProjectDocument } from "@constructflow/project-model";
import {
  compilePermitDrawingSet,
  compilePermitPdf,
  PERMIT_INDEX,
} from "../dist/index.js";
import { PDFDocument, PDFName } from "pdf-lib";
test("Phase 6: deterministic 20-sheet index and explicit missing data; valid A3 and embedded Thai font", async () => {
  const p = createEmptyProjectDocument(
      "PDF-PROOF",
      "ทดสอบ ก่อสร้าง ถั่ว ปั๊มน้ำ",
    ),
    set = compilePermitDrawingSet(p);
  assert.deepEqual(set, compilePermitDrawingSet(p));
  assert.equal(set.sheets.length, 20);
  assert.deepEqual(
    set.sheets.map((s) => s.id),
    PERMIT_INDEX.map((v) => v[0]),
  );
  assert.equal(set.issue_ready, false);
  assert.ok(set.sheets.every((s) => s.status === "missing_data"));
  const bytes = await compilePermitPdf(
      set,
      readFileSync(new URL("../assets/Sarabun-Regular.ttf", import.meta.url)),
    ),
    pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 20);
  for (const page of pdf.getPages()) {
    assert.ok(Math.abs(page.getWidth() - (420 * 72) / 25.4) < 1e-8);
    assert.ok(Math.abs(page.getHeight() - (297 * 72) / 25.4) < 1e-8);
    const fonts = page.node.Resources().lookup(PDFName.of("Font"));
    assert.ok(fonts.keys().length > 0);
    const font = fonts.lookup(fonts.keys()[0]);
    assert.equal(font.get(PDFName.of("Subtype")).toString(), "/Type0");
    assert.ok(font.has(PDFName.of("ToUnicode")));
  }
});
test("Phase 6: crop and scale inputs reject malformed ranges", () => {
  const p = createEmptyProjectDocument("PDF-PROOF");
  assert.throws(
    () =>
      compilePermitDrawingSet(p, {
        viewports: { "A-02": { scale_denominator: 13 } },
      }),
    /scale/,
  );
  assert.throws(
    () =>
      compilePermitDrawingSet(p, {
        viewports: {
          "A-02": { scale_denominator: 100, crop_bounds_mm: [10, 0, 0, 10] },
        },
      }),
    /crop/,
  );
});

test("Phase 6: saved sheet settings control the compiler and invalid coordinate lengths reject", () => {
  const p = createEmptyProjectDocument("PDF-PROOF");
  p.drawing_settings = {
    viewports: {
      "A-09": {
        scale_denominator: 20,
        center_mm: [1000, 1000],
        crop_bounds_mm: [0, 0, 2000, 2000],
      },
    },
    revision: "R2",
    author: "Thai Designer",
  };
  const set = compilePermitDrawingSet(p),
    sheet = set.sheets.find((s) => s.id === "A-09");
  assert.equal(sheet.scale, "1:20");
  assert.deepEqual(sheet.viewport.center_mm, [1000, 1000]);
  assert.ok(
    sheet.primitives.some(
      (p) => p.kind === "text" && p.text.includes("Revision R2"),
    ),
  );
  assert.throws(
    () =>
      compilePermitDrawingSet(p, {
        viewports: { "A-09": { scale_denominator: 25, center_mm: [1] } },
      }),
    /center_mm/,
  );
});

test("Track 2: Permit Package evaluates legal metadata, deed boundaries, setbacks, and issue_ready", () => {
  const p = createEmptyProjectDocument("PERMIT-LEGAL", "บ้านพักอาศัยโมเดิร์น 2 ชั้น");

  p.legal_metadata = {
    deed_no: "45678",
    land_no: "123",
    survey_page: "9988",
    subdistrict: "ลาดยาว",
    district: "จตุจักร",
    province: "กรุงเทพมหานคร",
    rai: 0,
    ngan: 1,
    sq_wa: 50,
    total_area_sqm: 600,
    boundary_pegs: [
      { peg_no: "1", coordinate_m: [0, 0] },
      { peg_no: "2", coordinate_m: [20, 0] },
      { peg_no: "3", coordinate_m: [20, 30] },
      { peg_no: "4", coordinate_m: [0, 30] },
    ],
    setbacks: {
      front_m: 3.0,
      rear_m: 2.0,
      left_m: 2.0,
      right_m: 2.0,
      min_opening_setback_m: 2.0,
      min_blind_setback_m: 0.5,
    },
    zoning: {
      zone_code: "ย.4-12",
      far_limit: 3.0,
      osr_min_percent: 10.0,
      permeable_open_space_ratio_percent: 50.0,
    },
    signatories: {
      owner_name: "นายสมชาย เจริญสุข",
      architect_name: "นายสถาปัตย์ มั่นคง",
      architect_license_no: "ส-สถ. 9876",
      structural_engineer_name: "นายวิศวกร ปลอดภัย",
      structural_engineer_license_no: "วส. 5432",
      issue_approved: true,
    },
  };

  const set = compilePermitDrawingSet(p);
  const a01 = set.sheets.find((s) => s.id === "A-01");
  assert.ok(a01);
  assert.equal(a01.status, "issued");
  assert.ok(!a01.warnings.some((w) => w.includes("Deed boundary")));

  // Verify A-01 contains Deed Table text and Peg text
  assert.ok(a01.primitives.some((pr) => pr.kind === "text" && pr.text.includes("45678")));
  assert.ok(a01.primitives.some((pr) => pr.kind === "text" && pr.text.includes("หลักเขต 1")));
  assert.ok(a01.primitives.some((pr) => pr.kind === "text" && pr.text.includes("ส-สถ. 9876")));
  assert.ok(a01.primitives.some((pr) => pr.kind === "text" && pr.text.includes("PERMIT ISSUE SET")));
});
