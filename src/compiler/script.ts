import pegjs = require('pegjs');
import * as QA from '../util/qa';
import { Program } from '../zcode/program';
import * as AST from './ast';
import { NodeKind } from './ast';
import * as Emitter from './emitter';
import * as Evaluator from './evaluator';
import * as Intrinsics from './intrinsics';
import * as Resolver from './resolver';

// tslint:disable-next-line:no-var-requires
const parser: pegjs.Parser = require('../../lib/compiler/grammar');

export function compile(
    program: Program,
    sourceFile: string,
    definitions: AST.VariableDeclarationStatement[] = [],
    declarations: Map<string, symbol> = new Map()
) {
    let ast: AST.SourceFile = parser.parse(sourceFile) as AST.SourceFile;
    if (definitions) {
        ast.children.body.splice(0, 0, ...definitions);
    }

    for (const transformer of [
        (file: AST.SourceFile) => Resolver.visit(file, declarations),
        (file: AST.SourceFile) => Evaluator.visit(file),
        (file: AST.SourceFile) => Intrinsics.visit(file)]
    ) {
        QA.vetEqual(ast.kind, NodeKind.sourceFile);
        ast = transformer(ast) as AST.SourceFile;
    }
    return Emitter.emit(program, ast);
}
