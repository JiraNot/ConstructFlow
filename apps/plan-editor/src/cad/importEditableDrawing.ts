import { importDxfDrawing } from './importDxfUnderlay.mjs'

export async function importEditableDrawing(file: File, unitScaleMm?: number) {
  if (file.size <= 0 || file.size > 100 * 1024 * 1024) throw new Error('ไฟล์ CAD ต้องมีขนาด 1 byte ถึง 100 MB')
  if (/\.dxf$/i.test(file.name)) return importDxfDrawing(await file.text(), { unitScaleMm })
  if (!/\.dwg$/i.test(file.name)) throw new Error('เลือกไฟล์ DWG หรือ DXF')
  const buffer = await file.arrayBuffer()
  const worker = new Worker(new URL('./libreDwgParser.worker.ts', import.meta.url), { type: 'module' })
  const result = await new Promise<{ dxf: string; unsupportedEntities: number }>((resolve,reject) => {
    const timeout = setTimeout(() => {worker.terminate();reject(new Error('อ่าน DWG เกิน 90 วินาที'))},90000)
    worker.onmessage = event => {clearTimeout(timeout);worker.terminate();if(event.data.ok)resolve(event.data.result);else reject(new Error(event.data.error))}
    worker.onerror = event => {clearTimeout(timeout);worker.terminate();reject(new Error(event.message))}
    worker.postMessage({buffer,editable:true},[buffer])
  })
  const drawing = importDxfDrawing(result.dxf, {unitScaleMm})
  return {...drawing, skipped_entities:drawing.skipped_entities + result.unsupportedEntities}
}
