import * as AST from '../compiler/ast';
import { Identifier, NodeKind } from '../compiler/ast';
import * as Resolver from '../compiler/resolver';
import * as QA from '../util/qa';
import { Stack } from '../util/stack';
import { Operand, Result, Variable } from '../zcode/op';
import { Program } from '../zcode/program';
import { Routine } from '../zcode/routine';

export class Emitter {
    private static readonly operatorToOpcode = new Map([
        ['+', (routine: Routine, left: Operand, right: Operand, result: Result) => routine.add(left, right, result) ],
        ['-', (routine: Routine, left: Operand, right: Operand, result: Result) => routine.sub(left, right, result) ],
        ['*', (routine: Routine, left: Operand, right: Operand, result: Result) => routine.mul(left, right, result) ],
        ['/', (routine: Routine, left: Operand, right: Operand, result: Result) => routine.div(left, right, result) ],
        ['%', (routine: Routine, left: Operand, right: Operand, result: Result) => routine.mod(left, right, result) ],
        ['&', (routine: Routine, left: Operand, right: Operand, result: Result) => routine.and(left, right, result) ],
        ['|', (routine: Routine, left: Operand, right: Operand, result: Result) => routine.or (left, right, result) ],
    ]);

    private static readonly comparatorToBranch = new Map([
        ['==', (routine: Routine, left: Operand, right: Operand, label: symbol) => routine.je(/* branchWhen */ true,  left, right, label) ],
        ['!=', (routine: Routine, left: Operand, right: Operand, label: symbol) => routine.je(/* branchWhen */ false, left, right, label) ],
        ['<',  (routine: Routine, left: Operand, right: Operand, label: symbol) => routine.jl(/* branchWhen */ true,  left, right, label) ],
        ['>=', (routine: Routine, left: Operand, right: Operand, label: symbol) => routine.jl(/* branchWhen */ false, left, right, label) ],
        ['>',  (routine: Routine, left: Operand, right: Operand, label: symbol) => routine.jg(/* branchWhen */ true,  left, right, label) ],
        ['<=', (routine: Routine, left: Operand, right: Operand, label: symbol) => routine.jg(/* branchWhen */ false, left, right, label) ],
    ]);

    private readonly symbolToRoutine = new Map<symbol, Routine>();
    private readonly symbolToOperand = new Map<symbol, Operand>();
    private readonly routines: Stack<Routine>;
    private readonly breakLabels = new Stack<symbol | undefined>(undefined);

    constructor(private readonly program: Program) {
        this.routines = new Stack<Routine>(program.main);
    }

    public visitSourceFile(sourceFile: AST.SourceFile) {
        this.visitStatements(sourceFile.children.body);
    }

    private get routine() { return this.routines.top; }

    private getRoutine(id: Identifier) {
        const symbol = Resolver.getSymbol(id);
        let routine = this.symbolToRoutine.get(symbol);
        if (routine === undefined) {
            routine = this.program.routine(symbol);
            this.symbolToRoutine.set(symbol, routine);
        }

        return routine;
    }

    private allocVar(id: Identifier) {
        const symbol = id.symbol;
        if (symbol === undefined) {
            throw QA.fail(`Unresolved identifier ${id.name}.`);
        }
        QA.vetEqual(this.symbolToOperand.has(symbol), false);
        const operand = this.routine.allocVar(symbol);
        this.symbolToOperand.set(symbol, operand);
        return operand;
    }

    private breakScope(label: symbol, emitBody: () => void) {
        const routine = this.routine;
        this.breakLabels.push(label);
        emitBody();
        routine.label(label);
        this.breakLabels.pop();
        return label;
    }

    private visitAssignmentExpression(assignExpr: AST.AssignmentExpression) {
        const left = this.visitExpression(assignExpr.children.left);
        const right = this.visitExpression(assignExpr.children.right);

        const op = assignExpr.op;
        if (op === '=') {
            this.routine.store(Variable.from(left), right);
            return left;
        }

        if (op.length === 2 && op.charAt(1) === '=') {
            const opcode = Emitter.operatorToOpcode.get(op.charAt(0));
            if (opcode !== undefined) {
                return opcode(this.routine, left, right, Result.from(left));
            }
        }

        throw this.nyi(assignExpr);
    }

    private visitBreakStatement() {
        const label = this.breakLabels.top;
        if (label === undefined) {
            throw new Error('break outside scope.');
        }
        this.routine.jump(label);
    }

    private visitCallExpression(callExpr: AST.CallExpression) {
        this.routine.call(this.getRoutine(callExpr.children.id), this.visitExpressions(callExpr.children.args), Result.stack());
        return Operand.stack();
    }

    private visitForStatement(forStmt: AST.ForStatement) {
        const startLabel = Symbol('for-start');
        const endLabel = Symbol('for-end');
        this.breakScope(endLabel, () => {
            if (forStmt.children.init) {
                this.visitStatement(forStmt.children.init);
            }
            this.routine.label(startLabel);
            if (forStmt.children.test) {
                const test = this.visitExpression(forStmt.children.test);
                this.routine.jz(/* branchWhen = */ true, test, endLabel);
            }
            this.visitStatement(forStmt.children.body);
            if (forStmt.children.update) {
                this.visitExpression(forStmt.children.update);
            }

            this.routine.jump(startLabel);
        });
    }

    private visitFunctionDeclarationStatement(funcDecl: AST.FunctionDeclarationStatement) {
        this.routines.push(this.getRoutine(funcDecl.children.id));
        for (const param of funcDecl.children.params) {
            this.allocVar(param.children.id);
        }

        const block = funcDecl.children.body;
        this.visitBlock(block);

        const body = block.children.body;
        if (body.length === 0 || body[body.length - 1].kind !== NodeKind.returnStatement) {
            this.routine.rtrue();
        }
        this.routines.pop();
    }

    private visitIdentifier(id: AST.Identifier) {
        const symbol = Resolver.getSymbol(id);
        const operand = this.symbolToOperand.get(symbol);
        if (operand === undefined) {
            throw QA.fail('');
        }
        return operand;
    }

    private visitIfStatement(ifStmt: AST.IfStatement) {
        const endLabel = Symbol('if-end');
        const alternate = ifStmt.children.alternate;
        const test = this.visitExpression(ifStmt.children.test);
        if (!alternate) {
            this.routine.jz(/* branchWhen */ true, test, endLabel);
            this.visitStatement(ifStmt.children.consequent);
            this.routine.label(endLabel);
        } else {
            const consequentLabel = Symbol('if-then');
            this.routine.jz(/* branchWhen */ false, test, consequentLabel);
            this.visitStatement(ifStmt.children.alternate);
            this.routine.jump(endLabel);

            this.routine.label(consequentLabel);
            this.visitStatement(ifStmt.children.consequent);
            this.routine.label(endLabel);
        }
    }

    private visitIntrinsicExpression(intrinsicExpr: AST.IntrinsicExpression) {
        const args = this.visitExpressions(intrinsicExpr.children.args);
        return intrinsicExpr.emit(this.program, this.routine, args);
    }

    private visitIntegerLiteral(integer: AST.IntegerLiteral) {
        return Operand.constant(integer.value);
    }

    private visitMemberExpression(memberExpr: AST.MemberExpression) {
        const owner = this.visitExpression(memberExpr.children.owner);
        const element = this.visitExpression(memberExpr.children.element);
        this.routine.add(owner, element, Result.stack());
        return Operand.stack();
    }

    private visitReturnStatement(retStmt: AST.ReturnStatement) {
        if (!retStmt.children.argument) {
            this.routine.rtrue();
            return;
        }

        const result = this.visitExpression(retStmt.children.argument);
        this.routine.ret(result);
    }

    private visitVariableDeclarationStatement(varDeclStmt: AST.VariableDeclarationStatement) {
        for (const varDecl of varDeclStmt.children.declarations) {
            const variable = Variable.from(this.allocVar(varDecl.children.id));
            const initializer = varDecl.children.initializer;
            if (initializer) {
                const value = typeof initializer === 'symbol'
                    ? initializer
                    : this.visitExpression(initializer);
                this.routine.store(variable, value);
            }
        }
    }

    private nyi(node?: AST.Node) {
        throw QA.fail(`${node === undefined ? '' : node.kind}`);
    }

    private visitBinaryExpression(binaryExpr: AST.BinaryExpression) {
        const right = this.visitExpression(binaryExpr.children.right);
        const left = this.visitExpression(binaryExpr.children.left);
        const compareTrue = Symbol('compare-true');
        const compareEnd = Symbol('compare-end');

        const opcode = Emitter.operatorToOpcode.get(binaryExpr.operator);
        if (opcode !== undefined) {
            return opcode(this.routine, left, right, Result.stack());
        }

        const branch = Emitter.comparatorToBranch.get(binaryExpr.operator);
        if (branch !== undefined) {
            branch(this.routine, left, right, compareTrue);
            this.routine.push(0);
            this.routine.jump(compareEnd);
            this.routine.label(compareTrue);
            this.routine.push(1);
            this.routine.label(compareEnd);
            return Operand.stack();
        }

        throw this.nyi(binaryExpr);
    }

    private visitBlockStatement(blockStmt: AST.BlockStatement) {
        this.visitStatements(blockStmt.children.body);
    }

    private visitExpression(expr: AST.Expression): Operand {
        switch (expr.kind) {
            case NodeKind.assignmentExpression:
                return this.visitAssignmentExpression(expr as AST.AssignmentExpression);
            case NodeKind.binaryExpression:
                return this.visitBinaryExpression(expr as AST.BinaryExpression);
            case NodeKind.callExpression:
                return this.visitCallExpression(expr as AST.CallExpression);
            case NodeKind.identifier:
                return this.visitIdentifier(expr as AST.Identifier);
            case NodeKind.intrinsicExpression:
                return this.visitIntrinsicExpression(expr as AST.IntrinsicExpression);
            case NodeKind.integerLiteral:
                return this.visitIntegerLiteral(expr as AST.IntegerLiteral);
            case NodeKind.memberExpression:
                return this.visitMemberExpression(expr as AST.MemberExpression);
            case NodeKind.unaryExpression:
                return this.visitUnaryExpression(expr as AST.UnaryExpression);
            default:
                throw this.nyi(expr);
        }
    }

    private visitExpressions(exprs: AST.Expression[]) {
        return exprs.map((expr) => {
            return this.visitExpression(expr);
        });
    }

    private visitExpressionStatement(exprStmt: AST.ExpressionStatement) {
        const result = this.visitExpression(exprStmt.children.expression);

        // If invoking an expression as a statement, discard the result.
        if (Operand.isStack(result)) {
            this.routine.pop();
        }
    }

    private visitStatement(stmt: AST.Statement) {
        switch (stmt.kind) {
            case NodeKind.blockStatement:
                this.visitBlockStatement(stmt as AST.BlockStatement);
                break;
            case NodeKind.breakStatement:
                this.visitBreakStatement();
                break;
            case NodeKind.expressionStatement:
                this.visitExpressionStatement(stmt as AST.ExpressionStatement);
                break;
            case NodeKind.forStatement:
                this.visitForStatement(stmt as AST.ForStatement);
                break;
            case NodeKind.functionDeclarationStatement:
                this.visitFunctionDeclarationStatement(stmt as AST.FunctionDeclarationStatement);
                break;
            case NodeKind.ifStatement:
                this.visitIfStatement(stmt as AST.IfStatement);
                break;
            case NodeKind.variableDeclarationStatement:
                this.visitVariableDeclarationStatement(stmt as AST.VariableDeclarationStatement);
                break;
            case NodeKind.returnStatement:
                this.visitReturnStatement(stmt as AST.ReturnStatement);
                break;
            case NodeKind.switchStatement:
                this.visitSwitchStatement(stmt as AST.SwitchStatement);
                break;
            case NodeKind.whileStatement:
                this.visitWhileStatement(stmt as AST.WhileStatement);
                break;
            default:
                throw this.nyi(stmt);
        }
    }

    private visitStatements(stmts: AST.Statement[]) {
        for (const stmt of stmts) {
            this.visitStatement(stmt);
        }
    }

    private visitBlock(block: AST.BlockStatement) {
        this.visitStatements(block.children.body);
    }

    private visitSwitchStatement(switchStatement: AST.SwitchStatement) {
        const clauses = switchStatement.children.cases;
        const endLabel = Symbol('switch-end');
        let defaultClause: AST.CaseClause | undefined;
        let defaultLabel = endLabel;
        const nonDefaultClauses: AST.CaseClause[] = [];

        clauses.forEach((clause) => {
            if (clause.children.test) {
                clause.label = Symbol(`switch-case #${nonDefaultClauses.length}`);
                nonDefaultClauses.push(clause);
            } else {
                if (defaultClause !== undefined) {
                    throw new Error('switch statement must have only one default clause.');
                }
                clause.label = Symbol('switch-default');
                defaultLabel = clause.label;
                defaultClause = clause;
            }
        });

        if (nonDefaultClauses.length > 0) {
            const discriminant = this.visitExpression(switchStatement.children.discriminant);
            nonDefaultClauses.forEach((clause, index) => {
                if (clause.label === undefined) {
                    throw QA.fail('');
                }

                const isLast = index === (nonDefaultClauses.length - 1);
                if (!isLast && Operand.isStack(discriminant)) {
                    this.routine.dup();
                }

                const test = clause.children.test;
                this.routine.je(/* branchWhen */ true, discriminant, this.visitExpression(test), clause.label);
            });
        }

        this.routine.jump(defaultLabel);

        const orderedClauses = defaultClause
            ? nonDefaultClauses.concat(defaultClause)
            : nonDefaultClauses;

        this.breakScope(endLabel, () => {
            for (const clause of orderedClauses) {
                if (clause.label === undefined) {
                    throw QA.fail('');
                }

                this.routine.label(clause.label);
                this.visitStatements(clause.children.consequent);
            }
        });
    }

    private visitUnaryOperator(operator: string, operand: Operand) {
        switch (operator) {
            case '-':  { return this.routine.mul(operand, -1, Result.stack()); }
            case '++': { return this.routine.inc(Variable.from(operand)); }
            case '--': { return this.routine.dec(Variable.from(operand)); }
            default: throw this.nyi();
        }
    }

    private visitUnaryExpression(unaryExpr: AST.UnaryExpression): Operand {
        const operand = this.visitExpression(unaryExpr.children.operand);
        if (!unaryExpr.isPostfix) {
            return this.visitUnaryOperator(unaryExpr.operator, operand);
        }

        this.routine.load(Variable.from(operand), Result.stack());
        const result = this.visitUnaryOperator(unaryExpr.operator, operand);
        if (Operand.isStack(result)) {
            this.routine.pop();
        }
        return Operand.stack();
    }

    private visitWhileStatement(whileStmt: AST.WhileStatement) {
        const startLabel = Symbol('while-start');
        const endLabel = Symbol('while-end');
        this.breakScope(endLabel, () => {
            this.routine.label(startLabel);
            const test = this.visitExpression(whileStmt.children.test);
            this.routine.jz(/* branchWhen = */ true, test, endLabel);
            this.visitStatement(whileStmt.children.body);
            this.routine.jump(startLabel);
        });
    }
}

export function emit(program: Program, sourceFile: AST.SourceFile) {
    new Emitter(program).visitSourceFile(sourceFile);
    return program;
}
