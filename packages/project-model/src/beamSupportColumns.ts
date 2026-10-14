import type { BeamModuleData } from './types.js'

/** Read canonical interior supports while accepting legacy projects with one middle support. */
export function getBeamIntermediateSupportColumnIds(data: Pick<BeamModuleData, 'middle_support_column_id' | 'intermediate_support_column_ids'>): string[] {
  const values = [
    ...(Array.isArray(data.intermediate_support_column_ids) ? data.intermediate_support_column_ids : []),
    ...(typeof data.middle_support_column_id === 'string' ? [data.middle_support_column_id] : []),
  ]
  return [...new Set(values.filter((id): id is string => typeof id === 'string' && id.length > 0))]
}
