const definition = (input, preview, dimensionPlacement = false) => ({
  input,
  preview,
  dimensionPlacement,
  keepsToolActive: !['selection', 'measure', 'calibration'].includes(input),
})

/** Single source of truth for how each toolbar tool consumes pointer input. */
export const TOOL_INTERACTION_REGISTRY = Object.freeze({
  select: definition('selection', 'selection'),
  column: definition('point', 'point', true),
  foundation: definition('point', 'point', true),
  beam: definition('two-point', 'line', true),
  wall: definition('two-point', 'line', true),
  door: definition('hosted-point', 'point', true),
  window: definition('hosted-point', 'point', true),
  slab: definition('polyline', 'polygon', true),
  slabVoid: definition('polyline', 'polygon', true),
  archFloor: definition('polyline', 'polygon', true),
  ceiling: definition('polyline', 'polygon', true),
  roof: definition('polyline', 'polygon', true),
  pipe: definition('two-point', 'line', true),
  fixture: definition('point', 'point', true),
  cabinet: definition('two-point', 'line', true),
  furniture: definition('two-point', 'line', true),
  moulding: definition('two-point', 'line', true),
  roomSeparator: definition('two-point', 'line', true),
  grid: definition('two-point', 'line', true),
  gridSystem: definition('point', 'point'),
  gridCopy: definition('grid-copy', 'line'),
  stair: definition('two-point', 'line', true),
  measure: definition('measure', 'line'),
  dimension: definition('dimension', 'line'),
  calibrate: definition('calibration', 'line'),
  erase: definition('point', 'none'),
})

export const isPolygonInteraction = tool => TOOL_INTERACTION_REGISTRY[tool].input === 'polyline'
export const isTwoPointInteraction = tool => TOOL_INTERACTION_REGISTRY[tool].input === 'two-point'
export const usesPlacementDimensions = tool => TOOL_INTERACTION_REGISTRY[tool].dimensionPlacement
