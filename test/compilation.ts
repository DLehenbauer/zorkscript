import * as ZorkScript from '../lib/index';
import { TestProgram } from './testprogram';

describe('Compilation', () => {
    const expectOutput = (description: string, source: string, expected: string) => {
        it(description, () => {
            const program = new TestProgram();
            ZorkScript.compile(program, source);
            program.main.quit();
            program.expect.output(expected);
        });
    };

    const expectPass = (description: string, source: string) => {
        expectOutput(description, source, 'pass');
    };

    describe('intrinsics', () => {
        expectOutput('quit', 'quit();', '');

        describe('print', () => {
            expectPass('string', 'print("pass");');
            expectOutput('number', 'print(42);', '42');
            expectOutput('variable', 'let x = 42; print(x);', '42');
        });

        describe('random', () => {
            expectOutput('random', 'print(random(1));', '1');
        });

        describe('array', () => {
            expectOutput('declare', 'const a = Array(1);', '');
            expectOutput('loadb', 'const a = Array(1); print(loadb(a, 0));', '0');
            expectOutput('storeb', 'const a = Array(1); storeb(a, 0, 42); print(loadb(a, 0));', '42');
        });
    });

    describe('operators', () => {
        const evaluate = (expr: string) => {
            // tslint:disable-next-line:no-eval
            return eval(`(() => ${expr})()`);
        };

        describe('assignment', () => {
            const testAssignment = (initial: number, op: string, operand: number) => {
                const expression = `t ${op} ${operand}`;
                const expected = evaluate(`{ let t = ${initial}; return ${expression}; }`);
                expectOutput(`t = ${initial}, ${expression} -> ${expected}`, `let t = ${initial}; print(${expression});`, `${expected}`);
            };

            testAssignment(1, '=', 2);
            testAssignment(-0x8000, '=', 0x7FFF);

            testAssignment(1, '+=', 2);
            testAssignment(-0x8000, '+=', 0x7FFF);

            testAssignment(1, '-=', 2);
            testAssignment(0x7FFF, '-=', 0x7FFF);
        });

        describe('unary', () => {
            describe('prefix', () => {
                expectOutput('-1 -> -1', 'print(-1);', '-1');
                expectOutput('-0x8000 -> -0x8000', 'print(-0x8000);', '-32768');
                expectOutput('i = 1,  -i -> -1', 'const i = 1; print(-i);', '-1');
                expectOutput('i = 0, ++i ->  1', 'let i = 0; print(++i);', '1');
                expectOutput('i = 0, --i -> -1', 'let i = 0; print(--i);', '-1');
            });
            describe('postfix', () => {
                expectOutput('i = 5, i++ -> 5, i <- 6', 'let i = 5; print(i++); print(6);', '56');
                expectOutput('i = 5, i-- -> 5, i <- 4', 'let i = 5; print(i--); print(4);', '54');
            });
        });

        const testBinOp = (op: string, left: number, right: number) => {
            const expression = `${left} ${op} ${right}`;
            const expected = `${evaluate(expression) | 0}`;
            expectOutput(`${expression} -> ${expected}`, `print(${expression});`, expected);
        };

        describe('arithmetic', () => {
            describe('addition', () => {
                testBinOp('+', 1, 2);
                testBinOp('+', -0x8000, 0x7FFF);
            });
            describe('subtraction', () => {
                testBinOp('-', 1, 2);
                testBinOp('-', -0x8000, -0x7FFF);
            });
            describe('multiplication', () => {
                testBinOp('*', 2, 3);
                testBinOp('*', -0x3FFF, -2);
            });
            describe('division', () => {
                testBinOp('/', 27, 8);
                testBinOp('/', 4, 2);
                testBinOp('/', -0x8000, -2);
            });
            describe('modulus', () => {
                testBinOp('%', 4, 3);
            });
        });

        describe('bitwise', () => {
            describe('and', () => {
                testBinOp('&', 2, 1);
                testBinOp('&', -1, -0x8000);
            });
            describe('or', () => {
                testBinOp('|', 2, 1);
                testBinOp('|', -0x4000, -0x8000);
            });
            // describe('bit-shift', () => {
            //     testBinOp('>>', -11743, 1);
            //     testBinOp('>>', -11743, 15);
            //     testBinOp('>>', -11743, 16);
            // });
        });

        describe('relational', () => {
            const testRelationalOp = (op: string, left: number, right: number) => {
                const expression = `${left} ${op} ${right}`;
                const expected = evaluate(expression) ? '1' : '0';
                expectOutput(`${expression} -> ${expected}`, `print(${expression});`, expected);
            };

            for (const op of ['==', '!=']) {
                for (const left of [1, 0]) {
                    testRelationalOp(op, left, 1);
                }
            }

            for (const other of [1, 0]) {
                testRelationalOp('<', other, 1);
                testRelationalOp('>', 1, other);
            }

            for (const other of [0, 1, 2]) {
                testRelationalOp('<=', 1, other);
                testRelationalOp('>=', other, 1);
            }
        });
    });

    describe('loop', () => {
        expectPass('while(false)', "while(false) { print('fail'); } print('pass');");
        expectOutput('while(i)', 'let i = 2; while(i) { print(i); i = i - 1; }', '21');
        expectPass('while/break', "while(true) { break; } print('pass');");

        expectPass('for(;;)', "for(;;) { print('pass'); quit(); }");
        expectPass('for(;0;)', "for(;0;) { print('fail'); } print('pass');");
        expectOutput('for(let i = 0; i < 2; i = i + 1)', 'for(let i = 0; i < 2; i = i + 1) { print(i); }', '01');
        expectPass('for/break', "for(;true;) { break; } print('pass');");
    });

    describe('subroutine', () => {
        expectPass('0 arguments', 'function sub() { print("pass"); } sub();');
        expectOutput('1 arguments', 'function sub(x) { print(x); } sub(1);', '1');
        expectOutput('2 arguments', 'function sub(x, y) { print(x); print(y); } sub(1, 2);', '12');
        expectOutput('3 arguments', 'function sub(x, y, z) { print(x); print(y); print(z); } sub(1, 2, 3);', '123');
        expectOutput('return', 'function sub() { return; } print(sub());', '1');
        expectOutput('return value', 'function sub() { return 5; } print(sub());', '5');
    });

    describe('conditional', () => {
        describe('if', () => {
            expectPass('true', 'if (true) { print("pass"); }');
            expectPass('false', 'if (false) { print("fail"); } print("pass");');
        });

        describe('if-else', () => {
            expectPass('true', 'if (1) { print("pass"); } else { print("fail"); }');
            expectPass('false', 'if (0) { print("fail"); } else { print("pass"); }');
        });

        describe('switch', () => {
            expectOutput('empty', 'switch(0) { }', '');
            expectOutput('default', 'switch(0) { default: print(1); }', '1');

            describe('1 case', () => {
                const sw = (x: number) => `switch(${x}) { case 1: print(1); }`;
                expectOutput('case 1', `${sw(1)}`, '1');
                expectOutput('none', `${sw(2)}`, '');
            });

            describe('2 cases, fallthrough', () => {
                const sw = (x: number) => `switch(${x}) { case 1: print(1); case 2: print(2); }`;
                expectOutput('case 1', `${sw(1)}`, '12');
                expectOutput('case 2', `${sw(2)}`, '2');
                expectOutput('none', `${sw(3)}`, '');
            });

            describe('2 cases, break', () => {
                const sw = (x: number) => `switch(${x}) { case 1: print(1); break; case 2: print(2); break; }`;
                expectOutput('case 1', `${sw(1)}`, '1');
                expectOutput('case 2', `${sw(2)}`, '2');
                expectOutput('none', `${sw(3)}`, '');
            });

            describe('2 cases, default', () => {
                const sw = (x: number) => `switch(${x}) { case 1: print(1); break; default: print(0); break; }`;
                expectOutput('case 1', `${sw(1)}`, '1');
                expectOutput('default', `${sw(2)}`, '0');
            });
        });
    });
});
