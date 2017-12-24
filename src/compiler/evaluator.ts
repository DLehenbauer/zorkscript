import * as AST from './ast';
import { NodeKind } from './ast';

class Pass1 extends AST.Walker {
    // private tryAsInteger(node: AST.Node) {
    //     if (node.kind !== NodeKind.integerLiteral) {
    //         return undefined;
    //     }

    //     const asInt = node as AST.IntegerLiteral;
    //     return asInt.value;
    // }

    // private coerceToExpression(expr: number | AST.Expression) {
    //     switch (typeof expr) {
    //         case 'number': return { kind: NodeKind.integerLiteral, value: expr } as IntegerLiteral;
    //         default: return expr;
    //     }
    // }

    // private makeBinop(operator: string, left: number | AST.Expression, right: number | AST.Expression) {
    //     return {
    //         kind: NodeKind.binaryExpression,
    //         operator: operator,
    //         children: { left: this.coerceToExpression(left), right: this.coerceToExpression(right) }
    //     } as AST.BinaryExpression
    // }

    // private convertShiftTo(newOperator: string, left: AST.Expression, right: AST.Expression) {
    //     let rightValue = this.tryAsInteger(right);
    //     if (rightValue === undefined) {
    //         throw `Right-hand side of bitwise shift operator must be a constant.`;
    //     }

    //     let exponent = 2 ** rightValue;
    //     if (exponent > 256) {
    //         exponent /= 256;
    //         return this.makeBinop(newOperator, this.makeBinop('*', left, 256), exponent);
    //     } else {
    //         return this.makeBinop(newOperator, left, exponent);
    //     }
    // }

    // protected exitBinaryExpression(binaryExpr: BinaryExpression) {
    //     switch (binaryExpr.operator) {
    //         case '<<': return this.convertShiftTo('*', binaryExpr.children.left, binaryExpr.children.right);
    //         case '>>': return this.convertShiftTo('/', binaryExpr.children.left, binaryExpr.children.right);
    //         default:   return super.exitBinaryExpression(binaryExpr);
    //     }
    // }

    protected exitUnaryExpression(unaryExpr: AST.UnaryExpression) {
        const operand = unaryExpr.children.operand;

        switch (unaryExpr.operator) {
            case '-': {
                switch (operand.kind) {
                    case NodeKind.integerLiteral: {
                        const asLiteral = operand as AST.IntegerLiteral;
                        asLiteral.value = -asLiteral.value;
                        return asLiteral;
                    }
                }
            }
        }

        return super.exitUnaryExpression(unaryExpr);
    }
}

export function visit(sourceFile: AST.SourceFile) {
    return new Pass1().visit(sourceFile);
}
