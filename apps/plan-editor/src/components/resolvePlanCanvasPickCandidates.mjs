/** Resolves overlapping hit targets in a stable, domain-aware selection order. */
export function resolvePlanCanvasPickCandidates(project, findHitObject, point, preferWall = false) {
  const excluded = new Set()
  for (let index = 0; index < Object.keys(project.objects).length; index++) {
    const id = findHitObject(point, preferWall, excluded)
    if (!id) break
    excluded.add(id)
  }
  const rank = id => {
    const object = project.objects[id]
    switch (object?.object_type) {
      case 'door_window.door': return 0
      case 'door_window.window': return 1
      case 'structure.column': return 2
      case 'architecture.wall': return 3
      case 'structure.beam': return 4
      case 'architecture.stair': return 5
      case 'structure.foundation': return 6
      case 'structure.grid': return 7
      case 'architecture.room': return 9
      default: return 8
    }
  }
  return [...excluded].sort((a, b) => rank(a) - rank(b))
}
