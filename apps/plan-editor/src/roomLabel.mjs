/** Return an area label only when the room boundary is current and the area is finite. */
export function formatRoomAreaM2(areaMm2, boundaryStatus) {
  if (boundaryStatus === 'unclosed') return null
  const area = Number(areaMm2)
  return Number.isFinite(area) && area >= 0 ? (area / 1_000_000).toFixed(2) : null
}
