import type { ToolType } from '../components/Toolbar.js'

export type ToolInputKind = 'selection' | 'point' | 'hosted-point' | 'two-point' | 'polyline' | 'measure' | 'dimension' | 'calibration' | 'grid-copy'
export interface ToolInteractionDefinition {
  input: ToolInputKind
  dimensionPlacement: boolean
  keepsToolActive: boolean
  preview: 'selection' | 'point' | 'line' | 'polygon' | 'none'
}
export const TOOL_INTERACTION_REGISTRY: Readonly<Record<ToolType, ToolInteractionDefinition>>
export function isPolygonInteraction(tool: ToolType): boolean
export function isTwoPointInteraction(tool: ToolType): boolean
export function usesPlacementDimensions(tool: ToolType): boolean
