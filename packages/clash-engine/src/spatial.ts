// Shared spatial types for the clash/coordination engines (canonical millimeters).

export type Vec3 = [number, number, number]

/** Axis-aligned bounds; all clash analysis uses the model's canonical millimeter units. */
export interface SpatialBounds {
  min: Vec3
  max: Vec3
}
