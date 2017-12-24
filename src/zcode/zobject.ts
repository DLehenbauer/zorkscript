import * as Binary from '../util/binary';
import * as QA from '../util/qa';
import * as Section from './section';
import * as ZString from './zstring';

export class ZObject {
    public name: string;
    public attributes: string[];
    public properties: any;
    public children: ZObject[];
    public index?: number;
}

export class PropertyDefaultEntry {
    public name: string;
    public default: number;
}

export class Encoder extends Binary.Encoder {
    private objectToIndex = new Map<ZObject, number>();
    private propertyToIndex = new Map<string, number>();
    private attributeToIndex = new Map<string, number>();
    private propertyTables = new Binary.Encoder(Symbol('temp: objects property tables'));

    constructor(private readonly strings: ZString.Encoder) {
        super(Section.name.objects);
    }

    public encode(objects: ZObject[], attributes: string[], defaults: PropertyDefaultEntry[]) {
        this.assignIndices(objects);

        this.defaultProperties(defaults);

        attributes.forEach((attribute, index) => {
            this.attributeToIndex.set(attribute, index);
        });

        QA.vetLessThanEqual(this.attributeToIndex.size, 32);

        this.objectEntriesAndPropertyTables(objects, 0);

        this.append(this.propertyTables);
    }

    private defaultProperties(defaults: PropertyDefaultEntry[]) {
        QA.vetEqual(this.byteLength, 0);

        const defaultsStart = this.zeros(31 * 2);
        defaults.forEach((entry, index) => {
            this.propertyToIndex.set(entry.name, index);
            this.setX16(defaultsStart + 2 * (index - 1), entry.default);
        });
        QA.vetLessThanEqual(this.propertyToIndex.size, 31);
    }

    private propertySizeAndIndex(size: number, index: number) {
        QA.vet(1 <= index && index <= 31);
        QA.vet(1 <= size && size <= 8);
        this.propertyTables.u8(((size - 1) << 5) + index);
    }

    private propertyTable(propertiesSymbol: symbol, obj: ZObject) {
        this.propertyTables.label(propertiesSymbol);

        const description = new Binary.Encoder(Symbol('objects-table: name'));
        ZString.encode(description, obj.name);
        const strLen = description.byteLength;
        QA.vet(strLen % 2 === 0);
        this.propertyTables.u8(strLen / 2);
        this.propertyTables.append(description);

        Object.getOwnPropertyNames(obj.properties).map((property) => {
            const propertyIndex = this.propertyToIndex.get(property);
            if (propertyIndex === undefined) {
                QA.fail(`Undeclared property '${property}'`);
                throw new Error();
            } else {
                return { index: propertyIndex, data: obj.properties[property] };
            }
        }).sort((left, right) => right.index - left.index).forEach((indexAndData) => {
            const index = indexAndData.index;
            const data  = indexAndData.data;
            if (typeof data === 'string') {
                this.propertySizeAndIndex(2, index);
                const symbol = Symbol(data);
                this.strings.add(symbol, data);
                this.propertyTables.fixupU16(symbol);
            } else {
                this.propertySizeAndIndex(data.length, index);
                this.propertyTables.bytes(data);
            }
        });
        this.propertyTables.u8(0);
    }

    private objectEntriesAndPropertyTables(siblings: ZObject[], parentIndex: number) {
        siblings.forEach((obj, position) => {
            let attribs = 0;
            obj.attributes.forEach((attrib) => {
                const index = this.attributeToIndex.get(attrib);
                if (index === undefined) {
                    QA.fail(`Unspecified attribute ${attrib}`);
                } else {
                    attribs |= 1 << (31 - index);
                    attribs >>>= 0;
                }
            });

            const siblingIndex = position < (siblings.length - 1)
                ? this.objectToIndex.get(siblings[position + 1]) as number
                : 0;

            const childIndex = obj.children.length > 0
                ? this.objectToIndex.get(obj.children[0]) as number
                : 0;

            this.u32(attribs);
            this.u8(parentIndex);
            this.u8(siblingIndex);
            this.u8(childIndex);

            const objectId = this.objectToIndex.get(obj) as number;
            const propertiesSymbol = Symbol(`object #${objectId} properties`);
            this.fixupU16(propertiesSymbol);
            this.propertyTable(propertiesSymbol, obj);

            if (childIndex > 0) {
                this.objectEntriesAndPropertyTables(obj.children, objectId);
            }
        });
    }

    private assignIndices(objects: ZObject[]) {
        if (objects !== undefined) {
            objects.forEach((obj) => {
                QA.vetEqual(this.objectToIndex.has(obj), false);
                this.objectToIndex.set(obj, this.objectToIndex.size + 1);
                this.assignIndices(obj.children);
            });
        }
    }
}
