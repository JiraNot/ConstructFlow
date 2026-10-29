import type { CommandEnvelope, ProjectCommandTransaction } from '@constructflow/command-schema'

export interface LiveProjectCommandTransaction extends ProjectCommandTransaction {
  source_device_id: string
  base_sequence: number
  sequence: number
  project_fingerprint?: string
}

export interface LiveProjectCommandSnapshot {
  project_id: string
  transactions: LiveProjectCommandTransaction[]
  cursor: number
  head_sequence: number
  has_more?: boolean
  joined?: boolean
  reset_required?: boolean
  can_write: boolean
  head_fingerprint?: string
}

export interface AcceptedProjectCommandTransaction {
  transaction_id: string
  sequence: number
  deduplicated: boolean
}

export class ProjectCommandSyncError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ProjectCommandSyncError'
    this.status = status
  }
}

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  let payload: unknown
  try { payload = await response.json() } catch { payload = null }
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `เซิร์ฟเวอร์ตอบกลับ HTTP ${response.status}`
    throw new ProjectCommandSyncError(message, response.status)
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('ข้อมูลซิงก์คำสั่งจากเซิร์ฟเวอร์ไม่ถูกต้อง')
  return payload as Record<string, unknown>
}

function isEnvelope(value: unknown, projectId: string): value is CommandEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<CommandEnvelope>
  return typeof candidate.command_id === 'string' && typeof candidate.name === 'string'
    && candidate.project_id === projectId && candidate.version === 1
    && typeof candidate.timestamp === 'string' && !!candidate.actor && typeof candidate.actor === 'object'
    && !!candidate.input && typeof candidate.input === 'object' && !Array.isArray(candidate.input)
}

export async function pullProjectCommandTransactions(
  projectId: string,
  token: string,
  cursor: number | null,
  joinAtHead = false,
): Promise<LiveProjectCommandSnapshot> {
  const query = joinAtHead || cursor === null ? '?join=1' : `?after=${encodeURIComponent(String(cursor))}`
  const endpoint = `/api/collaboration/projects/${encodeURIComponent(projectId)}/commands${query}`
  const payload = await parseResponse(await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } }))
  if (payload.project_id !== projectId || !Array.isArray(payload.transactions)
    || !Number.isSafeInteger(payload.cursor) || !Number.isSafeInteger(payload.head_sequence)) {
    throw new Error('ลำดับคำสั่งโครงการจากเซิร์ฟเวอร์ไม่ถูกต้อง')
  }
  if (payload.head_fingerprint !== undefined
    && (typeof payload.head_fingerprint !== 'string' || !/^\d{1,12}:[0-9a-f]{16}$/i.test(payload.head_fingerprint))) {
    throw new Error('fingerprint สถานะโครงการจากเซิร์ฟเวอร์ไม่ถูกต้อง')
  }
  const transactions: LiveProjectCommandTransaction[] = []
  for (const item of payload.transactions) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('พบ transaction ที่มีรูปแบบไม่ถูกต้อง')
    const candidate = item as Record<string, unknown>
    if (typeof candidate.transaction_id !== 'string' || typeof candidate.source_device_id !== 'string'
      || !Number.isSafeInteger(candidate.base_sequence) || !Number.isSafeInteger(candidate.sequence)
      || !Array.isArray(candidate.commands) || candidate.commands.length < 1
      || !candidate.commands.every(command => isEnvelope(command, projectId))) {
      throw new Error('พบ transaction ที่มีข้อมูลคำสั่งไม่ครบ')
    }
    if (candidate.project_fingerprint !== undefined
      && (typeof candidate.project_fingerprint !== 'string' || !/^\d{1,12}:[0-9a-f]{16}$/i.test(candidate.project_fingerprint))) {
      throw new Error('พบ fingerprint ของ transaction ที่ไม่ถูกต้อง')
    }
    transactions.push(candidate as unknown as LiveProjectCommandTransaction)
  }
  return {
    project_id: projectId,
    transactions,
    cursor: payload.cursor as number,
    head_sequence: payload.head_sequence as number,
    has_more: payload.has_more === true,
    joined: payload.joined === true,
    reset_required: payload.reset_required === true,
    can_write: payload.can_write === true,
    ...(typeof payload.head_fingerprint === 'string' ? { head_fingerprint: payload.head_fingerprint } : {}),
  }
}

export async function appendProjectCommandTransactions(
  projectId: string,
  token: string,
  transactions: ProjectCommandTransaction[],
): Promise<{ accepted: AcceptedProjectCommandTransaction[]; head_sequence: number }> {
  const endpoint = `/api/collaboration/projects/${encodeURIComponent(projectId)}/commands`
  const payload = await parseResponse(await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions }),
  }))
  if (payload.project_id !== projectId || !Array.isArray(payload.accepted) || !Number.isSafeInteger(payload.head_sequence)) {
    throw new Error('ผลการบันทึกลำดับคำสั่งจากเซิร์ฟเวอร์ไม่ถูกต้อง')
  }
  const accepted = payload.accepted.filter((item): item is AcceptedProjectCommandTransaction => !!item && typeof item === 'object'
    && typeof (item as AcceptedProjectCommandTransaction).transaction_id === 'string'
    && Number.isSafeInteger((item as AcceptedProjectCommandTransaction).sequence))
  if (accepted.length !== transactions.length) throw new Error('เซิร์ฟเวอร์ยืนยันจำนวน transaction ไม่ครบ')
  return { accepted, head_sequence: payload.head_sequence as number }
}
