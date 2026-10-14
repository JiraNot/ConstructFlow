export function stairLandingGripPoint(stair) {
  if (stair.stair_type === 'straight') return null
  const [sx, sy] = stair.start_point_mm
  const angle = Number(stair.rotation_deg ?? 0) * Math.PI / 180
  const firstFlightRisers = stair.first_flight_risers ?? Math.floor(stair.num_risers / 2)
  const firstRun = Math.max(1, firstFlightRisers - 1) * stair.tread_depth_mm
  const landingDepth = stair.landing_depth_mm ?? stair.width_mm
  const localY = stair.stair_type === 'u_shape'
    ? stair.width_mm * 2 + (stair.flight_gap_mm ?? 100)
    : landingDepth
  const mirroredY = stair.turn_direction === 'left' ? stair.width_mm - localY : localY
  const localX = firstRun + landingDepth
  return [
    sx + localX * Math.cos(angle) - mirroredY * Math.sin(angle),
    sy + localX * Math.sin(angle) + mirroredY * Math.cos(angle),
  ]
}
