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

export interface ParametricSymbolDefinition {
  parameters: string[];
  points: ParametricPoint[];
  equations: ParametricEquation[];
  lines: ParametricLine[];
}

export interface EvaluatedSymbolLine {
  id: string;
  start: [number, number];
  end: [number, number];
  style?: 'solid' | 'dashed' | 'dashdot';
  thickness?: number;
}
