export { Operand, Result, Variable } from './zcode/op';
export { Program } from './zcode/program';
export { Routine } from './zcode/routine';
export * from './compiler/script';

// tslint:disable-next-line:no-var-requires
export const version = require('../package.json').version;
