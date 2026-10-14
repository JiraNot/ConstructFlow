import { useCallback, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { SiteSurveyPoint } from '@constructflow/project-model'
import type { PlanCanvasProps } from './PlanCanvas.types.js'
import type { ToolType } from './Toolbar.js'
import type { ViewportState } from '../viewport/viewportTransform.js'
import { worldToScreen } from '../viewport/viewportTransform.js'
import { findNearestSurveyPoint } from './surveyPointPicking.mjs'

const EMPTY_SURVEY_POINTS: SiteSurveyPoint[] = []

interface UsePlanCanvasSurveySelectionOptions {
  project: PlanCanvasProps['project']
  activeTool: ToolType
  viewport: ViewportState
  onSelectObject: PlanCanvasProps['onSelectObject']
  onSelectionChange: PlanCanvasProps['onSelectionChange']
}

export function usePlanCanvasSurveySelection({
  project, activeTool, viewport, onSelectObject, onSelectionChange,
}: UsePlanCanvasSurveySelectionOptions) {
  const [selectedSurveyPointId, setSelectedSurveyPointId] = useState<string | null>(null)
  const surveyPoints = project.site_survey?.points ?? EMPTY_SURVEY_POINTS
  const selectedSurveyPoint: SiteSurveyPoint | null = surveyPoints.find(point => point.id === selectedSurveyPointId) ?? null
  const projectedCandidates = useMemo(() => surveyPoints.map(point => ({
    id: point.id,
    point: worldToScreen([point.x_mm, point.y_mm], viewport),
  })), [surveyPoints, viewport])

  const onPointerDown = useCallback((
    event: ReactPointerEvent<HTMLCanvasElement>,
    continueCanvasPointerDown?: (event: ReactPointerEvent<HTMLCanvasElement>) => void,
  ) => {
    if (event.button === 0 && !event.shiftKey && activeTool === 'select' && surveyPoints.length > 0) {
      const rect = event.currentTarget.getBoundingClientRect()
      const point: [number, number] = [event.clientX - rect.left, event.clientY - rect.top]
      const nearestId = findNearestSurveyPoint(point, projectedCandidates)
      if (nearestId) {
        event.preventDefault()
        event.stopPropagation()
        setSelectedSurveyPointId(nearestId)
        onSelectionChange?.([], null)
        onSelectObject(null)
        return
      }
    }

    setSelectedSurveyPointId(null)
    continueCanvasPointerDown?.(event)
  }, [activeTool, onSelectObject, onSelectionChange, projectedCandidates, surveyPoints.length])
  const dismissSurveyPoint = useCallback(() => setSelectedSurveyPointId(null), [])

  return {
    selectedSurveyPoint,
    dismissSurveyPoint,
    onPointerDown,
  }
}
