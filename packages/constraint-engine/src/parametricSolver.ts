import * as kiwi from 'kiwi.js';
import type {
    ParametricSymbolDefinition,
    EvaluatedSymbolLine,
    EvaluatedSymbolPolygon,
    EvaluatedSymbolArc,
    EvaluatedParametricSymbol,
} from '@constructflow/project-model';

export function evaluateParametricSymbol(
    symbol: ParametricSymbolDefinition,
    inputParameters: Record<string, number>
): EvaluatedParametricSymbol {
    const solver = new kiwi.Solver();
    const variables = new Map<string, kiwi.Variable>();

    const getVar = (name: string) => {
        if (!variables.has(name)) {
            variables.set(name, new kiwi.Variable(name));
        }
        return variables.get(name)!;
    };

    // 1. Add input parameters as required constraints
    for (const [key, value] of Object.entries(inputParameters)) {
        if (symbol.parameters.includes(key)) {
            const v = getVar(key);
            solver.addConstraint(new kiwi.Constraint(v, kiwi.Operator.Eq, value, kiwi.Strength.required));
        }
    }

    // 2. Add equations
    for (const eq of symbol.equations) {
        const terms = eq.terms.map(t => [t.coefficient, getVar(t.variable)] as [number, kiwi.Variable]);
        const expr = new kiwi.Expression(...terms, eq.constant);
        let op = kiwi.Operator.Eq;
        if (eq.operator === 'ge') op = kiwi.Operator.Ge;
        if (eq.operator === 'le') op = kiwi.Operator.Le;
        solver.addConstraint(new kiwi.Constraint(expr, op, 0, kiwi.Strength.required));
    }

    // 3. Add weak stay constraints for points to their initial values
    for (const pt of symbol.points) {
        const vx = getVar(`${pt.id}.x`);
        solver.addEditVariable(vx, kiwi.Strength.weak);
        solver.suggestValue(vx, pt.x);
        
        const vy = getVar(`${pt.id}.y`);
        solver.addEditVariable(vy, kiwi.Strength.weak);
        solver.suggestValue(vy, pt.y);
    }

    solver.updateVariables();

    const clean = (n: number) => (Math.abs(n) < 1e-9 ? 0 : n);

    // 4. Extract evaluated lines
    const lines: EvaluatedSymbolLine[] = (symbol.lines ?? []).map(line => {
        const sx = clean(getVar(`${line.start_point}.x`).value());
        const sy = clean(getVar(`${line.start_point}.y`).value());
        const ex = clean(getVar(`${line.end_point}.x`).value());
        const ey = clean(getVar(`${line.end_point}.y`).value());
        return {
            id: line.id,
            start: [sx, sy],
            end: [ex, ey],
            style: line.style,
            thickness: line.thickness ?? 0.25,
        };
    });

    // 5. Extract evaluated polygons
    const polygons: EvaluatedSymbolPolygon[] = (symbol.polygons ?? []).map(poly => {
        const points = poly.point_ids.map(pid => {
            const px = clean(getVar(`${pid}.x`).value());
            const py = clean(getVar(`${pid}.y`).value());
            return [px, py] as [number, number];
        });
        return {
            id: poly.id,
            points,
            style: poly.style ?? 'solid',
            thickness: poly.thickness ?? 0.25,
            fill: poly.fill,
            closed: poly.closed !== false,
        };
    });

    // 6. Extract evaluated arcs
    const arcs: EvaluatedSymbolArc[] = (symbol.arcs ?? []).map(arc => {
        const cx = clean(getVar(`${arc.center_point}.x`).value());
        const cy = clean(getVar(`${arc.center_point}.y`).value());
        let radius = arc.radius_mm ?? 0;
        if (arc.radius_var) {
            radius = clean(getVar(arc.radius_var).value());
        }
        return {
            id: arc.id,
            center: [cx, cy],
            radius,
            start_angle_deg: arc.start_angle_deg,
            sweep_angle_deg: arc.sweep_angle_deg,
            style: arc.style ?? 'solid',
            thickness: arc.thickness ?? 0.25,
        };
    });

    const result = Object.assign([...lines], { lines, polygons, arcs }) as EvaluatedParametricSymbol;
    return result;
}
