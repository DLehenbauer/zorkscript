import * as QA from '../util/qa';
import { Identifier } from './ast';

export class LexicalScopeResolver {
    public constructor(protected readonly definitions: Map<string, Identifier> = new Map(), private readonly declarations: Map<string, symbol> = new Map()) { }

    public lookupDefinition(id: Identifier): Identifier {
        const definition = this.definitions.get(id.name);
        if (definition === undefined) {
            throw new Error(`Undefined identifier '${id.name}'.`);
        }
        return definition;
    }

    public lookupDeclaration(name: string): symbol | undefined {
        return this.declarations.get(name);
    }

    public resolve(id: Identifier): Identifier {
        const definition = this.lookupDefinition(id);
        QA.vet(definition.symbol !== undefined);
        return definition;
    }
}

export class LexicalScope extends LexicalScopeResolver {
    private readonly parent: LexicalScopeResolver;

    constructor(parent: LexicalScopeResolver) {
        super();
        this.parent = parent;
    }

    public define(id: Identifier) {
        if (this.definitions.has(id.name)) {
            throw new Error(`Duplicate definition for '${id.name}'.`);
        }

        QA.vetEqual(id.symbol, undefined);

        const declaredAs = this.lookupDeclaration(id.name);
        id.symbol = declaredAs !== undefined
            ? declaredAs
            : Symbol(id.name);

        this.definitions.set(id.name, id);
    }

    public lookupDefinition(id: Identifier) {
        const definition = this.definitions.get(id.name);
        return definition !== undefined
            ? definition
            : this.parent.lookupDefinition(id);
    }

    public lookupDeclaration(name: string) {
        return this.parent.lookupDeclaration(name);
    }
}
