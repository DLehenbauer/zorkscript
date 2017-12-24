import * as LoByte from 'lobyte';
import * as Binary from '../util/binary';
import * as QA from '../util/qa';

export enum OpcodeKind {
    Op0 = (0b1011 << 4),        // 1011xxxx (Op1 w/type = 11 -> no argument)
    Op1 = (0b10   << 6),        // 10ttxxxx
    Op2 = (0b0    << 7),        // 0abxxxxx
    Var = (0b11   << 6),        // 11axxxxx (a = 0 - 2op, 1 = Var)
    Ext = 0,
}

export enum Type {
    word        = 0b00,     // A 16b constant
    byte        = 0b01,     // An 8b constant
    variable    = 0b10,     // An 8b variable reference (0 = routine stack, 1-15 = local var, 16-255 = global var (-16))
    none        = 0b11,
}

export class Opcode {
    public kind: OpcodeKind;
    public code: number;
    public store: boolean;
    public branch: boolean;
}

export class AResult {
    constructor(readonly value: number) {}
}

export class Result extends AResult {
    public static stack() {
        return new Result(0);
    }

    public static local(index: number) {
        LoByte.Uint8.ensure(index);
        QA.vetLessThanEqual(index, 15);
        return new Result(index + 1);
    }

    public static global(index: number) {
        LoByte.Uint8.ensure(index);
        QA.vetLessThanEqual(index, 239);
        return new Result(index + 16);
    }

    public static from(operand: Operand) {
        QA.vetEqual(operand.type, Type.variable);
        return new Result(operand.value);
    }

    public isResult = true;
}

export class AOperand extends AResult {
    constructor(readonly type: Type, readonly value: number) {
        super(value);

        switch (type) {
            case Type.variable:
            case Type.byte:
                LoByte.Uint8.ensure(value);
                break;
            default:
                LoByte.Xint16.ensure(value);
                break;
        }
    }
}

export class Operand extends AOperand {
    public static stack() {
        return new Operand(Type.variable, 0);
    }

    public static isStack(operand: Operand) {
        return operand !== undefined            // Not Operand.void()
            && operand.type === Type.variable
            && operand.value === 0;
    }

    public static local(value: number) {
        QA.vetLessThanEqual(value, 15);
        return new Operand(Type.variable, value + 1);
    }

    public static global(value: number) {
        QA.vetLessThanEqual(value, 239);
        return new Operand(Type.variable, value + 16);
    }

    public static variable(value: number) {
        return new Operand(Type.variable, value);
    }

    public static constant(value: number) {
        return LoByte.Uint8.test(value)
            ? new Operand(Type.byte, value)
            : new Operand(Type.word, value);
    }

    public static byte(value: number) {
        return new Operand(Type.byte, value);
    }

    public static word(value: number) {
        return new Operand(Type.word, value);
    }

    public static void() {
        return (undefined as any) as Operand;
    }

    public static isVoid(operand: Operand) {
        return operand === undefined;
    }

    public isOperand = true;
}

export class Variable extends AOperand {
    public static top() {
        return Variable.from(Operand.stack());
    }

    public static local(value: number) {
        const operand = typeof value === 'number'
            ? Operand.local(value)
            : value;

        return Variable.from(operand);
    }

    public static global(value: number) {
        const operand = typeof value === 'number'
            ? Operand.global(value)
            : value;

        return Variable.from(operand);
    }

    public static from(variable: Operand) {
        QA.vetEqual(variable.type, Type.variable);
        return new Variable(Type.byte, variable.value);
    }

    public static deref(variable: Operand) {
        QA.vetEqual(variable.type, Type.variable);
        return new Variable(Type.variable, variable.value);
    }

    public isVariable = true;
}

/**
 * Z-Machine opcodes common to all versions.
 *
 * Opcode descriptions were adapted from the 'The Z-Machine Standards Document':
 * http://inform-fiction.org/zmachine/standards/z1point1/sect15.html
 */
// tslint:disable:max-line-length
// tslint:disable-next-line:variable-name
const opcodes_common = {
    je:                 { officialName: 'EQUAL?',   kind: OpcodeKind.Op2, opcode:   1, code: 0x01, store: false, branch: true,  description: 'je a b ?(label)'},
    jl:                 { officialName: 'LESS?',    kind: OpcodeKind.Op2, opcode:   2, code: 0x02, store: false, branch: true,  description: 'jl a b ?(label)'},
    jg:                 { officialName: 'GRTR?',    kind: OpcodeKind.Op2, opcode:   3, code: 0x03, store: false, branch: true,  description: 'jg a b ?(label)'},
    dec_chk:            { officialName: 'DLESS?',   kind: OpcodeKind.Op2, opcode:   4, code: 0x04, store: false, branch: true,  variable: true, description: 'dec_chk (variable) value ?(label)' },
    inc_chk:            { officialName: 'IGRTR?',   kind: OpcodeKind.Op2, opcode:   5, code: 0x05, store: false, branch: true,  variable: true, description: 'inc_chk (variable) value ?(label)' },
    jin:                { officialName: 'IN?',      kind: OpcodeKind.Op2, opcode:   6, code: 0x06, store: false, branch: true,  description: 'jin obj1 obj2 ?(label)' },
    test:               { officialName: 'BTST',     kind: OpcodeKind.Op2, opcode:   7, code: 0x07, store: false, branch: true,  description: 'test bitmap flags ?(label)' },
    or:                 { officialName: 'BOR',      kind: OpcodeKind.Op2, opcode:   8, code: 0x08, store: true,  branch: false, description: 'or a b -> (result)' },
    and:                { officialName: 'BAND',     kind: OpcodeKind.Op2, opcode:   9, code: 0x09, store: true,  branch: false, description: 'and a b -> (result)'},
    test_attr:          { officialName: 'FSET?',    kind: OpcodeKind.Op2, opcode:  10, code: 0x0A, store: false, branch: true,  description: 'test_attr object attribute ?(label)'},
    set_attr:           { officialName: 'FSET',     kind: OpcodeKind.Op2, opcode:  11, code: 0x0B, store: false, branch: false, description: 'set_attr object attribute' },
    clear_attr:         { officialName: 'FCLEAR',   kind: OpcodeKind.Op2, opcode:  12, code: 0x0C, store: false, branch: false, description: 'clear_attr object attribute'},
    store:              { officialName: 'SET',      kind: OpcodeKind.Op2, opcode:  13, code: 0x0D, store: false, branch: false, variable: true, description: 'store (variable) value' },
    insert_obj:         { officialName: 'MOVE',     kind: OpcodeKind.Op2, opcode:  14, code: 0x0E, store: false, branch: false, description: 'insert_obj object destination' },
    loadw:              { officialName: 'GET',      kind: OpcodeKind.Op2, opcode:  15, code: 0x0F, store: true,  branch: false, description: 'loadw array word-index -> (result)' },
    loadb:              { officialName: 'GETB',     kind: OpcodeKind.Op2, opcode:  16, code: 0x10, store: true,  branch: false, description: 'loadb array byte-index -> (result)' },
    get_prop:           { officialName: 'GETP',     kind: OpcodeKind.Op2, opcode:  17, code: 0x11, store: true,  branch: false, description: 'get_prop object property -> (result)' },
    get_prop_addr:      { officialName: 'GETPT',    kind: OpcodeKind.Op2, opcode:  18, code: 0x12, store: true,  branch: false, description: 'get_prop_addr object property -> (result)' },
    get_next_prop:      { officialName: 'NEXTP',    kind: OpcodeKind.Op2, opcode:  19, code: 0x13, store: true,  branch: false, description: 'get_next_prop object property -> (result)' },
    add:                { officialName: 'ADD',      kind: OpcodeKind.Op2, opcode:  20, code: 0x14, store: true,  branch: false, description: 'add a b -> (result)'},
    sub:                { officialName: 'SUB',      kind: OpcodeKind.Op2, opcode:  21, code: 0x15, store: true,  branch: false, description: 'sub a b -> (result)'},
    mul:                { officialName: 'MUL',      kind: OpcodeKind.Op2, opcode:  22, code: 0x16, store: true,  branch: false, description: 'mul a b -> (result)'},
    div:                { officialName: 'DIV',      kind: OpcodeKind.Op2, opcode:  23, code: 0x17, store: true,  branch: false, description: 'div a b -> (result)'},
    mod:                { officialName: 'MOD',      kind: OpcodeKind.Op2, opcode:  24, code: 0x18, store: true,  branch: false, description: 'mod a b -> (result)'},
    jz:                 { officialName: 'ZERO?',    kind: OpcodeKind.Op1, opcode: 128, code: 0x00, store: false, branch: true,  description: 'jz a ?(label)' },
    get_sibling:        { officialName: 'NEXT?',    kind: OpcodeKind.Op1, opcode: 129, code: 0x01, store: true,  branch: true,  description: 'get_sibling object -> (result) ?(label)'},
    get_child:          { officialName: 'FIRST?',   kind: OpcodeKind.Op1, opcode: 130, code: 0x02, store: true,  branch: true,  description: 'get_child object -> (result) ?(label)' },
    get_parent:         { officialName: 'LOC',      kind: OpcodeKind.Op1, opcode: 131, code: 0x03, store: true,  branch: false, description: 'get_parent object -> (result)' },
    get_prop_len:       { officialName: 'PTSIZE',   kind: OpcodeKind.Op1, opcode: 132, code: 0x04, store: true,  branch: false, description: 'get_prop_len property-address -> (result)' },
    inc:                { officialName: 'INC',      kind: OpcodeKind.Op1, opcode: 133, code: 0x05, store: false, branch: false, variable: true, description: 'inc (variable)' },
    dec:                { officialName: 'DEC',      kind: OpcodeKind.Op1, opcode: 134, code: 0x06, store: false, branch: false, variable: true, description: 'dec (variable)' },
    print_addr:         { officialName: 'PRINTB',   kind: OpcodeKind.Op1, opcode: 135, code: 0x07, store: false, branch: false, description: 'print_addr byte-address-of-string' },
    remove_obj:         { officialName: 'REMOVE',   kind: OpcodeKind.Op1, opcode: 137, code: 0x09, store: false, branch: false, description: 'remove_obj object' },
    print_obj:          { officialName: 'PRINTD',   kind: OpcodeKind.Op1, opcode: 138, code: 0x0A, store: false, branch: false, description: 'print_obj object' },
    ret:                { officialName: 'RETURN',   kind: OpcodeKind.Op1, opcode: 139, code: 0x0B, store: false, branch: false, description: 'ret value' },
    jump:               { officialName: 'JUMP',     kind: OpcodeKind.Op1, opcode: 140, code: 0x0C, store: false, branch: false, description: 'jump ?(label)' },
    print_paddr:        { officialName: 'PRINT',    kind: OpcodeKind.Op1, opcode: 141, code: 0x0D, store: false, branch: false, description: 'print_paddr packed-address-of-string' },
    load:               { officialName: 'VALUE',    kind: OpcodeKind.Op1, opcode: 142, code: 0x0E, store: true,  branch: false, variable: true, description: 'load (variable) -> (result)'},
    rtrue:              { officialName: 'RTRUE',    kind: OpcodeKind.Op0, opcode: 176, code: 0x00, store: false, branch: false, description: 'rtrue' },
    rfalse:             { officialName: 'RFALSE',   kind: OpcodeKind.Op0, opcode: 177, code: 0x01, store: false, branch: false, description: 'rfalse' },
    print:              { officialName: 'PRINTI',   kind: OpcodeKind.Op0, opcode: 178, code: 0x02, store: false, branch: false, description: 'print (literal-string)' },
    print_ret:          { officialName: 'PRINTR',   kind: OpcodeKind.Op0, opcode: 179, code: 0x03, store: false, branch: false, description: 'print_ret (literal-string)' },
    nop:                { officialName: 'NOOP',     kind: OpcodeKind.Op0, opcode: 180, code: 0x04, store: false, branch: false, description: 'nop (unused)' },
    restart:            { officialName: 'RESTART',  kind: OpcodeKind.Op0, opcode: 183, code: 0x07, store: false, branch: false, description: 'restart' },
    ret_popped:         { officialName: 'RSTACK',   kind: OpcodeKind.Op0, opcode: 184, code: 0x08, store: false, branch: false, description: 'ret_popped' },
    quit:               { officialName: 'QUIT',     kind: OpcodeKind.Op0, opcode: 186, code: 0x0A, store: false, branch: false, description: 'quit' },
    new_line:           { officialName: 'CRLF',     kind: OpcodeKind.Op0, opcode: 187, code: 0x0B, store: false, branch: false, description: 'new_line'},
    storew:             { officialName: 'PUT',      kind: OpcodeKind.Var, opcode: 225, code: 0x01, store: false, branch: false, description: 'storew array word-index value' },
    storeb:             { officialName: 'PUTB',     kind: OpcodeKind.Var, opcode: 226, code: 0x02, store: false, branch: false, description: 'storeb array byte-index value' },
    put_prop:           { officialName: 'PUTP',     kind: OpcodeKind.Var, opcode: 227, code: 0x03, store: false, branch: false, description: 'put_prop object property value' },
    print_char:         { officialName: 'PRINTC',   kind: OpcodeKind.Var, opcode: 229, code: 0x05, store: false, branch: false, description: 'print_char output-character-code' },
    print_num:          { officialName: 'PRINTN',   kind: OpcodeKind.Var, opcode: 230, code: 0x06, store: false, branch: false, description: 'print_num value'},
    random:             { officialName: 'RANDOM',   kind: OpcodeKind.Var, opcode: 231, code: 0x07, store: true,  branch: false, description: 'random range -> (result)' },
    push:               { officialName: 'PUSH',     kind: OpcodeKind.Var, opcode: 232, code: 0x08, store: false, branch: false, description: 'push value' },
};

/**
 * Z-Machine opcodes supported from v3-v5.
 *
 * Opcode descriptions were adapted from the 'The Z-Machine Standards Document':
 * http://inform-fiction.org/zmachine/standards/z1point1/sect15.html
 */
// tslint:disable-next-line:variable-name
const opcodes_v3tov5 = {
    pull:               { officialName: 'POP',      kind: OpcodeKind.Var, opcode: 233, code: 0x09, store: false, branch: false, description: 'pull (variable)'},
};

/**
 * Z-Machine opcodes supported from v3-v4.
 *
 * Opcode descriptions were adapted from the 'The Z-Machine Standards Document':
 * http://inform-fiction.org/zmachine/standards/z1point1/sect15.html
 */
// tslint:disable-next-line:variable-name
const opcodes_v3and4 = {
    not:                { officialName: 'BCOM',     kind: OpcodeKind.Op1, opcode: 143, code: 0x0F, store: true,  branch: false, description: 'not value -> (result)' },
    pop:                { officialName: 'FSTACK',   kind: OpcodeKind.Op0, opcode: 185, code: 0x09, store: false, branch: false, description: 'pop'},
    call_vs:            { officialName: 'CALL',     kind: OpcodeKind.Var, opcode: 224, code: 0x00, store: true,  branch: false, description: 'call_vs routine ...0 to 3 args... -> (result)' },
};

/**
 * Z-Machine opcodes that are specific to v3.
 *
 * Opcode descriptions were adapted from the 'The Z-Machine Standards Document':
 * http://inform-fiction.org/zmachine/standards/z1point1/sect15.html
 */
// tslint:disable-next-line:variable-name
const opcodes_v3only = {
    save:               { officialName: 'SAVE',     kind: OpcodeKind.Op0, opcode: 181, code: 0x05, store: false, branch: true,  description: 'save ?(label)' },
    restore:            { officialName: 'RESTORE',  kind: OpcodeKind.Op0, opcode: 182, code: 0x06, store: false, branch: true,  description: 'restore ?(label)' },
    call:               opcodes_v3and4.call_vs,
    sread:              { officialName: 'READ',     kind: OpcodeKind.Var, opcode: 228, code: 0x04, store: false, branch: false, description: 'sread text parse' },
};
// tslint:enable:max-line-length

/**
 * All Z-Machine opcodes supported by the currently targetted version (v3).
 *
 * Opcode descriptions were adapted from the 'The Z-Machine Standards Document':
 * http://inform-fiction.org/zmachine/standards/z1point1/sect15.html
 */
export const opcodes = Object.assign(Object.assign({}, opcodes_common, opcodes_v3tov5, opcodes_v3and4), opcodes_v3only);

export class Encoder extends Binary.Encoder {
    public fixupU16Relative(label: symbol, mask: number, flags: number, start?: number) {
        this.fixupU16(label, start,
            (fixup: Binary.Fixup, targetAddress: number) => {
                let offset = targetAddress - fixup.start;
                offset &= mask;
                offset |= flags;
                return offset;
            });
    }

    public op0(opcode: Opcode, result?: Result, label?: symbol, branchWhen?: boolean) {
        QA.vetEqual(opcode.kind, OpcodeKind.Op0);

        this.u8(opcode.kind | opcode.code);
        return this.resultAndBranch(opcode, result, label, branchWhen);
    }

    public op1(opcode: Opcode, operand: Variable | Operand | number, result?: Result, label?: symbol | number, branchWhen?: boolean) {
        QA.vetEqual(opcode.kind, OpcodeKind.Op1);

        const asOperand = this.coerceNumberToOperand(operand);
        const type = asOperand.type;
        this.u8(opcode.kind | (type << 4) | opcode.code);

        switch (type) {
            case Type.byte:
            case Type.variable:
                this.u8(asOperand.value);
                break;
            default:
                QA.vetEqual(type, Type.word);
                this.x16(asOperand.value);
                break;
        }

        return this.resultAndBranch(opcode, result, label, branchWhen);
    }

    public var(opcode: Opcode, operands: Array<Variable | Operand | number| symbol>, result?: Result, label?: symbol, branchWhen?: boolean) {
        QA.vetEqual(opcode.kind, OpcodeKind.Var);
        return this.varOr2Op(opcode, this.coerceNumbersToOperands(operands), result, label, branchWhen);
    }

    public op2(opcode: Opcode, operands: Array<Variable | Operand | symbol | number>, result?: Result, label?: symbol, branchWhen?: boolean) {
        QA.vetEqual(opcode.kind, OpcodeKind.Op2);
        QA.vetGreaterThanEqual(operands.length, 2);

        const operandsOrSymbols = this.coerceNumbersToOperands(operands);
        const type0 = this.getOperandType(operandsOrSymbols[0]);
        const type1 = this.getOperandType(operandsOrSymbols[1]);

        if (operands.length !== 2 || type0 === Type.word || type1 === Type.word) {
            return this.varOr2Op(opcode, operandsOrSymbols, result, label, branchWhen);
        } else {
            const toAbbreviatedType = (type: Type) => {
                switch (type) {
                    case Type.byte:
                        return 0;
                    default:
                        QA.vetEqual(type, Type.variable);
                        return 1;
                }
            };

            this.u8(opcode.kind | (toAbbreviatedType(type0) << 6) | (toAbbreviatedType(type1) << 5) | opcode.code);
            this.u8((operandsOrSymbols[0] as Operand).value);
            this.u8((operandsOrSymbols[1] as Operand).value);
            return this.resultAndBranch(opcode, result, label, branchWhen);
        }
    }

    private coerceNumberToOperand(operand: Variable | Operand | number) {
        return typeof operand === 'number'
            ? Operand.constant(operand)
            : operand;
    }

    private getOperandType(operand: Variable | Operand | symbol) {
        return typeof operand === 'symbol'
            ? Type.word
            : (operand as Operand).type;
    }

    private varOr2Op(
        opcode: Opcode,
        operands: Array<Variable | Operand | symbol>,
        result: Result | undefined, label: symbol | undefined,
        branchWhen: boolean | undefined
    ) {
        QA.vetLessThanEqual(operands.length, 4);
        QA.vetEqual(opcode.store, result !== undefined);

        const kindBit = opcode.kind === OpcodeKind.Var
            ? 1
            : 0;

        this.u8(OpcodeKind.Var | (kindBit << 5) | opcode.code);

        let opTypes = 0xFF;
        for (let i = operands.length - 1; i >= 0; i--) {
            const type = this.getOperandType(operands[i]);
            opTypes >>>= 2;
            opTypes |= (type << 6);
        }
        this.u8(opTypes);

        operands.forEach((operand) => {
            if (typeof operand === 'symbol') {
                this.fixupU16Absolute(operand);
            } else {
                switch ((operand as Operand).type) {
                    case Type.variable:
                    case Type.byte:
                        this.u8((operand as Operand).value);
                        break;
                    default:
                        QA.vetEqual((operand as Operand).type, Type.word);
                        this.x16((operand as Operand).value);
                        break;
                }
            }
        });

        return this.resultAndBranch(opcode, result, label, branchWhen);
    }

    private coerceNumbersToOperands(operands: Array<Variable | Operand | symbol | number>) {
        return operands.map(
            (operand) => typeof operand === 'number'
                ? Operand.constant(operand)
                : operand);
    }

    private resultAndBranch(opcode: Opcode, result: Result | undefined, target: symbol | number | undefined, branchWhen: boolean | undefined) {
        let returned = Operand.void();

        QA.vetEqual(opcode.store,  result !== undefined);
        if (opcode.store) {
            if (result === undefined) {
                throw QA.fail(`'result' must be defined for opcode '${opcode.kind}:${opcode.code}'.`);
            }
            this.u8(result.value);
            returned = new Operand(Type.variable, result.value);
        }

        QA.vetEqual(opcode.branch, branchWhen !== undefined);
        QA.vetEqual(target === undefined, branchWhen === undefined);
        if (!opcode.branch) {
            return returned;
        }

        const branchWhenFlag = branchWhen === true
            ? 0x8000
            : 0x0000;

        if (typeof target === 'number') {
            this.u16((target & ~0x3FFF) | branchWhenFlag);
            return returned;
        }

        this.fixupU16Relative(target as symbol, 0x3FFF, branchWhenFlag);
        return returned;
    }

    private fixupU16Absolute(label: symbol, start?: number) {
        this.fixupU16(label, start);
    }
}
