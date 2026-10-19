export const PLAN_GRID_BUBBLE_RADIUS_PX = 14

export function electricalFixtureScreenSymbol(kind) {
  if (kind === 'panel') return { shape: 'panel', halfWidth: 7, halfHeight: 9, detail: 'none' }
  if (kind === 'switch') return { shape: 'circle', radius: 6, detail: 'switch' }
  if (kind === 'outlet') return { shape: 'circle', radius: 6, detail: 'outlet' }
  return { shape: 'circle', radius: 7, detail: 'light' }
}

/** Draws electrical symbols without inheriting the model zoom transform. */
export function drawElectricalFixtureScreenSymbol(ctx, x, y, kind) {
  const symbol = electricalFixtureScreenSymbol(kind)
  ctx.save()
  ctx.strokeStyle = '#7c3aed'
  ctx.fillStyle = '#ffffff'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  if (symbol.shape === 'panel') ctx.rect(x - symbol.halfWidth, y - symbol.halfHeight, symbol.halfWidth * 2, symbol.halfHeight * 2)
  else ctx.arc(x, y, symbol.radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  if (symbol.detail === 'switch') {
    ctx.beginPath(); ctx.moveTo(x - 4, y + 4); ctx.lineTo(x + 4, y - 4); ctx.stroke()
  } else if (symbol.detail === 'outlet') {
    ctx.beginPath(); ctx.moveTo(x - 2, y - 2); ctx.lineTo(x - 2, y + 2); ctx.moveTo(x + 2, y - 2); ctx.lineTo(x + 2, y + 2); ctx.stroke()
  } else if (symbol.detail === 'light') {
    ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.stroke()
  }
  ctx.restore()
  return symbol
}
