import { deserializeProject, serializeProject } from '@constructflow/project-model'
import { validateConstructionProject } from '@constructflow/domain-providers'
import { CommandBus } from '@constructflow/command-runtime'

/** Read and canonicalize a local ConstructFlow project file before it replaces editor state. */
export async function readProjectFile(file) {
  const parsed = JSON.parse(await file.text())
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('ไฟล์โครงการต้องเป็น JSON object')

  const projectJson = { ...parsed }
  const mediaBundle = projectJson._constructflow_media_bundle
  delete projectJson._constructflow_media_bundle
  const mediaAssets = readFieldPhotoMediaBundle(mediaBundle, projectJson)

  const project = CommandBus.migrateProject(deserializeProject(JSON.stringify(projectJson)))
  validateConstructionProject(project)
  return { project, serialized: serializeProject(project), name: file.name, mediaAssets }
}

function readFieldPhotoMediaBundle(bundle, project) {
  if (bundle === undefined) return {}
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle) || bundle.schema_version !== 1) {
    throw new Error('เวอร์ชันชุดรูปถ่ายในไฟล์โครงการไม่รองรับ')
  }
  const assets = bundle.field_photo_assets
  if (!assets || typeof assets !== 'object' || Array.isArray(assets)) throw new Error('รายการรูปถ่ายในไฟล์โครงการไม่ถูกต้อง')

  const referencedIds = new Set((Array.isArray(project.field_photo_inspections) ? project.field_photo_inspections : [])
    .map(inspection => inspection && typeof inspection.image_asset_id === 'string' ? inspection.image_asset_id : null)
    .filter(Boolean))
  const entries = Object.entries(assets)
  if (entries.length > 200) throw new Error('ไฟล์โครงการมีรูปถ่ายมากกว่า 200 รายการที่รองรับ')
  let totalImageChars = 0
  const mediaAssets = {}
  for (const [assetId, dataUrl] of entries) {
    if (!referencedIds.has(assetId)) throw new Error('ไฟล์โครงการมีรูปถ่ายที่ไม่ได้เชื่อมกับข้อมูลสำรวจ')
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/') || dataUrl.length > 28_000_000) {
      throw new Error(`รูปถ่าย ${assetId} ในไฟล์โครงการมีรูปแบบหรือขนาดไม่รองรับ`)
    }
    totalImageChars += dataUrl.length
    if (totalImageChars > 80_000_000) throw new Error('รูปถ่ายในไฟล์โครงการมีขนาดรวมเกินประมาณ 60 MB')
    mediaAssets[assetId] = dataUrl
  }
  return mediaAssets
}
