import type { ClashSeverity, CoordinationFinding } from '@constructflow/clash-engine'

export type OverlayWorldPoint = readonly number[]
export type CoordinationProjector = (point_mm: OverlayWorldPoint) => [number, number]

export interface CoordinationSeverityStyle {
  stroke: string
  fill: string
  badge: string
  label_th: string
}

export interface CoordinationOverlayOptions {
  /** World millimetres -> screen pixels. */
  project: CoordinationProjector
  /** Restrict to these severities; omitted = every severity. */
  severities?: readonly ClashSeverity[]
  /** Restrict to findings that touch at least one of these object UUIDs. */
  objectIds?: readonly string[]
  /** Hide on-canvas badges (the inspector panel still lists everything). */
  showLabels?: boolean
  /** Upper bound on rendered findings, worst severity first. */
  maxFindings?: number
}

export type CoordinationPrimitive =
  | { kind: 'rect'; tone: 'subject_a' | 'subject_b' | 'impact'; severity: ClashSeverity; x: number; y: number; width: number; height: number }
  | { kind: 'measure'; severity: ClashSeverity; x1: number; y1: number; x2: number; y2: number; text: string }
  | { kind: 'badge'; severity: ClashSeverity; x: number; y: number; width: number; height: number; lines: string[] }

export declare const COORDINATION_SEVERITY_STYLE: Record<ClashSeverity, CoordinationSeverityStyle>

export declare function coordinationMeasureText(finding: CoordinationFinding): string
export declare function coordinationFixText(finding: CoordinationFinding): string
export declare function coordinationFindingsForObject(findings: readonly CoordinationFinding[], objectId: string): CoordinationFinding[]
export declare function planCoordinationOverlay(
  findings: readonly CoordinationFinding[],
  options: CoordinationOverlayOptions,
): CoordinationPrimitive[]
