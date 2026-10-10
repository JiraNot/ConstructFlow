// ConstructFlow Exact Coordination Engine (Pillar 6)
//
// Produces coordination findings — not "AABB overlap" notes. Each finding carries:
//   rule_id + severity + source/jurisdiction, the exact penetration or clearance shortfall in mm,
//   the involved objects with roles and phases, renderer-neutral highlight geometry for
//   plan/elevation/3D, and an actionable fix with the translation that satisfies the rule.
//
// Intentional relationships come from the central dependency graph: hosted/child pairs and
// sequential (demolition → new) phases are never reported as clashes.

import {
  buildDependencyGraph,
  type DependencyGraph,
  type Phase,
  type ProjectDocument,
} from '@constructflow/project-model'
import {
  boundsOf,
  contactBetweenSolids,
  supportOf,
  vec as V,
  type ContactResult,
  type ConvexSolid,
} from './exactContact.js'
import type { SpatialBounds, Vec3 } from './spatial.js'
import {
  buildCoordinationModel,
  type CoordinationModel,
  type CoordinationProxy,
  type CoordinationRole,
} from './coordinationModel.js'
import {
  DEFAULT_CONSTRUCTION_SLACK_MM,
  resolveRuleSet,
  THAI_COORDINATION_RULES_V1,
  type ClashRule,
  type ClashRuleSet,
  type ClashSeverity,
  type CoordinationCategory,
  type FixStrategy,
  type ProjectCoordinationSettings,
  type ResolvedRuleSet,
} from './coordinationRules.js'

export type CoordinationInteractionKind = 'intersection' | 'clearance' | 'host_conflict' | 'phase_conflict'

export interface CoordinationFindingObject {
  object_id: string
  object_type: string
  mark: string
  role: CoordinationRole
  subject: 'a' | 'b'
  label_th: string
  created_phase: Phase
  removed_phase: 'demolition' | null
  level_id?: string
}

export interface CoordinationHighlightMarker {
  kind: 'box' | 'segment'
  tone: 'subject_a' | 'subject_b' | 'measure' | 'impact'
  /** Axis-aligned envelope in mm (box markers). */
  min?: Vec3
  max?: Vec3
  /** Measurement segment in mm (segment markers). */
  from?: Vec3
  to?: Vec3
}

export interface CoordinationInteraction {
  kind: CoordinationInteractionKind
  penetration_mm: number
  penetration_range_mm: [number, number]
  distance_mm: number
  /** Null when the rule does not state a numeric clearance. */
  required_clearance_mm: number | null
  /** How much more free space the rule needs; null when not applicable. */
  clearance_shortfall_mm: number | null
  /** Unit direction that resolves the condition when applied to subject a. */
  direction_mm: Vec3 | null
  point_a_mm: Vec3 | null
  point_b_mm: Vec3 | null
  method: 'gjk_epa' | 'sampled' | 'dependency'
}

export interface CoordinationSuggestionAlternative {
  delta_mm: Vec3
  magnitude_mm: number
  recommended_mm: number
  phrase_th: string
  phrase_en: string
}

export interface CoordinationSuggestion {
  strategy: FixStrategy
  owner: 'subject_a' | 'subject_b' | 'either'
  /** Exact translation vector for the owning subject, in mm. */
  delta_mm: Vec3 | null
  delta_magnitude_mm: number | null
  /** Rounded to a 5 mm construction step for field use. */
  recommended_mm: number | null
  /** `exact` = the resolving direction; `axis_constrained` = projected to a buildable axis. */
  exactness: 'exact' | 'axis_constrained' | 'review_only'
  phrase_th: string
  phrase_en: string
  /** Equally valid fixes (mirror exits and symmetric axes) the engineer can choose instead. */
  alternatives: CoordinationSuggestionAlternative[]
  review_note_th?: string
}

export interface CoordinationFinding {
  id: string
  rule_id: string
  rule_revision: number
  severity: ClashSeverity
  category: CoordinationCategory
  title_th: string
  title_en: string
  requirement_th: string
  rationale_th: string
  objects: CoordinationFindingObject[]
  interaction: CoordinationInteraction
  witness_point_mm: Vec3 | null
  highlight: CoordinationHighlightMarker[]
  suggestion: CoordinationSuggestion
  source: ClashRule['source']
  basis: ClashRule['basis']
  requires_engineer_review: boolean
  level_id?: string
  phase_context: {
    coexistence: 'sequential' | 'existing_vs_new' | 'same_phase' | 'mixed'
    subject_a: { created_phase: Phase; removed_phase: 'demolition' | null }
    subject_b: { created_phase: Phase; removed_phase: 'demolition' | null }
  }
}

export interface CoordinationReport {
  rule_set: {
    id: string
    version: number
    revision: number
    jurisdiction: string[]
    effective_date: string
    issued_at: string
    applied_overrides: string[]
  }
  generated_at: string
  summary: {
    objects_considered: number
    proxies_built: number
    rules_evaluated: number
    pairs_broad_phased: number
    pairs_narrow_phased: number
    suppressed_intentional: number
    suppressed_non_coexisting: number
    findings: number
    by_severity: Record<ClashSeverity, number>
    by_rule: Record<string, number>
    narrow_phase_methods: Record<string, number>
  }
  findings: CoordinationFinding[]
  warnings: string[]
  notes: string[]
}

export interface CoordinationOptions {
  rule_set?: ClashRuleSet
  settings?: ProjectCoordinationSettings
  /** Reuse a graph built by the caller (for example right after an impact analysis). */
  graph?: DependencyGraph
  /** Extra millimetres added to every recommended shift. */
  construction_slack_mm?: number
  /** Skip the generic `CF-CL-GEN-999` sweep. */
  include_generic_sweep?: boolean
  now?: string
}

const PHASE_INDEX: Record<Phase, number> = { existing: 0, demolition: 1, new_construction: 2 }
const SEVERITY_RANK: Record<ClashSeverity, number> = { hard: 0, clearance: 1, soft: 2 }
const SLACK_STEP_MM = 5

const roundUpToStep = (value: number, step = SLACK_STEP_MM): number => Math.ceil(Math.max(0, value) / step) * step

/** Translation vector = unit direction x magnitude, rounded to 0.1 mm. */
const vectorDelta = (direction: Vec3, magnitude: number): Vec3 =>
  direction.map(value => Math.round(value * magnitude * 10) / 10) as Vec3

/** Objects exist from their creation phase until their removal phase completes. */
function lifetime(created: Phase, removed: 'demolition' | null): [number, number] {
  const start = PHASE_INDEX[created]
  const end = removed ? PHASE_INDEX[removed] : Number.POSITIVE_INFINITY
  return [start, end]
}

function coexists(a: { created_phase: Phase; removed_phase: 'demolition' | null }, b: { created_phase: Phase; removed_phase: 'demolition' | null }): boolean {
  const [startA, endA] = lifetime(a.created_phase, a.removed_phase)
  const [startB, endB] = lifetime(b.created_phase, b.removed_phase)
  return Math.max(startA, startB) <= Math.min(endA, endB)
}

function coexistenceLabel(a: CoordinationProxy, b: CoordinationProxy): CoordinationFinding['phase_context']['coexistence'] {
  if (a.created_phase === b.created_phase && a.removed_phase === b.removed_phase) return 'same_phase'
  if (!coexists(a, b)) return 'sequential'
  if (a.created_phase === 'new_construction' || b.created_phase === 'new_construction') return 'existing_vs_new'
  return 'mixed'
}

const matchesSubject = (
  proxy: CoordinationProxy,
  subject: { role: CoordinationRole[]; families?: string[]; kinds?: string[] },
  solids: 'primary' | 'door_swing' = 'primary',
): boolean => {
  if (solids === 'door_swing' && !proxy.swing_solids?.length) return false
  if (solids === 'primary' && !proxy.solids.length) return false
  if (!subject.role.includes(proxy.role)) return false
  if (subject.families && !subject.families.includes(proxy.object_type)) return false
  if (subject.kinds && (!proxy.kind || !subject.kinds.includes(proxy.kind))) return false
  return true
}

const solidsOf = (proxy: CoordinationProxy, solids: 'primary' | 'door_swing'): ConvexSolid[] =>
  solids === 'door_swing' ? proxy.swing_solids ?? [] : proxy.solids

interface SolidEntry {
  solid: ConvexSolid
  bounds: SpatialBounds
}

const toEntries = (solids: ConvexSolid[]): SolidEntry[] => solids.map(solid => ({ solid, bounds: boundsOf(solid) }))

function boundsGap(a: SpatialBounds, b: SpatialBounds): number {
  return [0, 1, 2].reduce((max, axis) => Math.max(
    max,
    Math.max(a.min[axis] - b.max[axis], b.min[axis] - a.max[axis]),
  ), Number.NEGATIVE_INFINITY)
}

function intersectBounds(a: SpatialBounds, b: SpatialBounds): SpatialBounds {
  return {
    min: [0, 1, 2].map(axis => Math.max(a.min[axis], b.min[axis])) as Vec3,
    max: [0, 1, 2].map(axis => Math.min(a.max[axis], b.max[axis])) as Vec3,
  }
}

const boundsVolume = (bounds: SpatialBounds): number => [0, 1, 2]
  .reduce((volume, axis) => volume * Math.max(0, bounds.max[axis] - bounds.min[axis]), 1)

interface PairContact {
  contact: ContactResult
  requires_clearance: boolean
  entry_a: SolidEntry
  entry_b: SolidEntry
}

/**
 * Worst contact over every solid pair of the two proxies: maximum overlap for intersection rules,
 * minimum free space for clearance rules. Solid pairs that cannot reach the threshold are skipped
 * with the exact per-solid AABBs, so pipe chains and multi-part objects stay cheap.
 */
function requiredClearance(rule: ClashRule): number {
  const predicate = rule.predicate
  return predicate.type === 'clearance_below' || predicate.type === 'opening_spacing_below' ? predicate.required_mm : 0
}

function evaluateSolids(
  entriesA: SolidEntry[],
  entriesB: SolidEntry[],
  rule: ClashRule,
  reach_mm: number,
): PairContact | undefined {
  const requiresClearance = rule.predicate.type === 'clearance_below' || rule.predicate.type === 'opening_spacing_below'
  const required = requiredClearance(rule)
  let best: PairContact | undefined
  for (const entryA of entriesA) {
    for (const entryB of entriesB) {
      if (boundsGap(entryA.bounds, entryB.bounds) > reach_mm) continue
      const contact = contactBetweenSolids(entryA.solid, entryB.solid, requiresClearance ? { clearance_mm: required } : {})
      const candidate: PairContact = { contact, requires_clearance: requiresClearance, entry_a: entryA, entry_b: entryB }
      if (!best) { best = candidate; continue }
      if (requiresClearance) {
        if (contact.distance_mm < best.contact.distance_mm) best = candidate
      } else if (contact.penetration_mm > best.contact.penetration_mm) best = candidate
    }
  }
  return best
}

/** Exact minimal translation along an axis: `value(u) = h_A(u) + h_B(-u)` (negative when apart). */
function valueAlongAxis(a: ConvexSolid, b: ConvexSolid, axis: Vec3): number {
  return V.dot(supportOf(a, axis), axis) + V.dot(supportOf(b, V.neg(axis)), V.neg(axis))
}

const AXIS_X: Vec3 = [1, 0, 0]
const AXIS_Y: Vec3 = [0, 1, 0]
const AXIS_Z: Vec3 = [0, 0, 1]

function formatMm(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function phraseFor(delta: Vec3, magnitude: number): { th: string; en: string } {
  const [dx, dy, dz] = delta
  const labels: Array<[number, string, string]> = [[dx, 'X', 'X'], [dy, 'Y', 'Y'], [dz, 'Z', 'Z']]
  const significant = labels.filter(([value]) => Math.abs(value) > 0.35)
  if (significant.length === 1) {
    const [[value, labelTh, labelEn]] = significant
    const sign = value > 0 ? '+' : '-'
    return {
      th: labelTh === 'Z' ? `${value > 0 ? 'ยกขึ้น' : 'ลดลง'} ${formatMm(magnitude)} มม.` : `เลื่อนไปทาง ${sign}${labelTh} ${formatMm(magnitude)} มม.`,
      en: labelEn === 'Z' ? `${value > 0 ? 'raise' : 'lower'} by ${formatMm(magnitude)} mm` : `shift ${labelEn}${sign}${formatMm(magnitude)} mm`,
    }
  }
  const parts = labels.filter(([value]) => Math.abs(value) > 1e-6)
    .map(([value, labelTh]) => `${labelTh}${value > 0 ? '+' : '-'}${formatMm(Math.abs(value) * magnitude)}`)
  return {
    th: `เลื่อน (${parts.join(', ')}) มม.`,
    en: `shift by (${parts.join(', ')}) mm`,
  }
}

function suggestionFor(
  rule: ClashRule,
  contact: ContactResult,
  labelA: string,
  labelB: string,
  slack_mm: number,
  requires_clearance: boolean,
  entryA: SolidEntry,
  entryB: SolidEntry,
): CoordinationSuggestion {
  const margin = rule.fix.margin_mm
  const required = requiredClearance(rule)
  const shortfall = requires_clearance ? contact.clearance_shortfall_mm ?? 0 : Math.max(0, contact.penetration_mm)
  const baseMagnitude = shortfall + margin + slack_mm
  const reviewNote = rule.requires_engineer_review
    ? 'ต้องให้วิศวกรตรวจและออกแบบขยายก่อนดำเนินการ'
    : undefined

  void required
  const alternativeFor = (delta: Vec3, magnitude: number): CoordinationSuggestionAlternative => {
    const phrase = phraseFor(delta, magnitude)
    return {
      delta_mm: vectorDelta(delta, magnitude),
      magnitude_mm: Math.round(magnitude * 10) / 10,
      recommended_mm: roundUpToStep(magnitude),
      phrase_th: phrase.th,
      phrase_en: phrase.en,
    }
  }
  const withPhrase = (
    strategy: FixStrategy,
    owner: CoordinationSuggestion['owner'],
    delta: Vec3 | null,
    magnitude: number,
    exactness: CoordinationSuggestion['exactness'],
    alternatives: CoordinationSuggestionAlternative[] = [],
  ): CoordinationSuggestion => {
    if (!delta) {
      return {
        strategy,
        owner,
        delta_mm: null,
        delta_magnitude_mm: null,
        recommended_mm: null,
        exactness: 'review_only',
        phrase_th: `ตรวจสอบและยืนยันแนวทางแก้ไข: ${labelA} ↔ ${labelB}`,
        phrase_en: `review and confirm: ${labelA} vs ${labelB}`,
        alternatives: [],
        ...(reviewNote ? { review_note_th: reviewNote } : {}),
      }
    }
    const rounded = roundUpToStep(magnitude)
    const phrase = phraseFor(delta, magnitude)
    return {
      strategy,
      owner,
      delta_mm: vectorDelta(delta, magnitude),
      delta_magnitude_mm: Math.round(magnitude * 10) / 10,
      recommended_mm: rounded,
      exactness,
      phrase_th: phrase.th,
      phrase_en: phrase.en,
      alternatives,
      ...(reviewNote ? { review_note_th: reviewNote } : {}),
    }
  }

  switch (rule.fix.strategy) {
    case 'shift_primary':
    case 'reroute_primary': {
      const delta = contact.direction
      const alternatives = contact.alternatives_mm.slice(0, 2).map(alternative => alternativeFor(alternative, baseMagnitude))
      return withPhrase(rule.fix.strategy, 'subject_a', delta, baseMagnitude, 'exact', alternatives)
    }
    case 'shift_secondary': {
      const delta = V.neg(contact.direction)
      const alternatives = contact.alternatives_mm.slice(0, 2).map(alternative => alternativeFor(V.neg(alternative), baseMagnitude))
      return withPhrase(rule.fix.strategy, 'subject_b', delta, baseMagnitude, 'exact', alternatives)
    }
    case 'shift_primary_lateral':
    case 'shift_primary_vertical': {
      const vertical = rule.fix.strategy === 'shift_primary_vertical'
      const candidates: Vec3[] = vertical
        ? [V.mul(AXIS_Z, contact.direction[2] >= 0 ? 1 : -1), V.mul(AXIS_Z, contact.direction[2] >= 0 ? -1 : 1)]
        : [AXIS_X, V.neg(AXIS_X), AXIS_Y, V.neg(AXIS_Y)]
      const scored: Array<{ axis: Vec3; magnitude: number }> = []
      for (const axis of candidates) {
        // Gap along `axis` after moving A by m along -axis becomes -value(axis) + m, so the shift
        // that satisfies the rule exactly is `required + value(axis)` (value < 0 when already apart).
        // A non-positive requirement means that axis is already satisfied: it is not an escape axis.
        const value = valueAlongAxis(entryA.solid, entryB.solid, axis)
        const needed = (requires_clearance ? required : 0) + value + margin + slack_mm
        if (!Number.isFinite(needed) || needed <= 0) continue
        scored.push({ axis, magnitude: needed })
      }
      scored.sort((left, right) => left.magnitude - right.magnitude || right.axis[2] - left.axis[2])
      const best = scored[0]
      if (!best || best.magnitude <= 0) return withPhrase(rule.fix.strategy, 'subject_a', contact.direction, baseMagnitude, 'exact')
      const alternatives = scored.slice(1).filter(entry => Math.abs(entry.magnitude - best.magnitude) <= 1)
        .map(entry => alternativeFor(V.neg(entry.axis), best.magnitude))
      return withPhrase(rule.fix.strategy, 'subject_a', V.neg(best.axis), best.magnitude, 'axis_constrained', alternatives)
    }
    case 'relocate_secondary': {
      const delta = V.neg(contact.direction)
      return withPhrase(rule.fix.strategy, 'subject_b', delta, baseMagnitude, 'exact')
    }
    case 'flip_swing_handing': {
      const rounded = roundUpToStep(contact.penetration_mm + rule.fix.margin_mm + slack_mm)
      const delta = V.neg(contact.direction)
      const phrase = phraseFor(delta, contact.penetration_mm + rule.fix.margin_mm + slack_mm)
      return {
        strategy: rule.fix.strategy,
        owner: 'either',
        delta_mm: delta.map(value => Math.round(value * 10) / 10) as Vec3,
        delta_magnitude_mm: Math.round((contact.penetration_mm + rule.fix.margin_mm + slack_mm) * 10) / 10,
        recommended_mm: rounded,
        exactness: 'exact',
        phrase_th: `กลับทิศทางบานประตู (Flip Handing) หรือย้าย ${labelB} ออกอย่างน้อย ${formatMm(rounded)} มม. (${phrase.th})`,
        phrase_en: `flip the door handing or move ${labelB} at least ${formatMm(rounded)} mm (${phrase.en})`,
        alternatives: [],
      }
    }
    case 'add_sleeve_or_void': {
      const rounded = roundUpToStep(contact.penetration_mm + rule.fix.margin_mm + slack_mm)
      return {
        strategy: rule.fix.strategy,
        owner: 'either',
        delta_mm: V.neg(contact.direction),
        delta_magnitude_mm: Math.round((contact.penetration_mm + rule.fix.margin_mm + slack_mm) * 10) / 10,
        recommended_mm: rounded,
        exactness: 'exact',
        phrase_th: `เตรียมปลอกท่อ/ช่องเปิดที่จุดทะลุ หรือเลื่อน ${labelA} ออก ${formatMm(rounded)} มม.`,
        phrase_en: `provide a sleeve/void at the penetration, or shift ${labelA} by ${formatMm(rounded)} mm`,
        alternatives: [],
        ...(reviewNote ? { review_note_th: reviewNote } : {}),
      }
    }
    default:
      return withPhrase(rule.fix.strategy, 'either', null, 0, 'review_only')
  }
}

function buildHighlight(
  entryA: SolidEntry,
  entryB: SolidEntry,
  contact: ContactResult,
  intersecting: boolean,
): CoordinationHighlightMarker[] {
  const markers: CoordinationHighlightMarker[] = [
    { kind: 'box', tone: 'subject_a', min: entryA.bounds.min, max: entryA.bounds.max },
    { kind: 'box', tone: 'subject_b', min: entryB.bounds.min, max: entryB.bounds.max },
  ]
  if (intersecting) {
    const overlap = intersectBounds(entryA.bounds, entryB.bounds)
    if (overlap.min.every((value, axis) => value <= overlap.max[axis])) {
      markers.push({ kind: 'box', tone: 'impact', min: overlap.min, max: overlap.max })
    }
  }
  markers.push({ kind: 'segment', tone: 'measure', from: contact.point_a_mm, to: contact.point_b_mm })
  return markers
}

function maxReach(rule: ClashRule, slack_mm: number): number {
  const predicate = rule.predicate
  const required = predicate.type === 'clearance_below' || predicate.type === 'opening_spacing_below' ? predicate.required_mm : 0
  return Math.max(required + rule.fix.margin_mm + slack_mm, predicate.type === 'intersects' ? (predicate.min_overlap_mm ?? 0) : 0)
}

/** Run the full coordination pass. Deterministic: same project and rule set → same findings. */
export function runCoordination(project: ProjectDocument, options: CoordinationOptions = {}): CoordinationReport {
  const startedAt = Date.now()
  const settings: ProjectCoordinationSettings | undefined = options.settings ?? readProjectCoordinationSettings(project)
  const slack = Math.max(0, options.construction_slack_mm ?? settings?.construction_slack_mm ?? DEFAULT_CONSTRUCTION_SLACK_MM)
  const ruleSet: ResolvedRuleSet = resolveRuleSet(options.rule_set ?? THAI_COORDINATION_RULES_V1, settings)
  const graph = options.graph ?? buildDependencyGraph(project)
  const coordinationModel: CoordinationModel = buildCoordinationModel(project)
  const warnings = [...coordinationModel.warnings]
  const notes: string[] = []
  const findings: CoordinationFinding[] = []
  const by_rule: Record<string, number> = {}
  const narrow_phase_methods: Record<string, number> = {}
  let pairsBroadPhased = 0
  let pairsNarrowPhased = 0
  let suppressedIntentional = 0
  let suppressedNonCoexisting = 0

  const relatedPairs = new Set<string>()
  /** Pairs already explained by a specific rule; the generic sweep must not repeat them. */
  const coveredPairs = new Set<string>()
  const emittedFindings = new Set<string>()
  for (const edge of graph.edges) {
    if (!['hosted_on', 'hosts', 'supports', 'supported_by', 'derived_from'].includes(edge.kind)) continue
    relatedPairs.add(pairKey(edge.source_id, edge.target_id))
  }

  const entriesByProxy = new Map<string, SolidEntry[]>()
  const swingEntriesByProxy = new Map<string, SolidEntry[]>()
  for (const proxy of coordinationModel.proxies) {
    entriesByProxy.set(proxy.object_id, toEntries(proxy.solids))
    if (proxy.swing_solids?.length) swingEntriesByProxy.set(proxy.object_id, toEntries(proxy.swing_solids))
  }

  // The call option wins; otherwise the project's stored preference decides.
  const genericSweep = options.include_generic_sweep ?? settings?.include_generic_sweep
  const rules = ruleSet.rules.filter(rule => rule.id !== 'CF-CL-GEN-999' || genericSweep !== false)
  const proxyById = new Map(coordinationModel.proxies.map(proxy => [proxy.object_id, proxy]))

  for (const rule of rules) {
    if (rule.predicate.type === 'dependent_on_removed_host') continue
    const solidsA = rule.subject_a.solids ?? 'primary'
    const candidatesA = coordinationModel.proxies.filter(proxy => matchesSubject(proxy, rule.subject_a, solidsA))
    const candidatesB = coordinationModel.proxies.filter(proxy => matchesSubject(proxy, rule.subject_b, 'primary'))
    if (!candidatesA.length || !candidatesB.length) continue
    const reach = maxReach(rule, slack)

    // Broad phase: bounds sweep over the candidate cross-product.
    for (const proxyA of candidatesA) {
      const entriesA = solidsA === 'door_swing' ? swingEntriesByProxy.get(proxyA.object_id) ?? [] : entriesByProxy.get(proxyA.object_id) ?? []
      for (const proxyB of candidatesB) {
        if (proxyA.object_id === proxyB.object_id) continue
        const entriesB = entriesByProxy.get(proxyB.object_id) ?? []
        if (!entriesB.length) continue
        if (relatedPairs.has(pairKey(proxyA.object_id, proxyB.object_id))) {
          suppressedIntentional += 1
          continue
        }
        const sequentialCase = rule.predicate.type === 'new_into_demolished'
        if (coexists(proxyA, proxyB) === sequentialCase) {
          if (sequentialCase) continue
          suppressedNonCoexisting += 1
          continue
        }
        if (rule.predicate.type === 'opening_spacing_below') {
          const finding = evaluateOpeningSpacing(rule, proxyA, proxyB, coordinationModel, slack)
          if (finding && !emittedFindings.has(`${finding.rule_id}|${pairKey(proxyA.object_id, proxyB.object_id)}`)) {
            emittedFindings.add(`${finding.rule_id}|${pairKey(proxyA.object_id, proxyB.object_id)}`)
            findings.push(finding)
            by_rule[rule.id] = (by_rule[rule.id] ?? 0) + 1
          }
          continue
        }
        if (rule.id === 'CF-CL-GEN-999' && coveredPairs.has(pairKey(proxyA.object_id, proxyB.object_id))) continue

        pairsBroadPhased += 1
        const threshold = rule.predicate.type === 'intersects' ? rule.predicate.min_overlap_mm ?? 0 : requiredClearance(rule)
        const pairContact = evaluateSolids(entriesA, entriesB, rule, reach)
        if (!pairContact) continue
        pairsNarrowPhased += 1
        narrow_phase_methods[pairContact.contact.method] = (narrow_phase_methods[pairContact.contact.method] ?? 0) + 1
        const { contact } = pairContact
        const qualifies = rule.predicate.type === 'clearance_below'
          ? (contact.clearance_shortfall_mm ?? 0) > 0
          : sequentialCase
            ? contact.intersecting && contact.penetration_mm >= 25 && proxyA.object_type !== proxyB.object_type
            : contact.intersecting && contact.penetration_mm >= threshold
        if (!qualifies) continue
        if (rule.id === 'CF-CL-GEN-999' && isIntentionalGenericPair(proxyA, proxyB)) continue
        // Ordered pairs only exist for rules with narrow subject roles; de-duplicate defensively.
        const findingKey = `${rule.id}|${pairKey(proxyA.object_id, proxyB.object_id)}`
        if (emittedFindings.has(findingKey)) continue
        emittedFindings.add(findingKey)
        if (rule.id !== 'CF-CL-GEN-999') coveredPairs.add(pairKey(proxyA.object_id, proxyB.object_id))

        const finding = buildSolidFinding(rule, proxyA, proxyB, pairContact, slack, coexistenceLabel(proxyA, proxyB))
        findings.push(finding)
        by_rule[rule.id] = (by_rule[rule.id] ?? 0) + 1
      }
    }
  }

  // Dependency rules: a demolished host that still carries live dependents.
  const dependencyRule = rules.find(rule => rule.predicate.type === 'dependent_on_removed_host')
  if (dependencyRule) {
    for (const node of Object.values(graph.nodes)) {
      if (node.node_kind !== 'object' || node.removed_phase !== 'demolition') continue
      const hostProxy = proxyById.get(node.object_id)
      if (!hostProxy || !matchesSubject(hostProxy, dependencyRule.subject_a)) continue
      for (const edge of node.incoming) {
        if (!['hosted_on', 'derived_from', 'connects_to', 'controls'].includes(edge.kind)) continue
        const dependent = graph.nodes[edge.source_id]
        if (!dependent || dependent.node_kind !== 'object' || dependent.removed_phase) continue
        const dependentProxy = proxyById.get(edge.source_id)
        if (dependentProxy && !matchesSubject(dependentProxy, dependencyRule.subject_b)) continue
        pairsBroadPhased += 1
        findings.push(buildDependencyFinding(dependencyRule, hostProxy, dependent, dependentProxy, edge.kind, edge.basis))
        by_rule[dependencyRule.id] = (by_rule[dependencyRule.id] ?? 0) + 1
      }
    }
  }

  findings.sort(compareFindings)
  const by_severity: Record<ClashSeverity, number> = { hard: 0, clearance: 0, soft: 0 }
  for (const finding of findings) by_severity[finding.severity] += 1
  notes.push(`ชุดกติกาประสานงาน ${ruleSet.id} v${ruleSet.version}.${ruleSet.revision} (effective ${ruleSet.effective_date})`)
  if (ruleSet.applied_overrides.length) notes.push(`ใช้ project override: ${ruleSet.applied_overrides.join(', ')}`)
  if (!coordinationModel.proxies.length) notes.push('ไม่พบวัตถุที่มีรูปทรงสำหรับตรวจประสานงาน')
  notes.push(`narrow phase: ${Object.entries(narrow_phase_methods).map(([method, count]) => `${method} ${count}`).join(', ') || 'none'}`)
  void startedAt

  return {
    rule_set: {
      id: ruleSet.id,
      version: ruleSet.version,
      revision: ruleSet.revision,
      jurisdiction: ruleSet.jurisdiction,
      effective_date: ruleSet.effective_date,
      issued_at: ruleSet.issued_at,
      applied_overrides: ruleSet.applied_overrides,
    },
    generated_at: options.now ?? new Date().toISOString(),
    summary: {
      objects_considered: Object.keys(project.objects).length,
      proxies_built: coordinationModel.proxies.length,
      rules_evaluated: rules.length,
      pairs_broad_phased: pairsBroadPhased,
      pairs_narrow_phased: pairsNarrowPhased,
      suppressed_intentional: suppressedIntentional,
      suppressed_non_coexisting: suppressedNonCoexisting,
      findings: findings.length,
      by_severity,
      by_rule,
      narrow_phase_methods,
    },
    findings,
    warnings,
    notes,
  }
}

function readProjectCoordinationSettings(project: ProjectDocument): ProjectCoordinationSettings | undefined {
  const settings = (project as ProjectDocument & { coordination_settings?: ProjectCoordinationSettings }).coordination_settings
  return settings && typeof settings === 'object' ? settings : undefined
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`)

function isIntentionalGenericPair(a: CoordinationProxy, b: CoordinationProxy): boolean {
  // Structural members touch by design, pipes pass through walls by design, and openings live
  // inside their host wall: the specific rules cover the cases that need a decision.
  if (a.role === 'wall' || b.role === 'wall') return true
  if (a.role === 'mep_pipe' || b.role === 'mep_pipe') return true
  if (a.role === 'structure' && b.role === 'structure') return true
  if (a.role === 'opening' && b.role === 'opening') return true
  if (a.approximate && b.approximate) return true
  return false
}

function buildSolidFinding(
  rule: ClashRule,
  proxyA: CoordinationProxy,
  proxyB: CoordinationProxy,
  pairContact: PairContact,
  slack: number,
  coexistence: CoordinationFinding['phase_context']['coexistence'],
): CoordinationFinding {
  const { contact } = pairContact
  const requiresClearance = pairContact.requires_clearance
  const interacting = contact.intersecting
  const suggestion = suggestionFor(rule, contact, proxyA.mark, proxyB.mark, slack, requiresClearance, pairContact.entry_a, pairContact.entry_b)
  const interaction: CoordinationInteraction = {
    kind: interacting ? 'intersection' : 'clearance',
    penetration_mm: contact.penetration_mm,
    penetration_range_mm: contact.penetration_range_mm,
    distance_mm: contact.distance_mm,
    required_clearance_mm: requiresClearance ? (rule.predicate as { required_mm: number }).required_mm : null,
    clearance_shortfall_mm: requiresClearance ? contact.clearance_shortfall_mm : null,
    direction_mm: contact.direction,
    point_a_mm: contact.point_a_mm,
    point_b_mm: contact.point_b_mm,
    method: contact.method,
  }
  const witness: Vec3 | null = nearWitness(contact)
  return {
    id: `${rule.id}:${proxyA.object_id}:${proxyB.object_id}`,
    rule_id: rule.id,
    rule_revision: rule.revision,
    severity: rule.severity,
    category: rule.category,
    title_th: rule.title_th,
    title_en: rule.title_en,
    requirement_th: rule.requirement_th,
    rationale_th: rule.rationale_th,
    objects: [
      findingObject(proxyA, 'a', rule.subject_a.label_th),
      findingObject(proxyB, 'b', rule.subject_b.label_th),
    ],
    interaction,
    witness_point_mm: witness,
    highlight: buildHighlight(pairContact.entry_a, pairContact.entry_b, contact, interacting),
    suggestion,
    source: rule.source,
    basis: rule.basis,
    requires_engineer_review: rule.requires_engineer_review,
    ...(proxyA.level_id ? { level_id: proxyA.level_id } : proxyB.level_id ? { level_id: proxyB.level_id } : {}),
    phase_context: {
      coexistence,
      subject_a: { created_phase: proxyA.created_phase, removed_phase: proxyA.removed_phase },
      subject_b: { created_phase: proxyB.created_phase, removed_phase: proxyB.removed_phase },
    },
  }
}

function nearWitness(contact: ContactResult): Vec3 {
  return [
    Math.round((contact.point_a_mm[0] + contact.point_b_mm[0]) / 2),
    Math.round((contact.point_a_mm[1] + contact.point_b_mm[1]) / 2),
    Math.round((contact.point_a_mm[2] + contact.point_b_mm[2]) / 2),
  ]
}

function findingObject(
  proxy: CoordinationProxy,
  subject: 'a' | 'b',
  labelTh: string,
): CoordinationFindingObject {
  return {
    object_id: proxy.object_id,
    object_type: proxy.object_type,
    mark: proxy.mark,
    role: proxy.role,
    subject,
    label_th: labelTh,
    created_phase: proxy.created_phase,
    removed_phase: proxy.removed_phase,
    ...(proxy.level_id ? { level_id: proxy.level_id } : {}),
  }
}

function evaluateOpeningSpacing(
  rule: ClashRule,
  proxyA: CoordinationProxy,
  proxyB: CoordinationProxy,
  model: CoordinationModel,
  slack: number,
): CoordinationFinding | undefined {
  const openingA = model.openings.find(opening => opening.object_id === proxyA.object_id)
  const openingB = model.openings.find(opening => opening.object_id === proxyB.object_id)
  if (!openingA || !openingB) return undefined
  if (openingA.wall_id !== openingB.wall_id) return undefined
  const required = (rule.predicate as { required_mm: number }).required_mm
  const startA = openingA.offset_mm - openingA.width_mm / 2
  const endA = openingA.offset_mm + openingA.width_mm / 2
  const startB = openingB.offset_mm - openingB.width_mm / 2
  const endB = openingB.offset_mm + openingB.width_mm / 2
  const vertical = Math.max(0, Math.min(openingA.z_max_mm, openingB.z_max_mm) - Math.max(openingA.z_min_mm, openingB.z_min_mm))
  if (vertical <= 0) return undefined
  // Positive gap = clear space between the two openings; negative = overlap along the wall.
  const measured = Math.max(startA, startB) - Math.min(endA, endB)
  const shortfall = required - measured
  if (shortfall <= 0) return undefined
  const direction: Vec3 = [openingA.offset_mm <= openingB.offset_mm ? -1 : 1, 0, 0]
  const magnitude = shortfall + rule.fix.margin_mm + slack
  const rounded = roundUpToStep(magnitude)
  const phrase = phraseFor(direction, magnitude)
  const boundsA = proxyA.bounds
  const boundsB = proxyB.bounds
  return {
    id: `${rule.id}:${proxyA.object_id}:${proxyB.object_id}`,
    rule_id: rule.id,
    rule_revision: rule.revision,
    severity: rule.severity,
    category: rule.category,
    title_th: rule.title_th,
    title_en: rule.title_en,
    requirement_th: rule.requirement_th,
    rationale_th: rule.rationale_th,
    objects: [
      findingObject(proxyA, 'a', rule.subject_a.label_th),
      findingObject(proxyB, 'b', rule.subject_b.label_th),
    ],
    interaction: {
      kind: 'clearance',
      penetration_mm: measured < 0 ? -measured : 0,
      penetration_range_mm: measured < 0 ? [-measured, -measured] : [0, 0],
      distance_mm: Math.max(0, measured),
      required_clearance_mm: required,
      clearance_shortfall_mm: shortfall,
      direction_mm: direction,
      point_a_mm: [openingA.offset_mm, 0, (openingA.z_min_mm + openingA.z_max_mm) / 2],
      point_b_mm: [openingB.offset_mm, 0, (openingB.z_min_mm + openingB.z_max_mm) / 2],
      method: 'gjk_epa',
    },
    witness_point_mm: null,
    highlight: [
      { kind: 'box', tone: 'subject_a', min: boundsA.min, max: boundsA.max },
      { kind: 'box', tone: 'subject_b', min: boundsB.min, max: boundsB.max },
    ],
    suggestion: {
      strategy: rule.fix.strategy,
      owner: 'subject_b',
      delta_mm: direction.map(value => Math.round(value * rounded * 10) / 10) as Vec3,
      delta_magnitude_mm: Math.round(magnitude * 10) / 10,
      recommended_mm: rounded,
      exactness: 'axis_constrained',
      phrase_th: `ขยับช่องเปิด ${proxyB.mark} ตามแนวผนัง ${formatMm(rounded)} มม. (${phrase.th})`,
      phrase_en: `move opening ${proxyB.mark} along the wall by ${formatMm(rounded)} mm`,
      alternatives: [],
    },
    source: rule.source,
    basis: rule.basis,
    requires_engineer_review: rule.requires_engineer_review,
    ...(proxyB.level_id ? { level_id: proxyB.level_id } : {}),
    phase_context: {
      coexistence: coexistenceLabel(proxyA, proxyB),
      subject_a: { created_phase: proxyA.created_phase, removed_phase: proxyA.removed_phase },
      subject_b: { created_phase: proxyB.created_phase, removed_phase: proxyB.removed_phase },
    },
  }
}

function buildDependencyFinding(
  rule: ClashRule,
  host: CoordinationProxy,
  dependent: { object_id: string; object_type: string; mark: string; created_phase: Phase; removed_phase: 'demolition' | null; level_id?: string },
  dependentProxy: CoordinationProxy | undefined,
  edgeKind: string,
  basis: string,
): CoordinationFinding {
  const bounds = dependentProxy?.bounds ?? host.bounds
  const relationTh = edgeKind === 'connects_to' ? 'เชื่อมต่อ' : edgeKind === 'controls' ? 'ควบคุม' : 'ยึดอยู่บน'
  return {
    id: `${rule.id}:${host.object_id}:${dependent.object_id}`,
    rule_id: rule.id,
    rule_revision: rule.revision,
    severity: rule.severity,
    category: rule.category,
    title_th: rule.title_th,
    title_en: rule.title_en,
    requirement_th: rule.requirement_th,
    rationale_th: rule.rationale_th,
    objects: [
      findingObject(host, 'a', rule.subject_a.label_th),
      {
        object_id: dependent.object_id,
        object_type: dependent.object_type,
        mark: dependent.mark,
        role: dependentProxy?.role ?? 'other',
        subject: 'b',
        label_th: rule.subject_b.label_th,
        created_phase: dependent.created_phase,
        removed_phase: dependent.removed_phase,
        ...(dependent.level_id ? { level_id: dependent.level_id } : {}),
      },
    ],
    interaction: {
      kind: 'host_conflict',
      penetration_mm: 0,
      penetration_range_mm: [0, 0],
      distance_mm: 0,
      required_clearance_mm: null,
      clearance_shortfall_mm: null,
      direction_mm: null,
      point_a_mm: null,
      point_b_mm: null,
      method: 'dependency',
    },
    witness_point_mm: [Math.round((host.bounds.min[0] + host.bounds.max[0]) / 2), Math.round((host.bounds.min[1] + host.bounds.max[1]) / 2), Math.round((host.bounds.min[2] + host.bounds.max[2]) / 2)],
    highlight: [
      { kind: 'box', tone: 'subject_a', min: host.bounds.min, max: host.bounds.max },
      { kind: 'box', tone: 'subject_b', min: bounds.min, max: bounds.max },
    ],
    suggestion: {
      strategy: rule.fix.strategy,
      owner: 'subject_b',
      delta_mm: null,
      delta_magnitude_mm: null,
      recommended_mm: null,
      exactness: 'review_only',
      phrase_th: `${host.mark} (${host.object_type}) ถูกกำหนดเป็นงานรื้อถอน แต่ ${dependent.mark} ยัง${relationTh}อยู่ — ย้าย/เปลี่ยน host หรือกำหนดรื้อตาม (${basis})`,
      phrase_en: `${host.mark} is scheduled for demolition while ${dependent.mark} still ${edgeKind === 'connects_to' ? 'connects to' : 'sits on'} it`,
      alternatives: [],
      review_note_th: 'อัปเดต phase ของรายการที่เกี่ยวข้องให้สอดคล้องก่อนเริ่มรื้อ',
    },
    source: rule.source,
    basis: rule.basis,
    requires_engineer_review: rule.requires_engineer_review,
    ...(host.level_id ? { level_id: host.level_id } : {}),
    phase_context: {
      coexistence: 'sequential',
      subject_a: { created_phase: host.created_phase, removed_phase: host.removed_phase },
      subject_b: { created_phase: dependent.created_phase, removed_phase: dependent.removed_phase },
    },
  }
}

function compareFindings(a: CoordinationFinding, b: CoordinationFinding): number {
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    || a.rule_id.localeCompare(b.rule_id)
    || (a.objects[0]?.object_id ?? '').localeCompare(b.objects[0]?.object_id ?? '')
    || (a.objects[1]?.object_id ?? '').localeCompare(b.objects[1]?.object_id ?? '')
}

/**
 * Build a 3D/plan highlight for a single finding so all views share one source of truth.
 * Kept separate from the report so the UI can render markers lazily.
 */
export function findingHighlightBounds(finding: CoordinationFinding): SpatialBounds | undefined {
  const boxes = finding.highlight.filter(marker => marker.kind === 'box' && marker.tone === 'impact')
  if (boxes.length) return { min: boxes[0].min as Vec3, max: boxes[0].max as Vec3 }
  const all = finding.highlight.filter(marker => marker.kind === 'box')
  if (!all.length) return undefined
  return all.reduce<SpatialBounds>((acc, marker) => ({
    min: [0, 1, 2].map(axis => Math.min(acc.min[axis], (marker.min as Vec3)[axis])) as Vec3,
    max: [0, 1, 2].map(axis => Math.max(acc.max[axis], (marker.max as Vec3)[axis])) as Vec3,
  }), { min: all[0].min as Vec3, max: all[0].max as Vec3 })
}

/** Coordination entry point with the report pre-sorted for UI consumption. */
export function coordinationSummaryLine(report: CoordinationReport): string {
  const { by_severity: severity, findings } = report.summary
  return `ตรวจประสานงาน: พบ ${findings} รายการ (hard ${severity.hard} · clearance ${severity.clearance} · soft ${severity.soft})`
}
