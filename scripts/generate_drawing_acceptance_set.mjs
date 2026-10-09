import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { compilePermitPdf, compilePermitDrawingSet } from '../packages/sheet-engine/dist/index.js'
import { deserializeProject } from '../packages/project-model/dist/index.js'
import { exportProjectToDxf } from '../packages/cad-adapter/dist/index.js'
import pdfLib from '../packages/sheet-engine/node_modules/pdf-lib/cjs/index.js'

const { PDFDocument } = pdfLib
const outputRoot = resolve('output/acceptance')
const font = await readFile('packages/sheet-engine/assets/Sarabun-Regular.ttf')
const fixtures = [
  { key: 'house-demo', path: 'examples/constructflow-house-demo.cfproj' },
  { key: 'kitchen-extension-proof', path: 'examples/kitchen-extension-proof.cfproj' },
]
const acceptanceSheetIds = new Set(['A-02', 'A-03', 'A-05', 'A-06', 'A-07', 'A-10'])
const manifest = []

await mkdir(`${outputRoot}/pdf`, { recursive: true })
await mkdir(`${outputRoot}/dxf`, { recursive: true })

for (const fixture of fixtures) {
  const project = deserializeProject(await readFile(fixture.path, 'utf8'))
  // The full two-storey house plan needs 1:100 to fit its A3 view window;
  // the smaller extension proof is issued at 1:50 and exported at both scales.
  const pdfScale = fixture.key === 'house-demo' ? 100 : 50
  const viewports = {
    'A-02': { scale_denominator: pdfScale },
    'A-03': { scale_denominator: pdfScale },
  }
  const set = compilePermitDrawingSet(project, { viewports })
  const sheets = set.sheets.filter(sheet => acceptanceSheetIds.has(sheet.id))
  const planSheets = sheets.filter(sheet => sheet.id === 'A-02' || sheet.id === 'A-03')
  assert.equal(planSheets.length, 2)
  for (const sheet of planSheets) {
    assert.equal(sheet.scale, `1:${pdfScale}`)
    assert.ok(!sheet.warnings.some(warning => /clip|could not place/i.test(warning)), `${fixture.key} ${sheet.id} at 1:${pdfScale}: ${sheet.warnings.join('; ')}`)
  }
  for (const sheet of sheets)
    assert.ok(!sheet.warnings.some(warning => /Viewport clips model/i.test(warning)), `${fixture.key} ${sheet.id}: ${sheet.warnings.join('; ')}`)
  const dxfScales = fixture.key === 'house-demo' ? [100] : [100, 50]
  for (const scale of dxfScales) {
    const dxfViewports = { 'A-02': { scale_denominator: scale }, 'A-03': { scale_denominator: scale } }
    project.drawing_settings = { ...project.drawing_settings, viewports: { ...project.drawing_settings?.viewports, ...viewports } }
    project.drawing_settings.viewports = { ...project.drawing_settings.viewports, ...dxfViewports }
    const dxf = exportProjectToDxf(project).dxfContent
    assert.ok(dxf.includes('A-02_Ground_Plan'))
    assert.ok(dxf.includes('A-03_Upper_Plan'))
    await writeFile(`${outputRoot}/dxf/${fixture.key}-1-${scale}.dxf`, dxf, 'utf8')
  }

  const acceptanceSet = { ...set, sheets }
  const pdfBytes = await compilePermitPdf(acceptanceSet, font)
  const pdf = await PDFDocument.load(pdfBytes)
  assert.equal(pdf.getPageCount(), sheets.length)
  for (const page of pdf.getPages()) {
    const size = page.getSize()
    assert.ok(Math.abs(size.width - (420 * 72) / 25.4) < 1e-8)
    assert.ok(Math.abs(size.height - (297 * 72) / 25.4) < 1e-8)
  }
  await writeFile(`${outputRoot}/pdf/${fixture.key}-plans-a3.pdf`, pdfBytes)
  manifest.push({
    source: fixture.path,
    project_id: project.project.id,
    pdf: `pdf/${fixture.key}-plans-a3.pdf`,
    dxf: dxfScales.map(scale => `dxf/${fixture.key}-1-${scale}.dxf`),
    pages: sheets.map(sheet => ({ id: sheet.id, scale: sheet.scale, warnings: sheet.warnings })),
  })
}

await writeFile(`${outputRoot}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Generated full A3 PDF drawing sets for the house at 1:100 plans and kitchen at 1:50 plans, plus matching DXF exports under ${outputRoot}`)
