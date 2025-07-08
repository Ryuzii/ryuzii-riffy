/**
 * Represents a queue of tracks for a player.
 * @extends Array
 */
class Queue extends Array {
    /**
     * @param {number} [maxSize] - Maximum size of the queue (circular buffer). If set, oldest tracks are removed when full.
     * @param {EventEmitter} [emitter] - Optional event emitter (player or riffy) for queue events.
     */
    constructor(maxSize, emitter) {
        super();
        this.maxSize = maxSize || null;
        this.emitter = emitter || null;
    }
    /**
     * Sets the maximum size of the queue.
     * @param {number} size
     */
    setMaxSize(size) {
        this.maxSize = size;
        while (this.maxSize && this.length > this.maxSize) {
            this.shift();
        }
    }
    /**
     * Returns true if the queue is full.
     * @returns {boolean}
     */
    isFull() {
        return this.maxSize !== null && this.length >= this.maxSize;
    }
    /**
     * Returns the size of the queue.
     * @returns {number}
     */
    get size() {
        return this.length;
    }
    /**
     * Returns the first track in the queue.
     * @returns {*}
     */
    get first() {
        return this.length ? this[0] : null;
    }
    /**
     * Adds a track to the queue. If full, removes the oldest.
     * Emits 'queueAdd' event.
     * @param {*} track
     * @returns {Queue}
     */
    add(track) {
        if (this.isFull()) {
            this.shift();
        }
        this.push(track);
        if (this.emitter) this.emitter.emit('queueAdd', track, this);
        return this;
    }
    /**
     * Removes a track by index. Emits 'queueRemove' event.
     * @param {number} index
     * @returns {*}
     */
    remove(index) {
        if (index >= 0 && index < this.length) {
            const removed = this.splice(index, 1)[0];
            if (this.emitter) this.emitter.emit('queueRemove', removed, this);
            return removed;
        } else {
            throw new Error("Index out of range");
        }
    }
    /**
     * Clears the queue. Emits 'queueClear' event.
     */
    clear() {
        super.length = 0;
        if (this.emitter) this.emitter.emit('queueClear', this);
    }
    /**
     * Shuffles the queue. Emits 'queueShuffle' event.
     */
    shuffle() {
        for (let i = this.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this[i], this[j]] = [this[j], this[i]];
        }
        if (this.emitter) this.emitter.emit('queueShuffle', this);
    }
    /**
     * Peeks at the next n tracks in the queue.
     * @param {number} n
     * @returns {Array}
     */
    peek(n = 1) {
        return this.slice(0, n);
    }
}

module.exports = { Queue };