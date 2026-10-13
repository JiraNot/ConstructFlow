export function transitionToolSession(session, activeTool) {
  if (session.activeTool === activeTool) return session
  return { activeTool, activation: session.activation + 1 }
}

export function repeatToolSession(session, lastPlacementTool) {
  return { activeTool: lastPlacementTool, activation: session.activation + 1 }
}
