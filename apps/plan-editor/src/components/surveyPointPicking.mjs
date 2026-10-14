export function findNearestSurveyPoint(screenPoint, candidates, maxDistance = 11) {
  let nearestId = null
  let nearestDistance = maxDistance

  for (const candidate of candidates) {
    const distance = Math.hypot(candidate.point[0] - screenPoint[0], candidate.point[1] - screenPoint[1])
    if (distance < nearestDistance) {
      nearestId = candidate.id
      nearestDistance = distance
    }
  }

  return nearestId
}
