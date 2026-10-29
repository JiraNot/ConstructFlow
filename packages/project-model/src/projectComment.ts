/** Model-linked team note stored in the canonical project document. Coordinates are millimeters. */
export interface ProjectCommentReply {
  id: string
  author: string
  body: string
  created_at: string
}

export interface ProjectComment {
  id: string
  level_id: string
  point_mm: [number, number]
  /** Optional stable UUID of the model object discussed by this thread. */
  object_id?: string
  author: string
  body: string
  status: 'open' | 'resolved'
  /** Timestamp of the last explicit status change; older project files fall back to created_at. */
  status_updated_at?: string
  replies: ProjectCommentReply[]
  created_at: string
  updated_at: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function validateTimestamp(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length > 80 || !Number.isFinite(Date.parse(value)))
    throw new Error(`Project comment ${field} must be an ISO timestamp`)
}

function validateText(value: unknown, field: string, maximum: number): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum)
    throw new Error(`Project comment ${field} must contain 1–${maximum} characters`)
}

export function validateProjectComments(value: unknown): asserts value is ProjectComment[] {
  if (!Array.isArray(value) || value.length > 2000) throw new Error('Project comments must contain at most 2000 threads')
  const ids = new Set<string>()
  for (const [index, raw] of value.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Project comment ${index + 1} is invalid`)
    const comment = raw as ProjectComment
    if (typeof comment.id !== 'string' || !UUID_PATTERN.test(comment.id) || ids.has(comment.id))
      throw new Error(`Project comment ${index + 1} requires a unique persistent UUID`)
    ids.add(comment.id)
    if (typeof comment.level_id !== 'string' || !UUID_PATTERN.test(comment.level_id))
      throw new Error(`Project comment ${comment.id} requires a level UUID`)
    if (!Array.isArray(comment.point_mm) || comment.point_mm.length !== 2
      || comment.point_mm.some(coordinate => typeof coordinate !== 'number' || !Number.isFinite(coordinate)))
      throw new Error(`Project comment ${comment.id} requires a finite plan point in millimeters`)
    if (comment.object_id !== undefined && (typeof comment.object_id !== 'string' || !UUID_PATTERN.test(comment.object_id)))
      throw new Error(`Project comment ${comment.id} requires a model object UUID`)
    validateText(comment.author, 'author', 120)
    validateText(comment.body, 'message', 3000)
    if (!['open', 'resolved'].includes(comment.status)) throw new Error(`Project comment ${comment.id} has an invalid status`)
    validateTimestamp(comment.created_at, 'created_at')
    validateTimestamp(comment.updated_at, 'updated_at')
    if (comment.status_updated_at !== undefined) validateTimestamp(comment.status_updated_at, 'status_updated_at')
    if (!Array.isArray(comment.replies) || comment.replies.length > 100) throw new Error(`Project comment ${comment.id} may contain at most 100 replies`)
    const replyIds = new Set<string>()
    for (const [replyIndex, reply] of comment.replies.entries()) {
      if (!reply || typeof reply !== 'object' || Array.isArray(reply)
        || typeof reply.id !== 'string' || !UUID_PATTERN.test(reply.id) || replyIds.has(reply.id))
        throw new Error(`Project comment ${comment.id} reply ${replyIndex + 1} requires a unique UUID`)
      replyIds.add(reply.id)
      validateText(reply.author, 'reply author', 120)
      validateText(reply.body, 'reply', 2000)
      validateTimestamp(reply.created_at, 'reply timestamp')
    }
  }
}

function statusTimestamp(comment: ProjectComment): number {
  return Date.parse(comment.status_updated_at ?? comment.created_at)
}

function laterTimestamp(left: string, right: string): string {
  return Date.parse(left) >= Date.parse(right) ? left : right
}

/** Merge append-only comment threads from offline devices without dropping replies or newer status changes. */
export function mergeProjectComments(local: ProjectComment[], remote: ProjectComment[]): ProjectComment[] {
  const merged = new Map(local.map(comment => [comment.id, structuredClone(comment)]))
  for (const incoming of remote) {
    const existing = merged.get(incoming.id)
    if (!existing) {
      merged.set(incoming.id, structuredClone(incoming))
      continue
    }
    const replies = new Map(existing.replies.map(reply => [reply.id, reply]))
    for (const reply of incoming.replies) if (!replies.has(reply.id)) replies.set(reply.id, structuredClone(reply))
    const currentStatusTime = statusTimestamp(existing)
    const incomingStatusTime = statusTimestamp(incoming)
    const incomingWins = incomingStatusTime > currentStatusTime
      || (incomingStatusTime === currentStatusTime && incoming.status === 'resolved' && existing.status !== 'resolved')
    const statusUpdatedAt = incomingWins
      ? incoming.status_updated_at ?? incoming.created_at
      : existing.status_updated_at ?? existing.created_at
    merged.set(existing.id, {
      ...existing,
      status: incomingWins ? incoming.status : existing.status,
      status_updated_at: statusUpdatedAt,
      replies: [...replies.values()].sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at) || left.id.localeCompare(right.id)),
      updated_at: laterTimestamp(existing.updated_at, incoming.updated_at),
    })
  }
  return [...merged.values()].sort((left, right) => left.id.localeCompare(right.id))
}
