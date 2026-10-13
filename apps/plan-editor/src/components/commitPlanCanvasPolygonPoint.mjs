/** Apply one canvas click to the active polygon placement session. */
export function commitPlanCanvasPolygonPoint({
  activeTool,
  clickCount,
  pointMm,
  zoom,
  boundary,
  selectedId,
  selectedObjectType,
  roofOptions,
  onCommitSlab,
  onCommitArchitecturalFloor,
  onCommitCeiling,
  onCommitRoof,
  onCommitSurfaceVoid,
  onBoundaryChange,
  onDrawLengthChange,
  onDrawAngleChange,
  clearDimensionOverrides,
}) {
  const closeDistance = Math.max(150, 18 / zoom)
  const closesAtStart = boundary.length >= 3
    && Math.hypot(pointMm[0] - boundary[0][0], pointMm[1] - boundary[0][1]) <= closeDistance

  if ((clickCount >= 2 || closesAtStart) && boundary.length >= 3) {
    if (activeTool === 'slab') onCommitSlab(boundary)
    else if (activeTool === 'archFloor') onCommitArchitecturalFloor?.(boundary)
    else if (activeTool === 'ceiling') onCommitCeiling?.(boundary)
    else if (activeTool === 'roof') onCommitRoof?.(boundary, roofOptions)
    else if (selectedId && ['structure.slab', 'architecture.floor', 'architecture.ceiling', 'roof.system'].includes(selectedObjectType ?? '')) {
      onCommitSurfaceVoid(selectedId, boundary)
    }
    onBoundaryChange([])
    onDrawLengthChange('')
    onDrawAngleChange('')
    clearDimensionOverrides()
    return 'committed'
  }

  if (clickCount < 2) {
    onBoundaryChange([...boundary, pointMm])
    onDrawLengthChange('')
    onDrawAngleChange('')
    clearDimensionOverrides()
    return 'point-added'
  }

  return 'ignored'
}
