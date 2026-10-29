import {
  createLocalCompanyLibraryBundle,
  getLocalCollaborationToken,
  importLocalCompanyLibraryBundle,
  mergeLocalCompanyLibraryBundles,
  type LocalCompanyLibraryBundle,
} from './projectAutosave.js'

export interface CompanyLibrarySyncResult {
  version: number
  scope: 'company' | 'project'
  companyId?: string
  imported: boolean
  published: boolean
  canWrite: boolean
}

interface SharedLibraryResponse {
  company_id?: string
  version: number
  can_write: boolean
  bundle: LocalCompanyLibraryBundle | null
}

async function readResponse(response: Response): Promise<Record<string, unknown>> {
  let payload: unknown
  try { payload = await response.json() } catch { payload = null }
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) return payload as Record<string, unknown>
  throw new Error(`เซิร์ฟเวอร์ตอบกลับ HTTP ${response.status} โดยไม่มีข้อมูลที่อ่านได้`)
}

function getError(payload: Record<string, unknown>, status: number): string {
  return typeof payload.error === 'string' ? payload.error : `เซิร์ฟเวอร์ตอบกลับ HTTP ${status}`
}

async function readSharedLibraryAt(endpoint: string, token: string): Promise<SharedLibraryResponse> {
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return parseSharedLibraryResponse(response)
}

async function resolveSharedLibrary(projectId: string, token: string) {
  const companyEndpoint = '/api/collaboration/company-library'
  const companyResponse = await fetch(companyEndpoint, { headers: { Authorization: `Bearer ${token}` } })
  if (companyResponse.status !== 403 && companyResponse.status !== 404) {
    const shared = await parseSharedLibraryResponse(companyResponse)
    if (typeof shared.company_id !== 'string' || !shared.company_id) throw new Error('Company Library ระดับบริษัทไม่มีรหัสบริษัท')
    return { endpoint: companyEndpoint, scope: 'company' as const, companyId: shared.company_id, shared }
  }

  const endpoint = `/api/collaboration/projects/${encodeURIComponent(projectId)}/company-library`
  const shared = await readSharedLibraryAt(endpoint, token)
  return { endpoint, scope: 'project' as const, companyId: undefined, shared }
}

async function parseSharedLibraryResponse(response: Response): Promise<SharedLibraryResponse> {
  const payload = await readResponse(response)
  if (!response.ok) throw new Error(getError(payload, response.status))
  if (!Number.isInteger(payload.version) || (payload.version as number) < 0 || typeof payload.can_write !== 'boolean'
    || (payload.bundle !== null && (typeof payload.bundle !== 'object' || Array.isArray(payload.bundle)))) {
    throw new Error('ข้อมูล Company Library ที่แชร์จากทีมมีรูปแบบไม่ถูกต้อง')
  }
  return payload as unknown as SharedLibraryResponse
}

/** Pull and merge first, then publish using optimistic version checks so concurrent editors cannot overwrite each other. */
export async function syncCompanyLibraryWithProject(projectId: string): Promise<CompanyLibrarySyncResult> {
  const settings = await getLocalCollaborationToken()
  if (!settings?.token) throw new Error('ตั้งค่า Collaboration token ก่อน · เปิดประวัติเวอร์ชันแล้วเลือก “ซิงค์กับทีม”')

  const resolved = await resolveSharedLibrary(projectId, settings.token)
  let imported = false
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const shared = attempt === 0 ? resolved.shared : await readSharedLibraryAt(resolved.endpoint, settings.token)
    let merged = await createLocalCompanyLibraryBundle()
    if (shared.bundle) {
      merged = mergeLocalCompanyLibraryBundles(merged, shared.bundle, shared.can_write ? 'local' : 'remote')
      await importLocalCompanyLibraryBundle(merged)
      imported = true
    }
    if (!shared.can_write) return { version: shared.version, scope: resolved.scope, companyId: resolved.companyId, imported, published: false, canWrite: false }

    const response = await fetch(resolved.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${settings.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_version: shared.version, bundle: merged }),
    })
    const payload = await readResponse(response)
    if (response.status === 409) continue
    if (!response.ok) throw new Error(getError(payload, response.status))
    if (!Number.isInteger(payload.version) || (payload.version as number) < 1) throw new Error('เซิร์ฟเวอร์บันทึก Company Library แต่ไม่ส่งเลขเวอร์ชันกลับมา')
    return { version: payload.version as number, scope: resolved.scope, companyId: resolved.companyId, imported, published: true, canWrite: true }
  }
  throw new Error('มีสมาชิกแก้ Company Library พร้อมกันหลายครั้ง · ข้อมูลในเครื่องยังอยู่ ให้กดซิงค์อีกครั้ง')
}
