// ConstructFlow Central Dependency Graph (Dependency Coordination Core)
//
// One shared axis for object relationships so that moving, deleting or demolishing an object
// reports exactly who is affected instead of every domain re-implementing hidden rules.
//
// Edge direction is always "declaring object -> referenced object". The cascade policy
// describes what happens to the *declaring* object when the *referenced* object disappears.

import type { ProjectDocument } from './project.js'
import type { SmartObject } from './smartObject.js'
import type { Phase } from './types.js'

export type DependencyEdgeKind =
  | 'hosts'
  | 'hosted_on'
  | 'supports'
  | 'supported_by'
  | 'connects_to'
  | 'controls'
  | 'controlled_by'
  | 'derived_from'
  | 'references_level'
  | 'conflicts_with'

/**
 * What must happen to the declaring object when the referenced object is removed or reshaped:
 * delete  - dependent is meaningless without the target and is removed with it
 * rehost  - dependent survives but needs a new host/support and must be reviewed
 * prune   - the declaring object keeps existing but must drop the reference
 * follow  - dependent geometry follows the target (openings follow their wall)
 * inform  - only needs to be reported so a human or agent can verify
 * block   - removal must be resolved first (live service still depends on the target)
 */
export type DependencyCascadePolicy = 'delete' | 'rehost' | 'prune' | 'follow' | 'inform' | 'block'

export type DependencyOrigin = 'module_data' | 'host_refs' | 'level_refs' | 'relationships' | 'derived' | 'conflict'

export interface DependencyEdge {
  kind: DependencyEdgeKind
  /** Declaring (dependent) object UUID. */
  source_id: string
  /** Referenced (target) object UUID. */
  target_id: string
  /** Canonical field or relation that produced the edge, e.g. `wall_id`, `controlled_ids[]`. */
  basis: string
  origin: DependencyOrigin
  cascade: DependencyCascadePolicy
  /** Optional human role label such as `host`, `panel`, `support`. */
  role?: string
  meta?: Record<string, unknown>
}

export interface DependencyNode {
  object_id: string
  object_type: string
  mark: string
  /** `level` nodes are storey datums referenced by `level_refs`/level fields, not drawable objects. */
  node_kind: 'object' | 'level'
  created_phase: Phase
  removed_phase: 'demolition' | null
  level_id?: string
  outgoing: DependencyEdge[]
  incoming: DependencyEdge[]
}

export interface DependencyGraph {
  nodes: Record<string, DependencyNode>
  edges: DependencyEdge[]
  warnings: string[]
  summary: { object_count: number; level_count: number; edge_count: number; by_kind: Record<string, number> }
}

/**
 * Declarative reference surface. Field paths support `field` and `field[]` (array of ids);
 * nested paths such as `interface_treatments[].target_object_ids[]` are supported as well.
 * Only field *names* live here: domain math stays inside the owning domain engine.
 */
export interface ReferenceFieldRule {
  object_types: readonly string[]
  /** Canonical reference field path. Trailing `[]` marks an id array. */
  field: string
  kind: DependencyEdgeKind
  cascade: DependencyCascadePolicy
  role?: string
  /** Ignore references that point at these object families (for example pipe endpoints). */
  ignore_target_types?: readonly string[]
}

export const DEPENDENCY_REFERENCE_FIELDS: readonly ReferenceFieldRule[] = [
  { object_types: ['door_window.door', 'door_window.window'], field: 'wall_id', kind: 'hosted_on', cascade: 'delete', role: 'host_wall' },
  { object_types: ['structure.rebar_set'], field: 'host_id', kind: 'derived_from', cascade: 'delete', role: 'rebar_host' },
  { object_types: ['decorative.moulding_run', 'decorative.panel_layout', 'architecture.moulding_run'], field: 'host_id', kind: 'hosted_on', cascade: 'delete', role: 'moulding_host' },
  { object_types: ['electrical.led_run', 'interior.led_strip'], field: 'host_id', kind: 'hosted_on', cascade: 'delete', role: 'led_host' },
  { object_types: ['structure.beam'], field: 'start_column_id', kind: 'supported_by', cascade: 'rehost', role: 'start_support' },
  { object_types: ['structure.beam'], field: 'end_column_id', kind: 'supported_by', cascade: 'rehost', role: 'end_support' },
  { object_types: ['structure.beam'], field: 'middle_support_column_id', kind: 'supported_by', cascade: 'rehost', role: 'middle_support' },
  { object_types: ['structure.beam'], field: 'strap_beam_id', kind: 'connects_to', cascade: 'inform', role: 'strap_beam' },
  { object_types: ['structure.foundation'], field: 'supported_column_id', kind: 'supports', cascade: 'rehost', role: 'supported_column' },
  { object_types: ['structure.foundation'], field: 'strap_beam_id', kind: 'connects_to', cascade: 'inform', role: 'strap_beam' },
  { object_types: ['electrical.fixture'], field: 'circuit_id', kind: 'connects_to', cascade: 'inform', role: 'circuit', ignore_target_types: ['electrical.circuit'] },
  { object_types: ['electrical.circuit'], field: 'panel_id', kind: 'connects_to', cascade: 'rehost', role: 'panel' },
  { object_types: ['electrical.fixture'], field: 'controlled_ids[]', kind: 'controls', cascade: 'prune', role: 'controlled_load' },
  { object_types: ['electrical.circuit'], field: 'device_ids[]', kind: 'controls', cascade: 'prune', role: 'circuit_device' },
  { object_types: ['architecture.ceiling', 'architecture.arch_floor', 'architecture.floor'], field: 'room_id', kind: 'derived_from', cascade: 'inform', role: 'room' },
  { object_types: ['architecture.wall'], field: 'interface_treatments[].target_object_ids[]', kind: 'connects_to', cascade: 'prune', role: 'interface_treatment' },
  { object_types: ['plumbing.pipe_route', 'drainage.pipe_route'], field: 'start_node_id', kind: 'connects_to', cascade: 'inform', role: 'route_start' },
  { object_types: ['plumbing.pipe_route', 'drainage.pipe_route'], field: 'end_node_id', kind: 'connects_to', cascade: 'inform', role: 'route_end' },
  { object_types: ['plumbing.pump_bypass'], field: 'tank_id', kind: 'connects_to', cascade: 'inform', role: 'storage_tank' },
  { object_types: ['roof.system'], field: 'host_id', kind: 'hosted_on', cascade: 'inform', role: 'roof_host' },
  { object_types: ['extension.assembly', 'extension.zone'], field: 'host_id', kind: 'hosted_on', cascade: 'inform', role: 'existing_host' },
]

/** Storey datum fields that live in module data rather than `level_refs`. */
export const LEVEL_REFERENCE_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['level_id', 'host_level'],
  ['base_level_id', 'base_level'],
  ['top_level_id', 'top_level'],
  ['head_level_id', 'head_level'],
]

const RELATIONSHIP_KINDS: Record<string, DependencyEdgeKind> = {
  hosts: 'hosts',
  hosted_on: 'hosted_on',
  supports: 'supports',
  supported_by: 'supported_by',
  connects_to: 'connects_to',
  controls: 'controls',
  derived_from: 'derived_from',
  conflicts_with: 'conflicts_with',
}

const dataOf = (object: SmartObject): Record<string, unknown> =>
  object.module_data && typeof object.module_data === 'object' && !Array.isArray(object.module_data)
    ? object.module_data as Record<string, unknown>
    : {}

const markOf = (object: SmartObject): string => {
  const mark = dataOf(object).mark
  return typeof mark === 'string' && mark.trim() ? mark : object.object_type
}

const levelIdOf = (object: SmartObject): string | undefined => {
  const data = dataOf(object)
  for (const key of ['level_id', 'base_level_id', 'host_level_id']) {
    if (typeof data[key] === 'string') return data[key] as string
  }
  return object.level_refs.find(reference => reference.role === 'base_level' || reference.role === 'host_level')?.level_id
}

/**
 * Read `field`, `field[]` (id array) or `field[].child[]` (nested id array) into a flat id list.
 * A trailing `[]` expands the value at that step, so nested object arrays stay declarative.
 */
export function resolveReferenceIds(data: Record<string, unknown>, field: string): string[] {
  const steps = field.split('.').filter(step => step.length > 0)
  let current: unknown[] = [data]
  for (const step of steps) {
    const expand = step.endsWith('[]')
    const key = expand ? step.slice(0, -2) : step
    const next: unknown[] = []
    for (const item of current) {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
      const value = (item as Record<string, unknown>)[key]
      if (value === undefined || value === null) continue
      if (expand) {
        if (Array.isArray(value)) next.push(...value)
        else next.push(value)
      } else {
        next.push(value)
      }
    }
    current = next
  }
  return current.filter((value): value is string => typeof value === 'string' && value.length > 0)
}

/** Deterministic graph of the whole model: nodes keep incoming/outgoing edges, edges keep their basis. */
export function buildDependencyGraph(project: ProjectDocument): DependencyGraph {
  const warnings: string[] = []
  const nodes: Record<string, DependencyNode> = {}
  for (const level of project.levels) {
    nodes[level.id] = {
      object_id: level.id,
      object_type: 'core.level',
      mark: level.name,
      node_kind: 'level',
      created_phase: 'existing',
      removed_phase: null,
      outgoing: [],
      incoming: [],
    }
  }
  for (const object of Object.values(project.objects)) {
    nodes[object.id] = {
      object_id: object.id,
      object_type: object.object_type,
      mark: markOf(object),
      node_kind: 'object',
      created_phase: object.created_phase,
      removed_phase: object.removed_phase ?? null,
      ...(levelIdOf(object) ? { level_id: levelIdOf(object) as string } : {}),
      outgoing: [],
      incoming: [],
    }
  }

  const edges: DependencyEdge[] = []
  const seen = new Set<string>()
  const push = (edge: DependencyEdge): void => {
    const target = nodes[edge.target_id]
    const source = nodes[edge.source_id]
    if (!target || !source) {
      warnings.push(`${edge.source_id}: ${edge.basis} references missing object ${edge.target_id}`)
      return
    }
    if (edge.source_id === edge.target_id) {
      warnings.push(`${edge.source_id}: ${edge.basis} is self-referencing and ignored`)
      return
    }
    const key = `${edge.kind}|${edge.source_id}|${edge.target_id}|${edge.basis}`
    if (seen.has(key)) return
    seen.add(key)
    edges.push(edge)
    source.outgoing.push(edge)
    target.incoming.push(edge)
  }

  for (const object of Object.values(project.objects)) {
    const data = dataOf(object)
    // A host that a declared field already describes keeps that field's policy: a beam names its
    // supporting column, and losing a support must not delete the beam the way losing a wall
    // deletes the door hosted in it.
    const declaredHosts = new Set<string>()
    for (const rule of DEPENDENCY_REFERENCE_FIELDS) {
      if (!rule.object_types.includes(object.object_type)) continue
      for (const targetId of resolveReferenceIds(data, rule.field)) {
        const target = nodes[targetId]
        if (target && rule.ignore_target_types?.includes(target.object_type)) continue
        declaredHosts.add(targetId)
        push({
          kind: rule.kind,
          source_id: object.id,
          target_id: targetId,
          basis: rule.field,
          origin: 'module_data',
          cascade: rule.cascade,
          ...(rule.role ? { role: rule.role } : {}),
        })
      }
    }

    for (const hostId of object.host_refs) {
      if (declaredHosts.has(hostId)) continue
      push({ kind: 'hosted_on', source_id: object.id, target_id: hostId, basis: 'host_refs', origin: 'host_refs', cascade: 'delete', role: 'host' })
    }

    for (const reference of object.level_refs) {
      push({
        kind: 'references_level',
        source_id: object.id,
        target_id: reference.level_id,
        basis: `level_refs.${reference.role}`,
        origin: 'level_refs',
        cascade: 'follow',
        role: reference.role,
      })
    }

    // Declared vertical datums outside `level_refs` stay visible to the same graph.
    for (const [field, role] of LEVEL_REFERENCE_FIELDS) {
      const levelId = data[field]
      if (typeof levelId !== 'string' || !levelId) continue
      push({
        kind: 'references_level',
        source_id: object.id,
        target_id: levelId,
        basis: field,
        origin: 'module_data',
        cascade: 'follow',
        role,
      })
    }
  }

  for (const relationship of project.relationships) {
    const kind = RELATIONSHIP_KINDS[relationship.kind] ?? 'connects_to'
    const cascade: DependencyCascadePolicy = relationship.kind === 'hosts' ? 'rehost' : 'inform'
    push({
      kind,
      source_id: relationship.source_id,
      target_id: relationship.target_id,
      basis: `relationships.${relationship.kind}`,
      origin: 'relationships',
      cascade,
      ...(relationship.role ? { role: relationship.role } : {}),
      ...(relationship.meta ? { meta: relationship.meta } : {}),
    })
  }

  for (const node of Object.values(nodes)) {
    node.outgoing.sort(compareEdges)
    node.incoming.sort(compareEdges)
  }
  edges.sort(compareEdges)
  const by_kind: Record<string, number> = {}
  for (const edge of edges) by_kind[edge.kind] = (by_kind[edge.kind] ?? 0) + 1
  return {
    nodes,
    edges,
    warnings,
    summary: {
      object_count: Object.values(nodes).filter(node => node.node_kind === 'object').length,
      level_count: Object.values(nodes).filter(node => node.node_kind === 'level').length,
      edge_count: edges.length,
      by_kind,
    },
  }
}

function compareEdges(a: DependencyEdge, b: DependencyEdge): number {
  return a.source_id.localeCompare(b.source_id) || a.target_id.localeCompare(b.target_id) || a.kind.localeCompare(b.kind) || a.basis.localeCompare(b.basis)
}

/** Attach clash-engine findings to the graph so conflicts are first-class dependencies. */
export function withConflictEdges(
  graph: DependencyGraph,
  conflicts: ReadonlyArray<{ rule_id: string; severity: string; object_ids: readonly string[] }>,
): DependencyGraph {
  const edges = [...graph.edges]
  for (const conflict of conflicts) {
    const [first, second] = conflict.object_ids
    if (!first || !second) continue
    edges.push({
      kind: 'conflicts_with',
      source_id: first,
      target_id: second,
      basis: `clash:${conflict.rule_id}`,
      origin: 'conflict',
      cascade: 'inform',
      meta: { rule_id: conflict.rule_id, severity: conflict.severity },
    })
  }
  return buildGraphFromEdges(graph, edges)
}

function buildGraphFromEdges(base: DependencyGraph, edges: DependencyEdge[]): DependencyGraph {
  const nodes: Record<string, DependencyNode> = {}
  for (const node of Object.values(base.nodes)) nodes[node.object_id] = { ...node, incoming: [], outgoing: [] }
  const sorted = [...edges].sort(compareEdges)
  for (const edge of sorted) {
    const source = nodes[edge.source_id]
    const target = nodes[edge.target_id]
    if (!source || !target) continue
    source.outgoing.push(edge)
    target.incoming.push(edge)
  }
  const by_kind: Record<string, number> = {}
  for (const edge of sorted) by_kind[edge.kind] = (by_kind[edge.kind] ?? 0) + 1
  return {
    nodes,
    edges: sorted,
    warnings: base.warnings,
    summary: {
      object_count: Object.values(nodes).filter(node => node.node_kind === 'object').length,
      level_count: Object.values(nodes).filter(node => node.node_kind === 'level').length,
      edge_count: sorted.length,
      by_kind,
    },
  }
}

export type DependencyAction = 'delete' | 'demolish' | 'move' | 'phase_change'

export type DependencyDisposition = 'cascade_delete' | 'needs_rehost' | 'prune_reference' | 'follows_target' | 'informational' | 'blocks'

export interface DependencyImpactEntry {
  object_id: string
  object_type: string
  mark: string
  disposition: DependencyDisposition
  via: DependencyEdgeKind
  basis: string
  reason: string
  /** UUID chain from the seed object to this dependent. */
  path: string[]
  depth: number
}

export interface DependencyImpactReport {
  action: DependencyAction
  seeds: string[]
  entries: DependencyImpactEntry[]
  summary: Record<DependencyDisposition, number>
  blocking: DependencyImpactEntry[]
  /** Ready-to-render Thai lines for confirmations and panels. */
  messages: string[]
  warnings: string[]
}

/**
 * Cascade strength, strongest first. One pair can be linked by several edges at once (a wall's
 * door is declared both in `module_data.wall_id` and as a `hosted_on` relationship), and the
 * impact report must obey the strongest policy, not whichever edge happened to be visited first.
 */
const CASCADE_STRENGTH: Record<DependencyCascadePolicy, number> = {
  block: 5, delete: 4, rehost: 3, prune: 2, follow: 1, inform: 0,
}

const DISPOSITION_BY_ACTION: Record<DependencyAction, (policy: DependencyCascadePolicy) => DependencyDisposition> = {
  delete: policy => policy === 'delete' ? 'cascade_delete'
    : policy === 'rehost' ? 'needs_rehost'
      : policy === 'prune' ? 'prune_reference'
        : policy === 'follow' ? 'follows_target'
          : policy === 'block' ? 'blocks' : 'informational',
  demolish: policy => policy === 'delete' ? 'needs_rehost'
    : policy === 'rehost' ? 'needs_rehost'
      : policy === 'prune' ? 'prune_reference'
        : policy === 'follow' ? 'follows_target'
          : policy === 'block' ? 'blocks' : 'informational',
  phase_change: policy => policy === 'block' ? 'blocks' : 'informational',
  move: () => 'follows_target',
}

const ACTION_LABELS: Record<DependencyAction, string> = {
  delete: 'ลบ',
  demolish: 'รื้อถอน',
  move: 'ย้าย',
  phase_change: 'เปลี่ยนเฟส',
}

/**
 * Walk the graph to answer "who does this affect?" before the command is executed.
 * `follows_target` entries rely on the command handler to keep geometry in sync
 * (openings follow their host wall); they stay visible so nothing is silently assumed.
 */
export function analyzeDependencyImpact(
  graph: DependencyGraph,
  seedIds: readonly string[],
  action: DependencyAction,
): DependencyImpactReport {
  const classify = DISPOSITION_BY_ACTION[action]
  const messages: string[] = []
  const warnings: string[] = []
  const queue: Array<{ id: string; path: string[]; depth: number }> = []
  const visited = new Map<string, number>()

  for (const seed of [...new Set(seedIds)]) {
    if (!graph.nodes[seed]) {
      warnings.push(`ไม่พบวัตถุ ${seed} ในกราฟความสัมพันธ์`)
      continue
    }
    queue.push({ id: seed, path: [seed], depth: 0 })
    visited.set(seed, 0)
  }

  interface ChosenEdge { edge: DependencyEdge; sourceMark: string; sourceType: string; path: string[]; depth: number }
  const chosen = new Map<string, ChosenEdge>()
  const enqueue = (id: string, path: string[], depth: number): void => {
    const known = visited.get(id)
    if (known !== undefined && known <= depth) return
    visited.set(id, depth)
    queue.push({ id, path, depth })
  }

  while (queue.length) {
    const current = queue.shift() as { id: string; path: string[]; depth: number }
    const node = graph.nodes[current.id]
    if (!node) continue
    const depth = current.depth + 1
    for (const edge of node.incoming) {
      const dependent = graph.nodes[edge.source_id]
      if (!dependent) continue
      const existing = chosen.get(dependent.object_id)
      const better = !existing
        || depth < existing.depth
        || (depth === existing.depth && CASCADE_STRENGTH[edge.cascade] > CASCADE_STRENGTH[existing.edge.cascade])
      if (!better) continue
      const record: ChosenEdge = {
        edge,
        sourceMark: node.mark,
        sourceType: node.object_type,
        path: [...current.path, dependent.object_id],
        depth,
      }
      chosen.set(dependent.object_id, record)
      // Only dependents that a human or agent must act on keep the walk going: everything is
      // still reported, but a reference we merely prune cannot cascade further.
      const disposition = classify(record.edge.cascade)
      if (disposition === 'cascade_delete' || disposition === 'follows_target') enqueue(dependent.object_id, record.path, depth)
    }
  }

  const entries: DependencyImpactEntry[] = [...chosen.entries()].map(([dependentId, record]) => {
    const dependent = graph.nodes[dependentId]
    return {
      object_id: dependentId,
      object_type: dependent.object_type,
      mark: dependent.mark,
      disposition: classify(record.edge.cascade),
      via: record.edge.kind,
      basis: record.edge.basis,
      reason: `${record.sourceMark} (${record.sourceType}) ${ACTION_LABELS[action]} → ${dependent.mark} ${basisReason(record.edge.basis, record.edge.kind)}`,
      path: record.path,
      depth: record.depth,
    }
  })

  entries.sort((a, b) => a.depth - b.depth || a.object_id.localeCompare(b.object_id))
  const summary: Record<DependencyDisposition, number> = {
    cascade_delete: 0, needs_rehost: 0, prune_reference: 0, follows_target: 0, informational: 0, blocks: 0,
  }
  for (const entry of entries) summary[entry.disposition] += 1
  const blocking = entries.filter(entry => entry.disposition === 'blocks')
  if (summary.cascade_delete) messages.push(`ลบตามวัตถุต้นทาง ${summary.cascade_delete} ชิ้น`)
  if (summary.needs_rehost) messages.push(`ต้องหา host/ที่ยึดใหม่ ${summary.needs_rehost} ชิ้น`)
  if (summary.prune_reference) messages.push(`ต้องตัดการอ้างอิงออก ${summary.prune_reference} รายการ`)
  if (summary.blocks) messages.push(`มีงานที่ยังใช้งานอยู่ผูกกับวัตถุนี้ ${summary.blocks} รายการ — ต้องแก้ก่อน`)
  if (!messages.length) messages.push('ไม่พบวัตถุอื่นที่ผูกกับรายการนี้')
  return { action, seeds: [...new Set(seedIds)], entries, summary, blocking, messages, warnings }
}

function basisReason(basis: string, kind: DependencyEdgeKind): string {
  const clean = basis.replace(/\[\]$/g, '')
  switch (kind) {
    case 'hosted_on': return `อยู่บน host (${clean})`
    case 'supports': return `เป็นตัวรับน้ำหนักให้ (${clean})`
    case 'supported_by': return `ถูกค้ำด้วย (${clean})`
    case 'controls': return `ถูกควบคุมผ่าน (${clean})`
    case 'controlled_by': return `ควบคุมวัตถุนี้ผ่าน (${clean})`
    case 'derived_from': return `ได้รูปทรงมาจาก (${clean})`
    case 'connects_to': return `เชื่อมต่อผ่าน (${clean})`
    case 'references_level': return `อ้างระดับชั้น (${clean})`
    case 'conflicts_with': return `ชนกับ (${clean})`
    default: return `ผูกผ่าน (${clean})`
  }
}

/** Convenience wrapper for hosts that only need a project snapshot. */
export function analyzeProjectDependencyImpact(
  project: ProjectDocument,
  seedIds: readonly string[],
  action: DependencyAction,
): { graph: DependencyGraph; impact: DependencyImpactReport } {
  const graph = buildDependencyGraph(project)
  return { graph, impact: analyzeDependencyImpact(graph, seedIds, action) }
}

/** Objects that must be removed together with the given seeds under the current delete rules. */
export function cascadeDeletionSet(graph: DependencyGraph, seedIds: readonly string[]): string[] {
  const impact = analyzeDependencyImpact(graph, seedIds, 'delete')
  return [...new Set([...seedIds, ...impact.entries.filter(entry => entry.disposition === 'cascade_delete').map(entry => entry.object_id)])].sort()
}
