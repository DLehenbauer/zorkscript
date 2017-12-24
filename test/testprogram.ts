import { Operand, Program, Result } from '../lib/index';
import * as TestInterpreter from './testinterpreter';

export class TestProgram extends Program {
    private static readonly stackGuard = 0x57AC;

    public programBytes: Uint8Array;
    public readonly passLabel = Symbol('pass');
    public readonly failLabel = Symbol('fail');

    public expect = {
        pass:   () => { TestInterpreter.expectPass(this.getZcode(), this.input); },
        output: (expected: string) => { TestInterpreter.expectOutput(this.getZcode(), this.input, expected); },
        crash:  () => { TestInterpreter.expectCrash(this.getZcode()); },
        stack: {
            equal: (expected: number | Operand) => {
                this.main.je(/* branchWhen = */ false, Operand.stack(), expected, this.failLabel);
            },
        },
        memory: {
            peek: (address: symbol | Operand) => {
                return {
                    byte: (byteIndex: number | Operand) => this.peekByte(address, byteIndex),
                };
            },
        },
        global: (actual: Operand | number) => {
            return {
                equal: (expected: number | Operand) => {
                    this.main.push(actual);
                    this.main.je(/* branchWhen = */ false, Operand.stack(), expected, this.failLabel);
                },
            };
        },
    };

    private readonly stackCheckLabel = Symbol('stack-check');
    private readonly originalQuit: () => void;
    private readonly input: string[] = [];

    constructor() {
        super();
        this.main.push(TestProgram.stackGuard);
        const originalQuit = this.main.quit;
        this.originalQuit = () => {
            originalQuit.call(this.main);
        };
        this.main.quit = () => {
            this.main.jump(this.stackCheckLabel);
        };
    }

    public passOrFailLabel(pass: boolean) {
        return pass ? this.passLabel : this.failLabel;
    }

    public fail() {
        this.main.jump(this.failLabel);
    }

    public pass() {
        this.main.jump(this.passLabel);
    }

    public peek(address: symbol | Operand) {
        return {
            byte: (byteIndex: number | Operand) => this.peekByte(address, byteIndex),
        };
    }

    public sendInput(text: string) {
        this.input.push(text);
    }

    private peekByte(address: symbol | Operand, byteIndex: number | Operand) {
        this.main.loadb(address, byteIndex, /* result = */ Result.stack());
        return {
            equal: this.expect.stack.equal,
        };
    }

    private getZcode() {
        this.main.print('fail: fallthrough -- did you forget main.quit()? ');
        this.originalQuit();

        this.main.label(this.failLabel);
        this.main.print('fail');
        this.originalQuit();

        const hang = Symbol('hang');
        this.main.label(hang);
        this.main.jump(hang);

        this.main.label(this.passLabel);
        this.main.print('pass');
        this.main.label(this.stackCheckLabel);
        const stackOkLabel = Symbol('stack ok');
        this.main.dup();
        this.main.je(/* branchWhen = */ true, Operand.stack(), TestProgram.stackGuard, stackOkLabel);
        this.main.print(`\n\nfail: wrong value on top of data stack. (expected ${TestProgram.stackGuard}, but got '`);
        this.main.print_num(Operand.stack());
        this.main.print("')\n");
        this.main.label(stackOkLabel);
        this.originalQuit();

        return this.compile();
    }
}
