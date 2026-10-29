import type { ApplyProjectHistoryDeltaChange, ApplyProjectHistoryDeltaInput } from '@constructflow/command-schema'
import type { ProjectDocument, SmartObject } from '@constructflow/project-model'

const historyDeltaFields = new Set([
  'families', 'proposal_drafts', 'change_orders', 'invoices', 'takeoff_rates', 'field_photo_inspections',
  'field_forms', 'project', 'levels', 'phases', 'types', 'relationships', 'constraints',
  'drawing_settings', 'coordination_settings', 'rainwater_design', 'site_survey', 'legal_metadata',
  'underlays', 'view_settings',
])

const MAX_HISTORY_DELTA_BYTES = 8_000_000
const MAX_HISTORY_DELTA_CHANGES = 5_000

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalValue(item)]))
  }
  return value
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) return left === right
  return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right))
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

/**
 * Build a replayable inverse/redo record from two adjacent editor history snapshots.
 * Model objects are addressed by persistent UUID; other changes are limited to named
 * ProjectDocument sections. This never serializes the whole document as a replacement.
 */
export function buildProjectHistoryDeltaInput(from: ProjectDocument, to: ProjectDocument): ApplyProjectHistoryDeltaInput {
  if (from.project.id !== to.project.id) throw new Error('History delta cannot cross project UUIDs')
  const changes: ApplyProjectHistoryDeltaChange[] = []
  const fromObjects = from.objects as Record<string, unknown>
  const toObjects = to.objects as Record<string, unknown>
  const objectIds = [...new Set([...Object.keys(fromObjects), ...Object.keys(toObjects)])].sort()
  for (const id of objectIds) {
    const expected_exists = hasOwn(fromObjects, id)
    const next_exists = hasOwn(toObjects, id)
    if (expected_exists === next_exists && sameValue(fromObjects[id], toObjects[id])) continue
    changes.push({
      target: 'object', id, expected_exists,
      ...(expected_exists ? { expected_value: structuredClone(fromObjects[id]) } : {}),
      next_exists, ...(next_exists ? { next_value: structuredClone(toObjects[id]) } : {}),
    })
  }

  const fromFields = from as unknown as Record<string, unknown>
  const toFields = to as unknown as Record<string, unknown>
  const handledFields = new Set([...historyDeltaFields, 'objects'])
  for (const field of new Set([...Object.keys(fromFields), ...Object.keys(toFields)])) {
    if (handledFields.has(field)) continue
    const expected_exists = hasOwn(fromFields, field) && fromFields[field] !== undefined
    const next_exists = hasOwn(toFields, field) && toFields[field] !== undefined
    if (expected_exists !== next_exists || !sameValue(fromFields[field], toFields[field])) {
      throw new Error(`History travel changes unsupported project section ${field}`)
    }
  }
  for (const field of [...historyDeltaFields].sort()) {
    const expected_exists = hasOwn(fromFields, field) && fromFields[field] !== undefined
    const next_exists = hasOwn(toFields, field) && toFields[field] !== undefined
    if (expected_exists === next_exists && sameValue(fromFields[field], toFields[field])) continue
    changes.push({
      target: 'field', field, expected_exists,
      ...(expected_exists ? { expected_value: structuredClone(fromFields[field]) } : {}),
      next_exists, ...(next_exists ? { next_value: structuredClone(toFields[field]) } : {}),
    })
  }

  if (!changes.length) throw new Error('History travel contains no serializable project changes')
  if (changes.length > MAX_HISTORY_DELTA_CHANGES) throw new Error('History travel changes too many project entities to sync safely')
  const input = { changes }
  const bytes = new TextEncoder().encode(JSON.stringify(input)).byteLength
  if (bytes > MAX_HISTORY_DELTA_BYTES) throw new Error('History travel delta is too large for live collaboration')
  return input
}

/** Command execution updates this metadata timestamp; compare all other state exactly. */
export function matchesProjectHistoryTarget(actual: ProjectDocument, target: ProjectDocument): boolean {
  const actualWithoutTimestamp = structuredClone(actual)
  const targetWithoutTimestamp = structuredClone(target)
  delete (actualWithoutTimestamp.project as unknown as Record<string, unknown>).updated_at
  delete (targetWithoutTimestamp.project as unknown as Record<string, unknown>).updated_at
  return sameValue(actualWithoutTimestamp, targetWithoutTimestamp)
}

/** Apply an atomic history delta after checking every before-value against the current model. */
export function applyProjectHistoryDelta(
  project: ProjectDocument,
  input: ApplyProjectHistoryDeltaInput,
): string[] {
  if (!Array.isArray(input?.changes) || input.changes.length < 1 || input.changes.length > MAX_HISTORY_DELTA_CHANGES) {
    throw new Error('History delta must contain between 1 and 5000 changes')
  }
  const updatedFields = project as unknown as Record<string, unknown>
  const seen = new Set<string>()
  const affectedObjectIds: string[] = []

  for (const change of input.changes) {
    if (!change || typeof change !== 'object' || typeof change.expected_exists !== 'boolean' || typeof change.next_exists !== 'boolean') {
      throw new Error('History delta change is malformed')
    }
    if ((change.expected_exists && !hasOwn(change, 'expected_value')) || (change.next_exists && !hasOwn(change, 'next_value'))) {
      throw new Error('History delta change is missing a required value')
    }

    if (change.target === 'object') {
      const id = change.id
      if (typeof id !== 'string' || !id.trim() || ['__proto__', 'prototype', 'constructor'].includes(id) || change.field !== undefined) {
        throw new Error('History delta object UUID is invalid')
      }
      const key = `object:${id}`
      if (seen.has(key)) throw new Error(`History delta repeats ${key}`)
      seen.add(key)
      const currentExists = hasOwn(project.objects, id)
      if (currentExists !== change.expected_exists || (currentExists && !sameValue(project.objects[id], change.expected_value))) {
        throw new Error(`History delta precondition failed for object ${id}`)
      }
      if (change.next_exists) {
        const nextObject = change.next_value as SmartObject | undefined
        if (!nextObject || typeof nextObject !== 'object' || nextObject.id !== id) throw new Error(`History delta object ${id} does not preserve its UUID`)
        project.objects[id] = structuredClone(nextObject)
      } else delete project.objects[id]
      affectedObjectIds.push(id)
      continue
    }

    if (change.target !== 'field' || typeof change.field !== 'string' || !historyDeltaFields.has(change.field) || change.id !== undefined) {
      throw new Error('History delta field is not allowed')
    }
    const field = change.field
    const key = `field:${field}`
    if (seen.has(key)) throw new Error(`History delta repeats ${key}`)
    seen.add(key)
    const currentExists = hasOwn(updatedFields, field)
    if (currentExists !== change.expected_exists || (currentExists && !sameValue(updatedFields[field], change.expected_value))) {
      throw new Error(`History delta precondition failed for project section ${field}`)
    }
    if (change.next_exists) updatedFields[field] = structuredClone(change.next_value)
    else delete updatedFields[field]
  }

  return affectedObjectIds
}
