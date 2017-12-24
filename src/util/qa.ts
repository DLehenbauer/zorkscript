class InvariantViolationError extends Error {
    public framesToPop: number;

    constructor(message?: string | (() => string), description?: string, framesToPop?: number) {
        message = typeof message === 'function'
            ? message()
            : message;

        message = message
            ? description
                ? `${message} (${description})`
                : message
            : description
                ? `${description}.`
                : 'Invariant violation.';

        super(message);

        this.name = 'InvariantViolationError';
        this.framesToPop = (framesToPop || 0) + 1;

        // tslint:disable-next-line:no-debugger
        debugger;
    }
}

function pretty(value: any) {
    const valueType = typeof value;
    const asString  = typeof value === 'symbol'
        ? value.toString()
        : '' + value;

    return valueType === 'object'
        ? value.constructor.name !== 'Object'
            ? `[object] ${value.constructor.name}`
            : asString
        : `[${valueType}] ${asString}`;
}

export function unused(...args: any[]) {
    vetGreaterThanEqual(args.length, 1);
}

export function fail(message: string | (() => string)): never {
    throw new InvariantViolationError(message, '');
}

export function vet(invariant: boolean, message?: string | (() => string)) {
    if (!invariant) {
        throw new InvariantViolationError(message, '');
    }
}

function areSame(left: any, right: any) {
    // Note: Use 'x !== x' to test for NaN rather than NaN(x) to distinguish between NaN and undefined.
    // Note: Use '(1 / x) === (1 / y)' to distinguish between +/- 0 when comparing zeros.
    return right !== right                                  // If expecting NaN
        ? left !== left                                     //   return true if actually NaN
        : (right === 0)                                     // Else if expecting zero
            ? left === 0 && ((1 / left) === (1 / right))    //   return true if actually zero w/the same sign
            : left === right;                               // Else return result of strict equality
}

export function vetEqual<T>(actual: T, expected: T, message?: string | (() => string)) {
    if (!areSame(actual, expected)) {
        throw new InvariantViolationError(message, `expected '${pretty(expected)}', but got '${pretty(actual)}'`);
    }
}

export function vetNotEqual<T>(actual: T, expected: T, message?: string | (() => string)) {
    if (areSame(actual, expected)) {
        throw new InvariantViolationError(message, `must not be equal to '${pretty(actual)}'`);
    }
}

export function vetGreaterThanEqual(left: number, right: number, message?: string | (() => string)) {
    if (!(left >= right)) {
        throw new InvariantViolationError(message, `expected '${left}' >= ${right}`);
    }
}

export function vetLessThanEqual(left: number, right: number, message?: string | (() => string)) {
    if (!(left <= right)) {
        throw new InvariantViolationError(message, `expected '${left}' <= ${right}`);
    }
}

export function vetInRange(minInclusive: number, value: number, maxInclusive: number, message?: string | (() => string)) {
    if (minInclusive > value || value > maxInclusive) {
        const description = `expected [${minInclusive}..${maxInclusive}], but got '${value}'`;
        throw new InvariantViolationError(message, description);
    }
}
