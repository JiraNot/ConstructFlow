import type { SiteSurvey } from '@constructflow/project-model'

export function importSiteSurveyCsv(source: string, options?: { fileName?: string; id?: string; importedAt?: string }): SiteSurvey
