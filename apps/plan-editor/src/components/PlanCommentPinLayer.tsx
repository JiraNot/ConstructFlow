import type { ProjectComment } from '@constructflow/project-model'
import { worldToScreen, type ViewportState } from '../viewport/viewportTransform.js'

export interface PlanCommentPinLayerProps {
  viewport: ViewportState
  activeLevelId: string
  comments: readonly ProjectComment[]
  onOpen: (commentId: string) => void
}

/** Model-linked discussion pins; their source of truth remains the project document/CommandBus. */
export function PlanCommentPinLayer({ viewport, activeLevelId, comments, onOpen }: PlanCommentPinLayerProps) {
  const visible = comments.filter(comment => comment.level_id === activeLevelId)
  if (!visible.length) return null
  return <svg aria-label="หมุดความเห็นบนแปลน" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'hidden', pointerEvents: 'none', zIndex: 13 }}>
    {visible.map((comment, index) => {
      const [x, y] = worldToScreen(comment.point_mm, viewport)
      const resolved = comment.status === 'resolved'
      return <g key={comment.id} data-project-comment-pin={comment.id} role="button" tabIndex={0}
        aria-label={`${resolved ? 'ปิดแล้ว' : 'ความเห็น'}: ${comment.body.slice(0, 100)}`}
        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
        onPointerDown={event => { event.stopPropagation(); onOpen(comment.id) }}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(comment.id) } }}>
        <title>{`${comment.author}: ${comment.body}`}</title>
        <path d={`M${x} ${y + 16} L${x - 10} ${y + 3} A13 13 0 1 1 ${x + 10} ${y + 3} Z`}
          fill={resolved ? '#64748b' : '#7c3aed'} stroke="#fff" strokeWidth="2" />
        <circle cx={x} cy={y - 1} r="6.5" fill="#fff" />
        <text x={x} y={y + 2} textAnchor="middle" fontSize="8" fontWeight="700" fill={resolved ? '#475569' : '#6d28d9'}>{index + 1}</text>
      </g>
    })}
  </svg>
}
