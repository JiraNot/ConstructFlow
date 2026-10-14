export function groupProjectBrowserObjects(objects) {
  const grouped = new Map()
  for (const object of objects) {
    let members = grouped.get(object.object_type)
    if (!members) {
      members = []
      grouped.set(object.object_type, members)
    }
    members.push(object)
  }
  return [...grouped.entries()]
}
