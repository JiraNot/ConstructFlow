/** Grip points at the ends of each editable flight on an L/U stair. */
export function stairFlightGripPoints(stair) {
  if (!stair || stair.stair_type === 'straight') return []
  const [sx, sy] = stair.start_point_mm
  const width = Number(stair.width_mm)
  const n = Number(stair.num_risers)
  const n1 = Number(stair.first_flight_risers ?? Math.floor(n / 2))
  const n2 = n - n1
  const firstRun = Math.max(1, n1 - 1) * Number(stair.tread_depth_mm)
  const secondTread = Number(stair.second_tread_depth_mm ?? stair.tread_depth_mm)
  const secondRun = Math.max(1, n2 - 1) * secondTread
  const landingDepth = Number(stair.landing_depth_mm ?? width)
  const gap = Number(stair.flight_gap_mm ?? 100)
  const local = stair.stair_type === 'u_shape'
    ? [
        { flight: 'first', point: [sx + firstRun, sy + width / 2], direction: [1, 0], run: firstRun },
        { flight: 'second', point: [sx + firstRun - secondRun, sy + width + gap + width / 2], direction: [-1, 0], run: secondRun },
      ]
    : [
        { flight: 'first', point: [sx + firstRun, sy + width / 2], direction: [1, 0], run: firstRun },
        { flight: 'second', point: [sx + firstRun + width / 2, sy + landingDepth + secondRun], direction: [0, 1], run: secondRun },
      ]
  const mirror = stair.turn_direction === 'left'
  const angle = Number(stair.rotation_deg ?? 0) * Math.PI / 180
  const cos = Math.cos(angle), sin = Math.sin(angle)
  return local.map(grip => {
    const lx = grip.point[0] - sx
    const ly = mirror ? width - (grip.point[1] - sy) : grip.point[1] - sy
    const dx = grip.direction[0]
    const dy = mirror ? -grip.direction[1] : grip.direction[1]
    return {
      flight: grip.flight,
      point: [sx + lx * cos - ly * sin, sy + lx * sin + ly * cos],
      direction: [dx * cos - dy * sin, dx * sin + dy * cos],
      run: grip.run,
    }
  })
}
