import { useCallback, useState } from 'react'
import type { ToolType } from '../components/Toolbar.js'
import { transitionToolSession, type ToolSession } from './toolSession.mjs'

/** Owns the active authoring session; canvas-local drafts reset on activation changes. */
export function useToolSession(initialTool: ToolType = 'select') {
  const [session, setSession] = useState<ToolSession>({ activeTool: initialTool, activation: 0 })
  const activate = useCallback((tool: ToolType) => setSession(current => transitionToolSession(current, tool)), [])
  const cancel = useCallback(() => activate('select'), [activate])
  return { activeTool: session.activeTool, activation: session.activation, activate, cancel }
}
