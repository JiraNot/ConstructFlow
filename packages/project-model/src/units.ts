/** Meter-first length input; an explicit suffix overrides the default unit. */
export function parseLengthMm(text: string): number | null {
  const match = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(mm|cm|m)?\s*$/i.exec(text);
  if (!match) return null;
  const factor = match[2]?.toLowerCase() === "mm" ? 1 : match[2]?.toLowerCase() === "cm" ? 10 : 1000;
  const value = Number(match[1]) * factor;
  return Number.isFinite(value) ? value : null;
}
