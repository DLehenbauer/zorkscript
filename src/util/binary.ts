import * as LoByte from 'lobyte';
import * as QA from './qa';

export class Fixup {
    constructor(
        private encoder: Encoder,
        readonly label: symbol,
        private startOffset: number,
        private byteLength: number,
        public fixupFn: ((...args: any[]) => void)
    ) {}

    public apply(bytes: number[]) {
        removeFixupFromEncoder(this.encoder, this);
        QA.vetEqual(bytes.length, this.byteLength);
        this.encoder.splice(this.startOffset, this.byteLength, bytes);
    }

    public get start() { return this.startOffset; }

    public adjust(newEncoder: Encoder, newBaseAddress: number) {
        this.encoder = newEncoder;
        this.startOffset += newBaseAddress;
    }
}

let removeFixupFromEncoder: (encoder: Encoder, fixup: Fixup) => void;

export interface IAppendable {
    name: symbol;
    localLabelToOffset: Map<symbol, number>;
    labelToFixups: Map<symbol, Set<Fixup>>;
    isEmpty: boolean;
    toUint8Array(): Uint8Array;
}

// Encoder
export class Encoder extends LoByte.ByteArray implements IAppendable {
    protected static _ctor = (() => {
        if (Encoder._ctor !== undefined) {
            throw new Error('Encoder._ctor() must only be initialized once.');
        }
        removeFixupFromEncoder = (encoder: Encoder, fixup: Fixup) => {
            const fixups = encoder.labelToFixups.get(fixup.label);
            QA.vetNotEqual(fixups, undefined);

            if (fixups !== undefined) {
                const removed = fixups.delete(fixup);
                QA.vetEqual(removed, true);
                if (fixups.size === 0) {
                    encoder.labelToFixups.delete(fixup.label);
                }
            }
        };
    })();

    public readonly localLabelToOffset = new Map<symbol, number>();
    public labelToFixups = new Map<symbol, Set<Fixup>>();
    private _baseAddress: number | undefined = undefined;

    constructor(public name: symbol) { super(LoByte.Endianness.Big); }

    public get isEmpty() { return this.byteLength === 0; }

    public get baseAddress() {
        QA.vetNotEqual(this._baseAddress, undefined);
        return this._baseAddress as number;
    }

    public label(name: symbol) {
        this.localLabelToOffset.set(name, this.byteLength);
    }

    public getU8(address: number)               { return this.getUint8(address); }
    public setU8(address: number, byte: number) { this.setUint8(address, byte); }

    public getU16(address: number)               { return this.getUint16(address); }
    public setU16(address: number, word: number) { this.setUint16(address, word); }
    public setX16(address: number, word: number) { this.setXint16(address, word); }

    public x8(byte: number)   { this.pushXint8(byte); }
    public u8(byte: number)   { this.pushUint8(byte); }
    public u16(word: number)  { this.pushUint16(word); }
    public i16(word: number)  { this.pushInt16(word); }
    public x16(word: number)  { this.pushXint16(word); }
    public u32(dword: number) { this.pushUint32(dword); }
    public i32(dword: number) { this.pushInt32(dword); }
    public x32(dword: number) { this.pushXint32(dword); }
    public bytes(bytes: ArrayLike<number>) {
        const start = this.byteLength;
        this.splice(start, 0, bytes);
        return start;
    }

    public zeros(byteCount: number) {
        const startAddress = this.byteLength;
        for (let i = byteCount; i > 0; i--) {
            this.u8(0);
        }
        return startAddress;
    }

    public zerosUntil(address: number) {
        while (this.byteLength < address) {
            this.u8(0);
        }
    }

    public alignTo(byteSize: number, padByte?: number) {
        if (padByte === undefined) {
            padByte = 0;
        }

        while (this.byteLength % byteSize !== 0) {
            this.x8(padByte);
        }
    }

    public append(suffix: IAppendable) {
        const address = this.byteLength;
        this.localLabelToOffset.set(suffix.name, address);
        this.splice(address, 0, suffix.toUint8Array());

        for (const entry of suffix.localLabelToOffset.entries()) {
            const label = entry[0];
            const offset = entry[1];

            QA.vetEqual(this.localLabelToOffset.has(label), false);
            this.localLabelToOffset.set(label, offset + address);
        }

        for (const entry of suffix.labelToFixups.entries()) {
            const label = entry[0];
            const fixups = entry[1];

            for (const fixup of fixups.keys()) {
                fixup.adjust(this, address);
                this.addFixup(label, fixup);
            }
        }

        return address;
    }

    public extract() {
        this._baseAddress = 0;

        this.applyFixups(this.localLabelToOffset);
        QA.vetEqual(this.labelToFixups.size, 0);

        return this.toUint8Array();
    }

    public fixupU16(label: symbol, start?: number, adjustment?: (fixup: Fixup, u16: number) => number) {
        const rawBytes = (fixup: Fixup, value: number) => {
            QA.unused(fixup);
            return LoByte.Uint16.toArray(value, this.endianness);
        };

        const adjustedBytes = adjustment !== undefined
            ? (fixup: Fixup, value: number) => rawBytes(fixup, adjustment(fixup, value))
            : rawBytes;

        return this.fixup(label, start, LoByte.Uint16.byteSize, adjustedBytes);
    }

    protected fixup(label: symbol, startOffset: number | undefined, fixupByteLength: number, adjust?: (fixup: Fixup, ...args: any[]) => number[]) {
        let bytesToDelete = 0;
        if (startOffset === undefined) {
            startOffset = this.byteLength;
        } else {
            bytesToDelete = fixupByteLength;
        }

        QA.vetLessThanEqual(startOffset, this.byteLength);
        this.splice(startOffset, bytesToDelete, Array(fixupByteLength).fill(0xF1));

        const fixup: Fixup = new Fixup(this, label, startOffset, fixupByteLength,
            (adjust !== undefined)
                ? (...args: any[]) => fixup.apply(adjust(fixup, ...args))
                : (bytes: number[]) => fixup.apply(bytes));

        this.addFixup(label, fixup);
    }

    protected applyFixups(labelToFixupArgs: Map<symbol, any>) {
        for (const entry of Array.from(this.labelToFixups.entries())) {
            const label = entry[0];
            const fixupArgs = labelToFixupArgs.get(label);

            if (fixupArgs !== undefined) {
                const fixups = entry[1];
                for (const fixup of fixups) {
                    if (fixupArgs instanceof Array) {
                        fixup.fixupFn(...fixupArgs);
                    } else {
                        fixup.fixupFn(fixupArgs);
                    }
                }
            }
        }
    }

    private addFixup(label: symbol, fixup: Fixup) {
        let fixups = this.labelToFixups.get(label);
        if (fixups === undefined) {
            fixups = new Set<Fixup>();
            this.labelToFixups.set(label, fixups);
        }
        QA.vetEqual(fixups.has(fixup), false);
        fixups.add(fixup);
    }
}
