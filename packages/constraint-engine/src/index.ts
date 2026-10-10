import type { ConstraintData } from '@constructflow/project-model';
import * as kiwi from 'kiwi.js';

export interface ConstraintVar {
    id: string;
    property: string;
    value: number;
}

export class ConstructFlowSolver {
    private solver: kiwi.Solver;
    private variables: Map<string, kiwi.Variable>;

    constructor() {
        this.solver = new kiwi.Solver();
        this.variables = new Map();
    }

    private getVariable(id: string, property: string): kiwi.Variable {
        const key = `${id}.${property}`;
        if (!this.variables.has(key)) {
            this.variables.set(key, new kiwi.Variable(key));
        }
        return this.variables.get(key)!;
    }

    public addEditIntent(id: string, property: string, targetValue: number, strength: number = kiwi.Strength.strong) {
        const variable = this.getVariable(id, property);
        this.solver.addEditVariable(variable, strength);
        this.solver.suggestValue(variable, targetValue);
    }

    public addLockConstraint(id: string, property: string, value: number) {
        const variable = this.getVariable(id, property);
        const constraint = new kiwi.Constraint(variable, kiwi.Operator.Eq, value, kiwi.Strength.required);
        this.solver.addConstraint(constraint);
    }

    public addOffsetConstraint(idA: string, propA: string, idB: string, propB: string, offset: number) {
        const varA = this.getVariable(idA, propA);
        const varB = this.getVariable(idB, propB);
        const expr = new kiwi.Expression(varB, offset);
        const constraint = new kiwi.Constraint(varA, kiwi.Operator.Eq, expr, kiwi.Strength.required);
        this.solver.addConstraint(constraint);
    }

    
    public applyProjectConstraints(constraints: ConstraintData[]) {
        for (const c of constraints) {
            if (c.kind === 'offset' && c.entities.length === 2 && c.value !== undefined) {
                this.addOffsetConstraint(c.entities[0].id, c.entities[0].property, c.entities[1].id, c.entities[1].property, c.value);
            } else if (c.kind === 'lock' && c.entities.length === 1 && c.value !== undefined) {
                this.addLockConstraint(c.entities[0].id, c.entities[0].property, c.value);
            }
            // More constraint types (parallel, coincident, etc.) would be mapped here
        }
    }

    public solve(): Map<string, number> {
        this.solver.updateVariables();
        const results = new Map<string, number>();
        for (const [key, variable] of this.variables.entries()) {
            const val = variable.value();
            results.set(key, Math.abs(val) < 1e-9 ? 0 : val);
        }
        return results;
    }
}

export * from './parametricSolver.js';
