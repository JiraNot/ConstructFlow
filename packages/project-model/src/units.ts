export type DisplayLengthUnit = 'm' | 'cm' | 'mm'

export function lengthUnitFactor(unit: DisplayLengthUnit): number {
  return unit === 'm' ? 1000 : unit === 'cm' ? 10 : 1
}

export function formatLengthMm(value_mm: number, unit: DisplayLengthUnit, precision?: number): string {
  const digits = precision ?? (unit === 'm' ? 3 : unit === 'cm' ? 1 : 0)
  return (value_mm / lengthUnitFactor(unit)).toFixed(digits)
}

/** Parse a length into canonical millimeters; an explicit suffix overrides the chosen display unit. */
export function parseLengthMm(text: string, defaultUnit: DisplayLengthUnit = 'm'): number | null {
  const match = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(mm|cm|m)?\s*$/i.exec(text);
  if (!match) return null;
  const suffix = match[2]?.toLowerCase() as DisplayLengthUnit | undefined
  const factor = lengthUnitFactor(suffix ?? defaultUnit)
  const value = Number(match[1]) * factor;
  return Number.isFinite(value) ? value : null;
}
