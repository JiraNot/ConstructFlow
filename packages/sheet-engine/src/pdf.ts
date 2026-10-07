import {
  PDFDocument,
  PDFHexString,
  rgb,
  beginText,
  endText,
  setFontAndSize,
  setTextMatrix,
  showText,
  setFillingRgbColor,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { PermitDrawingSet } from "./permit.js";
const PT = 72 / 25.4;
const color = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** Native browser/Node vector PDF. Full font embedding keeps CID equal to glyph ID.
 * Apply fontkit GPOS offsets explicitly; PDF-LIB drawText does not apply mark offsets.
 */
export async function compilePermitPdf(
  set: PermitDrawingSet,
  fontBytes: Uint8Array,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: false }),
    face = fontkit.create(fontBytes);
  if ("fonts" in face) throw new Error("A standalone TTF font is required");
  pdf.setTitle(`ConstructFlow | ${set.project_id} | 20-sheet draft`);
  pdf.setLanguage("th-TH");
  pdf.setCreator("ConstructFlow native sheet compiler");
  for (const sheet of set.sheets) {
    const page = pdf.addPage([420 * PT, 297 * PT]),
      resource = page.node.newFontDictionary(font.name, font.ref);
    for (const p of sheet.primitives) {
      if (p.kind === "path") {
        const pts = p.closed ? [...p.points, p.points[0]] : p.points;
        for (let i = 1; i < pts.length; i++)
          page.drawLine({
            start: { x: pts[i - 1][0] * PT, y: (297 - pts[i - 1][1]) * PT },
            end: { x: pts[i][0] * PT, y: (297 - pts[i][1]) * PT },
            thickness: p.width * PT,
            color: color(p.color),
            dashArray: p.dash?.map((v) => v * PT),
          });
      } else {
        const run = face.layout(p.text),
          baseSize = p.size * PT,
          advance = run.positions.reduce((s, v) => s + v.xAdvance, 0),
          width = (advance / face.unitsPerEm) * baseSize;
        const size =
            p.max_width && width > p.max_width * PT
              ? (baseSize * p.max_width * PT) / width
              : baseSize,
          scale = size / face.unitsPerEm;
        let x = p.at[0] * PT,
          y = (297 - p.at[1]) * PT;
        const c = color(p.color);
        page.pushOperators(
          beginText(),
          setFontAndSize(resource, size),
          setFillingRgbColor(c.red, c.green, c.blue),
        );
        for (let i = 0; i < run.glyphs.length; i++) {
          const g = run.glyphs[i],
            pos = run.positions[i];
          if (g.id === 0) throw new Error(`Font has no glyph for ${p.text}`);
          page.pushOperators(
            setTextMatrix(
              1,
              0,
              0,
              1,
              x + pos.xOffset * scale,
              y + pos.yOffset * scale,
            ),
            showText(PDFHexString.of(g.id.toString(16).padStart(4, "0"))),
          );
          x += pos.xAdvance * scale;
          y += pos.yAdvance * scale;
        }
        page.pushOperators(endText());
      }
    }
  }
  return pdf.save();
}
