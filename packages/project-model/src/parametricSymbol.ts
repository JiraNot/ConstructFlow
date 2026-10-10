export interface ParametricEquationTerm {
  variable: string;
  coefficient: number;
}

export interface ParametricEquation {
  id: string;
  terms: ParametricEquationTerm[];
  constant: number;
  operator?: 'eq' | 'ge' | 'le'; // default 'eq'
}

export interface ParametricPoint {
  id: string;
  x: number;
  y: number;
}

export interface ParametricLine {
  id: string;
  start_point: string;
  end_point: string;
  style?: 'solid' | 'dashed' | 'dashdot';
  thickness?: number;
}

export interface ParametricPolygon {
  id: string;
  point_ids: string[];
  style?: 'solid' | 'dashed';
  thickness?: number;
  fill?: string;
  closed?: boolean;
}

export interface ParametricArc {
  id: string;
  center_point: string;
  radius_var?: string;
  radius_mm?: number;
  start_angle_deg: number;
  sweep_angle_deg: number;
  style?: 'solid' | 'dashed';
  thickness?: number;
}

export interface ParametricSymbolDefinition {
  parameters: string[];
  points: ParametricPoint[];
  equations: ParametricEquation[];
  lines: ParametricLine[];
  polygons?: ParametricPolygon[];
  arcs?: ParametricArc[];
}

export interface EvaluatedSymbolLine {
  id: string;
  start: [number, number];
  end: [number, number];
  style?: 'solid' | 'dashed' | 'dashdot';
  thickness?: number;
}

export interface EvaluatedSymbolPolygon {
  id: string;
  points: Array<[number, number]>;
  style?: 'solid' | 'dashed';
  thickness: number;
  fill?: string;
  closed: boolean;
}

export interface EvaluatedSymbolArc {
  id: string;
  center: [number, number];
  radius: number;
  start_angle_deg: number;
  sweep_angle_deg: number;
  style?: 'solid' | 'dashed';
  thickness: number;
}

export type EvaluatedParametricSymbol = EvaluatedSymbolLine[] & {
  lines: EvaluatedSymbolLine[];
  polygons: EvaluatedSymbolPolygon[];
  arcs: EvaluatedSymbolArc[];
};
