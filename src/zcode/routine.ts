import * as Binary from '../util/binary';
import { IAppendable } from '../util/binary';
import * as QA from '../util/qa';
import * as Op from './op';
import { opcodes, Operand, Result, Variable } from './op';
import * as Section from './section';
import * as Zstring from './zstring';

export const names = {
    main  : Symbol('main'),
};

export abstract class VariablesTable {
    public readonly symbolToOperand = new Map<symbol, Operand>();

    constructor(public readonly headerBytes: Binary.Encoder) { }

    public abstract get routineName(): symbol;

    public alloc(name: symbol, initialValue?: number) {
        const index = this.minIndex + this.count;
        QA.vetLessThanEqual(index, this.maxIndex);

        this.headerBytes.i16(
            initialValue === undefined
                ? 0
                : initialValue);

        const operand = Operand.variable(index);
        this.symbolToOperand.set(name, operand);

        this.updateCount();

        return operand;
    }

    protected get count() { return this.symbolToOperand.size; }
    protected get minIndex() { return 16; }
    protected get maxIndex() { return 238; }

    // 'updateCount' is overridden by SubroutineHeader to update the local variable count.
    // tslint:disable-next-line:no-empty
    protected updateCount() { }
}

export class GlobalsTable extends VariablesTable {
    constructor(globalsArray: Binary.Encoder) {
        QA.vetEqual(globalsArray.name, Section.name.globals);
        super(globalsArray);
    }

    public get routineName() { return names.main; }
    protected get minIndex() { return 16; }
    protected get maxIndex() { return 255; }
}

export class SubroutineHeader extends VariablesTable {
    public readonly symbolToOperand = new Map<symbol, Operand>();
    private readonly _routineName: symbol;

    constructor(routineName: symbol) {
        super(new Binary.Encoder(routineName));
        this.headerBytes.u8(0);
        this._routineName = Symbol(`${this.headerBytes.name.toString()} z-code`);
    }

    public get routineName() {
        return this._routineName;
    }

    protected get minIndex() { return 1; }
    protected get maxIndex() { return 15; }

    protected updateCount() {
        this.headerBytes.setU8(0, this.count);
    }
}

/**
 * Builds a subroutine from Z-Machine opcodes.
 *
 * JSDoc comments were adapted from the 'The Z-Machine Standards Document':
 * http://inform-fiction.org/zmachine/standards/z1point1/sect15.html
 */
export class Routine implements IAppendable {
    private readonly ops: Op.Encoder;

    constructor(readonly variables: VariablesTable) {
        this.ops = new Op.Encoder(variables.routineName);
    }

    public get localLabelToOffset() { return this.ops.localLabelToOffset; }
    public get labelToFixups() { return this.ops.labelToFixups; }
    public toUint8Array() { return this.ops.toUint8Array(); }
    public get isEmpty() { return this.ops.isEmpty; }

    /** Allocate a variable (global for main rountine, otherwise local). */
    public allocVar(name: symbol, initialValue?: number) {
        return this.variables.alloc(name, initialValue);
    }

    public label(name: symbol) {
        this.ops.label(name);
    }

    public get name() { return this.ops.name; }

    /** Signed 16-bit addition. */
    public add(left: Operand, right: Operand, result: Result) {
        // 2OP:20 14 add a b -> (result)
        return this.ops.op2(opcodes.add, [left, right], result);
    }

    /** Bitwise AND. */
    public and(left: Operand, right: Operand, result: Result) {
        // 2OP:9 9 and a b -> (result)
        return this.ops.op2(opcodes.and, [left, right], result);
    }

    /**
     * The only call instruction in Version 3: it calls the routine with 0, 1, 2 or 3 arguments as
     * supplied and stores the resulting return value.
     *
     * (When the address 0 is called as a routine, nothing happens and the return value is false.)
     */
    public call(routine: Routine, operands: Array<symbol | Operand>, result: Result) {
        // VAR:224 0 4 call_vs routine ...up to 3 args... -> (result)
        operands.unshift(Operand.word(0x7FFF));
        QA.vetLessThanEqual(operands.length, 4);

        const opStart = this.ops.byteLength;
        const returned = this.ops.var(opcodes.call_vs, operands, result);
        this.ops.fixupU16(routine.variables.headerBytes.name, opStart + 2, (fixup: Binary.Fixup, absolute: number) => {
            QA.unused(fixup);
            QA.vetEqual(absolute % 2, 0);
            return absolute / 2;
        });
        return returned;
    }

    /** Make object not have the attribute numbered attribute     */
    public clear_attr(obj: Operand, attribute: Operand) {
        // 2OP:12 C clear_attr object attribute
        this.ops.op2(opcodes.clear_attr, [obj, attribute]);
    }

    /** Decrement variable by 1. This is signed, so 0 decrements to -1. */
    public dec(variable: Variable) {
        // 1OP:134 6 dec (variable)
        this.ops.op1(opcodes.dec, variable);

        return variable.type === Op.Type.byte
            ? new Operand(Op.Type.variable, variable.value)
            : Operand.void();
    }

    /** Decrement variable, and branch if it is now less than the given value. */
    public dec_chk(variable: Variable, value: Operand | number, label: symbol, branchWhen: boolean) {
        // 2OP:4 4 dec_chk (variable) value ?(label)
        this.ops.op2(opcodes.dec_chk, [variable, value], /* result = */ undefined, label, branchWhen);
    }

    /** Signed 16-bit division. Division by zero should halt the interpreter with a suitable error message. */
    public div(left: Operand, right: Operand, result: Result) {
        // 2OP:23 17 div a b -> (result)
        return this.ops.op2(opcodes.div, [left, right], result);
    }

    /**
     * Duplicate the value on the top of the stack (via 'load STACK >STACK').
     *
     * (Useful for peeking at the top of the stack without consuming the top value.)
     */
    public dup() {
        return this.load(Variable.from(Operand.stack()), Result.stack());
    }

    /** Get first object contained in given object, branching if this exists, i.e. is not nothing (i.e., is not 0). */
    public get_child(objectIndex: Operand | number, result: Result, label?: symbol, branchWhen?: boolean) {
        // 1OP:130 2 get_child object -> (result) ?(label)
        let target: symbol | number | undefined = label;
        if (label === undefined) {
            target = 0;
            branchWhen = false;
        }

        return this.ops.op1(opcodes.get_child, objectIndex, result, target, branchWhen);
    }

    /**
     * Gives the number of the next property provided by the quoted object. This may be zero, indicating the end of the
     * property list.
     *
     * If called with zero, it gives the first property number present. It is illegal to try to find the next property of
     * a property which does not exist, and an interpreter should halt with an error message (if it can efficiently check
     * this condition).
     */
    public get_next_prop(obj: Operand, property: Operand, result: Result) {
        // 2OP:19 13 get_next_prop object property -> (result)
        return this.ops.op2(opcodes.get_next_prop, [obj, property], result);
    }

    /** Get parent object (note that this has no "branch if exists" clause). */
    public get_parent(objectIndex: Operand | number, result: Result) {
        // 1OP:130 2 get_child object -> (result) ?(label)
        return this.ops.op1(opcodes.get_parent, objectIndex, result);
    }

    /**
     * Read property from object (resulting in the default value if it had no such declared property). If the property has
     * length 1, the value is only that byte. If it has length 2, the first two bytes of the property are taken as a word
     * value. It is illegal for the opcode to be used if the property has length greater than 2, and the result is unspecified.
     */
    public get_prop(obj: Operand, property: Operand, result: Result) {
        // 2OP:17 11 get_prop object property -> (result)
        return this.ops.op2(opcodes.get_prop, [obj, property], result);
    }

    /**
     * Get the byte address (in dynamic memory) of the property data for the given object's property. This must return 0 if the
     * object hasn't got the property.
     */
    public get_prop_addr(obj: Operand, property: Operand, result: Result) {
        // 2OP:18 12 get_prop_addr object property -> (result)
        return this.ops.op2(opcodes.get_prop_addr, [obj, property], result);
    }

    /**
     * Get length of property data (in bytes) for the given object's property. It is illegal to try to find the property length
     * of a property which does not exist for the given object, and an interpreter should halt with an error message (if it can
     * efficiently check this condition).
     *
     * get_prop_len 0 must return 0. This is required by some Infocom games.
     */
    public get_prop_len(propertyAddress: Operand, result: Result) {
        // 1OP:132 4 get_prop_len property-address -> (result)
        return this.ops.op1(opcodes.get_prop_len, propertyAddress, result);
    }

    /** Get next object in tree, branching if this exists, i.e. is not 0. */
    public get_sibling(objectIndex: Operand | number, result: Result, label?: symbol, branchWhen?: boolean) {
        let target: symbol | number | undefined = label;
        if (label === undefined) {
            target = 0;
            branchWhen = false;
        }

        // 1OP:129 1 get_sibling object -> (result) ?(label)
        return this.ops.op1(opcodes.get_sibling, objectIndex, result, target, branchWhen);
    }

    /** Increment variable by 1. (This is signed, so -1 increments to 0.) */
    public inc(variable: Variable) {
        // 1OP:133 5 inc (variable)
        this.ops.op1(opcodes.inc, variable);
        return variable.type === Op.Type.byte
            ? new Operand(Op.Type.variable, variable.value)
            : Operand.void();
    }

    /** Increment variable, and branch if now greater than value. */
    public inc_chk(variable: Variable, value: Operand | number, label: symbol, branchWhen: boolean) {
        // 2OP:5 5 inc_chk (variable) value ?(label)
        this.ops.op2(opcodes.inc_chk, [variable, value], /* result = */ undefined, label, branchWhen);
    }

    /**
     * Moves object O to become the first child of the destination object D. (Thus, after the
     * operation the child of D is O, and the sibling of O is whatever was previously the child of
     * D.) All children of O move with it. (Initially O can be at any point in the object tree; it
     * may legally have parent zero.)
     */
    public insert_obj(obj: Operand, destination: Operand) {
        // 2OP:14 E insert_obj object destination
        this.ops.op2(opcodes.insert_obj, [obj, destination]);
    }

    public illegal() {
        this.ops.op2({ kind: Op.OpcodeKind.Op2, code: 0x1F, store: false, branch: false }, [ 0xFA, 0x17 ]);
    }

    /**
     * Jump if a is equal to any of the subsequent operands. (Thus @je a never jumps and @je a b jumps if a = b.)
     *
     * je with just 1 operand is not permitted.
     */
    public je(branchWhen: boolean, left: Operand | number, right: Operand | number, label: symbol) {
        // 2OP:1 1 je a b c d ?(label)
        this.ops.op2(opcodes.je, [left, right], /* result = */ undefined, label, branchWhen);
    }

    /** Jump if a > b (using a signed 16-bit comparison). */
    public jg(branchWhen: boolean, left: Operand | number, right: Operand | number, label: symbol) {
        // 2OP:3 3 jg a b ?(label)
        this.ops.op2(opcodes.jg, [left, right], /* result = */ undefined, label, branchWhen);
    }

    /** Jump if object a is a direct child of b, i.e., if parent of a is b.  */
    public jin(branchWhen: boolean, child: Operand | number, maybeParent: Operand | number, label: symbol) {
        // 2OP:6 6 jin obj1 obj2 ?(label)
        this.ops.op2(opcodes.jin, [child, maybeParent], /* result = */ undefined, label, branchWhen);
    }

    /** Jump if a < b (using a signed 16-bit comparison). */
    public jl(branchWhen: boolean, left: Operand | number, right: Operand | number, label: symbol) {
        // 2OP:2 2 jl a b ?(label)
        this.ops.op2(opcodes.jl, [left, right], /* result = */ undefined, label, branchWhen);
    }

    /**
     * Jump (unconditionally) to the given label. (This is not a branch instruction and the operand is a 2-byte signed
     * offset to apply to the program counter.)
     *
     * It is legal for this to jump into a different routine (which should not change the routine call state), although
     * it is considered bad practice to do so and the Txd disassembler is confused by it.
     *
     * The destination of the jump opcode is:
     * Address after instruction + Offset - 2
     *
     * This is analogous to the calculation for branch offsets.
     */
    public jump(label: symbol) {
        // 1OP:140 C jump ?(label)
        this.ops.op1(opcodes.jump, Operand.word(0xF1F1));
        const fixupStart = this.ops.byteLength - 2;
        this.ops.fixupU16Relative(label, 0xFFFF, 0x0000, fixupStart);
    }

    /** Jump if a = 0. */
    public jz(branchWhen: boolean, a: Operand, label: symbol) {
        // 1OP:128 0 jz a ?(label)
        this.ops.op1(opcodes.jz, a, /* result = */ undefined, label, branchWhen);
    }

    /** The value of the variable referred to by the operand is stored in the result. */
    public load(variable: Variable, result: Result) {
        // 1OP:142 E load (variable) -> (result)
        return this.ops.op1(opcodes.load, variable, result);
    }

    /** Stores array->byte-index (i.e., the byte at address array+byte-index, which must lie in static or dynamic memory) */
    public loadb(baddr: Operand | symbol, byteIndex: Operand | number, result: Result) {
        // 2OP:16 10 loadb array byte-index -> (result)
        byteIndex = typeof byteIndex === 'number'
            ? Operand.constant(byteIndex)
            : byteIndex;

        return this.ops.op2(opcodes.loadb, [baddr, byteIndex], result);
    }

    /** Stores array-->word-index (i.e., the word at address array+2*word-index, which must lie in static or dynamic memory). */
    public loadw(baddr: Operand | symbol, wordIndex: Operand | number, result: Result) {
        // 2OP:15 F loadw array word-index -> (result)
        wordIndex = typeof wordIndex === 'number'
            ? Operand.constant(wordIndex)
            : wordIndex;

        return this.ops.op2(opcodes.loadw, [baddr, wordIndex], result);
    }

    /** Remainder after signed 16-bit division. Division by zero should halt the interpreter with a suitable error message.  */
    public mod(left: Operand, right: Operand, result: Result) {
        // 2OP:24 18 mod a b -> (result)
        return this.ops.op2(opcodes.mod, [left, right], result);
    }

    /** Signed 16-bit multiplication. */
    public mul(left: Operand | number, right: Operand | number, result: Result) {
        // 2OP:22 16 mul a b -> (result)
        return this.ops.op2(opcodes.mul, [left, right], result);
    }

    /** Print carriage return. */
    public new_line() {
        // 0OP:187 B new_line
        this.ops.op0(opcodes.new_line);
    }

    /**
     * Probably the official "no operation" instruction, which, appropriately, was never operated (in any of the Infocom
     * datafiles): it may once have been a breakpoint.
     */
    public nop() {
        // 0OP:180 4 1/- nop
        this.ops.op0(opcodes.nop);
    }

    /**
     * Bitwise NOT (i.e., all 16 bits reversed). Note that in Versions 3 and 4 this is a 1OP instruction, reasonably since
     * it has 1 operand, but in later Versions it was moved into the extended set to make room for call_1n.
     */
    public not(value: Operand, result: Result) {
        // 1OP:143 F 1/4 not value -> (result)
        return this.ops.op1(opcodes.not, value, result);
    }

    /** Bitwise OR. */
    public or(left: Operand, right: Operand, result: Result) {
        // 2OP:8 8 or a b -> (result)
        return this.ops.op2(opcodes.or, [left, right], result);
    }

    /** Throws away the top item on the stack. (This was useful to lose unwanted routine call results in early Versions. */
    public pop() {
        // 0OP:185 9 1 pop
        this.ops.op0(opcodes.pop);
    }

    // Print the quoted (literal) Z-encoded string.
    public print(text: string) {
        // 0OP:178 2 print (literal-string)
        this.ops.op0(opcodes.print);
        Zstring.encode(this.ops, text);
    }

    /** Print (Z-encoded) string at given byte address, in dynamic or static memory. */
    public print_addr(byteAddressOfString: Operand) {
        // 1OP:135 7 print_addr byte-address-of-string
        this.ops.op1(opcodes.print_addr, byteAddressOfString);
    }

    /**
     * Print a ZSCII character. The operand must be a character code defined in ZSCII for output.
     * In particular, it must certainly not be negative or larger than 1023.
     */
    public print_char(charCode: Operand) {
        // VAR:229 5 print_char output-character-code
        this.ops.var(opcodes.print_char, [charCode]);
    }

    /** Print (signed) number in decimal. */
    public print_num(value: Operand | number) {
        // VAR:230 6 print_num value
        this.ops.var(opcodes.print_num, [value]);
    }

    /**
     * Print short name of object (the Z-encoded string in the object header, not a property).
     * If the object number is invalid, the interpreter should halt with a suitable error message.
     */
    public print_object(objectIndex: Operand | number) {
        // 1OP:138 A print_obj object
        this.ops.op1(opcodes.print_obj, objectIndex);
    }

    /** Print the (Z-encoded) string at the given packed address in high memory. */
    public print_paddr(packedAddressOfString: Operand) {
        // 1OP:141 D print_paddr packed-address-of-string
        this.ops.op1(opcodes.print_paddr, packedAddressOfString);
    }

    /** Print the quoted (literal) Z-encoded string, then print a new-line and then return true (i.e., 1). */
    public print_ret(text: string) {
        // 0OP:179 3 print_ret <literal-string>
        this.ops.op0(opcodes.print_ret);
        Zstring.encode(this.ops, text);
    }

    /**
     * Pulls value off a stack. (If the stack underflows, the interpreter should halt with a suitable error
     * message.)
     *
     * In Version 6, the stack in question may be specified as a user one: otherwise it is the game stack.
     */
    public pull(variable: Variable) {
        // VAR:233 9 1 pull (variable)
        this.ops.var(opcodes.pull, [variable]);
    }

    /** Pushes value onto the game stack. */
    public push(value: Operand | number | symbol) {
        // VAR:232 8 push value
        this.ops.var(opcodes.push, [value]);
    }

    /**
     * Writes the given value to the given property of the given object. If the property does not exist for
     * that object, the interpreter should halt with a suitable error message. If the property length is 1, then
     * the interpreter should store only the least significant byte of the value. (For instance, storing -1 into
     * a 1-byte property results in the property value 255.) As with get_prop the property length must not be more
     * than 2: if it is, the behaviour of the opcode is undefined.
     */
    public put_prop(obj: Operand, property: Operand, value: Operand) {
        // VAR:227 3 put_prop object property value
        this.ops.var(opcodes.put_prop, [obj, property, value]);
    }

    /**
     * Exit the game immediately. (Any "Are you sure?" question must be asked by the game, not the interpreter.)
     *
     * It is not legal to return from the main routine (that is, from where execution first begins) and this must
     * be used instead
     */
    public quit() {
        // 0OP:186 A quit
        this.ops.op0(opcodes.quit);
    }

    /**
     * If range is positive, returns a uniformly random number between 1 and range. If range is negative,
     * the random number generator is seeded to that value and the return value is 0.
     *
     * Most interpreters consider giving 0 as range illegal (because they attempt a division with remainder
     * by the range), but correct behavior is to reseed the generator in as random a way as the interpreter
     * can (e.g. by using the time in milliseconds).
     *
     * (Some version 3 games, such as 'Enchanter' release 29, had a debugging verb #random such that typing,
     * say, #random 14 caused a call of random with -14.)
     */
    public random(range: Operand | number, result: Result) {
        // VAR:231 7 random range -> (result)
        return this.ops.var(opcodes.random, [range], result);
    }

    /** Detach the object from its parent, so that it no longer has any parent. (Its children remain in its possession.)  */
    public remove_obj(obj: Operand) {
        // 1OP:137 9 remove_obj object
        this.ops.op1(opcodes.remove_obj, obj);
    }

    /**
     * Restart the game. (Any "Are you sure?" question must be asked by the game, not the interpreter.)
     *
     * The only pieces of information surviving from the previous state are the "transcribing to printer"
     * bit (bit 0 of 'Flags 2' in the header, at address $10) and the "use fixed pitch font" bit (bit 1 of
     * 'Flags 2').
     *
     * In particular, changing the program start address before a restart will not have the effect of restarting
     * from this new address.
     */
    public restart() {
        // 0OP:183 7 1 restart
        this.ops.op0(opcodes.restart);
    }

    /**
     * See save. In Version 3, the branch is never actually made, since either the game has successfully picked up
     * again from where it was saved, or it failed to load the save game file.
     *
     * As with restart, the transcription and fixed font bits survive. The interpreter gives the game a way of knowing
     * that a restore has just happened (see save).
     *
     * ***[1.0] From Version 5 it can have optional parameters as save does, and returns the number of bytes loaded if
     *          so. (Whether Infocom intended these options as part of Version 5 is doubtful, but it's too useful a feature
     *          to exclude from this Standard.)
     *
     * If the restore fails, 0 is returned, but once again this necessarily happens since otherwise control is already
     * elsewhere.
     */
    public restore(branchWhen: boolean, label: symbol) {
        // 0OP:182 6 1 restore ?(label)
        this.ops.op0(opcodes.restore, /* result = */ undefined, label, branchWhen);
    }

    /** Returns from the current routine with the value given. */
    public ret(value: Operand) {
        // 1OP:139 B ret value
        this.ops.op1(opcodes.ret, value);
    }

    /** Pops top of stack and returns that. (This is equivalent to ret sp, but is one byte cheaper.) */
    public ret_popped() {
        // 0OP:184 8 ret_popped
        this.ops.op0(opcodes.ret_popped);
    }
    /** Return false (i.e., 0) from the current routine. */
    public rfalse() {
        // 0OP:177 1 rfalse
        this.ops.op0(opcodes.rfalse);
    }

    /** Return true (i.e., 1) from the current routine. */
    public rtrue() {
        // 0OP:176 0 rtrue
        this.ops.op0(opcodes.rtrue);
    }

    /**
     * On Versions 3 and 4, attempts to save the game (all questions about filenames are asked by interpreters) and branches if successful.
     *
     * From Version 5 it is a store rather than a branch instruction; the store value is 0 for failure, 1 for "save succeeded" and 2 for "the
     * game is being restored and is resuming execution again from here, the point where it was saved".
     *
     * It is illegal to use this opcode within an interrupt routine (one called asynchronously by a sound effect, or keyboard timing, or newline
     * counting).
     *
     * ***[1.0] The extension also has (optional) parameters, which save a region of the save area, whose address and length are in bytes, and
     *          provides a suggested filename: name is a pointer to an array of ASCII characters giving this name (as usual preceded by a byte
     *          giving the number of characters).
     *
     *          See S 7.6. (Whether Infocom intended these options as part of Version 5 is doubtful, but it's too useful a feature to exclude
     *          from this Standard.)
     *
     * ***[1.1] As of Standard 1.1 an additional optional parameter, prompt, is allowed on Version 5 extended save/restore. This allows a game
     *          author to tell the interpreter whether it should ask for confirmation of the provided file name (prompt is 1), or just silently
     *          save/restore using the provided filename (prompt is 0). If the parameter is not provided, whether to prompt or not is a matter
     *          for the interpreter - this might be globally user-configurable. Infocom's interpreters do prompt for filenames, many modern ones
     *          do not.
     */
    public save(branchWhen: boolean, label: symbol) {
        // 0OP:181 5 1 save ?(label)
        this.ops.op0(opcodes.save, /* result = */ undefined, label, branchWhen);
    }

    /** Make object have the attribute numbered attribute. */
    public set_attr(obj: Operand, attribute: Operand) {
        // 2OP:11 B set_attr object attribute
        this.ops.op2(opcodes.set_attr, [obj, attribute]);
    }

    /**
     * This opcode reads a whole command from the keyboard (no prompt is automatically displayed).
     * It is legal for this to be called with the cursor at any position on any window.
     *
     * In Versions 1 to 3, the status line is automatically redisplayed first.
     *
     * A sequence of characters is read in from the current input stream until a carriage return
     * (or, in Versions 5 and later, any terminating character) is found.
     *
     * In Versions 1 to 4, byte 0 of the text-buffer should initially contain the maximum number of
     * letters which can be typed, minus 1 (the interpreter should not accept more than this).
     *
     * The text typed is reduced to lower case (so that it can tidily be printed back by the program
     * if need be) and stored in bytes 1 onward, with a zero terminator (but without any other
     * terminator, such as a carriage return code). This means that if byte 0 contains n then the
     * buffer must contain n+1 bytes.
     *
     * In Versions 5 and later, byte 0 of the text-buffer should initially contain the maximum
     * number of letters which can be typed (the interpreter should not accept more than this). The
     * interpreter stores the number of characters actually typed in byte 1 (not counting the
     * terminating character), and the characters themselves (reduced to lower case) in bytes 2
     * onward (not storing the terminating character).
     *
     * Some interpreters wrongly add a zero byte after the text anyway, so it is wise for the buffer
     * to contain at least n+3 bytes.
     *
     * Moreover, if byte 1 contains a positive value at the start of the input, then read assumes
     * that number of characters are left over from an interrupted previous input, and writes the
     * new characters after those already there. Note that the interpreter does not redisplay the
     * characters left over: the game does this, if it wants to. This is unfortunate for any
     * interpreter wanting to give input text a distinctive appearance on-screen, but 'Beyond Zork',
     * 'Zork Zero' and 'Shogun' clearly require it. ("Just a tremendous pain in my butt" -- Andrew
     * Plotkin; "the most unfortunate feature of the Z-machine design" -- Stefan Jokisch.)
     *
     * In Version 4 and later, if the operands time and routine are supplied (and non-zero) then the
     * routine call routine() is made every time/10 seconds during the keyboard-reading process. If
     * this routine returns true, all input is erased (to zero) and the reading process is
     * terminated at once. (The terminating character code is 0.) The routine is permitted to print
     * to the screen even if it returns false to signal "carry on": the interpreter should notice
     * and redraw the input line so far, before input continues. (Frotz notices by looking to see if
     * the cursor position is at the left-hand margin after the interrupt routine has returned.)
     *
     * If input was terminated in the usual way, by the player typing a carriage return, then a
     * carriage return is printed (so the cursor moves to the next line). If it was interrupted, the
     * cursor is left at the rightmost end of the text typed in so far.
     *
     * Next, lexical analysis is performed on the text (except that in Versions 5 and later, if
     * parse-buffer is zero then this is omitted). Initially, byte 0 of the parse-buffer should hold
     * the maximum number of textual words which can be parsed. (If this is n, the buffer must be at
     * least 2 + 4*n bytes long to hold the results of the analysis.)
     *
     * The interpreter divides the text into words and looks them up in the dictionary, as described
     * in S 13. The number of words is written in byte 1 and one 4-byte block is written for each
     * word, from byte 2 onwards (except that it should stop before going beyond the maximum number
     * of words specified). Each block consists of the byte address of the word in the dictionary,
     * if it is in the dictionary, or 0 if it isn't; followed by a byte giving the number of letters
     * in the word; and finally a byte giving the position in the text-buffer of the first letter of
     * the word.
     *
     * In Version 5 and later, this is a store instruction: the return value is the terminating
     * character (note that the user pressing his "enter" key may cause either 10 or 13 to be
     * returned; the interpreter must return 13). A timed-out input returns 0.
     *
     * (Versions 1 and 2 and early Version 3 games mistakenly write the parse buffer length 240 into
     * byte 0 of the parse buffer: later games fix this bug and write 59, because 2+4*59 = 238 so
     * that 59 is the maximum number of textual words which can be parsed into a buffer of length
     * 240 bytes.)
     *
     * (Interpreters are asked to halt with a suitable error message if the text or parse buffers
     * have length of less than 3 or 6 bytes, respectively: this sometimes occurs due to a previous
     * array being overrun, causing bugs which are very difficult to find.)
     */
    public sread(textBuffer: Operand | symbol, parseBuffer: Operand | symbol) {
        // VAR:228 4 1 sread text parse
        this.ops.var(opcodes.sread, [textBuffer, parseBuffer]);
    }

    /** Set the variable referenced by the operand to value. */
    public store(variable: Variable, value: Operand | number | symbol) {
        this.ops.op2(opcodes.store, [variable, value]);
    }

    /** array->byte-index = value, i.e. stores the given value in the byte at address array+byte-index (which must lie in dynamic memory). (See loadb.) */
    public storeb(array: Operand, index: Operand, value: Operand) {
        // VAR:226 2 storeb array byte-index value
        this.ops.var(opcodes.storeb, [array, index, value]);
    }

    /** array-->word-index = value, i.e. stores the given value in the word at address array+2*word-index (which must lie in dynamic memory). (See loadw.) */
    public storew(array: Operand, wordIndex: Operand, value: Operand) {
        // VAR:225 1 storew array word-index value
        this.ops.var(opcodes.storeb, [array, wordIndex, value]);
    }

    /** Signed 16-bit subtraction. */
    public sub(left: Operand, right: Operand, result: Result) {
        // 2OP:21 15 sub a b -> (result)
        return this.ops.op2(opcodes.sub, [left, right], result);
    }

    /** Jump if all of the flags in bitmap are set (i.e. if bitmap & flags == flags). */
    public test(branchWhen: boolean, bitmap: Operand | number, flags: Operand | number, label: symbol) {
        // 2OP:7 7 test bitmap flags ?(label)
        this.ops.op2(opcodes.test, [bitmap, flags], /* result = */ undefined, label, branchWhen);
    }

    /** Jump if object has attribute. */
    public test_attr(branchWhen: boolean, obj: Operand | number, attribute: Operand | number, label: symbol) {
        // 2OP:10 A test_attr object attribute ?(label)
        this.ops.op2(opcodes.test_attr, [obj, attribute], /* result = */ undefined, label, branchWhen);
    }
}
