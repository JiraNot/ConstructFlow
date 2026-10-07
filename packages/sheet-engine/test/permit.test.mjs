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
