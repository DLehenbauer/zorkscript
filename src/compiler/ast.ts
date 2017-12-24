import * as QA from '../util/qa';
import { Operand } from '../zcode/op';
import { Program } from '../zcode/program';
import { Routine } from '../zcode/routine';
import { LexicalScopeResolver } from './lexicalscope';

export function deepClone(original: object) {
    return Object.assign(Object.create(original.constructor.prototype), original);
}

// tslint:disable-next-line:variable-name
export const NodeKind = {
    assignmentExpression: 'assignmentExpression',
    binaryExpression: 'binaryExpression',
    blockStatement: 'blockStatement',
    breakStatement: 'breakStatement',
    callExpression: 'callExpression',
    expressionStatement: 'expressionStatement',
    forStatement: 'forStatement',
    functionDeclarationStatement: 'functionDeclarationStatement',
    identifier: 'identifier',
    ifStatement: 'ifStatement',
    integerLiteral: 'integerLiteral',
    intrinsicExpression: 'intrinsicExpression',
    memberExpression: 'memberExpression',
    returnStatement: 'returnStatement',
    stringLiteral: 'stringLiteral',
    parameter: 'parameter',
    sourceFile: 'sourceFile',
    unaryExpression: 'unaryExpression',
    variableDeclarationStatement: 'variableDeclarationStatement',
    variableDeclarator: 'variableDeclarator',
    switchStatement: 'switchStatement',
    whileStatement: 'whileStatement',
};

// tslint:disable:interface-name
export interface Node {
    kind: string;
    scope?: LexicalScopeResolver;
    children?: any;
}

// tslint:disable:no-empty-interface
export interface Expression extends Node { }

export interface Statement extends Node {}

export interface AssignmentExpression extends Expression {
    op: string;
    children: {
        left: Expression;
        right: Expression;
    };
}

export interface BlockStatement extends Statement {
    children: {
        body: Statement[];
    };
}

export interface ForStatement extends Statement {
    children: {
        init?: Statement,
        test?: Expression;
        update?: Expression;
        body: Statement;
    };
}

export interface UnaryExpression extends Expression {
    operator: string;
    isPostfix: boolean;
    children: {
        operand: Expression,
    };
}

export interface BinaryExpression extends Expression {
    operator: string;
    children: {
        left: Expression,
        right: Expression,
    };
}

export interface BreakStatement extends Statement { }

export interface CallExpression extends Expression {
    children: {
        id: Identifier;
        args: Expression[];
    };
}

export interface CaseClause extends Statement {
    label?: symbol;
    children: {
        test: Expression;
        consequent: Statement[];
    };
}

export interface ExpressionStatement extends Statement {
    children: {
        expression: Expression;
    };
}

export interface FunctionDeclarationStatement extends Statement {
    children: {
        id: Identifier;
        params: Parameter[];
        body: BlockStatement;
    };
}

export interface Identifier extends Expression {
    name: string;
    symbol?: symbol;
}

export interface IfStatement extends Statement {
    children: {
        test: Expression;
        consequent: Statement;
        alternate: Statement;
    };
}

export interface LabelStatment extends Statement {
    label: symbol;
}

export interface Literal extends Expression {
    value: number | string;
}

export interface IntegerLiteral extends Literal {
    value: number;
}

export abstract class IntrinsicExpression implements Expression {
    public readonly scope?: LexicalScopeResolver;
    public readonly kind = NodeKind.intrinsicExpression;
    public children: { id: Identifier; args: Expression[]; };

    constructor(original: Expression) {
        this.scope = original.scope;
        this.children = deepClone(original.children);
    }

    public abstract emit(program: Program, routine: Routine, args: Operand[]): Operand;
}

export interface MemberExpression extends Expression {
    owner: Expression;
    element: Expression;
    computed: boolean;
}

export interface Parameter extends Node {
    children: {
        id: Identifier;
        defaultValue: Expression;
    };
}

export interface SourceFile extends Node {
    children: {
        body: Statement[];
    };
}

export interface SwitchStatement extends Statement {
    children: {
        discriminant: Expression;
        cases: CaseClause[];
    };
}

export interface ReturnStatement extends Statement {
    children: {
        argument: Expression;
    };
}

export interface StringLiteral extends Literal {
    value: string;
}

export interface VariableDeclarationStatement extends Statement {
    children: {
        declarations: VariableDeclarator[];
    };
    isConstant: boolean;
}

export interface VariableDeclarator extends Node {
    children: {
        id: Identifier;
        initializer: Expression | symbol | null;
    };
}

export interface WhileStatement extends Statement {
    children: {
        test: Expression;
        body: Statement;
    };
}

// tslint:enable:no-empty-interface
// tslint:enable:interface-name

export class Walker {
    private readonly dispatch = new Map([
        [ NodeKind.assignmentExpression,            { exit: this.exitAssignmentExpression }],
        [ NodeKind.binaryExpression,                { exit: this.exitBinaryExpression }],
        [ NodeKind.blockStatement,                  { exit: this.exitBlockStatement }],
        [ NodeKind.callExpression,                  { exit: this.exitCallExpression }],
        [ NodeKind.expressionStatement,             { exit: this.exitExpressionStatement }],
        [ NodeKind.functionDeclarationStatement,    { exit: this.exitFunctionDeclarationStatement }],
        [ NodeKind.identifier,                      { exit: this.exitIdentifier }],
        [ NodeKind.ifStatement,                     { exit: this.exitIfStatement }],
        [ NodeKind.integerLiteral,                  { exit: this.exitIntegerLiteral }],
        [ NodeKind.intrinsicExpression,             { exit: this.exitIntrinsicExpression }],
        [ NodeKind.memberExpression,                { exit: this.exitMemberExpression }],
        [ NodeKind.returnStatement,                 { exit: this.exitReturnStatement }],
        [ NodeKind.stringLiteral,                   { exit: this.exitStringLiteral }],
        [ NodeKind.unaryExpression,                 { exit: this.exitUnaryExpression }],
        [ NodeKind.parameter,                       { exit: this.exitParameter }],
        [ NodeKind.variableDeclarationStatement,    { exit: this.exitVariableDeclarationStatement }],
        [ NodeKind.variableDeclarator,              { exit: this.exitVariableDeclarator }],
        [ NodeKind.whileStatement,                  { exit: this.exitWhileStatement }],
    ] as Array<[string, { exit?: (node: Node) => void }]>);

    public visit(node: Node): Node {
        node = Object.assign(Object.create(node.constructor.prototype), node);

        this.entering(node);
        this.entered(node);

        if (node.children !== undefined) {
            node.children = this.visitChildren(node.children);
        }

        this.exiting(node);
        const nodeDispatch = this.dispatch.get(node.kind);
        if (nodeDispatch !== undefined && nodeDispatch.exit !== undefined) {
            node = nodeDispatch.exit.call(this, node);
        }
        this.exited(node);

        return node;
    }

    protected exitAssignmentExpression(assignmentExpression: AssignmentExpression): Node { return assignmentExpression; }
    protected exitBinaryExpression(binaryExpression: BinaryExpression): Node { return binaryExpression; }
    protected exitBlockStatement(blockStatement: BlockStatement): Node { return blockStatement; }
    protected exitCallExpression(callExpression: CallExpression): Node { return callExpression; }
    protected exitExpressionStatement(expressionStatement: ExpressionStatement): Node { return expressionStatement; }
    protected exitFunctionDeclarationStatement(functionDeclarationStatement: FunctionDeclarationStatement): Node { return functionDeclarationStatement; }
    protected exitIdentifier(identifier: Identifier): Node { return identifier; }
    protected exitIfStatement(ifStatement: IfStatement): Node { return ifStatement; }
    protected exitIntegerLiteral(integerLiteral: IntegerLiteral): Node { return integerLiteral; }
    protected exitIntrinsicExpression(intrinsicExpression: IntrinsicExpression): Node { return intrinsicExpression; }
    protected exitMemberExpression(memberExpression: MemberExpression): Node { return memberExpression; }
    protected exitReturnStatement(returnStatement: ReturnStatement): Node { return returnStatement; }
    protected exitStringLiteral(stringLiteral: StringLiteral): Node { return stringLiteral; }
    protected exitParameter(parameter: Parameter): Node { return parameter; }
    protected exitProgram(program: SourceFile): Node { return program; }
    protected exitUnaryExpression(unaryExpression: UnaryExpression): Node { return unaryExpression; }
    protected exitVariableDeclarationStatement(variableDeclarationStatement: VariableDeclarationStatement): Node { return variableDeclarationStatement; }
    protected exitVariableDeclarator(variableDeclarator: VariableDeclarator): Node { return variableDeclarator; }
    protected exitWhileStatement(whileStatement: WhileStatement): Node { return whileStatement; }

    protected entering(node: Node) { QA.unused(node); }
    protected entered(node: Node) { QA.unused(node); }

    protected exiting(node: Node) { QA.unused(node); }
    protected exited(node: Node) { QA.unused(node); }

    private visitArray(oldItems: Node[]) {
        const newItems: Node[] = [];
        for (const oldItem of oldItems) {
            const newItem = this.visit(oldItem);
            newItems.push(newItem);
        }
        return newItems;
    }

    private visitChildren(oldChildren: any) {
        const newChildren: any = {};

        for (const childName in oldChildren) {
            if (oldChildren.hasOwnProperty(childName)) {
                const oldValue = oldChildren[childName];
                const newValue = typeof oldValue === 'object'
                    ? this.visitChild(oldValue)
                    : oldValue;
                newChildren[childName] = newValue;
            }
        }

        return newChildren;
    }

    private visitChild(child: Node | Node[]) {
        if (child instanceof Array) {
            return this.visitArray(child);
        } else {
            return child === null
                ? null
                : this.visit(child);
        }
    }
}
