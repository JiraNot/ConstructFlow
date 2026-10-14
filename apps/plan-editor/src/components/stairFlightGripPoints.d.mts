export function stairFlightGripPoints(stair: {
  stair_type: string; start_point_mm: [number, number, number]; width_mm: number; num_risers: number;
  first_flight_risers?: number; tread_depth_mm: number; second_tread_depth_mm?: number;
  landing_depth_mm?: number; flight_gap_mm?: number; turn_direction?: string; rotation_deg?: number;
} | null | undefined): Array<{ flight: 'first' | 'second'; point: [number, number]; direction: [number, number]; run: number }>
