import { Routine } from '../lib/index';
import { TestProgram } from './testprogram';

describe('Z-string', () => {
    let program: TestProgram;
    let main: Routine;

    beforeEach(() => {
        program = new TestProgram();
        main = program.main;
    });

    const zcharTest = (description: string, text: string) => {
        it(description, () => {
            main.print(text);
            main.quit();
            program.expect.output(text);
        });
    };

    describe('padding', () => {
        for (let i = 3; i >= 0; i--) {
            const text = 'zzz'.slice(0, i);
            zcharTest(`should encode '${text}' with ${3 - i} pad zchars`, text);
        }
    });

    describe('alphabets', () => {
        zcharTest('should encode A0 (lower-case)', 'abcdefghijklmnopqrstuvwxyz');
        zcharTest('should encode A1 (upper-case)', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
        zcharTest('should encode A2 (numbers, punctuation, and special)', '\n0123456789.,!?_#\'"/\\-:()');
        zcharTest('should encode interleaved A0 and A1', 'aAaaAAaaa');
        zcharTest('should encode interleaved A1 and A2', 'A0AA00AAA');
        zcharTest('should encode interleaved A0 and A2', 'a0aa00aaa');
    });

    describe('ascii', () => {
        zcharTest('should encode ascii', '<>');
    });
});
