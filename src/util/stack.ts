export class Stack<T> {
    private _top: T;
    private readonly nextItems: T[] = [];

    constructor(top: T) {
        this._top = top;
    }

    public get top() { return this._top; }

    public push(item: T) {
        this.nextItems.push(this._top);
        this._top = item;
    }

    public pop() {
        if (this.nextItems.length === 0) {
            throw new Error('Stack is empty.');
        }

        const newTop = this.nextItems.pop() as T;
        const oldTop = this._top;
        this._top = newTop;
        return oldTop;
    }
}
