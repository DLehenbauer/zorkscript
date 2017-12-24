import { Operand, Result, Routine, Variable } from '../lib/index';
import { TestProgram } from './testprogram';

const objectsRootPass = [
    {
        index: 1,
        name: 'pass',
        attributes: [],
        properties: {},
        children: [],
    },
];

const objectsSibling = [
    {
        index: 1,
        name: 'root',
        attributes: [],
        properties: {},
        children: [],
    },
    {
        index: 2,
        name: 'sibling',
        attributes: [],
        properties: {},
        children: [],
    },
];

const objectsChild = [
    {
        index: 1,
        name: 'root',
        attributes: [],
        properties: {},
        children: [{
            index: 2,
            name: 'child',
            attributes: [],
            properties: {},
            children: [],
        }],
    },
];

describe('opcodes', () => {
    let program: TestProgram;
    let main: Routine;

    beforeEach(() => {
        program = new TestProgram();
        main = program.main;
    });

    describe('printing', () => {
        it('print_char', () => {
            'pass'.split('').forEach((ch) => {
                main.print_char(Operand.byte(ch.charCodeAt(0)));
            });
            main.quit();
            program.expect.pass();
        });

        it('print_num', () => {
            main.print_num(-1);
            main.quit();
            program.expect.output('-1');
        });
    });

    describe('pass/fail', () => {
        afterEach(() => {
            program.expect.pass();
        });

        const branchTest = (condition: boolean, test: (branchWhen: boolean, description: string, branchLabel: () => symbol, done: () => void) => void) => {
            [true, false].forEach((branchWhen) => {
                const branchExpected = condition ? branchWhen : !branchWhen;
                test(
                    branchWhen,
                    branchExpected ? 'should branch' : 'should not branch',
                    () => program.passOrFailLabel(branchExpected),
                    () => program.main.jump(program.passOrFailLabel(!branchExpected)));
            });
        };

        describe('objects', () => {
            it('print_object', () => {
                program.objects(objectsRootPass, /* attributes */ [], /* defaultProperties */ []);
                main.print_object(1);
                main.quit();
            });

            describe('get_sibling', () => {
                it('none', () => {
                    program.objects(objectsRootPass, /* attributes */ [], /* defaultProperties */ []);
                    main.get_sibling(1, Result.stack(), program.failLabel, /* branchWhen = */ true);
                    program.expect.stack.equal(0);
                    program.pass();
                });

                it('first', () => {
                    program.objects(objectsSibling, /* attributes */ [], /* defaultProperties */ []);
                    main.get_sibling(1, Result.stack(), program.failLabel, /* branchWhen = */ false);
                    program.expect.stack.equal(2);
                    program.pass();
                });
            });

            describe('get_child', () => {
                it('none', () => {
                    program.objects(objectsRootPass, /* attributes */ [], /* defaultProperties */ []);
                    main.get_child(1, Result.stack(), program.failLabel, /* branchWhen = */ true);
                    program.expect.stack.equal(0);
                    program.pass();
                });

                it('first', () => {
                    program.objects(objectsChild, /* attributes */ [], /* defaultProperties */ []);
                    main.get_child(1, Result.stack(), program.failLabel, /* branchWhen = */ false);
                    program.expect.stack.equal(2);
                    program.pass();
                });
            });

            describe('get_parent', () => {
                it('none', () => {
                    program.objects(objectsRootPass, /* attributes */ [], /* defaultProperties */ []);
                    main.get_parent(1, Result.stack());
                    program.expect.stack.equal(0);
                    program.pass();
                });

                it('first', () => {
                    program.objects(objectsChild, /* attributes */ [], /* defaultProperties */ []);
                    main.get_parent(Operand.byte(2), Result.stack());
                    program.expect.stack.equal(1);
                    program.pass();
                });
            });
        });

        describe('memory', () => {
            it('loadb', () => {
                const charBuffer = Symbol('charBuffer');
                program.table(charBuffer).bytes('pass'.split('').map((ch) => ch.charCodeAt(0)));
                main.loadb(charBuffer, 3, Result.stack());
                main.loadb(charBuffer, 2, Result.stack());
                main.loadb(charBuffer, 1, Result.stack());
                main.loadb(charBuffer, 0, Result.stack());
                main.print_char(Operand.stack());
                main.print_char(Operand.stack());
                main.print_char(Operand.stack());
                main.print_char(Operand.stack());
                main.quit();
            });
        });

        describe('variable', () => {
            it('load', () => {
                const temp = program.global(Symbol('temp'), 1);
                main.load(Variable.from(temp), Result.stack());
                program.expect.stack.equal(1);
                program.pass();
            });

            it('store', () => {
                const temp = program.global(Symbol('temp'));
                main.store(Variable.from(temp), 1);
                program.expect.global(temp).equal(1);
                program.pass();
            });

            it('inc', () => {
                main.push(0);
                main.inc(Variable.top());
                program.expect.stack.equal(1);
                program.pass();
            });

            describe('inc_chk', () => {
                [-1, 0].forEach((start) => {
                    branchTest(start + 1 > 0, (branchWhen, description, branchLabel, done) => {
                        it(`x = ${start}, x++; x == 0 ${description}`, () => {
                            const temp = main.allocVar(Symbol('temp'), start);
                            main.inc_chk(Variable.from(temp), 0, branchLabel(), branchWhen);
                            done();
                        });
                    });
                });
            });

            it('dec', () => {
                main.push(0);
                main.dec(Variable.top());
                program.expect.stack.equal(-1);
                program.pass();
            });

            describe('dec_chk', () => {
                [1, 0].forEach((start) => {
                    branchTest(start - 1 < 0, (branchWhen, description, branchLabel, done) => {
                        it(`x = ${start}, x++; x == 0 ${description}`, () => {
                            const temp = main.allocVar(Symbol('temp'), start);
                            main.dec_chk(Variable.from(temp), 0, branchLabel(), branchWhen);
                            done();
                        });
                    });
                });
            });
        });

        describe('routines', () => {
            it('rtrue', () => {
                const r = program.routine(Symbol('r0'));
                r.rtrue();

                main.call(r, [], Result.stack());
                program.expect.stack.equal(1);
                program.pass();
            });

            it('rfalse', () => {
                const r = program.routine(Symbol('r0'));
                r.rfalse();

                main.call(r, [], Result.stack());
                program.expect.stack.equal(0);
                program.pass();
            });
        });

        describe('branching', () => {
            describe('jump', () => {
                it('forward', () => {
                    program.pass();
                });

                it('backward', () => {
                    const l0 = Symbol('l0');
                    const l1 = Symbol('l1');

                    main.jump(l0);
                    main.label(l1);
                    program.pass();
                    main.label(l0);
                    main.jump(l1);
                });
            });

            describe('jz', () => {
                [0, 1].forEach((x) => {
                    branchTest(x === 0, (branchWhen, description, branchLabel, done) => {
                        it(`x = ${x}, x ${branchWhen ? '==' : '!='} 0 ${description}`, () => {
                            const temp = program.global(Symbol('temp'));
                            main.store(Variable.from(temp), x);
                            main.jz(branchWhen, temp, branchLabel());
                            done();
                        });
                    });
                });
            });

            describe('je', () => {
                [0, 1].forEach((a) => {
                    [0, 1].forEach((b) => {
                        branchTest(a === b, (branchWhen, description, branchLabel, done) => {
                            it(`a = ${a}, b = ${b}, a ${branchWhen ? '==' : '!='} b ${description}`, () => {
                                const left = program.global(Symbol('left'));
                                const right = program.global(Symbol('right'));

                                main.store(Variable.from(left), b);
                                main.store(Variable.from(right), a);

                                main.je(branchWhen, left, right, branchLabel());
                                done();
                            });
                        });
                    });
                });
            });
        });

        describe('input', () => {
            it('sread', () => {
                const textBuffer = Symbol('textBuffer');
                const parseBuffer = Symbol('parseBuffer');

                const textBufferBytes = Array(3).fill(0);
                textBufferBytes[0] = textBufferBytes.length - 1;

                const parseBufferBytes = Array(6).fill(0);
                parseBufferBytes[0] = Math.floor((parseBufferBytes.length - 2) / 4);

                program.table(textBuffer).bytes(textBufferBytes);
                program.table(parseBuffer).bytes(parseBufferBytes);

                program.vocabulary('.,"', [
                    ['t', [0x42]],
                ]);
                program.sendInput('truncated input');

                main.sread(textBuffer, parseBuffer);
                't\0'.split('').forEach((ch, index) => {
                    program.peek(textBuffer).byte(index + 1).equal(ch.charCodeAt(0));
                });

                program.peek(parseBuffer).byte(1).equal(1);
                program.peek(parseBuffer).byte(4).equal(1);
                program.peek(parseBuffer).byte(5).equal(1);

                program.pass();
            });
        });
    });
});
