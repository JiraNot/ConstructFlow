// Coordination report hook — one place where the editor asks the clash engine "what is wrong?".
//
// The engine reads `project.coordination_settings` itself, so project-level rule overrides and
// construction slack travel with the .cfproj file and never need separate UI plumbing.

import { useEffect, useState } from 'react'
import type { CoordinationReport } from '@constructflow/clash-engine'
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
  const [state, setState] = useState<CoordinationReportState>({ report: null, error: null })

  useEffect(() => {
    let current = true
    if (!enabled) {
      setState({ report: null, error: null })
      return () => { current = false }
    }

    setState({ report: null, error: null })
    void import('@constructflow/clash-engine').then(({ runCoordination }) => {
      if (current) setState({ report: runCoordination(project), error: null })
    }).catch(error => {
      if (!current) return
      console.warn('Coordination error:', error)
      setState({ report: null, error: error instanceof Error ? error.message : String(error) })
    })
    return () => { current = false }
  }, [project, enabled])

  return enabled ? state : { report: null, error: null }
}
