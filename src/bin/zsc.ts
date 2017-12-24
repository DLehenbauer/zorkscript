#!/usr/bin/env node

import fs = require('fs');
import minimist = require('minimist');
import { compile, Program, version } from '../index';

// tslint:disable:no-console
console.log(`\nZorkScript Compiler version ${version}\n`);

const args = minimist(process.argv.slice(2), {
    string: ['out'],
});

try {
    if (args._.length === 0) {
        throw new Error('No source files were specified on the command line.');
    }

    if (args._.length > 1) {
        throw new Error('Only one source file may be specified on the command line.');
    }

    if (args.out === undefined) {
        throw new Error('No out file specified on the command line.');
    }

    const program = new Program();
    compile(program, fs.readFileSync(args._[0], 'utf8'));

    program.main.new_line();    // Encourage interpretter to flush the output buffer before exiting.
    program.main.quit();        // Ensure that main exits cleanly (vs. run off into an illegal opcode).
    const zcode = program.compile();

    console.log(`Produced '${args.out}' (${zcode.length} bytes)`);
    fs.writeFileSync(args.out, zcode);
} catch (error) {
    console.error(`Error: ${error.message}`);
}
