export function countProjectObjects(project) {
  const counts = Object.create(null)
  for (const object of Object.values(project.objects)) {
    counts[object.object_type] = (counts[object.object_type] ?? 0) + 1
  }
  return counts
}
