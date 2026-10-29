import type { ProjectDocument } from '@constructflow/project-model'
import { listLocalFieldPhotoAssets, notifyLocalFieldPhotoAssetsChanged, saveLocalFieldPhotoAssets } from './projectAutosave.js'

const ASSET_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256_PATTERN = /^[a-f0-9]{64}$/i
const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|webp|gif|avif));base64,([A-Za-z0-9+/]+={0,2})$/i
const MAX_ASSET_BYTES = 20_000_000
const MAX_LOCAL_PHOTO_CHARS = 80_000_000

interface SharedPhotoAsset {
  asset_id: string
  sha256: string
  byte_length: number
  content_type: string
  created_at: string
}

interface SharedPhotoManifest {
  project_id: string
  assets: SharedPhotoAsset[]
  can_upload: boolean
}

export interface FieldPhotoSyncResult {
  uploaded: number
  downloaded: number
  already_shared: number
  missing: number
  conflicts: string[]
  can_upload: boolean
}

const activeSyncsByProject = new Map<string, Promise<FieldPhotoSyncResult>>()

function collaborationUrl(projectId: string, suffix = ''): string {
  return `/api/collaboration/projects/${encodeURIComponent(projectId)}/media${suffix}`
}

async function readError(response: Response): Promise<string> {
  const payload: unknown = await response.json().catch(() => null)
  if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') return payload.error
  return `Gateway ตอบกลับ HTTP ${response.status}`
}

function decodeImageDataUrl(dataUrl: string): { contentType: string; bytes: Uint8Array<ArrayBuffer> } {
  const match = DATA_URL_PATTERN.exec(dataUrl)
  if (!match) throw new Error('รองรับเฉพาะรูป JPEG, PNG, WebP, GIF และ AVIF ที่เข้ารหัสเป็น base64')
  let binary: string
  try { binary = atob(match[2]) } catch { throw new Error('ข้อมูลรูปถ่ายในอุปกรณ์ไม่ใช่ base64 ที่ถูกต้อง') }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  if (!bytes.length || bytes.byteLength > MAX_ASSET_BYTES) throw new Error('รูปถ่ายต้องมีขนาดไม่เกิน 20 MB')
  return { contentType: match[1].toLowerCase(), bytes }
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
}

function encodeImageDataUrl(contentType: string, bytes: Uint8Array<ArrayBuffer>): string {
  let binary = ''
  const chunkSize = 32_768
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)))
  }
  return `data:${contentType};base64,${btoa(binary)}`
}

function validateManifest(value: unknown, projectId: string): SharedPhotoManifest {
  if (!value || typeof value !== 'object' || !('project_id' in value) || value.project_id !== projectId
    || !('assets' in value) || !Array.isArray(value.assets) || value.assets.length > 500
    || !('can_upload' in value) || typeof value.can_upload !== 'boolean')
    throw new Error('Gateway ส่ง photo manifest ที่ไม่ถูกต้อง')
  const assets: SharedPhotoAsset[] = []
  const seen = new Set<string>()
  for (const item of value.assets) {
    if (!item || typeof item !== 'object' || !('asset_id' in item) || typeof item.asset_id !== 'string'
      || !ASSET_UUID_PATTERN.test(item.asset_id) || seen.has(item.asset_id.toLowerCase())
      || !('sha256' in item) || typeof item.sha256 !== 'string' || !SHA256_PATTERN.test(item.sha256)
      || !('byte_length' in item) || typeof item.byte_length !== 'number' || !Number.isInteger(item.byte_length)
      || item.byte_length < 1 || item.byte_length > MAX_ASSET_BYTES
      || !('content_type' in item) || typeof item.content_type !== 'string'
      || !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(item.content_type)
      || !('created_at' in item) || typeof item.created_at !== 'string')
      throw new Error('Gateway ส่งข้อมูลรูปถ่ายใน manifest ที่ไม่ถูกต้อง')
    seen.add(item.asset_id.toLowerCase())
    assets.push(item as SharedPhotoAsset)
  }
  return { project_id: value.project_id, assets, can_upload: value.can_upload }
}

/** Reuse an active sync so the field panel and background sync cannot upload the same asset twice. */
export function syncFieldPhotoAssets(project: ProjectDocument, token: string): Promise<FieldPhotoSyncResult> {
  const projectId = project.project.id
  const active = activeSyncsByProject.get(projectId)
  if (active) return active
  const sync = syncFieldPhotoAssetsOnce(project, token).finally(() => {
    if (activeSyncsByProject.get(projectId) === sync) activeSyncsByProject.delete(projectId)
  })
  activeSyncsByProject.set(projectId, sync)
  return sync
}

/** Exchange immutable photo bytes for this project's photo inspection UUIDs; model data stays local/offline-first. */
async function syncFieldPhotoAssetsOnce(project: ProjectDocument, token: string): Promise<FieldPhotoSyncResult> {
  const projectId = project.project.id
  const referencedIds = [...new Set((project.field_photo_inspections ?? []).map(item => item.image_asset_id))]
  if (referencedIds.length > 500 || referencedIds.some(id => !ASSET_UUID_PATTERN.test(id))) throw new Error('UUID รูปตรวจหน้างานในโครงการไม่ถูกต้อง')
  const localAssets = await listLocalFieldPhotoAssets(projectId)
  const manifestResponse = await fetch(collaborationUrl(projectId), {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!manifestResponse.ok) throw new Error(await readError(manifestResponse))
  const manifest = validateManifest(await manifestResponse.json().catch(() => null), projectId)
  const remoteById = new Map(manifest.assets.map(asset => [asset.asset_id.toLowerCase(), asset]))
  const result: FieldPhotoSyncResult = { uploaded: 0, downloaded: 0, already_shared: 0, missing: 0, conflicts: [], can_upload: manifest.can_upload }
  const toDownload: SharedPhotoAsset[] = []
  const referenced = new Set(referencedIds.map(id => id.toLowerCase()))
  let expectedLocalPhotoChars = Object.values(localAssets).reduce((total, value) => total + value.length, 0)

  for (const assetId of referencedIds) {
    const localDataUrl = localAssets[assetId]
    const remote = remoteById.get(assetId.toLowerCase())
    if (localDataUrl) {
      const decoded = decodeImageDataUrl(localDataUrl)
      const digest = await sha256(decoded.bytes)
      if (remote) {
        if (remote.sha256 !== digest || remote.byte_length !== decoded.bytes.byteLength || remote.content_type !== decoded.contentType) {
          result.conflicts.push(assetId)
        } else result.already_shared += 1
        continue
      }
      if (!manifest.can_upload) {
        result.missing += 1
        continue
      }
      const response = await fetch(collaborationUrl(projectId, `/${encodeURIComponent(assetId)}`), {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': decoded.contentType, 'X-Content-SHA256': digest },
        body: decoded.bytes.buffer,
      })
      if (response.status === 409) {
        result.conflicts.push(assetId)
        continue
      }
      if (!response.ok) throw new Error(await readError(response))
      result.uploaded += 1
      continue
    }
    if (remote) toDownload.push(remote)
    else result.missing += 1
  }

  const projectedChars = toDownload.reduce((total, asset) => total + 4 * Math.ceil(asset.byte_length / 3) + asset.content_type.length + 32, expectedLocalPhotoChars)
  if (projectedChars > MAX_LOCAL_PHOTO_CHARS) throw new Error('พื้นที่รูปถ่ายในอุปกรณ์ไม่พอสำหรับไฟล์ที่ทีมแชร์')

  for (const asset of toDownload) {
    if (!referenced.has(asset.asset_id.toLowerCase())) continue
    const response = await fetch(collaborationUrl(projectId, `/${encodeURIComponent(asset.asset_id)}`), {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(await readError(response))
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength !== asset.byte_length || await sha256(bytes) !== asset.sha256
      || response.headers.get('X-Content-SHA256')?.toLowerCase() !== asset.sha256
      || response.headers.get('Content-Type')?.split(';', 1)[0].toLowerCase() !== asset.content_type) {
      throw new Error(`ตรวจสอบความสมบูรณ์ของรูป ${asset.asset_id} จาก gateway ไม่ผ่าน`)
    }
    const dataUrl = encodeImageDataUrl(asset.content_type, bytes)
    await saveLocalFieldPhotoAssets(projectId, [{ asset_id: asset.asset_id, data_url: dataUrl }])
    expectedLocalPhotoChars += dataUrl.length
    result.downloaded += 1
  }
  if (result.downloaded) notifyLocalFieldPhotoAssetsChanged()
  return result
}
