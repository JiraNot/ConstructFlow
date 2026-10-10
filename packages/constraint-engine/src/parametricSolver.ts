import * as kiwi from 'kiwi.js';
import type { ParametricSymbolDefinition, EvaluatedSymbolLine } from '@constructflow/project-model/src/parametricSymbol.js';

export function evaluateParametricSymbol(
    symbol: ParametricSymbolDefinition,
    inputParameters: Record<string, number>
): EvaluatedSymbolLine[] {
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
    // This provides a fallback and prevents the solver from picking arbitrary coordinates 
    // for unconstrained degrees of freedom.
    for (const pt of symbol.points) {
        const vx = getVar(`${pt.id}.x`);
        solver.addEditVariable(vx, kiwi.Strength.weak);
        solver.suggestValue(vx, pt.x);
        
        const vy = getVar(`${pt.id}.y`);
        solver.addEditVariable(vy, kiwi.Strength.weak);
        solver.suggestValue(vy, pt.y);
    }

    solver.updateVariables();

    // 4. Extract evaluated lines
    return symbol.lines.map(line => {
        const sx = getVar(`${line.start_point}.x`).value();
        const sy = getVar(`${line.start_point}.y`).value();
        const ex = getVar(`${line.end_point}.x`).value();
        const ey = getVar(`${line.end_point}.y`).value();
        return {
            id: line.id,
            start: [sx, sy],
            end: [ex, ey],
            style: line.style,
            thickness: line.thickness
        };
    });
}
