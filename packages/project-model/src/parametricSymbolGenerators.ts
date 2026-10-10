import { ParametricSymbolDefinition, ParametricEquation, ParametricPoint, ParametricLine } from './parametricSymbol.js';

export function createDoorElevationSymbol(panelCount: number = 1, hingeAtStart: boolean = true): ParametricSymbolDefinition {
    const points: ParametricPoint[] = [];
    const equations: ParametricEquation[] = [];
    const lines: ParametricLine[] = [];
    let eqId = 0;

    const addEq = (terms: {v: string, c: number}[], constant: number) => {
        equations.push({
            id: `eq_${eqId++}`,
            terms: terms.map(t => ({ variable: t.v, coefficient: t.c })),
            constant
        });
    };

    const addPt = (id: string, x: number, y: number) => {
        points.push({ id, x, y });
    };

    const addLine = (id: string, start: string, end: string, style?: 'dashed' | 'solid', thickness?: number) => {
        lines.push({ id, start_point: start, end_point: end, style, thickness });
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
    addEq([{v: 'out_bl.x', c: 1}], 0); // out_bl.x = 0
    addEq([{v: 'out_bl.y', c: 1}], 0); // out_bl.y = 0
    addEq([{v: 'out_br.x', c: 1}, {v: 'W', c: -1}], 0); // out_br.x = W
    addEq([{v: 'out_br.y', c: 1}], 0); // out_br.y = 0
    addEq([{v: 'out_tl.x', c: 1}], 0); // out_tl.x = 0
    addEq([{v: 'out_tl.y', c: 1}, {v: 'H', c: -1}], 0); // out_tl.y = H
    addEq([{v: 'out_tr.x', c: 1}, {v: 'W', c: -1}], 0); // out_tr.x = W
    addEq([{v: 'out_tr.y', c: 1}, {v: 'H', c: -1}], 0); // out_tr.y = H

    // Equations for Inner Frame
    addEq([{v: 'in_bl.x', c: 1}, {v: 'F', c: -1}], 0); // in_bl.x = F
    addEq([{v: 'in_bl.y', c: 1}], 0); // in_bl.y = 0
    addEq([{v: 'in_br.x', c: 1}, {v: 'W', c: -1}, {v: 'F', c: 1}], 0); // in_br.x = W - F
    addEq([{v: 'in_br.y', c: 1}], 0); // in_br.y = 0
    addEq([{v: 'in_tl.x', c: 1}, {v: 'F', c: -1}], 0); // in_tl.x = F
    addEq([{v: 'in_tl.y', c: 1}, {v: 'H', c: -1}, {v: 'F', c: 1}], 0); // in_tl.y = H - F
    addEq([{v: 'in_tr.x', c: 1}, {v: 'W', c: -1}, {v: 'F', c: 1}], 0); // in_tr.x = W - F
    addEq([{v: 'in_tr.y', c: 1}, {v: 'H', c: -1}, {v: 'F', c: 1}], 0); // in_tr.y = H - F

    // Lines for Outer Frame
    addLine('out_l', 'out_bl', 'out_tl', 'solid', 2);
    addLine('out_t', 'out_tl', 'out_tr', 'solid', 2);
    addLine('out_r', 'out_tr', 'out_br', 'solid', 2);
    // Lines for Inner Frame
    addLine('in_l', 'in_bl', 'in_tl', 'solid', 1);
    addLine('in_t', 'in_tl', 'in_tr', 'solid', 1);
    addLine('in_r', 'in_tr', 'in_br', 'solid', 1);

    // Multi-panel logic for door leaves
    for (let i = 0; i < panelCount; i++) {
        const pStr = `p${i}`;
        addPt(`${pStr}_bl`, 50 + i * 450, 0);
        addPt(`${pStr}_br`, 50 + (i + 1) * 450, 0);
        addPt(`${pStr}_tl`, 50 + i * 450, 1950);
        addPt(`${pStr}_tr`, 50 + (i + 1) * 450, 1950);
        addPt(`${pStr}_mid_l`, 50 + i * 450, 975);
        addPt(`${pStr}_mid_r`, 50 + (i + 1) * 450, 975);

        // Panel boundaries
        // panel width = (W - 2F) / panelCount
        // x = F + i * panelWidth
        // x = F + i * (W - 2F) / panelCount
        // panelCount * x = panelCount * F + i * W - 2 * i * F
        // panelCount * x - i * W - (panelCount - 2 * i) * F = 0
        addEq([
            {v: `${pStr}_bl.x`, c: panelCount},
            {v: 'W', c: -i},
            {v: 'F', c: -(panelCount - 2 * i)}
        ], 0);
        addEq([
            {v: `${pStr}_br.x`, c: panelCount},
            {v: 'W', c: -(i + 1)},
            {v: 'F', c: -(panelCount - 2 * (i + 1))}
        ], 0);

        addEq([{v: `${pStr}_bl.y`, c: 1}], 0); // y = 0
        addEq([{v: `${pStr}_br.y`, c: 1}], 0); // y = 0

        addEq([{v: `${pStr}_tl.x`, c: 1}, {v: `${pStr}_bl.x`, c: -1}], 0);
        addEq([{v: `${pStr}_tr.x`, c: 1}, {v: `${pStr}_br.x`, c: -1}], 0);
        addEq([{v: `${pStr}_tl.y`, c: 1}, {v: 'in_tl.y', c: -1}], 0);
        addEq([{v: `${pStr}_tr.y`, c: 1}, {v: 'in_tr.y', c: -1}], 0);

        // Mid points for swing
        addEq([{v: `${pStr}_mid_l.x`, c: 1}, {v: `${pStr}_bl.x`, c: -1}], 0);
        addEq([{v: `${pStr}_mid_r.x`, c: 1}, {v: `${pStr}_br.x`, c: -1}], 0);
        addEq([{v: `${pStr}_mid_l.y`, c: 2}, {v: 'in_tl.y', c: -1}], 0); // y = (H-F)/2 -> 2y = H-F -> 2y - in_tl.y = 0
        addEq([{v: `${pStr}_mid_r.y`, c: 2}, {v: 'in_tr.y', c: -1}], 0);

        // Leaf separation line
        if (i > 0) addLine(`${pStr}_sep`, `${pStr}_bl`, `${pStr}_tl`, 'solid', 1);

        // Swing symbol
        // For double doors, first panel hinges left, second hinges right.
        const panelHingeLeft = panelCount === 1 ? hingeAtStart : (i === 0);
        if (panelHingeLeft) {
            addLine(`${pStr}_swing_t`, `${pStr}_tl`, `${pStr}_mid_r`, 'dashed', 1);
            addLine(`${pStr}_swing_b`, `${pStr}_bl`, `${pStr}_mid_r`, 'dashed', 1);
        } else {
            addLine(`${pStr}_swing_t`, `${pStr}_tr`, `${pStr}_mid_l`, 'dashed', 1);
            addLine(`${pStr}_swing_b`, `${pStr}_br`, `${pStr}_mid_l`, 'dashed', 1);
        }
    }

    return {
        parameters: ['W', 'H', 'F'],
        points,
        equations,
        lines
    };
}

export function createWindowElevationSymbol(panelCount: number = 2): ParametricSymbolDefinition {
    const points: ParametricPoint[] = [];
    const equations: ParametricEquation[] = [];
    const lines: ParametricLine[] = [];
    let eqId = 0;

    const addEq = (terms: {v: string, c: number}[], constant: number) => {
        equations.push({ id: `eq_${eqId++}`, terms: terms.map(t => ({ variable: t.v, coefficient: t.c })), constant });
    };
    const addPt = (id: string, x: number, y: number) => points.push({ id, x, y });
    const addLine = (id: string, start: string, end: string, style?: 'dashed' | 'solid', thickness?: number) => {
        lines.push({ id, start_point: start, end_point: end, style, thickness });
    };

    // W, H, F (outer frame), S (sash frame)
    addPt('out_bl', 0, 0); addPt('out_br', 1200, 0); addPt('out_tl', 0, 1200); addPt('out_tr', 1200, 1200);
    addPt('in_bl', 50, 50); addPt('in_br', 1150, 50); addPt('in_tl', 50, 1150); addPt('in_tr', 1150, 1150);

    addEq([{v: 'out_bl.x', c: 1}], 0); addEq([{v: 'out_bl.y', c: 1}], 0);
    addEq([{v: 'out_br.x', c: 1}, {v: 'W', c: -1}], 0); addEq([{v: 'out_br.y', c: 1}], 0);
    addEq([{v: 'out_tl.x', c: 1}], 0); addEq([{v: 'out_tl.y', c: 1}, {v: 'H', c: -1}], 0);
    addEq([{v: 'out_tr.x', c: 1}, {v: 'W', c: -1}], 0); addEq([{v: 'out_tr.y', c: 1}, {v: 'H', c: -1}], 0);

    addEq([{v: 'in_bl.x', c: 1}, {v: 'F', c: -1}], 0); addEq([{v: 'in_bl.y', c: 1}, {v: 'F', c: -1}], 0);
    addEq([{v: 'in_br.x', c: 1}, {v: 'W', c: -1}, {v: 'F', c: 1}], 0); addEq([{v: 'in_br.y', c: 1}, {v: 'F', c: -1}], 0);
    addEq([{v: 'in_tl.x', c: 1}, {v: 'F', c: -1}], 0); addEq([{v: 'in_tl.y', c: 1}, {v: 'H', c: -1}, {v: 'F', c: 1}], 0);
    addEq([{v: 'in_tr.x', c: 1}, {v: 'W', c: -1}, {v: 'F', c: 1}], 0); addEq([{v: 'in_tr.y', c: 1}, {v: 'H', c: -1}, {v: 'F', c: 1}], 0);

    addLine('out_b', 'out_bl', 'out_br', 'solid', 2); addLine('out_t', 'out_tl', 'out_tr', 'solid', 2);
    addLine('out_l', 'out_bl', 'out_tl', 'solid', 2); addLine('out_r', 'out_br', 'out_tr', 'solid', 2);
    addLine('in_b', 'in_bl', 'in_br', 'solid', 1); addLine('in_t', 'in_tl', 'in_tr', 'solid', 1);
    addLine('in_l', 'in_bl', 'in_tl', 'solid', 1); addLine('in_r', 'in_br', 'in_tr', 'solid', 1);

    // Sliding sash panels
    for (let i = 0; i < panelCount; i++) {
        const pStr = `sash${i}`;
        // inner box (glass) and outer box (sash frame)
        addPt(`${pStr}_out_bl`, 0, 0); addPt(`${pStr}_out_br`, 0, 0);
        addPt(`${pStr}_out_tl`, 0, 0); addPt(`${pStr}_out_tr`, 0, 0);
        addPt(`${pStr}_in_bl`, 0, 0); addPt(`${pStr}_in_br`, 0, 0);
        addPt(`${pStr}_in_tl`, 0, 0); addPt(`${pStr}_in_tr`, 0, 0);
        
        // Equations:
        // sash_out_bl.y = in_bl.y, etc
        addEq([{v: `${pStr}_out_bl.y`, c: 1}, {v: 'in_bl.y', c: -1}], 0);
        addEq([{v: `${pStr}_out_br.y`, c: 1}, {v: 'in_br.y', c: -1}], 0);
        addEq([{v: `${pStr}_out_tl.y`, c: 1}, {v: 'in_tl.y', c: -1}], 0);
        addEq([{v: `${pStr}_out_tr.y`, c: 1}, {v: 'in_tr.y', c: -1}], 0);
        
        // panel width = (W - 2F) / panelCount
        // left = F + i * panelWidth
        // right = F + (i+1) * panelWidth
        addEq([{v: `${pStr}_out_bl.x`, c: panelCount}, {v: 'W', c: -i}, {v: 'F', c: -(panelCount - 2 * i)}], 0);
        addEq([{v: `${pStr}_out_br.x`, c: panelCount}, {v: 'W', c: -(i + 1)}, {v: 'F', c: -(panelCount - 2 * (i + 1))}], 0);
        addEq([{v: `${pStr}_out_tl.x`, c: 1}, {v: `${pStr}_out_bl.x`, c: -1}], 0);
        addEq([{v: `${pStr}_out_tr.x`, c: 1}, {v: `${pStr}_out_br.x`, c: -1}], 0);

        // inner glass = outer sash +/- S
        addEq([{v: `${pStr}_in_bl.x`, c: 1}, {v: `${pStr}_out_bl.x`, c: -1}, {v: 'S', c: -1}], 0);
        addEq([{v: `${pStr}_in_bl.y`, c: 1}, {v: `${pStr}_out_bl.y`, c: -1}, {v: 'S', c: -1}], 0);
        addEq([{v: `${pStr}_in_br.x`, c: 1}, {v: `${pStr}_out_br.x`, c: -1}, {v: 'S', c: 1}], 0);
        addEq([{v: `${pStr}_in_br.y`, c: 1}, {v: `${pStr}_out_br.y`, c: -1}, {v: 'S', c: -1}], 0);
        addEq([{v: `${pStr}_in_tl.x`, c: 1}, {v: `${pStr}_out_tl.x`, c: -1}, {v: 'S', c: -1}], 0);
        addEq([{v: `${pStr}_in_tl.y`, c: 1}, {v: `${pStr}_out_tl.y`, c: -1}, {v: 'S', c: 1}], 0);
        addEq([{v: `${pStr}_in_tr.x`, c: 1}, {v: `${pStr}_out_tr.x`, c: -1}, {v: 'S', c: 1}], 0);
        addEq([{v: `${pStr}_in_tr.y`, c: 1}, {v: `${pStr}_out_tr.y`, c: -1}, {v: 'S', c: 1}], 0);

        if (i > 0) addLine(`${pStr}_sep`, `${pStr}_out_bl`, `${pStr}_out_tl`, 'solid', 1);

        addLine(`${pStr}_glass_b`, `${pStr}_in_bl`, `${pStr}_in_br`, 'solid', 1);
        addLine(`${pStr}_glass_t`, `${pStr}_in_tl`, `${pStr}_in_tr`, 'solid', 1);
        addLine(`${pStr}_glass_l`, `${pStr}_in_bl`, `${pStr}_in_tl`, 'solid', 1);
        addLine(`${pStr}_glass_r`, `${pStr}_in_br`, `${pStr}_in_tr`, 'solid', 1);

        // Arrow for sliding
        addPt(`${pStr}_arr_s`, 0, 0); addPt(`${pStr}_arr_e`, 0, 0);
        addEq([{v: `${pStr}_arr_s.x`, c: 2}, {v: `${pStr}_out_bl.x`, c: -1}, {v: `${pStr}_out_br.x`, c: -1}], 0);
        addEq([{v: `${pStr}_arr_s.y`, c: 2}, {v: `${pStr}_in_tl.y`, c: -1}, {v: `${pStr}_out_tl.y`, c: -1}], 0); // vertically between inner and outer top
        
        const arrowDir = i % 2 === 0 ? 1 : -1;
        addEq([{v: `${pStr}_arr_e.x`, c: 1}, {v: `${pStr}_arr_s.x`, c: -1}], arrowDir * -100); // 100mm arrow
        addEq([{v: `${pStr}_arr_e.y`, c: 1}, {v: `${pStr}_arr_s.y`, c: -1}], 0);

        addLine(`${pStr}_arr`, `${pStr}_arr_s`, `${pStr}_arr_e`, 'solid', 1);
    }

    return {
        parameters: ['W', 'H', 'F', 'S'],
        points,
        equations,
        lines
    };
}
