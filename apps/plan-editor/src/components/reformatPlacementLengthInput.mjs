import { formatLengthMm, parseLengthMm } from '@constructflow/project-model'

export function reformatPlacementLengthInput(value, fromUnit, toUnit) {
  if (!value.trim() || fromUnit === toUnit) return value
  const millimeters = parseLengthMm(value, fromUnit)
  return millimeters === null ? value : formatLengthMm(millimeters, toUnit)
}
