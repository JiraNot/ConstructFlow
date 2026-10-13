export type SurveySourceStatus = 'measured' | 'assumed'

export interface SiteSurveyPoint {
  id: string
  name: string
  x_mm: number
  y_mm: number
  elevation_mm?: number
  source_status: SurveySourceStatus
  source_reference: string
}

export interface SiteSurveyBoundary {
  id: string
  name: string
  point_ids: string[]
}

/** Survey coordinates are canonical millimetres; source status remains explicit per point. */
export interface SiteSurvey {
  id: string
  name: string
  source_file: string
  coordinate_system: string
  imported_at: string
  points: SiteSurveyPoint[]
  boundaries: SiteSurveyBoundary[]
}

export function validateSiteSurvey(value: unknown): asserts value is SiteSurvey {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Site survey must be an object')
  const survey = value as SiteSurvey
  for (const [field, maximum] of [['id', 100], ['name', 120], ['source_file', 260], ['coordinate_system', 120]] as const) {
    const text = survey[field]
    if (typeof text !== 'string' || !text.trim() || text.length > maximum) throw new Error(`Site survey ${field} is required and must be at most ${maximum} characters`)
  }
  if (typeof survey.imported_at !== 'string' || !Number.isFinite(Date.parse(survey.imported_at))) throw new Error('Site survey imported_at must be a valid timestamp')
  if (!Array.isArray(survey.points) || survey.points.length === 0 || survey.points.length > 100_000) throw new Error('Site survey must contain 1 to 100000 points')
  const ids = new Set<string>()
  for (const point of survey.points) {
    if (!point || typeof point !== 'object' || typeof point.id !== 'string' || !point.id.trim() || point.id.length > 100 || ids.has(point.id)) throw new Error('Site survey point IDs must be non-empty and unique')
    if (typeof point.name !== 'string' || !point.name.trim() || point.name.length > 120) throw new Error(`Site survey point ${point.id} requires a name`)
    if (![point.x_mm, point.y_mm].every(Number.isFinite) || (point.elevation_mm !== undefined && !Number.isFinite(point.elevation_mm))) throw new Error(`Site survey point ${point.id} has invalid coordinates`)
    if (!['measured', 'assumed'].includes(point.source_status)) throw new Error(`Site survey point ${point.id} must be marked measured or assumed`)
    if (typeof point.source_reference !== 'string' || !point.source_reference.trim() || point.source_reference.length > 1000) throw new Error(`Site survey point ${point.id} requires source provenance`)
    ids.add(point.id)
  }
  if (!Array.isArray(survey.boundaries)) throw new Error('Site survey boundaries must be an array')
  const boundaryIds = new Set<string>()
  for (const boundary of survey.boundaries) {
    if (!boundary || typeof boundary !== 'object' || typeof boundary.id !== 'string' || !boundary.id.trim() || boundaryIds.has(boundary.id)) throw new Error('Site survey boundary IDs must be non-empty and unique')
    if (typeof boundary.name !== 'string' || !boundary.name.trim()) throw new Error(`Site survey boundary ${boundary.id} requires a name`)
    if (!Array.isArray(boundary.point_ids) || boundary.point_ids.length < 3 || boundary.point_ids.some(id => !ids.has(id)) || new Set(boundary.point_ids).size !== boundary.point_ids.length) throw new Error(`Site survey boundary ${boundary.id} must reference at least three unique survey points`)
    boundaryIds.add(boundary.id)
  }
}
