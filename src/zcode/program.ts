import * as Binary from '../util/binary';
import { IAppendable } from '../util/binary';
import * as QA from '../util/qa';
import * as Op from './op';
import * as Routine from './routine';
import * as Section from './section';
import * as ZObject from './zobject';
import * as ZString from './zstring';

export class Program {
    private static section(name: symbol, sections: Map<symbol, Binary.Encoder>, encoder?: Binary.Encoder) {
        QA.vetEqual(sections.has(name), false);
        if (encoder === undefined) {
            encoder = new Binary.Encoder(name);
        }

        QA.vetEqual(encoder.name, name);

        sections.set(name, encoder);
        return encoder;
    }

    public readonly tables = new Map<symbol, Binary.Encoder>();
    public readonly arrays = new Map<symbol, Binary.Encoder>();
    public readonly globals = new Routine.GlobalsTable(this.array(Section.name.globals));
    public readonly main = new Routine.Routine(this.globals);
    public readonly routines = new Map<symbol, Routine.Routine>([[this.main.name, this.main]]);

    private headerOffsets = new Map([
        // 0x01 Flags 1
        // 0x04 Base of high memory (byte address)
        [Routine.names.main,        0x06],                      // 0x06 Initial value of program counter (byte address)
        [Section.name.dictionary,   0x08],                      // 0x08 Location of dictionary (byte address)
        [Section.name.objects,      0x0A],                      // 0x0A Location of object table (byte address)
        [Section.name.globals,      0x0C],                      // 0x0C Location of global variables table (byte address)
        // 0x0E Base of static memory (byte address)
        // 0x18 Location of abbreviations table (byte address)
        //
        // 0x1A Length of file (see note)
        // 0x1C Checksum of file
    ]);

    private readonly program = new Binary.Encoder(Symbol('program'));

    private sectionToDefault = new Map([
        [Section.name.dictionary, () => this.vocabulary('Z', [])],      // FROTZ V2.44: Requires a word separator, or tokenization behaves eratically.
        [Section.name.objects, () => this.objects([], [], [])],         // FROTZ V2.44: Requires an object table, even if empty, or segfaults.
    ]);

    constructor() {
        this.program.u8(3);                                             // 0x00 Version number (1 to 6)
        this.program.zerosUntil(0x40);                                  // (Zero initialize remainder of 64B header.)
    }

    private get flag1()     { return this.program.getU8(0x01); }        // 0x01 Flags 1
    private set flag1(bits) { this.program.setU8(0x01, bits); }

    public global(name: symbol, initialValue?: number): Op.Operand {
        return this.globals.alloc(name, initialValue);
    }

    public table(name: symbol) {
        return Program.section(name, this.tables);
    }

    public array(name: symbol) {
        return Program.section(name, this.arrays);
    }

    public routine(name: symbol) {
        const routine = new Routine.Routine(new Routine.SubroutineHeader(name));
        this.routines.set(name, routine);
        return routine;
    }

    public vocabulary(separators: string, entries: Array<[string, number[]]>) {
        const encoder = this.table(Section.name.dictionary);
        encoder.u8(separators.length);                      // Number of word-separator input codes
        separators.split('').forEach((inputCode) => {       // List of input codes
            encoder.u8(inputCode.charCodeAt(0));
        });

        const dataByteSize = (entries.length > 0
            ? ((entries[0])[1]).length
            : 0);

        const entrySize = 4 + dataByteSize;                 // 4 <- Encoded ZString of length 6
        encoder.u8(entrySize);                              // Byte-length of entry (must be >= 4 for v1-3)
        encoder.u16(entries.length);                        // Number of entries

        const truncatedEntries = entries.map((pair, index) => {
            return { original: pair[0], originalIndex: index, word: pair[0].substr(0, 6).toLowerCase(), data: pair[1] };
        });

        const sortedEntries = truncatedEntries.sort((left, right) => {
            const order = left.word < right.word
                ? -1
                : left.word > right.word
                    ? 1
                    : 0;

            if (order === 0) {
                throw (left.word === right.word
                    ? `Vocabulary words must be unique. (Found ${left.original} at position #${left.originalIndex} and position #${right.originalIndex})`
                    // tslint:disable-next-line:max-line-length
                    : `Vocabulary words must be unique. ('${left.original}' at position #${left.originalIndex} and '${right.original}' at position #${right.originalIndex} both map to '${left.word}')`);
            }

            return order;
        });

        for (const entry of sortedEntries) {
            const wordEnc = new Binary.Encoder(Symbol('temp: dictionary word encoder'));
            ZString.encode(wordEnc, entry.word);

            if (wordEnc.byteLength === 2) {
                wordEnc.setU16(0, wordEnc.getU16(0) & ~0x8000);
                wordEnc.u16(0x8000 | (5 << 10) | (5 << 5) | 5);
            }

            QA.vetEqual(wordEnc.byteLength, 4);
            encoder.append(wordEnc);

            const data = entry.data;
            QA.vetEqual(data.length, dataByteSize);
            encoder.bytes(data);
        }
    }

    public objects(objects: ZObject.ZObject[], attributes: string[], defaults: ZObject.PropertyDefaultEntry[]) {
        const propertyStrings = new ZString.Encoder(Symbol('objects: strings'));
        const encoder = new ZObject.Encoder(propertyStrings);
        Program.section(Section.name.objects, this.arrays, encoder);
        encoder.encode(objects, attributes, defaults);
        encoder.append(propertyStrings);
    }

    public compile() {
        //  Dynamic  header (0x40 bytes)
        //           abbreviation strings
        //           abbreviation table
        //           objects
        //               property defaults
        //               object entries
        //               property tables
        //           global variables
        //           arrays

        const sectionToByteAddress = new Map<symbol, number>();
        QA.vetEqual(this.program.byteLength, 0x40);
        this.writeSection(Section.name.objects, this.arrays, sectionToByteAddress);
        this.writeSection(Section.name.globals, this.arrays, sectionToByteAddress);
        this.writeRemainingSections(this.arrays, sectionToByteAddress);

        //  Static   grammar table
        //           actions table
        //           preactions table
        //           adjectives table
        //           dictionary

        this.program.setU16(0x0E, this.program.byteLength);                                  // 0x0E Base of static memory (byte address)
        this.writeSection(Section.name.dictionary, this.tables, sectionToByteAddress);
        this.writeRemainingSections(this.tables, sectionToByteAddress);

        //  High     Z-code
        //           static strings
        //           (end of file)

        // Code
        this.program.setU16(0x04, this.program.byteLength);                                  // 0x04 Base of high/paged memory (byte address)
        this.writeSection(this.main.name, this.routines, sectionToByteAddress);

        for (const entry of this.routines.entries()) {
            const name = entry[0];
            const routine = entry[1];
            const variables = routine.variables;

            this.program.alignTo(2);                                                        // subroutines must begin at word-aligned boundaries
            this.program.append(variables.headerBytes);
            this.writeSection(name, this.routines, sectionToByteAddress);
        }

        return new Uint8Array(this.program.extract());
    }

    private getSection(name: symbol, sectionToEncoder: Map<symbol, IAppendable>) {
        let section = sectionToEncoder.get(name);
        if (section === undefined) {
            const createDefault = this.sectionToDefault.get(name);
            if (createDefault !== undefined) {
                createDefault();
                section = sectionToEncoder.get(name);
                QA.vetNotEqual(section, undefined);
            }
        }

        if (section !== undefined) {
            QA.vet(sectionToEncoder.delete(name));

            return section.isEmpty
                ? undefined
                : section;
        }

        return undefined;
    }

    private writeSection(name: symbol, sectionToEncoder: Map<symbol, IAppendable>, sectionToByteAddress: Map<symbol, number>) {
        const section = this.getSection(name, sectionToEncoder);
        if (section !== undefined) {
            const byteAddress = this.program.append(section);
            sectionToByteAddress.set(name, byteAddress);

            const headerOffset = this.headerOffsets.get(name);
            if (headerOffset !== undefined) {
                QA.vetEqual(this.program.getU16(headerOffset), 0);
                this.program.setU16(headerOffset, byteAddress);
            }
        }

        // Sanity check that the 'symbol' was only inserted into one section, and has now been removed.
        QA.vet(!this.tables.has(name));
        QA.vet(!this.arrays.has(name));
        QA.vet(!this.routines.has(name));
    }

    private writeRemainingSections(sectionToEncoder: Map<symbol, Binary.Encoder>, sectionToByteAddress: Map<symbol, number>) {
        const remaining = Array.from(sectionToEncoder.keys());
        for (const name of remaining) {
            this.writeSection(name, sectionToEncoder, sectionToByteAddress);
        }
    }
}
