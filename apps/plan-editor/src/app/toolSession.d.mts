import type { ToolType } from '../components/Toolbar.js'
export interface ToolSession { activeTool: ToolType; activation: number }
export function transitionToolSession(session: ToolSession, activeTool: ToolType): ToolSession
