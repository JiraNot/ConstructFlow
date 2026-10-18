import React, { lazy, Suspense } from 'react'
import type { PlanCanvasAuthoringControlsProps } from './PlanCanvasAuthoringControlsContent.js'
import { toolNames } from './planCanvasToolNames.js'

const PlanCanvasAuthoringControlsContent = lazy(() =>
  import('./PlanCanvasAuthoringControlsContent.js').then(module => ({ default: module.PlanCanvasAuthoringControlsContent })),
)

export type { PlanCanvasAuthoringControlsProps } from './PlanCanvasAuthoringControlsContent.js'

/** Keep the compact control visible while deferring detailed drawing options until requested. */
export const PlanCanvasAuthoringControls: React.FC<PlanCanvasAuthoringControlsProps> = props => {
  const { activeTool, activeTypeMarks, open, onOpenChange } = props
  const activeTypeMark = activeTypeMarks[activeTool]

  return <div className={`cf-authoring-controls ${open ? 'is-open' : 'is-collapsed'}`} onPointerDown={event => event.stopPropagation()}>
    <button type="button" className="cf-authoring-controls-toggle" aria-expanded={open} onClick={() => onOpenChange(!open)}>
      <span>ตัวเลือกการวาด · {toolNames[activeTool] ?? activeTool}{activeTypeMark ? ` · ${activeTypeMark}` : ''}</span>
      <span aria-hidden="true">{open ? 'ยุบ' : 'แสดง'}</span>
    </button>
    {open && <Suspense fallback={<div className="cf-authoring-controls-content" role="status">กำลังโหลดตัวเลือก…</div>}>
      <PlanCanvasAuthoringControlsContent {...props} />
    </Suspense>}
  </div>
}
