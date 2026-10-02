class EventBus {
    constructor() {
        this.listeners = new Map();
        this.currentOwner = null;
    }

    on(event, callback) {
        if (!this.listeners.has(event)) this.listeners.set(event, []);
        this.listeners.get(event).push({ callback, owner: this.currentOwner });
    }

    withOwner(owner, register) {
        const previousOwner = this.currentOwner;
        this.currentOwner = owner;
        try {
            register();
        } finally {
            this.currentOwner = previousOwner;
        }
    }

    off(event, callback) {
        this.removeListenerForEvent(event, callback);
    }

    removeListenerForEvent(event, callbackOrOwner) {
        const listeners = this.listeners.get(event);
        if (!listeners) return;
        if (!callbackOrOwner) {
            this.listeners.delete(event);
            return;
        }
        const remaining = listeners.filter(({ callback, owner }) =>
            callback !== callbackOrOwner && owner !== callbackOrOwner
        );
        if (remaining.length) this.listeners.set(event, remaining);
        else this.listeners.delete(event);
    }

    removeListenersForOwner(owner) {
        for (const event of this.listeners.keys()) {
            this.removeListenerForEvent(event, owner);
        }
    }

    clearAll() {
        for (const listeners of this.listeners.values()) {
            for (const { owner } of listeners) {
                if (owner) owner._eventsBound = false;
            }
        }
        this.listeners.clear();
    }

    reset() {
        this.clearAll();
    }

    emit(event, data) {
        const listeners = this.listeners.get(event);
        if (!listeners) return;
        listeners.slice().forEach(({ callback }) => callback(data));
    }
}

export default new EventBus();
