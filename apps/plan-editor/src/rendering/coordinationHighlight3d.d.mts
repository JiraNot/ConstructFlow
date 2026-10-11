import type * as THREE from 'three'
import type { ClashSeverity, CoordinationFinding } from '@constructflow/clash-engine'

export const COORDINATION_HIGHLIGHT_3D_NAME: string

export interface CoordinationHighlight3DOptions {
  severities?: readonly ClashSeverity[]
  /** Upper bound on highlighted findings, worst severity first. */
  maxFindings?: number
}

/** Build renderer-neutral Three.js objects for the selected coordination findings. */
export function buildCoordinationHighlightGroup(
  findings: readonly CoordinationFinding[],
  options?: CoordinationHighlight3DOptions,
): THREE.Group

/** Release geometries/materials owned by a group and clear its children. */
export function disposeCoordinationHighlightGroup(group: THREE.Group): void
