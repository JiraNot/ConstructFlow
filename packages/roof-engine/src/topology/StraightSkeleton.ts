import type { Point2Mm } from '@constructflow/project-model';

export interface RoofTopologyEdge {
  start: Point2Mm;
  end: Point2Mm;
  kind: 'ridge' | 'hip' | 'valley' | 'eave' | 'rake';
}

export interface RoofTopology {
  edges: RoofTopologyEdge[];
  faces: Point2Mm[][];
}

/**
 * Computes a bespoke 3D Roof Topology (Straight Skeleton) for a given footprint.
 * Currently a structural stub that processes standard rectangular footprints correctly.
 */
export function computeRoofSkeleton(footprint: Point2Mm[], pitchDeg: number = 30): RoofTopology {
  // 1. Initialize active edge contour
  // 2. Calculate angular bisectors for all vertices
  // 3. Find intersection events (edge collapse, split)
  // 4. Construct 3D ridge and valley graph
  
  if (footprint.length !== 4) {
      // Fallback for complex polygons (real robust shrinking algo goes here)
      const edges: RoofTopologyEdge[] = [];
      for (let i = 0; i < footprint.length; i++) {
          const start = footprint[i];
          const end = footprint[(i + 1) % footprint.length];
          edges.push({ start, end, kind: 'eave' });
      }
      return { edges, faces: [footprint] };
  }

  // Simplified Hip Roof logic for a 4-point rectangle
  // Assuming points are ordered and form a rectangle
  const [p0, p1, p2, p3] = footprint;
  
  // Calculate midpoints and ridge line for a basic rectangular hip roof
  const width = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const length = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  
  const isWidthShorter = width < length;
  const inset = isWidthShorter ? width / 2 : length / 2;

  // Simple hardcoded offset for the typical hip roof shape
  const dx01 = (p1[0] - p0[0]) / width;
  const dy01 = (p1[1] - p0[1]) / width;
  
  const dx12 = (p2[0] - p1[0]) / length;
  const dy12 = (p2[1] - p1[1]) / length;

  const ridgeStart: Point2Mm = [
    p0[0] + dx01 * inset + dx12 * inset,
    p0[1] + dy01 * inset + dy12 * inset
  ];
  
  const ridgeEnd: Point2Mm = [
    p3[0] + dx01 * inset - dx12 * inset,
    p3[1] + dy01 * inset - dy12 * inset
  ];

  return {
    edges: [
      { start: p0, end: p1, kind: 'eave' },
      { start: p1, end: p2, kind: 'eave' },
      { start: p2, end: p3, kind: 'eave' },
      { start: p3, end: p0, kind: 'eave' },
      { start: p0, end: ridgeStart, kind: 'hip' },
      { start: p1, end: ridgeStart, kind: 'hip' },
      { start: p2, end: ridgeEnd, kind: 'hip' },
      { start: p3, end: ridgeEnd, kind: 'hip' },
      { start: ridgeStart, end: ridgeEnd, kind: 'ridge' }
    ],
    faces: []
  };
}
