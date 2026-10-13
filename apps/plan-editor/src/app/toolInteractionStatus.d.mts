import type { ToolType } from '../components/Toolbar.js'

export interface ToolInteractionStatus {
  tool: ToolType
  step: string
  stepLabel: string
  instruction: string
  constraint: string
}
export function resolveToolInteractionStatus(tool: ToolType, state?: Record<string, unknown>): ToolInteractionStatus | null
export function resolveEscapeAction(tool: ToolType, hasPendingStep: boolean, hasSelection?: boolean): 'cancel-step' | 'clear-selection' | 'exit-tool' | 'noop'
export function hasPendingToolStep(state?: Record<string, unknown>): boolean
