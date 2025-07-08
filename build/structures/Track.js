const { getImageUrl } = require("../functions/fetchImage");
const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Represents a track loaded from Lavalink.
 */
class Track {
    /**
     * @param {object} data - Track data from Lavalink.
     * @param {*} requester - The user who requested the track.
     * @param {Node} node - The node this track is associated with.
     */
    constructor(data, requester, node) {
        this.rawData = data;
        this.track = data.encoded;
        this.info = {
            identifier: data.info.identifier,
            seekable: data.info.isSeekable,
            author: data.info.author,
            length: data.info.length,
            stream: data.info.isStream,
            position: data.info.position,
            title: data.info.title,
            uri: data.info.uri,
            requester,
            sourceName: data.info.sourceName,
            isrc: data.info?.isrc || null,
            _cachedThumbnail: data.info.thumbnail ?? null,
            get thumbnail() {
            if (data.info.thumbnail) return data.info.thumbnail;

            if (node.rest.version === "v4") {
                if (data.info.artworkUrl) {
                  this._cachedThumbnail = data.info.artworkUrl;
                  return data.info.artworkUrl
               } else {
                  return !this._cachedThumbnail ? (this._cachedThumbnail = getImageUrl(this)) : this._cachedThumbnail ?? null
               }
              } else {
              return !this._cachedThumbnail
                ? (this._cachedThumbnail = getImageUrl(this))
                : this._cachedThumbnail ?? null;
              }
            }
        };
        /** @private */
        this._beforeHooks = {};
        /** @private */
        this._afterHooks = {};
        /**
         * Arbitrary user/plugin data.
         * @type {object}
         */
        this.customData = {};
        /**
         * Arbitrary custom metadata for this track.
         * @type {object}
         */
        this.metadata = {};
        /**
         * Play count for this track.
         * @type {number}
         */
        this.playCount = 0;
        /**
         * Last played timestamp (ms since epoch).
         * @type {number|null}
         */
        this.lastPlayed = null;
    }
    /**
     * Marks this track as played, updates stats, and emits 'trackPlay' event.
     * @param {EventEmitter} [emitter] - Optional player or riffy instance for events.
     */
    markPlayed(emitter) {
        this.playCount++;
        this.lastPlayed = Date.now();
        if (emitter) emitter.emit('trackPlay', this);
    }
    /**
     * Register a function to run before a given event.
     * @param {string} event
     * @param {Function} fn
     */
    onBefore(event, fn) {
        if (!this._beforeHooks[event]) this._beforeHooks[event] = [];
        this._beforeHooks[event].push(fn);
    }
    /**
     * Register a function to run after a given event.
     * @param {string} event
     * @param {Function} fn
     */
    onAfter(event, fn) {
        if (!this._afterHooks[event]) this._afterHooks[event] = [];
        this._afterHooks[event].push(fn);
    }
    async _runBeforeHooks(event, ...args) {
        if (this._beforeHooks[event]) {
            for (const fn of this._beforeHooks[event]) {
                await fn(...args);
            }
        }
    }
    async _runAfterHooks(event, ...args) {
        if (this._afterHooks[event]) {
            for (const fn of this._afterHooks[event]) {
                await fn(...args);
            }
        }
    }
    /**
     * Advanced resolve: allow plugins to modify the result. Emits 'trackResolve' event.
     * @param {import("./Riffy").Riffy} riffy - The Riffy instance.
     * @returns {Promise<Track|undefined>}
     */
    async resolve(riffy) {
        await this._runBeforeHooks('resolve', riffy);
        const query = [this.info.author, this.info.title].filter((x) => !!x).join(" - ");
        let result = await riffy.resolve({ query, source: riffy.options.defaultSearchPlatform, requester: this.info.requester });
        // Allow plugins to modify result
        if (riffy._afterGlobalHooks && riffy._afterGlobalHooks['trackResolve']) {
            for (const fn of riffy._afterGlobalHooks['trackResolve']) {
                result = await fn(result, this, riffy) || result;
            }
        }
        if (riffy.emit) riffy.emit('trackResolve', this, result);
        if (!result || !result.tracks.length) {
            return;
        }

        const officialAudio = result.tracks.find((track) => {
            const author = [this.info.author, `${this.info.author} - Topic`];
            return author.some((name) => new RegExp(`^${escapeRegExp(name)}$`, "i").test(track.info.author)) ||
                new RegExp(`^${escapeRegExp(this.info.title)}$`, "i").test(track.info.title);
        });

        if (officialAudio) {
            this.info.identifier = officialAudio.info.identifier;
            this.track = officialAudio.track;
            return this;
        }

        if (this.info.length) {
            const sameDuration = result.tracks.find((track) => track.info.length >= (this.info.length ? this.info.length : 0) - 2000 &&
                track.info.length <= (this.info.length ? this.info.length : 0) + 2000);

            if (sameDuration) {
                this.info.identifier = sameDuration.info.identifier;
                this.track = sameDuration.track;
                return this;
            }

            const sameDurationAndTitle = result.tracks.find((track) => track.info.title === this.info.title && track.info.length >= (this.info.length ? this.info.length : 0) - 2000 && track.info.length <= (this.info.length ? this.info.length : 0) + 2000);

            if (sameDurationAndTitle) {
                this.info.identifier = sameDurationAndTitle.info.identifier;
                this.track = sameDurationAndTitle.track;
                return this;
            }
        }

        this.info.identifier = result.tracks[0].info.identifier;
        this.track = result.tracks[0].track;
        return this;
        await this._runAfterHooks('resolve', riffy);
        return this;
    }
    /**
     * Emits 'trackEnd' event (should be called by player when track ends).
     * @param {EventEmitter} [emitter] - Optional player or riffy instance for events.
     */
    emitEnd(emitter) {
        if (emitter) emitter.emit('trackEnd', this);
    }
}

module.exports = { Track };
