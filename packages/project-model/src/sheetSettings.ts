export interface SavedSheetViewport {
  scale_denominator: number;
  center_mm?: [number, number];
  crop_bounds_mm?: [number, number, number, number];
  section_cut_mm?: number;
}
export interface DrawingSettings {
  viewports: Record<string, SavedSheetViewport>;
  revision?: string;
  author?: string;
}
export function validateDrawingSettings(
  value: unknown,
): asserts value is DrawingSettings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid drawing settings");
  const settings = value as DrawingSettings;
  if (
    !settings.viewports ||
    typeof settings.viewports !== "object" ||
    Array.isArray(settings.viewports)
  )
    throw new Error("Invalid sheet viewports");
  for (const [id, v] of Object.entries(settings.viewports)) {
    if (!/^(A-(0[1-9]|10)|S-0[1-6]|[ME]-0[12])$/.test(id))
      throw new Error("Invalid sheet ID");
    if (!v || ![20, 25, 50, 100, 200, 500].includes(v.scale_denominator))
      throw new Error("Invalid sheet scale");
    for (const [key, count] of [
      ["center_mm", 2],
      ["crop_bounds_mm", 4],
    ] as const) {
      const a = v[key];
      if (
        a !== undefined &&
        (!Array.isArray(a) ||
          a.length !== count ||
          a.some((n) => typeof n !== "number" || !Number.isFinite(n)))
      )
        throw new Error("Invalid sheet " + key);
    }
    const c = v.crop_bounds_mm;
    if (c && (c[2] <= c[0] || c[3] <= c[1]))
      throw new Error("Invalid sheet crop");
    if (v.section_cut_mm !== undefined && !Number.isFinite(v.section_cut_mm))
      throw new Error("Invalid section cut");
  }
  for (const key of ["revision", "author"] as const)
    if (settings[key] !== undefined && typeof settings[key] !== "string")
      throw new Error("Invalid drawing " + key);
}
