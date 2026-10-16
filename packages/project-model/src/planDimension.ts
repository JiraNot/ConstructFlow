import type { Phase } from './types.js'

/** User-authored aligned dimension in model millimeters; its value is always calculated. */
export interface PlanDimension {
  id: string
  level_id: string
  created_phase: Phase
  start_mm: [number, number]
  end_mm: [number, number]
  offset_mm: number
}

export function validatePlanDimension(value: unknown): asserts value is PlanDimension {
  if (!value || typeof value !== 'object') throw new Error('Invalid plan dimension')
  const dimension = value as PlanDimension
  if (typeof dimension.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(dimension.id)) throw new Error('Plan dimension requires a persistent UUID')
  if (typeof dimension.level_id !== 'string' || !dimension.level_id.trim()) throw new Error('Plan dimension requires a level')
  if (!['existing', 'demolition', 'new_construction'].includes(dimension.created_phase)) throw new Error('Plan dimension requires a valid phase')
  for (const point of [dimension.start_mm, dimension.end_mm]) if (!Array.isArray(point) || point.length !== 2 || point.some(n => typeof n !== 'number' || !Number.isFinite(n))) throw new Error('Plan dimension points must be finite XY coordinates')
  if (Math.hypot(dimension.end_mm[0] - dimension.start_mm[0], dimension.end_mm[1] - dimension.start_mm[1]) < 1) throw new Error('Plan dimension must be at least 1 mm long')
  if (typeof dimension.offset_mm !== 'number' || !Number.isFinite(dimension.offset_mm)) throw new Error('Plan dimension offset must be finite')
}
