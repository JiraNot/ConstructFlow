export function transitionToolSession(session, activeTool) {
  if (session.activeTool === activeTool) return session
  return { activeTool, activation: session.activation + 1 }
}
