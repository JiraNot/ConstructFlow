import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import {
  createKitchenProofProject,
  planPhaseProof,
} from "../packages/extension-engine/dist/index.js";
import { CommandBus } from "../packages/command-runtime/dist/index.js";
import { serializeProject } from "../packages/project-model/dist/index.js";
import { constructionOutputs } from "../packages/domain-providers/dist/index.js";
import { calculateTakeoff } from "../packages/takeoff-engine/dist/index.js";
import {
  compilePermitDrawingSet,
  compilePermitPdf,
  renderPermitDrawingSetHtml,
  PERMIT_INDEX,
} from "../packages/sheet-engine/dist/index.js";
import pdfLib from "../packages/sheet-engine/node_modules/pdf-lib/cjs/index.js";
const { PDFDocument } = pdfLib;
const seed = createKitchenProofProject();
assert.equal(seed.status, "success");
const result = CommandBus.executeBatch(
  seed.updatedProject,
  planPhaseProof(seed.updatedProject),
);
assert.equal(result.status, "success", JSON.stringify(result.errors));
const p = result.updatedProject,
  set = compilePermitDrawingSet(p);
assert.equal(set.sheets.length, 20);
assert.deepEqual(
  set.sheets.map((s) => s.id),
  PERMIT_INDEX.map((s) => s[0]),
);
const outputs = constructionOutputs(p);
for (const out of outputs) {
  for (const q of out.quantities)
    assert.ok(Number.isFinite(q.quantity) && q.quantity >= 0);
  for (const v of Object.values(out.schedule))
    if (typeof v === "number") assert.ok(Number.isFinite(v));
}
const report = calculateTakeoff(p);
assert.ok(report.lines.some((l) => l.unit === "kg"));
const font = readFileSync("packages/sheet-engine/assets/Sarabun-Regular.ttf"),
  bytes = await compilePermitPdf(set, font),
  pdf = await PDFDocument.load(bytes);
assert.equal(pdf.getPageCount(), 20);
for (const page of pdf.getPages()) {
  const { width, height } = page.getSize();
  assert.ok(Math.abs(width - (420 * 72) / 25.4) < 1e-8);
  assert.ok(Math.abs(height - (297 * 72) / 25.4) < 1e-8);
}
mkdirSync("output/pdf", { recursive: true });
writeFileSync("output/pdf/phase-1-6-proof.pdf", bytes);
writeFileSync("output/pdf/phase-1-6-proof.html", renderPermitDrawingSetHtml(p));
writeFileSync("output/pdf/phase-1-6-proof.cfproj", serializeProject(p));
writeFileSync(
  "output/pdf/phase-1-6-proof-report.json",
  JSON.stringify(
    {
      objects: Object.keys(p.objects).length,
      domain_outputs: outputs.length,
      sheets: set.sheets.map((s) => ({
        id: s.id,
        status: s.status,
        sources: s.source_object_ids.length,
        source_object_ids: s.source_object_ids,
        viewport: s.viewport,
        primitives: s.primitives.length,
        warnings: s.warnings,
      })),
      quantities: report.lines,
      warnings: set.warnings,
    },
    null,
    2,
  ),
);
console.log(
  `Phase proof: ${Object.keys(p.objects).length} Smart Objects, ${outputs.length} domain outputs, 20 A3 PDF pages, ${report.lines.length} takeoff rows. Missing-data warnings: ${set.warnings.length}.`,
);
