import * as QA from '../util/qa';
import { Stack } from '../util/stack';
import * as AST from './ast';
import { Identifier, NodeKind } from './ast';
import * as Instrinsics from './intrinsics';
import { LexicalScope, LexicalScopeResolver } from './lexicalscope';

class Pass1 extends AST.Walker {
    private readonly scopes: Stack<LexicalScope>;

    constructor(lexicalScopeResolver: LexicalScopeResolver) {
        super();
        this.scopes = new Stack<LexicalScope>(new LexicalScope(lexicalScopeResolver));
    }

    protected entered(node: AST.Node) {
        switch (node.kind) {
            case NodeKind.functionDeclarationStatement:
            case NodeKind.parameter:
            case NodeKind.variableDeclarator: {
                this.scopes.top.define(node.children.id);
                break;
            }
        }

        if (this.createsNewScope(node)) {
            this.scopes.push(new LexicalScope(this.scopes.top));
        }

        node.scope = this.scopes.top;
    }

    protected exited(node: AST.Node) {
        if (this.createsNewScope(node)) {
            this.scopes.pop();
        }
    }

    private createsNewScope(node: AST.Node) {
        switch (node.kind) {
            case NodeKind.blockStatement:
            case NodeKind.functionDeclarationStatement:
            case NodeKind.sourceFile:
                return true;

            default:
                return false;
        }
    }
}

class Pass2 extends AST.Walker {
    constructor() { super(); }

    protected exitIdentifier(id: Identifier) {
        if (id.scope === undefined) {
            throw QA.fail(`Identifier ${id.name} must be assigned a lexical scope.`);
        }

        if (id.symbol === undefined) {
            const declaration = id.scope.resolve(id);
            QA.vetNotEqual(declaration, id);

            id.symbol = declaration.symbol;
        }

        QA.vetNotEqual(id.symbol, undefined);
        return super.exitIdentifier(id);
    }
}

export function getSymbol(id: AST.Identifier) {
    if (id.symbol === undefined) {
        throw QA.fail(`Declaration ${id.name} must be assigned a symbol.`);
    }
    return id.symbol;
}

export function visit(tree: AST.SourceFile, declarations = new Map<string, symbol>()) {
    const resolver = new LexicalScopeResolver(Instrinsics.definitions, declarations);
    const pass1Out = new Pass1(resolver).visit(tree);
    return new Pass2().visit(pass1Out);
}
