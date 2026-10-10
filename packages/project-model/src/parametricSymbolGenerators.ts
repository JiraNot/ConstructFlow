import {
  ParametricSymbolDefinition,
  ParametricEquation,
  ParametricPoint,
  ParametricLine,
  ParametricPolygon,
  ParametricArc,
} from './parametricSymbol.js';

export interface DoorElevationSymbolOptions {
  panelCount?: number;
  hingeAtStart?: boolean;
  showOperationIndicator?: boolean;
}

export interface WindowElevationSymbolOptions {
  panelCount?: number;
  panelWidthRatios?: number[];
  muntinRows?: number;
  muntinColumns?: number;
  showOperationIndicator?: boolean;
}

export interface DoorPlanSymbolOptions {
  panelCount?: number;
  handing?: 'left_in' | 'left_out' | 'right_in' | 'right_out';
  operation?: 'hinged' | 'sliding' | 'pocket' | 'folding';
}

export interface WindowPlanSymbolOptions {
  panelCount?: number;
  panelWidthRatios?: number[];
  operation?: 'sliding' | 'casement' | 'fixed' | 'awning';
}

export function createDoorElevationSymbol(
  optionsOrPanelCount?: number | DoorElevationSymbolOptions,
  legacyHingeAtStart: boolean = true
): ParametricSymbolDefinition {
  const options: DoorElevationSymbolOptions =
    typeof optionsOrPanelCount === 'number'
      ? { panelCount: optionsOrPanelCount, hingeAtStart: legacyHingeAtStart, showOperationIndicator: true }
      : { panelCount: 1, hingeAtStart: true, showOperationIndicator: false, ...(optionsOrPanelCount ?? {}) };

  const panelCount = Math.max(1, Math.min(4, Math.floor(options.panelCount ?? 1)));
  const hingeAtStart = options.hingeAtStart !== false;
  const showOperationIndicator = Boolean(options.showOperationIndicator);

  const points: ParametricPoint[] = [];
  const equations: ParametricEquation[] = [];
  const lines: ParametricLine[] = [];
  const polygons: ParametricPolygon[] = [];
  let eqId = 0;

  const addEq = (terms: { v: string; c: number }[], constant: number) => {
    equations.push({
      id: `eq_${eqId++}`,
      terms: terms.map((t) => ({ variable: t.v, coefficient: t.c })),
      constant,
    });
  };

  const addPt = (id: string, x: number, y: number) => {
    points.push({ id, x, y });
  };

  const addLine = (id: string, start: string, end: string, style?: 'dashed' | 'solid', thickness?: number) => {
    lines.push({ id, start_point: start, end_point: end, style, thickness: thickness ?? 0.25 });
  };

  // Parameters: W (width), H (height), F (frame width)
  // Outer Frame Points
  addPt('out_bl', 0, 0);
  addPt('out_br', 1000, 0);
  addPt('out_tl', 0, 2000);
  addPt('out_tr', 1000, 2000);

  // Inner Frame Points
  addPt('in_bl', 50, 0);
  addPt('in_br', 950, 0);
  addPt('in_tl', 50, 1950);
  addPt('in_tr', 950, 1950);

  // Equations for Outer Frame
  addEq([{ v: 'out_bl.x', c: 1 }], 0);
  addEq([{ v: 'out_bl.y', c: 1 }], 0);
  addEq([{ v: 'out_br.x', c: 1 }, { v: 'W', c: -1 }], 0);
  addEq([{ v: 'out_br.y', c: 1 }], 0);
  addEq([{ v: 'out_tl.x', c: 1 }], 0);
  addEq([{ v: 'out_tl.y', c: 1 }, { v: 'H', c: -1 }], 0);
  addEq([{ v: 'out_tr.x', c: 1 }, { v: 'W', c: -1 }], 0);
  addEq([{ v: 'out_tr.y', c: 1 }, { v: 'H', c: -1 }], 0);

  // Equations for Inner Frame
  addEq([{ v: 'in_bl.x', c: 1 }, { v: 'F', c: -1 }], 0);
  addEq([{ v: 'in_bl.y', c: 1 }], 0);
  addEq([{ v: 'in_br.x', c: 1 }, { v: 'W', c: -1 }, { v: 'F', c: 1 }], 0);
  addEq([{ v: 'in_br.y', c: 1 }], 0);
  addEq([{ v: 'in_tl.x', c: 1 }, { v: 'F', c: -1 }], 0);
  addEq([{ v: 'in_tl.y', c: 1 }, { v: 'H', c: -1 }, { v: 'F', c: 1 }], 0);
  addEq([{ v: 'in_tr.x', c: 1 }, { v: 'W', c: -1 }, { v: 'F', c: 1 }], 0);
  addEq([{ v: 'in_tr.y', c: 1 }, { v: 'H', c: -1 }, { v: 'F', c: 1 }], 0);

  // Polygons for Outer Frame Background (white fill to mask wall hatch) and Inner Frame
  polygons.push({
    id: 'out_frame_poly',
    point_ids: ['out_bl', 'out_br', 'out_tr', 'out_tl'],
    fill: '#ffffff',
    thickness: 0.35,
    closed: true,
  });

  polygons.push({
    id: 'in_frame_poly',
    point_ids: ['in_bl', 'in_br', 'in_tr', 'in_tl'],
    thickness: 0.25,
    closed: true,
  });

  // Lines for Outer Frame
  addLine('out_l', 'out_bl', 'out_tl', 'solid', 0.35);
  addLine('out_t', 'out_tl', 'out_tr', 'solid', 0.35);
  addLine('out_r', 'out_tr', 'out_br', 'solid', 0.35);

  // Lines for Inner Frame
  addLine('in_l', 'in_bl', 'in_tl', 'solid', 0.25);
  addLine('in_t', 'in_tl', 'in_tr', 'solid', 0.25);
  addLine('in_r', 'in_tr', 'in_br', 'solid', 0.25);

  // Multi-panel logic for door leaves
  for (let i = 0; i < panelCount; i++) {
    const pStr = `p${i}`;
    addPt(`${pStr}_bl`, 50 + i * 450, 0);
    addPt(`${pStr}_br`, 50 + (i + 1) * 450, 0);
    addPt(`${pStr}_tl`, 50 + i * 450, 1950);
    addPt(`${pStr}_tr`, 50 + (i + 1) * 450, 1950);
    addPt(`${pStr}_mid_l`, 50 + i * 450, 975);
    addPt(`${pStr}_mid_r`, 50 + (i + 1) * 450, 975);

    addEq(
      [
        { v: `${pStr}_bl.x`, c: panelCount },
        { v: 'W', c: -i },
        { v: 'F', c: -(panelCount - 2 * i) },
      ],
      0
    );
    addEq(
      [
        { v: `${pStr}_br.x`, c: panelCount },
        { v: 'W', c: -(i + 1) },
        { v: 'F', c: -(panelCount - 2 * (i + 1)) },
      ],
      0
    );

    addEq([{ v: `${pStr}_bl.y`, c: 1 }], 0);
    addEq([{ v: `${pStr}_br.y`, c: 1 }], 0);

    addEq([{ v: `${pStr}_tl.x`, c: 1 }, { v: `${pStr}_bl.x`, c: -1 }], 0);
    addEq([{ v: `${pStr}_tr.x`, c: 1 }, { v: `${pStr}_br.x`, c: -1 }], 0);
    addEq([{ v: `${pStr}_tl.y`, c: 1 }, { v: 'in_tl.y', c: -1 }], 0);
    addEq([{ v: `${pStr}_tr.y`, c: 1 }, { v: 'in_tr.y', c: -1 }], 0);

    // Mid points for swing
    addEq([{ v: `${pStr}_mid_l.x`, c: 1 }, { v: `${pStr}_bl.x`, c: -1 }], 0);
    addEq([{ v: `${pStr}_mid_r.x`, c: 1 }, { v: `${pStr}_br.x`, c: -1 }], 0);
    addEq([{ v: `${pStr}_mid_l.y`, c: 2 }, { v: 'in_tl.y', c: -1 }], 0);
    addEq([{ v: `${pStr}_mid_r.y`, c: 2 }, { v: 'in_tr.y', c: -1 }], 0);

    if (i > 0) addLine(`${pStr}_sep`, `${pStr}_bl`, `${pStr}_tl`, 'solid', 0.25);

    // Optional swing symbol (dashed diagonals)
    if (showOperationIndicator) {
      const panelHingeLeft = panelCount === 1 ? hingeAtStart : i === 0;
      if (panelHingeLeft) {
        addLine(`${pStr}_swing_t`, `${pStr}_tl`, `${pStr}_mid_r`, 'dashed', 0.2);
        addLine(`${pStr}_swing_b`, `${pStr}_bl`, `${pStr}_mid_r`, 'dashed', 0.2);
      } else {
        addLine(`${pStr}_swing_t`, `${pStr}_tr`, `${pStr}_mid_l`, 'dashed', 0.2);
        addLine(`${pStr}_swing_b`, `${pStr}_br`, `${pStr}_mid_l`, 'dashed', 0.2);
      }
    }
  }

  return {
    parameters: ['W', 'H', 'F'],
    points,
    equations,
    lines,
    polygons,
  };
}

export function createWindowElevationSymbol(
  optionsOrPanelCount?: number | WindowElevationSymbolOptions
): ParametricSymbolDefinition {
  const options: WindowElevationSymbolOptions =
    typeof optionsOrPanelCount === 'number'
      ? { panelCount: optionsOrPanelCount, showOperationIndicator: true }
      : { panelCount: 2, showOperationIndicator: false, ...(optionsOrPanelCount ?? {}) };

  const panelCount = Math.max(1, Math.min(8, Math.floor(options.panelCount ?? 2)));
  const ratios =
    options.panelWidthRatios &&
    options.panelWidthRatios.length === panelCount &&
    options.panelWidthRatios.every((r) => Number.isFinite(r) && r > 0)
      ? options.panelWidthRatios
      : Array.from({ length: panelCount }, () => 1 / panelCount);

  const muntinRows = Math.max(0, Math.min(8, Math.floor(options.muntinRows ?? 0)));
  const muntinColumns = Math.max(0, Math.min(8, Math.floor(options.muntinColumns ?? 0)));
  const showOperationIndicator = Boolean(options.showOperationIndicator);

  const points: ParametricPoint[] = [];
  const equations: ParametricEquation[] = [];
  const lines: ParametricLine[] = [];
  const polygons: ParametricPolygon[] = [];
  let eqId = 0;

  const addEq = (terms: { v: string; c: number }[], constant: number) => {
    equations.push({
      id: `eq_${eqId++}`,
      terms: terms.map((t) => ({ variable: t.v, coefficient: t.c })),
      constant,
    });
  };
  const addPt = (id: string, x: number, y: number) => points.push({ id, x, y });
  const addLine = (id: string, start: string, end: string, style?: 'dashed' | 'solid', thickness?: number) => {
    lines.push({ id, start_point: start, end_point: end, style, thickness: thickness ?? 0.25 });
  };

  // Outer Frame
  addPt('out_bl', 0, 0);
  addPt('out_br', 1200, 0);
  addPt('out_tl', 0, 1200);
  addPt('out_tr', 1200, 1200);

  // Inner Frame
  addPt('in_bl', 50, 50);
  addPt('in_br', 1150, 50);
  addPt('in_tl', 50, 1150);
  addPt('in_tr', 1150, 1150);

  addEq([{ v: 'out_bl.x', c: 1 }], 0);
  addEq([{ v: 'out_bl.y', c: 1 }], 0);
  addEq([{ v: 'out_br.x', c: 1 }, { v: 'W', c: -1 }], 0);
  addEq([{ v: 'out_br.y', c: 1 }], 0);
  addEq([{ v: 'out_tl.x', c: 1 }], 0);
  addEq([{ v: 'out_tl.y', c: 1 }, { v: 'H', c: -1 }], 0);
  addEq([{ v: 'out_tr.x', c: 1 }, { v: 'W', c: -1 }], 0);
  addEq([{ v: 'out_tr.y', c: 1 }, { v: 'H', c: -1 }], 0);

  addEq([{ v: 'in_bl.x', c: 1 }, { v: 'F', c: -1 }], 0);
  addEq([{ v: 'in_bl.y', c: 1 }, { v: 'F', c: -1 }], 0);
  addEq([{ v: 'in_br.x', c: 1 }, { v: 'W', c: -1 }, { v: 'F', c: 1 }], 0);
  addEq([{ v: 'in_br.y', c: 1 }, { v: 'F', c: -1 }], 0);
  addEq([{ v: 'in_tl.x', c: 1 }, { v: 'F', c: -1 }], 0);
  addEq([{ v: 'in_tl.y', c: 1 }, { v: 'H', c: -1 }, { v: 'F', c: 1 }], 0);
  addEq([{ v: 'in_tr.x', c: 1 }, { v: 'W', c: -1 }, { v: 'F', c: 1 }], 0);
  addEq([{ v: 'in_tr.y', c: 1 }, { v: 'H', c: -1 }, { v: 'F', c: 1 }], 0);

  // Closed Polygons for Outer Frame Background and Inner Frame
  polygons.push({
    id: 'out_frame_poly',
    point_ids: ['out_bl', 'out_br', 'out_tr', 'out_tl'],
    fill: '#ffffff',
    thickness: 0.35,
    closed: true,
  });

  polygons.push({
    id: 'in_frame_poly',
    point_ids: ['in_bl', 'in_br', 'in_tr', 'in_tl'],
    thickness: 0.25,
    closed: true,
  });

  // Border Lines
  addLine('out_b', 'out_bl', 'out_br', 'solid', 0.35);
  addLine('out_t', 'out_tl', 'out_tr', 'solid', 0.35);
  addLine('out_l', 'out_bl', 'out_tl', 'solid', 0.35);
  addLine('out_r', 'out_br', 'out_tr', 'solid', 0.35);
  addLine('in_b', 'in_bl', 'in_br', 'solid', 0.25);
  addLine('in_t', 'in_tl', 'in_tr', 'solid', 0.25);
  addLine('in_l', 'in_bl', 'in_tl', 'solid', 0.25);
  addLine('in_r', 'in_br', 'in_tr', 'solid', 0.25);

  // Meeting stiles / panels based on exact ratios
  let accumulatedRatio = 0;
  for (let i = 0; i < panelCount - 1; i++) {
    accumulatedRatio += ratios[i];
    const stileKey = `stile_${i}`;
    addPt(`${stileKey}_b`, 500, 50);
    addPt(`${stileKey}_t`, 500, 1150);
    addEq([{ v: `${stileKey}_b.x`, c: 1 }, { v: 'W', c: -accumulatedRatio }], 0);
    addEq([{ v: `${stileKey}_b.y`, c: 1 }, { v: 'in_bl.y', c: -1 }], 0);
    addEq([{ v: `${stileKey}_t.x`, c: 1 }, { v: `${stileKey}_b.x`, c: -1 }], 0);
    addEq([{ v: `${stileKey}_t.y`, c: 1 }, { v: 'in_tl.y', c: -1 }], 0);
    addLine(stileKey, `${stileKey}_b`, `${stileKey}_t`, 'solid', 0.3);
  }

  // Muntin Rows
  for (let r = 1; r <= muntinRows; r++) {
    const mRowKey = `muntin_row_${r}`;
    const rowRatio = r / (muntinRows + 1);
    addPt(`${mRowKey}_l`, 50, 400);
    addPt(`${mRowKey}_r`, 1150, 400);
    addEq([{ v: `${mRowKey}_l.x`, c: 1 }, { v: 'in_bl.x', c: -1 }], 0);
    addEq([{ v: `${mRowKey}_r.x`, c: 1 }, { v: 'in_br.x', c: -1 }], 0);
    // y = F + (H - 2F) * rowRatio  => y - rowRatio*H - (1 - 2*rowRatio)*F = 0
    addEq(
      [
        { v: `${mRowKey}_l.y`, c: 1 },
        { v: 'H', c: -rowRatio },
        { v: 'F', c: -(1 - 2 * rowRatio) },
      ],
      0
    );
    addEq([{ v: `${mRowKey}_r.y`, c: 1 }, { v: `${mRowKey}_l.y`, c: -1 }], 0);
    addLine(mRowKey, `${mRowKey}_l`, `${mRowKey}_r`, 'solid', 0.2);
  }

  // Muntin Columns
  for (let c = 1; c <= muntinColumns; c++) {
    const mColKey = `muntin_col_${c}`;
    const colRatio = c / (muntinColumns + 1);
    addPt(`${mColKey}_b`, 400, 50);
    addPt(`${mColKey}_t`, 400, 1150);
    addEq([{ v: `${mColKey}_b.y`, c: 1 }, { v: 'in_bl.y', c: -1 }], 0);
    addEq([{ v: `${mColKey}_t.y`, c: 1 }, { v: 'in_tl.y', c: -1 }], 0);
    // x = F + (W - 2F) * colRatio => x - colRatio*W - (1 - 2*colRatio)*F = 0
    addEq(
      [
        { v: `${mColKey}_b.x`, c: 1 },
        { v: 'W', c: -colRatio },
        { v: 'F', c: -(1 - 2 * colRatio) },
      ],
      0
    );
    addEq([{ v: `${mColKey}_t.x`, c: 1 }, { v: `${mColKey}_b.x`, c: -1 }], 0);
    addLine(mColKey, `${mColKey}_b`, `${mColKey}_t`, 'solid', 0.2);
  }

  // Optional Sliding Arrows (for schedules A-08)
  if (showOperationIndicator) {
    let pLeftRatio = 0;
    for (let i = 0; i < panelCount; i++) {
      const pRatio = ratios[i];
      const pMidRatio = pLeftRatio + pRatio / 2;
      pLeftRatio += pRatio;

      const arrKey = `arr_${i}`;
      addPt(`${arrKey}_s`, 300, 600);
      addPt(`${arrKey}_e`, 400, 600);
      addEq([{ v: `${arrKey}_s.x`, c: 1 }, { v: 'W', c: -pMidRatio }], 0);
      addEq([{ v: `${arrKey}_s.y`, c: 2 }, { v: 'H', c: -1 }], 0); // mid height
      const dir = i % 2 === 0 ? 1 : -1;
      addEq([{ v: `${arrKey}_e.x`, c: 1 }, { v: `${arrKey}_s.x`, c: -1 }], dir * -100);
      addEq([{ v: `${arrKey}_e.y`, c: 1 }, { v: `${arrKey}_s.y`, c: -1 }], 0);
      addLine(arrKey, `${arrKey}_s`, `${arrKey}_e`, 'solid', 0.25);
    }
  }

  return {
    parameters: ['W', 'H', 'F', 'S'],
    points,
    equations,
    lines,
    polygons,
  };
}

export function createDoorPlanSymbol(options: DoorPlanSymbolOptions = {}): ParametricSymbolDefinition {
  const handing = options.handing ?? 'left_in';
  const panelCount = options.panelCount ?? 1;

  const points: ParametricPoint[] = [];
  const equations: ParametricEquation[] = [];
  const lines: ParametricLine[] = [];
  const polygons: ParametricPolygon[] = [];
  const arcs: ParametricArc[] = [];
  let eqId = 0;

  const addEq = (terms: { v: string; c: number }[], constant: number) => {
    equations.push({
      id: `eq_${eqId++}`,
      terms: terms.map((t) => ({ variable: t.v, coefficient: t.c })),
      constant,
    });
  };
  const addPt = (id: string, x: number, y: number) => points.push({ id, x, y });
  const addLine = (id: string, start: string, end: string, style?: 'dashed' | 'solid', thickness?: number) => {
    lines.push({ id, start_point: start, end_point: end, style, thickness: thickness ?? 0.25 });
  };

  // Parameters: W (clear opening width), T (wall thickness), F (frame face width), D (leaf thickness)
  // Origin (0,0) is at clear opening start, centered across wall thickness Y in [-T/2, +T/2].

  // Left Jamb Polygon (from -F to 0 in X, and -T/2 to +T/2 in Y)
  addPt('lj_bl', -50, -50);
  addPt('lj_br', 0, -50);
  addPt('lj_tr', 0, 50);
  addPt('lj_tl', -50, 50);

  addEq([{ v: 'lj_bl.x', c: 1 }, { v: 'F', c: 1 }], 0);
  addEq([{ v: 'lj_bl.y', c: 2 }, { v: 'T', c: 1 }], 0);
  addEq([{ v: 'lj_br.x', c: 1 }], 0);
  addEq([{ v: 'lj_br.y', c: 2 }, { v: 'T', c: 1 }], 0);
  addEq([{ v: 'lj_tr.x', c: 1 }], 0);
  addEq([{ v: 'lj_tr.y', c: 2 }, { v: 'T', c: -1 }], 0);
  addEq([{ v: 'lj_tl.x', c: 1 }, { v: 'F', c: 1 }], 0);
  addEq([{ v: 'lj_tl.y', c: 2 }, { v: 'T', c: -1 }], 0);

  polygons.push({
    id: 'left_jamb',
    point_ids: ['lj_bl', 'lj_br', 'lj_tr', 'lj_tl'],
    thickness: 0.35,
    closed: true,
  });

  // Right Jamb Polygon (from W to W+F in X, and -T/2 to +T/2 in Y)
  addPt('rj_bl', 900, -50);
  addPt('rj_br', 950, -50);
  addPt('rj_tr', 950, 50);
  addPt('rj_tl', 900, 50);

  addEq([{ v: 'rj_bl.x', c: 1 }, { v: 'W', c: -1 }], 0);
  addEq([{ v: 'rj_bl.y', c: 2 }, { v: 'T', c: 1 }], 0);
  addEq([{ v: 'rj_br.x', c: 1 }, { v: 'W', c: -1 }, { v: 'F', c: -1 }], 0);
  addEq([{ v: 'rj_br.y', c: 2 }, { v: 'T', c: 1 }], 0);
  addEq([{ v: 'rj_tr.x', c: 1 }, { v: 'W', c: -1 }, { v: 'F', c: -1 }], 0);
  addEq([{ v: 'rj_tr.y', c: 2 }, { v: 'T', c: -1 }], 0);
  addEq([{ v: 'rj_tl.x', c: 1 }, { v: 'W', c: -1 }], 0);
  addEq([{ v: 'rj_tl.y', c: 2 }, { v: 'T', c: -1 }], 0);

  polygons.push({
    id: 'right_jamb',
    point_ids: ['rj_bl', 'rj_br', 'rj_tr', 'rj_tl'],
    thickness: 0.35,
    closed: true,
  });

  // Jamb lines for crisp rendering
  addLine('lj_outer', 'lj_bl', 'lj_tl', 'solid', 0.35);
  addLine('lj_inner', 'lj_br', 'lj_tr', 'solid', 0.25);
  addLine('rj_inner', 'rj_bl', 'rj_tl', 'solid', 0.25);
  addLine('rj_outer', 'rj_br', 'rj_tr', 'solid', 0.35);

  // Door Leaf and 90° Swing Arc
  const isLeft = handing.startsWith('left');
  const isOut = handing.endsWith('out');
  const hingePoint = isLeft ? 'hinge_l' : 'hinge_r';
  const ySign = isOut ? -1 : 1;

  if (isLeft) {
    addPt('hinge_l', 0, ySign * 25);
    addEq([{ v: 'hinge_l.x', c: 1 }], 0);
    addEq([{ v: 'hinge_l.y', c: 4 }, { v: 'T', c: -ySign }], 0); // placed on interior/exterior wall face edge

    // Leaf open endpoint
    addPt('leaf_open_end', 0, ySign * 900);
    addEq([{ v: 'leaf_open_end.x', c: 1 }], 0);
    addEq([{ v: 'leaf_open_end.y', c: 1 }, { v: 'hinge_l.y', c: -1 }, { v: 'W', c: -ySign }], 0);

    addLine('door_leaf', 'hinge_l', 'leaf_open_end', 'solid', 0.35);

    // 90° Swing Arc from closed position (W, hinge.y) to open position (0, hinge.y + ySign*W)
    arcs.push({
      id: 'swing_arc',
      center_point: 'hinge_l',
      radius_var: 'W',
      start_angle_deg: 0,
      sweep_angle_deg: isOut ? -90 : 90,
      style: 'solid',
      thickness: 0.25,
    });
  } else {
    addPt('hinge_r', 900, ySign * 25);
    addEq([{ v: 'hinge_r.x', c: 1 }, { v: 'W', c: -1 }], 0);
    addEq([{ v: 'hinge_r.y', c: 4 }, { v: 'T', c: -ySign }], 0);

    // Leaf open endpoint
    addPt('leaf_open_end', 900, ySign * 900);
    addEq([{ v: 'leaf_open_end.x', c: 1 }, { v: 'W', c: -1 }], 0);
    addEq([{ v: 'leaf_open_end.y', c: 1 }, { v: 'hinge_r.y', c: -1 }, { v: 'W', c: -ySign }], 0);

    addLine('door_leaf', 'hinge_r', 'leaf_open_end', 'solid', 0.35);

    // 90° Swing Arc from closed position (0, hinge.y) to open position (W, hinge.y + ySign*W)
    arcs.push({
      id: 'swing_arc',
      center_point: 'hinge_r',
      radius_var: 'W',
      start_angle_deg: 180,
      sweep_angle_deg: isOut ? 90 : -90,
      style: 'solid',
      thickness: 0.25,
    });
  }

  return {
    parameters: ['W', 'T', 'F', 'D'],
    points,
    equations,
    lines,
    polygons,
    arcs,
  };
}

export function createWindowPlanSymbol(options: WindowPlanSymbolOptions = {}): ParametricSymbolDefinition {
  const panelCount = Math.max(1, Math.min(8, Math.floor(options.panelCount ?? 2)));
  const ratios =
    options.panelWidthRatios &&
    options.panelWidthRatios.length === panelCount &&
    options.panelWidthRatios.every((r) => Number.isFinite(r) && r > 0)
      ? options.panelWidthRatios
      : Array.from({ length: panelCount }, () => 1 / panelCount);

  const points: ParametricPoint[] = [];
  const equations: ParametricEquation[] = [];
  const lines: ParametricLine[] = [];
  const polygons: ParametricPolygon[] = [];
  let eqId = 0;

  const addEq = (terms: { v: string; c: number }[], constant: number) => {
    equations.push({
      id: `eq_${eqId++}`,
      terms: terms.map((t) => ({ variable: t.v, coefficient: t.c })),
      constant,
    });
  };
  const addPt = (id: string, x: number, y: number) => points.push({ id, x, y });
  const addLine = (id: string, start: string, end: string, style?: 'dashed' | 'solid', thickness?: number) => {
    lines.push({ id, start_point: start, end_point: end, style, thickness: thickness ?? 0.25 });
  };

  // Parameters: W (width), T (wall thickness), F (frame face width), S (sash width)
  // Left Jamb Polygon (0 to F in X, -T/2 to +T/2 in Y)
  addPt('lj_bl', 0, -50);
  addPt('lj_br', 50, -50);
  addPt('lj_tr', 50, 50);
  addPt('lj_tl', 0, 50);

  addEq([{ v: 'lj_bl.x', c: 1 }], 0);
  addEq([{ v: 'lj_bl.y', c: 2 }, { v: 'T', c: 1 }], 0);
  addEq([{ v: 'lj_br.x', c: 1 }, { v: 'F', c: -1 }], 0);
  addEq([{ v: 'lj_br.y', c: 2 }, { v: 'T', c: 1 }], 0);
  addEq([{ v: 'lj_tr.x', c: 1 }, { v: 'F', c: -1 }], 0);
  addEq([{ v: 'lj_tr.y', c: 2 }, { v: 'T', c: -1 }], 0);
  addEq([{ v: 'lj_tl.x', c: 1 }], 0);
  addEq([{ v: 'lj_tl.y', c: 2 }, { v: 'T', c: -1 }], 0);

  polygons.push({
    id: 'left_jamb',
    point_ids: ['lj_bl', 'lj_br', 'lj_tr', 'lj_tl'],
    thickness: 0.35,
    closed: true,
  });

  // Right Jamb Polygon (W-F to W in X, -T/2 to +T/2 in Y)
  addPt('rj_bl', 1150, -50);
  addPt('rj_br', 1200, -50);
  addPt('rj_tr', 1200, 50);
  addPt('rj_tl', 1150, 50);

  addEq([{ v: 'rj_bl.x', c: 1 }, { v: 'W', c: -1 }, { v: 'F', c: 1 }], 0);
  addEq([{ v: 'rj_bl.y', c: 2 }, { v: 'T', c: 1 }], 0);
  addEq([{ v: 'rj_br.x', c: 1 }, { v: 'W', c: -1 }], 0);
  addEq([{ v: 'rj_br.y', c: 2 }, { v: 'T', c: 1 }], 0);
  addEq([{ v: 'rj_tr.x', c: 1 }, { v: 'W', c: -1 }], 0);
  addEq([{ v: 'rj_tr.y', c: 2 }, { v: 'T', c: -1 }], 0);
  addEq([{ v: 'rj_tl.x', c: 1 }, { v: 'W', c: -1 }, { v: 'F', c: 1 }], 0);
  addEq([{ v: 'rj_tl.y', c: 2 }, { v: 'T', c: -1 }], 0);

  polygons.push({
    id: 'right_jamb',
    point_ids: ['rj_bl', 'rj_br', 'rj_tr', 'rj_tl'],
    thickness: 0.35,
    closed: true,
  });

  // Exterior and Interior Sill Lines across clear opening
  addPt('sill_ext_l', 0, -50);
  addPt('sill_ext_r', 1200, -50);
  addPt('sill_int_l', 0, 50);
  addPt('sill_int_r', 1200, 50);

  addEq([{ v: 'sill_ext_l.x', c: 1 }], 0);
  addEq([{ v: 'sill_ext_l.y', c: 2 }, { v: 'T', c: 1 }], 0);
  addEq([{ v: 'sill_ext_r.x', c: 1 }, { v: 'W', c: -1 }], 0);
  addEq([{ v: 'sill_ext_r.y', c: 2 }, { v: 'T', c: 1 }], 0);

  addEq([{ v: 'sill_int_l.x', c: 1 }], 0);
  addEq([{ v: 'sill_int_l.y', c: 2 }, { v: 'T', c: -1 }], 0);
  addEq([{ v: 'sill_int_r.x', c: 1 }, { v: 'W', c: -1 }], 0);
  addEq([{ v: 'sill_int_r.y', c: 2 }, { v: 'T', c: -1 }], 0);

  addLine('sill_ext', 'sill_ext_l', 'sill_ext_r', 'solid', 0.25);
  addLine('sill_int', 'sill_int_l', 'sill_int_r', 'solid', 0.25);

  // Staggered Glass / Sash Lines for Sliding panels
  let curXRatio = 0;
  for (let i = 0; i < panelCount; i++) {
    const pRatio = ratios[i];
    const sashKey = `sash_${i}`;
    const yOffset = (i % 2 === 0 ? -1 : 1) * 15; // staggered tracks inside frame

    addPt(`${sashKey}_s`, 0, yOffset);
    addPt(`${sashKey}_e`, 600, yOffset);

    addEq([{ v: `${sashKey}_s.x`, c: 1 }, { v: 'W', c: -curXRatio }], 0);
    addEq([{ v: `${sashKey}_s.y`, c: 1 }], yOffset);

    curXRatio += pRatio;
    addEq([{ v: `${sashKey}_e.x`, c: 1 }, { v: 'W', c: -curXRatio }], 0);
    addEq([{ v: `${sashKey}_e.y`, c: 1 }], yOffset);

    addLine(sashKey, `${sashKey}_s`, `${sashKey}_e`, 'solid', 0.35);

    // Directional Arrow for sliding panel
    const arrKey = `arr_${i}`;
    const dir = i % 2 === 0 ? 1 : -1;
    addPt(`${arrKey}_s`, 0, yOffset);
    addPt(`${arrKey}_e`, 0, yOffset);
    addEq([{ v: `${arrKey}_s.x`, c: 2 }, { v: `${sashKey}_s.x`, c: -1 }, { v: `${sashKey}_e.x`, c: -1 }], 0);
    addEq([{ v: `${arrKey}_s.y`, c: 1 }], yOffset);
    addEq([{ v: `${arrKey}_e.x`, c: 1 }, { v: `${arrKey}_s.x`, c: -1 }], dir * -60);
    addEq([{ v: `${arrKey}_e.y`, c: 1 }], yOffset);
    addLine(arrKey, `${arrKey}_s`, `${arrKey}_e`, 'solid', 0.2);
  }

  return {
    parameters: ['W', 'T', 'F', 'S'],
    points,
    equations,
    lines,
    polygons,
  };
}
