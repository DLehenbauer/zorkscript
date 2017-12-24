import { Program, Routine } from '../lib/index';
import * as TestInterpreter from './testinterpreter';
import { TestProgram } from './testprogram';

describe('Program', () => {
    it('minimal', () => {
        const program = new Program();
        program.main.quit();
        TestInterpreter.expectOutput(program.compile(), undefined, '');
    });
});

describe('TestProgram', () => {
    let program: TestProgram;
    let main: Routine;

    beforeEach(() => {
        program = new TestProgram();
        main = program.main;
    });

    it('print', () => {
        main.print('pass');
        main.quit();
        program.expect.pass();
    });

    it('illegal', () => {
        main.illegal();
        main.quit();
        program.expect.crash();
    });

    describe('assert', () => {
        describe('stack', () => {
            it('pass', () => {
                main.push(1);
                program.expect.stack.equal(1);
                main.print('pass');
                main.quit();
                program.expect.pass();
            });
            it('fail', () => {
                main.push(0);
                program.expect.stack.equal(7);
                main.quit();
                program.expect.output('fail');
            });
        });
    });
});
