import type { ProjectDocument } from '@constructflow/project-model'
import { getLocalCollaborationToken } from '../projectAutosave.js'
import { getCanonicalProjectUuid } from '../projectUuid.js'

export type DrawingDownloadLink = {
  id: string
  display_name: string
  filename: string
  sha256: string
  byte_length: number
  status: 'active' | 'revoked' | 'expired'
  download_count: number
  created_by: string
  created_at: string
  expires_at: string
  last_downloaded_at: string | null
}

export type PublicDrawingDownload = {
  display_name: string
  filename: string
  sha256: string
  byte_length: number
  expires_at: string
}

type CreatedDrawingDownloadLink = Omit<DrawingDownloadLink, 'download_count' | 'created_by' | 'last_downloaded_at'> & { token: string }

async function collaborationToken(): Promise<string> {
  const settings = await getLocalCollaborationToken()
  if (!settings) throw new Error('ตั้งค่า Collaboration token ของทีมก่อนสร้างลิงก์ดาวน์โหลด')
  return settings.token
}

function linksEndpoint(projectId: string): string {
  return `/api/collaboration/projects/${encodeURIComponent(getCanonicalProjectUuid(projectId))}/drawing-download-links`
}

async function responseError(response: Response): Promise<Error> {
  const payload = await response.json().catch(() => null) as { error?: string } | null
  return new Error(payload?.error ?? `Gateway ตอบกลับ HTTP ${response.status}`)
}

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw await responseError(response)
  const payload = await response.json().catch(() => null)
  if (!payload || typeof payload !== 'object') throw new Error('Gateway ส่งข้อมูลตอบกลับไม่ถูกต้อง')
  return payload as T
}

export async function listProjectDrawingDownloadLinks(projectId: string): Promise<DrawingDownloadLink[]> {
  const token = await collaborationToken()
  const response = await fetch(linksEndpoint(projectId), { headers: { Authorization: `Bearer ${token}` }, credentials: 'same-origin' })
  const result = await responseJson<{ links: DrawingDownloadLink[] }>(response)
  return result.links
}

/** Compile and upload one immutable A3 vector drawing set, then return its one-time bearer URL. */
export async function createProjectDrawingDownloadLink(project: ProjectDocument, ttlDays: number): Promise<CreatedDrawingDownloadLink & { url: string }> {
  if (!Number.isInteger(ttlDays) || ttlDays < 1 || ttlDays > 30) throw new Error('อายุลิงก์ต้องอยู่ระหว่าง 1–30 วัน')
  const token = await collaborationToken()
  const { compilePermitDrawingSet, compilePermitPdf } = await import('@constructflow/sheet-engine')
  const drawingSet = compilePermitDrawingSet(project)
  const fontResponse = await fetch('/fonts/Sarabun-Regular.ttf', { credentials: 'same-origin' })
  if (!fontResponse.ok) throw new Error('โหลดฟอนต์ Sarabun สำหรับ PDF ไม่สำเร็จ')
  const pdfBytes = await compilePermitPdf(drawingSet, new Uint8Array(await fontResponse.arrayBuffer()))
  const displayName = `${project.project.name.replace(/[\u0000-\u001f/\\]/g, ' ').trim().slice(0, 100) || 'ConstructFlow'} · ชุดแบบ A3`
  const response = await fetch(linksEndpoint(project.project.id), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/pdf',
      'X-Download-Name': encodeURIComponent(displayName),
      'X-Link-Ttl-Days': String(ttlDays),
    },
    body: new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }),
    credentials: 'same-origin',
  })
  const result = await responseJson<CreatedDrawingDownloadLink>(response)
  return { ...result, url: `${window.location.origin}${window.location.pathname}#cf-drawing-download=${result.token}` }
}

export async function revokeProjectDrawingDownloadLink(projectId: string, linkId: string): Promise<void> {
  const token = await collaborationToken()
  const response = await fetch(`${linksEndpoint(projectId)}/${encodeURIComponent(linkId)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, credentials: 'same-origin',
  })
  await responseJson<{ status: string }>(response)
}

export async function getPublicDrawingDownload(token: string): Promise<PublicDrawingDownload> {
  const response = await fetch('/api/drawing-download', { headers: { Authorization: `Bearer ${token}` }, credentials: 'same-origin' })
  return responseJson<PublicDrawingDownload>(response)
}

export async function downloadPublicDrawing(token: string, expected: PublicDrawingDownload): Promise<void> {
  const response = await fetch('/api/drawing-download', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, credentials: 'same-origin',
  })
  if (!response.ok) throw await responseError(response)
  const contentType = response.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase()
  if (contentType !== 'application/pdf') throw new Error('ไฟล์ที่ได้รับไม่ใช่ PDF')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength !== expected.byte_length || String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') {
    throw new Error('ขนาดหรือรูปแบบ PDF ไม่ตรงกับไฟล์ที่แชร์')
  }
  const expectedHash = response.headers.get('X-Content-SHA256')
  if (!expectedHash || !crypto.subtle) throw new Error('เบราว์เซอร์นี้ตรวจสอบความถูกต้องของ PDF ไม่ได้')
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const actualHash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
  if (actualHash !== expectedHash || actualHash !== expected.sha256) throw new Error('ตรวจสอบ SHA-256 ของ PDF ไม่ผ่าน')
  const encodedFilename = response.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  let filename = expected.filename
  if (encodedFilename) {
    try { filename = decodeURIComponent(encodedFilename) } catch { /* use the validated metadata name */ }
  }
  if (/[\u0000-\u001f/\\]/.test(filename)) filename = expected.filename
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
