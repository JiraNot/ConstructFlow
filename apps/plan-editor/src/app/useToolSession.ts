import { useCallback, useRef, useState } from 'react'
import type { ToolType } from '../components/Toolbar.js'
import { repeatToolSession, transitionToolSession, type ToolSession } from './toolSession.mjs'

/** Owns the active authoring session; canvas-local drafts reset on activation changes. */
export function useToolSession(initialTool: ToolType = 'select') {
  const [session, setSession] = useState<ToolSession>({ activeTool: initialTool, activation: 0 })
  const lastPlacementTool = useRef<ToolType>(initialTool === 'select' ? 'wall' : initialTool)
  const activate = useCallback((tool: ToolType) => {
    if (tool !== 'select' && tool !== 'measure' && tool !== 'calibrate' && tool !== 'erase') lastPlacementTool.current = tool
    setSession(current => transitionToolSession(current, tool))
  }, [])
  const repeat = useCallback(() => setSession(current => repeatToolSession(current, lastPlacementTool.current)), [])
  const cancel = useCallback(() => activate('select'), [activate])
  return { activeTool: session.activeTool, activation: session.activation, lastPlacementTool: lastPlacementTool.current, activate, repeat, cancel }
}
