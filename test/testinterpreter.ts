import { expect } from 'chai';
import fs = require('fs');
import JSZM = require('jszm');
import minimist = require('minimist');

const testArgs = minimist(process.argv.slice(2), {
    string: ['saveOnFailurePath'],
});

export function run(programBytes: Uint8Array, input: string[] = []) {
    const jszm = new JSZM(programBytes);
    let output = '';

    jszm.print = function*(text) {
        output += text;
        yield undefined;
    };

    jszm.read = function*() {
        const text = input.shift();
        expect(text).not.equals(undefined);
        return yield text;
    };

    const turns = jszm.run();
    for (let turn = turns.next(); !turn.done;) {
        turn = turns.next(turn.value);
    }

    return output;
}

export function expectPass(programBytes: Uint8Array, input: string[] = []) { expectOutput(programBytes, input, 'pass'); }

export function expectOutput(programBytes: Uint8Array, input: string[] = [], output: string) {
    try {
        expect(run(programBytes, input)).equal(output);
    } catch (error) {
        if (testArgs.saveOnFailurePath !== undefined) {
            fs.writeFileSync(testArgs.saveOnFailurePath, programBytes);

            // tslint:disable-next-line:no-console
            console.log(`Failed case saved: '${testArgs.saveOnFailurePath}'`);
        }
        throw error;
    }
}

export function expectCrash(programBytes: Uint8Array, input: string[] = [], error?: string | RegExp) {
    expect(() => run(programBytes, input)).throws(error);
}
