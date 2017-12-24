import * as Binary from '../util/binary';

const zcharAlphabet2 = new Map<number, number[]>([
    [ 0x0A, [ 0x05, 0x07 ]],        // (new line)
    [ 0x20, [ 0x00 ]],              // (space)
    [ 0x2E, [ 0x05, 0x12 ]],        // .
    [ 0x2C, [ 0x05, 0x13 ]],        // ,
    [ 0x21, [ 0x05, 0x14 ]],        // !
    [ 0x3F, [ 0x05, 0x15 ]],        // ?
    [ 0x5F, [ 0x05, 0x16 ]],        // _
    [ 0x23, [ 0x05, 0x17 ]],        // #
    [ 0x27, [ 0x05, 0x18 ]],        // '
    [ 0x22, [ 0x05, 0x19 ]],        // "
    [ 0x2F, [ 0x05, 0x1A ]],        // /
    [ 0x5C, [ 0x05, 0x1B ]],        // \
    [ 0x2D, [ 0x05, 0x1C ]],        // -
    [ 0x3A, [ 0x05, 0x1D ]],        // :
    [ 0x28, [ 0x05, 0x1E ]],        // (
    [ 0x29, [ 0x05, 0x1F ]],        // )
]);

const zcharPadding = [0x05, 0x05, 0x05];

function *toUnpaddedZchars(text: string) {
    for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);

        //                        1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1
        //    6 7 8 9 a b c d e f 0 1 2 3 4 5 6 7 8 9 a b c d e f
        // A0 a b c d e f g h i j k l m n o p q r s t u v w x y z
        // A1 A B C D E F G H I J K L M N O P Q R S T U V W X Y Z
        // A2 *   0 1 2 3 4 5 6 7 8 9 . , ! ? _ # ' " / \ - : ( )
        if (0x61 <= ch && ch <= 0x7A) {
            yield (ch - 0x5B);                          // Lower-case
        } else if (0x41 <= ch && ch <= 0x5A) {
            yield 0x04;                                 // Upper-case
            yield (ch - 0x3B);
        } else if (0x30 <= ch && ch <= 0x39) {
            yield 0x05;                                 // 0-9
            yield (ch - 0x28);
        } else {
            const zcharSeq = zcharAlphabet2.get(ch);
            if (zcharSeq !== undefined) {
                yield * zcharSeq;
            } else if (0x00 <= ch && ch <= 0x7F) {      // ASCII
                yield 0x05;
                yield 0x06;
                yield ch >>> 5;
                yield ch & 0x1F;
            } else {
                throw new Error(`Unsupported character '${text.charAt(i)}' (${ch}).`);
            }
        }
    }
}

function toZchars(text: string) {
    if (text.length === 0) {
        return zcharPadding;
    }

    const unpaddedZchars = Array.from(toUnpaddedZchars(text));

    const remainder = unpaddedZchars.length % 3;
    return (remainder === 0)
        ? unpaddedZchars
        : unpaddedZchars.concat(zcharPadding.slice(remainder));
}

export function encode(encoder: Binary.Encoder, text: string) {
    const zchars = toZchars(text);
    for (let i = 0; i < zchars.length;) {
        const ch1 = zchars[i++];
        const ch2 = zchars[i++];
        const ch3 = zchars[i++];

        // |     high byte      |     low byte     |
        // | 7 | 6 5 4 3 2 | 1 0 7 6 5 | 4 3 2 1 0 |
        // | z |    ch1    |    ch2    |   ch3     |
        encoder.u8((ch1 << 2) | (ch2 >>> 3));
        encoder.u8(((ch2 << 5) & 0xE0) | ch3);
    }

    encoder.setU8(encoder.byteLength - 2, encoder.getU8(encoder.byteLength - 2) | 0x80);

    return encoder.toUint8Array();
}

export class Encoder extends Binary.Encoder {
    public add(symbol: symbol, text: string) {
        this.label(symbol);
        this.bytes(encode(this, text));
    }
}
