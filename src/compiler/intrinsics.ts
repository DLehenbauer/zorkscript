import * as AST from '../compiler/ast';
import { IntegerLiteral, NodeKind } from '../compiler/ast';
import * as QA from '../util/qa';
import { Operand, Result } from '../zcode/op';
import { Program } from '../zcode/program';
import { Routine } from '../zcode/routine';

class IntrinsicMatcher {
    public readonly symbol: symbol;
    private readonly matchPattern: any;

    constructor(
        public readonly name: string,
        public readonly numArgs: number,
        private readonly ctor: (original: AST.CallExpression) => AST.IntrinsicExpression
    ) {
        this.symbol = Symbol(name);

        this.matchPattern = {
            kind: NodeKind.callExpression,
            children: {
                id: {
                    kind: NodeKind.identifier,
                    symbol: this.symbol,
                },
            },
        };
    }

    public process(original: AST.CallExpression): AST.Node {
        if (isMatch(original, this.matchPattern)) {
            const numArgs = original.children.args.length;
            if (numArgs !== this.numArgs) {
                throw new Error('Wrong number of args.');
            }
            return this.ctor(original);
        }

        return original;
    }
}

function makeSimple(name: string, numArgs: number, op: (routine: Routine, args: Operand[]) => Operand | void) {
    return new IntrinsicMatcher(name, numArgs,
        (original) => new SimpleCall(original,
            (routine: Routine, args: Operand[]) => {
                QA.vetEqual(args.length, numArgs);
                return op(routine, args);
            }));
}

const callMatchers = [
    new IntrinsicMatcher('Array', 1, (original) => new ArrayCall(original)),
    makeSimple('get_child', 1, (routine: Routine, args: Operand[]) => routine.get_child(args[0], Result.stack())),
    makeSimple('get_parent', 1, (routine: Routine, args: Operand[]) => routine.get_parent(args[0], Result.stack())),
    makeSimple('get_prop', 2, (routine: Routine, args: Operand[]) => routine.get_prop(args[0], args[1], Result.stack())),
    makeSimple('get_prop_addr', 2, (routine: Routine, args: Operand[]) => routine.get_prop_addr(args[0], args[1], Result.stack())),
    makeSimple('get_sibling', 1, (routine: Routine, args: Operand[]) => routine.get_sibling(args[0], Result.stack())),
    makeSimple('loadb', 2, (routine: Routine, args: Operand[]) => routine.loadb(args[0], args[1], Result.stack())),
    makeSimple('loadw', 2, (routine: Routine, args: Operand[]) => routine.loadw(args[0], args[1], Result.stack())),
    new IntrinsicMatcher('print', 1, (original) => {
        const arg0 = original.children.args[0];
        switch (arg0.kind) {
            case NodeKind.stringLiteral:
                return new PrintCall(original, (arg0 as AST.StringLiteral).value);
            default:
                return new SimpleCall(original,
                    (routine: Routine, args: Operand[]) => routine.print_num(args[0]));
        }
    }),
    makeSimple('read', 2, (routine: Routine, args: Operand[]) => routine.sread(args[0], args[1])),
    makeSimple('random', 1, (routine: Routine, args: Operand[]) => routine.random(args[0], Result.stack())),
    makeSimple('storeb', 3, (routine: Routine, args: Operand[]) => routine.storeb(args[0], args[1], args[2])),
    makeSimple('storew', 3, (routine: Routine, args: Operand[]) => routine.storew(args[0], args[1], args[2])),
    makeSimple('print_object', 1, (routine: Routine, args: Operand[]) => routine.print_object(args[0])),
    makeSimple('print_addr', 1, (routine: Routine, args: Operand[]) => routine.print_addr(args[0])),
    makeSimple('quit', 0, (routine: Routine) => routine.quit()),
];

export const definitions = new Map(callMatchers.map((matcher) => {
    const name = matcher.name;
    const symbol = matcher.symbol;
    const id = { kind: AST.NodeKind.identifier, name, symbol };
    return [name, id] as [string, AST.Identifier];
}));

function isMatch(actual: any, candidate: any) {
    if (candidate === null) {
        return actual === null;
    }

    if (typeof candidate !== 'object') {
        return actual === candidate;
    }

    if (typeof actual !== 'object') {
        return false;
    }

    for (const property of Object.getOwnPropertyNames(candidate)) {
        const candidateValue = candidate[property];
        if (!actual.hasOwnProperty(property)) {
            return false;
        }
        const actualValue = actual[property];
        const areSame = typeof candidateValue === 'function'
            ? candidateValue(actualValue)
            : isMatch(actualValue, candidate[property]);

        if (!areSame) {
            return false;
        }
    }
    return true;
}

class SimpleCall extends AST.IntrinsicExpression {
    constructor(original: AST.CallExpression, private readonly call: (routine: Routine, args: Operand[]) => Operand | void) {
        super(original);
    }

    public emit(program: Program, routine: Routine, args: Operand[]) {
        QA.unused(program);
        const result = this.call(routine, args);
        return (result === undefined)
            ? Operand.void()
            : result;
    }
}

class PrintCall extends AST.IntrinsicExpression {
    constructor(original: AST.CallExpression, private readonly value: string) {
        super(original);
        this.children.args = [];
    }

    public emit(program: Program, routine: Routine, args: Operand[]) {
        QA.unused(program);
        QA.vetEqual(args.length, 0);
        routine.print(this.value);
        return Operand.void();
    }
}

class ArrayCall extends AST.IntrinsicExpression {
    private readonly length: number;

    constructor(original: AST.CallExpression) {
        super(original);
        const arg = original.children.args[0];
        if (arg.kind === NodeKind.integerLiteral) {
            this.length = (arg as IntegerLiteral).value;
        } else {
            throw new Error("Argument to 'Array()' must be an integer literal.");
        }

        this.children.args = [];
    }

    public emit(program: Program, routine: Routine, args: Operand[]) {
        QA.unused(program);
        QA.vetEqual(args.length, 0);

        const symbol = Symbol(`array(${this.length})`);
        program.array(symbol).zeros(this.length);
        routine.push(symbol);
        return Operand.stack();
    }
}

class Pass1 extends AST.Walker {
    protected exitCallExpression(expr: AST.CallExpression) {
        for (const matcher of callMatchers) {
            const result = matcher.process(expr);
            if (result !== expr) {
                return result;
            }
        }

        return expr;
    }
}

export function visit(sourceFile: AST.Node) {
    return new Pass1().visit(sourceFile);
}
