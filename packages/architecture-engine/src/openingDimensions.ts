export interface OpeningDimensions {
  width_mm: number;
  height_mm: number;
  main_height_mm: number;
  transom_height_mm: number;
  bottom_light_height_mm: number;
}

/** Nominal region heights include their framing, not clear sash/egress sizes.
 * Invalid drafts have no measurement; never clamp a light then label its requested size.
 */
export function measureOpeningRegions(parameters: {
  width_mm: number;
  height_mm: number;
  transom_height_mm?: number;
  bottom_light_height_mm?: number;
}): OpeningDimensions | undefined {
  const { width_mm, height_mm } = parameters;
  const transom_height_mm = parameters.transom_height_mm ?? 0;
  const bottom_light_height_mm = parameters.bottom_light_height_mm ?? 0;
  if (
    ![width_mm, height_mm, transom_height_mm, bottom_light_height_mm].every(
      Number.isFinite,
    ) ||
    width_mm <= 0 ||
    height_mm <= 0 ||
    transom_height_mm < 0 ||
    bottom_light_height_mm < 0
  )
    return undefined;
  const main_height_mm = height_mm - transom_height_mm - bottom_light_height_mm;
  if (main_height_mm <= 0) return undefined;
  return {
    width_mm,
    height_mm,
    main_height_mm,
    transom_height_mm,
    bottom_light_height_mm,
  };
}
