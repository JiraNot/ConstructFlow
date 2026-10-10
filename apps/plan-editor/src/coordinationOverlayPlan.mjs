// Coordination Overlay Planner (pure, renderer-independent)
//
// The clash engine returns world-space (millimetre) highlight markers plus the measured distance
// or clearance shortfall and a ready-to-build fix. This module turns those into screen primitives
// for any viewport: the plan canvas projects x/y, an elevation projects a horizontal axis/z.
// Keeping it free of canvas and React code is what lets the output be asserted directly.

export const COORDINATION_SEVERITY_STYLE = {
  hard: { stroke: '#ef4444', fill: 'rgba(239, 68, 68, 0.18)', badge: 'rgba(220, 38, 38, 0.92)', label_th: 'ชนทับ (Hard)' },
  clearance: { stroke: '#f59e0b', fill: 'rgba(245, 158, 11, 0.18)', badge: 'rgba(217, 119, 6, 0.92)', label_th: 'ระยะไม่พอ (Clearance)' },
  soft: { stroke: '#0ea5e9', fill: 'rgba(14, 165, 233, 0.15)', badge: 'rgba(2, 132, 199, 0.92)', label_th: 'ควรตรวจ (Soft)' },
}

const SEVERITY_ORDER = { hard: 0, clearance: 1, soft: 2 }

const mm = value => `${Math.round(value)} mm`

/** One short Thai line describing what was measured, for the on-canvas dimension tag. */
export function coordinationMeasureText(finding) {
  const interaction = finding.interaction
  if (interaction.kind === 'host_conflict') return 'host ถูกกำหนดรื้อถอนแล้ว'
  if (interaction.penetration_mm > 0) return `ทับกัน ${mm(interaction.penetration_mm)}`
  const required = interaction.required_clearance_mm
  const distance = interaction.distance_mm
  return required === null || required === undefined
    ? `ระยะ ${mm(distance)}`
    : `ระยะ ${mm(distance)} · ต้องการ ${mm(required)}`
}

/** The suggested fix in one line, or the review note when the engine cannot compute a shift. */
export function coordinationFixText(finding) {
  const suggestion = finding.suggestion ?? {}
  if (suggestion.recommended_mm !== null && suggestion.recommended_mm !== undefined) return suggestion.phrase_th
  return suggestion.review_note_th ?? 'ต้องให้วิศวกรตรวจสอบแนวทางแก้ไข'
}

export function coordinationFindingsForObject(findings, objectId) {
  return findings.filter(finding => finding.objects.some(object => object.object_id === objectId))
}

function selectFindings(findings, options) {
  const allowedSeverities = options.severities ? new Set(options.severities) : null
  const wanted = options.objectIds?.length ? new Set(options.objectIds) : null
  const filtered = findings.filter(finding =>
    (!allowedSeverities || allowedSeverities.has(finding.severity))
    && (!wanted || finding.objects.some(object => wanted.has(object.object_id))))
  const ordered = [...filtered].sort((left, right) =>
    SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] || String(left.id).localeCompare(String(right.id)))
  return options.maxFindings !== undefined ? ordered.slice(0, Math.max(0, options.maxFindings)) : ordered
}

/**
 * Convert findings into screen-space primitives. Every marker is projected here so the plan
 * canvas, the elevation canvas and the acceptance script all share one implementation.
 */
export function planCoordinationOverlay(findings, options) {
  const { project } = options
  const primitives = []
  const showLabels = options.showLabels ?? true
  for (const finding of selectFindings(findings, options)) {
    let badgeAnchor = null
    let fallbackAnchor = null
    for (const marker of finding.highlight) {
      if (marker.kind === 'segment' && marker.from && marker.to) {
        const [x1, y1] = project(marker.from)
        const [x2, y2] = project(marker.to)
        primitives.push({ kind: 'measure', severity: finding.severity, x1, y1, x2, y2, text: coordinationMeasureText(finding) })
        continue
      }
      if (marker.kind !== 'box' || !marker.min || !marker.max || marker.tone === 'measure') continue
      const [x1, y1] = project(marker.min)
      const [x2, y2] = project(marker.max)
      const x = Math.min(x1, x2)
      const y = Math.min(y1, y2)
      primitives.push({
        kind: 'rect',
        tone: marker.tone,
        severity: finding.severity,
        x,
        y,
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      })
      if (marker.tone === 'impact') badgeAnchor = { x: Math.max(x1, x2), y }
      else if (!fallbackAnchor) fallbackAnchor = { x, y }
    }
    if (!showLabels) continue
    const anchor = badgeAnchor ?? fallbackAnchor ?? { x: 0, y: 0 }
    const lines = [`${COORDINATION_SEVERITY_STYLE[finding.severity].label_th} · ${finding.rule_id}`, coordinationFixText(finding)]
    const width = Math.max(...lines.map(line => Math.min(46, line.length))) * 6.4 + 14
    primitives.push({ kind: 'badge', severity: finding.severity, x: anchor.x, y: anchor.y, width, height: 12 + lines.length * 13, lines })
  }
  return primitives
}
