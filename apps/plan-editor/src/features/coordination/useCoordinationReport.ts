// Coordination report hook — one place where the editor asks the clash engine "what is wrong?".
//
// The engine reads `project.coordination_settings` itself, so project-level rule overrides and
// construction slack travel with the .cfproj file and never need separate UI plumbing.

import { useMemo } from 'react'
import { runCoordination, type CoordinationReport } from '@constructflow/clash-engine'
import type { ProjectDocument } from '@constructflow/project-model'

export interface CoordinationReportState {
  report: CoordinationReport | null
  error: string | null
}

/**
 * Deterministic coordination report for the current document.
 * Pass `enabled: false` for heavy documents where the user has switched overlay review off.
 */
export function useCoordinationReport(project: ProjectDocument, enabled = true): CoordinationReportState {
  return useMemo(() => {
    if (!enabled) return { report: null, error: null }
    try {
      return { report: runCoordination(project), error: null }
    } catch (error) {
      console.warn('Coordination error:', error)
      return { report: null, error: error instanceof Error ? error.message : String(error) }
    }
  }, [project, enabled])
}
