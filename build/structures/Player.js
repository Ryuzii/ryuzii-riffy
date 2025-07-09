const { EventEmitter } = require("events");
const { Connection } = require("./Connection");
const { Filters } = require("./Filters");
const { Queue } = require("./Queue");
const { spAutoPlay, scAutoPlay, amAutoPlay } = require('../functions/autoPlay');
const { inspect } = require("util");

// --- Real-time live lyrics support using lrclib-api ---
let lrclibClient = null;
try {
    const { Client } = require('lrclib-api');
    lrclibClient = new Client();
} catch (error) {
    console.warn('lrclib-api not installed. Lyrics functionality will be disabled.');
}

/**
 * Represents a music player for a guild.
 * @extends EventEmitter
 */
class Player extends EventEmitter {
    /**
     * @param {import("./Riffy").Riffy} riffy - The Riffy instance.
     * @param {Node} node - The node this player is on.
     * @param {object} options - Player options.
     * @param {number} [options.crossfadeDuration=0] - Crossfade duration in milliseconds.
     */
    constructor(riffy, node, options) {
        super();
        this.riffy = riffy;
        this.node = node;
        this.options = options;
        this.guildId = options.guildId;
        this.textChannel = options.textChannel;
        this.voiceChannel = options.voiceChannel;
        /** @private */
        this._connection = null;
        /** @private */
        this._filters = null;
        this.mute = options.mute ?? false;
        this.deaf = options.deaf ?? false;
        this.volume = options.defaultVolume ?? 100;
        this.loop = options.loop ?? "none";
        this.data = {};
        this.queue = new Queue();
        this.position = 0;
        this.current = null;
        this.previousTracks = new Array();
        this.playing = false;
        this.paused = false;
        this.connected = false;
        this.timestamp = 0;
        this.ping = 0;
        this.isAutoplay = false;
        this._idleTimeout = null;
        this._lastPlayerUpdate = 0;
        this.crossfadeDuration = options.crossfadeDuration ?? 0; // ms

        /** @private */
        this._beforeHooks = {};
        /** @private */
        this._afterHooks = {};
        /**
         * Arbitrary user/plugin data.
         * @type {object}
         */
        this.customData = {};

        // Use performance and track options
        this.autopauseOnEmpty = riffy.options.performance?.autopauseOnEmpty ?? true;
        this.lazyLoad = riffy.options.performance?.lazyLoad?.enabled ?? false;
        this.lazyLoadTimeout = riffy.options.performance?.lazyLoad?.timeout ?? 5000;
        this.historyLimit = riffy.options.track?.historyLimit ?? 20;
        this.debug = riffy.options.debug ?? false;
        // TODO: Implement auto-pause when everyone leaves
        // TODO: Implement lazy loading of tracks
        // TODO: Enforce track history limit in previousTracks
        // TODO: Use debug to control debug event emission

        this.on("playerUpdate", (packet) => {
            // Throttle playerUpdate events to at most once per 500ms
            const now = Date.now();
            if (now - this._lastPlayerUpdate < 500) return;
            this._lastPlayerUpdate = now;
            (this.connected = packet.state.connected),
                (this.position = packet.state.position),
                (this.ping = packet.state.ping);
            this.timestamp = packet.state.time;
            this.riffy.emit("playerUpdate", this, packet);
        });

        this.on("event", (data) => {
            this.handleEvent(data)
        });
        // Idle cleanup: auto-destroy if idle for 5 minutes
        this._setupIdleCleanup();
        // --- Auto-pause when everyone leaves ---
        this._setupVoiceStateListener();
    }
    /**
     * Lazy getter for connection.
     */
    get connection() {
        if (!this._connection) this._connection = new Connection(this);
        return this._connection;
    }
    /**
     * Lazy getter for filters.
     */
    get filters() {
        if (!this._filters) this._filters = new Filters(this);
        return this._filters;
    }
    /**
     * Sets up idle cleanup: destroys player if idle for 5 minutes.
     * @private
     */
    _setupIdleCleanup() {
        const checkIdle = () => {
            if (!this.playing && !this.paused && this.queue.length === 0) {
                this.destroy();
            } else {
                this._idleTimeout = setTimeout(checkIdle, 5 * 60 * 1000); // 5 minutes
            }
        };
        this._idleTimeout = setTimeout(checkIdle, 5 * 60 * 1000);
    }
    /**
     * Setup listener for voice state updates to auto-pause when everyone leaves.
     * @private
     */
    _setupVoiceStateListener() {
        if (!this.autopauseOnEmpty) return;
        const client = this.riffy.client;
        if (!client || !client.on) return;
        client.on('voiceStateUpdate', (oldState, newState) => {
            try {
                if (this.voiceChannel && oldState.channelId === this.voiceChannel) {
                    const channel = oldState.guild.channels.cache.get(this.voiceChannel);
                    if (channel && channel.members.filter(m => !m.user.bot).size === 0) {
                        this.pause(true);
                        if (this.debug) this.riffy.emit('debug', `Player (${this.guildId}) auto-paused: everyone left the channel.`);
                    }
                }
            } catch (e) {
                if (this.debug) this.riffy.emit('debug', `AutoPause error: ${e}`);
            }
        });
    }
    /**
     * @description gets the Previously played Track
     */
    get previous() {
     return this.previousTracks?.[0]
    }

    /**
     * Add a track to previousTracks, enforcing historyLimit.
     * @private
     */
    addToPreviousTrack(track) {
        if (this.historyLimit && this.previousTracks.length >= this.historyLimit) {
            this.previousTracks.splice(this.historyLimit, this.previousTracks.length);
        } else if (!this.historyLimit) {
            this.previousTracks[0] = track;
            return;
        }
        this.previousTracks.unshift(track);
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
    /**
     * Internal: run before hooks for an event.
     */
    async _runBeforeHooks(event, ...args) {
        if (this._beforeHooks[event]) {
            for (const fn of this._beforeHooks[event]) {
                await fn(...args);
            }
        }
    }
    /**
     * Internal: run after hooks for an event.
     */
    async _runAfterHooks(event, ...args) {
        if (this._afterHooks[event]) {
            for (const fn of this._afterHooks[event]) {
                await fn(...args);
            }
        }
    }

    /**
     * Internal: play the next track with optional crossfade.
     * @private
     */
    async _playNextWithCrossfade() {
        if (this.crossfadeDuration > 0 && this.current && this.queue.length > 0) {
            // Start next track with overlap
            const nextTrack = this.queue[0];
            // Fade out current, fade in next (if supported by filters)
            // 1. Lower volume of current track over crossfadeDuration
            // 2. Start next track at low volume, ramp up
            // This requires filter support; fallback to instant switch if not supported
            try {
                // Fade out current
                await this.filters.setTimescale(true, { rate: 1 });
                await this.filters.setLowPass(true, { smoothing: 20 });
                for (let v = this.volume; v >= 0; v -= Math.ceil(this.volume / 10)) {
                    this.setVolume(v);
                    await new Promise(res => setTimeout(res, this.crossfadeDuration / 10));
                }
                // Start next track at low volume
                this.setVolume(0);
                this.current = this.queue.shift();
                this.node.rest.updatePlayer({
                    guildId: this.guildId,
                    data: { track: { encoded: this.current.track } },
                });
                // Fade in
                for (let v = 0; v <= this.volume; v += Math.ceil(this.volume / 10)) {
                    this.setVolume(v);
                    await new Promise(res => setTimeout(res, this.crossfadeDuration / 10));
                }
                // Reset filters
                await this.filters.setLowPass(false);
            } catch (e) {
                // Fallback to instant switch
                this.current = this.queue.shift();
                this.node.rest.updatePlayer({
                    guildId: this.guildId,
                    data: { track: { encoded: this.current.track } },
                });
            }
        } else {
            // No crossfade, just play next
            this.current = this.queue.shift();
            this.node.rest.updatePlayer({
                guildId: this.guildId,
                data: { track: { encoded: this.current.track } },
            });
        }
    }
    /**
     * Play the next track, with gapless/crossfade if enabled. Implements lazy loading if enabled.
     */
    async play() {
        if (!this.connected) throw new Error("Player connection is not initiated. Kindly use Riffy.createConnection() and establish a connection, TIP: Check if Guild Voice States intent is set/provided & 'updateVoiceState' is used in the raw(Gateway Raw) event");
        if (!this.queue.length) return;
        // --- Lazy load: delay before playing next track ---
        if (this.lazyLoad) {
            await new Promise(res => setTimeout(res, this.lazyLoadTimeout));
            if (this.debug) this.riffy.emit('debug', `Player (${this.guildId}) lazy loaded next track after ${this.lazyLoadTimeout}ms.`);
        }
        await this._playNextWithCrossfade();
        this.playing = true;
        this.position = 0;
        return this;
    }

    /**
     * 
     * @param {this} player 
     * @returns 
     */
    async autoplay(player) {
        if (!player) {
            if (player == null) {
                this.isAutoplay = false;
                return this;
            } else if (player == false) {
                this.isAutoplay = false;
                return this;
            } else throw new Error("Missing argument. Quick Fix: player.autoplay(player)");
        }

        this.isAutoplay = true;

        // If ran on queueEnd event
        if (player.previous) {
            if (player.previous.info.sourceName === "youtube") {
                try {
                    let data = `https://www.youtube.com/watch?v=${player.previous.info.identifier}&list=RD${player.previous.info.identifier}`;

                    let response = await this.riffy.resolve({ query: data, source: "ytmsearch", requester: player.previous.info.requester });

                    if (this.node.rest.version === "v4") {
                        if (!response || !response.tracks || ["error", "empty"].includes(response.loadType)) return this.stop();
                    } else {
                        if (!response || !response.tracks || ["LOAD_FAILED", "NO_MATCHES"].includes(response.loadType)) return this.stop();
                    }

                    let track = response.tracks[Math.floor(Math.random() * Math.floor(response.tracks.length))];
                    this.queue.push(track);
                    this.play();
                    return this
                } catch (e) {
                    return this.stop();
                }
            } else if (player.previous.info.sourceName === "soundcloud") {
                try {
                    scAutoPlay(player.previous.info.uri).then(async (data) => {
                        let response = await this.riffy.resolve({ query: data, source: "scsearch", requester: player.previous.info.requester });

                        if (this.node.rest.version === "v4") {
                            if (!response || !response.tracks || ["error", "empty"].includes(response.loadType)) return this.stop();
                        } else {
                            if (!response || !response.tracks || ["LOAD_FAILED", "NO_MATCHES"].includes(response.loadType)) return this.stop();
                        }

                        let track = response.tracks[Math.floor(Math.random() * Math.floor(response.tracks.length))];

                        this.queue.push(track);
                        this.play();
                        return this;
                    })
                } catch (e) {
                    console.log(e);
                    return this.stop();
                }
            } else if (player.previous.info.sourceName === "spotify") {
                try {
                    spAutoPlay(player.previous.info.identifier).then(async (data) => {
                        const response = await this.riffy.resolve({ query: `https://open.spotify.com/track/${data}`, requester: player.previous.info.requester });

                        if (this.node.rest.version === "v4") {
                            if (!response || !response.tracks || ["error", "empty"].includes(response.loadType)) return this.stop();
                        } else {
                            if (!response || !response.tracks || ["LOAD_FAILED", "NO_MATCHES"].includes(response.loadType)) return this.stop();
                        }

                        let track = response.tracks[Math.floor(Math.random() * Math.floor(response.tracks.length))];
                        this.queue.push(track);
                        this.play();
                        return this;
                    })
                } catch (e) {
                    console.log(e);
                    return this.stop();
                }
            } else if (player.previous.info.sourceName === "applemusic") {
                try {
                    let genres = player.previous.info.genres || [];
                    // Add 'K-Pop' genre if the title, artist, or album suggests it's KPOP
                    const isKpop = (
                        (player.previous.info.author && /k[- ]?pop|twice|bts|blackpink|stray kids|newjeans|seventeen|ive|itzy|aespa|le sserafim/i.test(player.previous.info.author)) ||
                        (player.previous.info.title && /k[- ]?pop/i.test(player.previous.info.title)) ||
                        (player.previous.info.albumName && /k[- ]?pop/i.test(player.previous.info.albumName))
                    );
                    if (isKpop && !genres.some(g => /k[- ]?pop/i.test(g.name))) {
                        genres = [...genres, { genreId: '51', name: 'K-Pop' }];
                    }
                    amAutoPlay({
                        country: player.previous.info.country || 'us',
                        chartType: 'most-played',
                        originalTrack: {
                            genres,
                            artistName: null // Only use artist fallback if all genre fallbacks fail
                        }
                    }).then(async (data) => {
                        if (!data) return this.stop();
                        // Use the Apple Music URL if available, else fallback to name + artist
                        const query = data.url || `${data.name} ${data.artistName}`;
                        const response = await this.riffy.resolve({ query, source: "amsearch", requester: player.previous.info.requester });

                        if (this.node.rest.version === "v4") {
                            if (!response || !response.tracks || ["error", "empty"].includes(response.loadType)) return this.stop();
                        } else {
                            if (!response || !response.tracks || ["LOAD_FAILED", "NO_MATCHES"].includes(response.loadType)) return this.stop();
                        }

                        let track = response.tracks[Math.floor(Math.random() * Math.floor(response.tracks.length))];
                        this.queue.push(track);
                        this.play();
                        return this;
                    })
                } catch (e) {
                    console.log(e);
                    return this.stop();
                }
            }
        } else return this;
    }

    connect(options = this) {
        const { guildId, voiceChannel, deaf = true, mute = false } = options;
        this.send({
            guild_id: guildId,
            channel_id: voiceChannel,
            self_deaf: deaf,
            self_mute: mute,
        });

        this.connected = true

        this.riffy.emit("debug", this.guildId, `Player has informed the Discord Gateway to Establish Voice Connectivity in ${voiceChannel} Voice Channel, Awaiting Confirmation(Via Voice State Update & Voice Server Update events)`);
    }

    stop() {
        this.position = 0;
        this.playing = false;
        this.node.rest.updatePlayer({
            guildId: this.guildId,
            data: { track: { encoded: null } },
        });

        return this;
    }

    pause(toggle = true) {
        this.node.rest.updatePlayer({
            guildId: this.guildId,
            data: { paused: toggle },
        });

        this.playing = !toggle;
        this.paused = toggle;

        return this;
    }

    seek(position) {
        const trackLength = this.current.info.length;
        this.position = Math.max(0, Math.min(trackLength, position));

        this.node.rest.updatePlayer({ guildId: this.guildId, data: { position } });
    }

    setVolume(volume) {
        if (volume < 0 || volume > 1000) {
            throw new Error("[Volume] Volume must be between 0 to 1000");
        }

        this.node.rest.updatePlayer({ guildId: this.guildId, data: { volume } });
        this.volume = volume;
        return this;
    }

    setLoop(mode) {
        if (!mode) {
            throw new Error("You must provide the loop mode as an argument for setLoop");
        }

        if (!["none", "track", "queue"].includes(mode)) {
            throw new Error("setLoop arguments must be 'none', 'track', or 'queue'");
        }

        this.loop = mode;
        return this;
    }

    setTextChannel(channel) {
        if (typeof channel !== "string") throw new TypeError("Channel must be a non-empty string.");
        this.textChannel = channel;
        return this;
    }

    setVoiceChannel(channel, options) {
        if (typeof channel !== "string") throw new TypeError("Channel must be a non-empty string.");

        if (this.connected && channel === this.voiceChannel) {
            throw new ReferenceError(`Player is already connected to ${channel}`);
        }

        this.voiceChannel = channel;

        if (options) {
            this.mute = options.mute ?? this.mute;
            this.deaf = options.deaf ?? this.deaf;
        }

        this.connect({
            deaf: this.deaf,
            guildId: this.guildId,
            voiceChannel: this.voiceChannel,
            textChannel: this.textChannel,
            mute: this.mute,
        });

        return this;
    }

    disconnect() {
        if (!this.voiceChannel) {
            return;
        }

        this.connected = false;
        this.send({
            guild_id: this.guildId,
            channel_id: null,
            self_mute: false,
            self_deaf: false,
        });

        this.voiceChannel = null;
        return this;
    }

    destroy() {
        if (this._idleTimeout) clearTimeout(this._idleTimeout);
        this.disconnect();

        this.node.rest.destroyPlayer(this.guildId);

        this.riffy.emit("playerDisconnect", this);
        this.riffy.emit("debug", this.guildId, "Destroyed the player");

        this.riffy.players.delete(this.guildId);
    }

    async handleEvent(payload) {
        const player = this.riffy.players.get(payload.guildId);
        if (!player) return;
        const track = this.current;
        await this._runBeforeHooks(payload.type, player, track, payload);

        // if (this.node.rest.version === "v4") {
        //     track.info.thumbnail = await track.info.thumbnail;
        // } else {
        //     track.info.thumbnail = await track.info.thumbnail;
        // }

        switch (payload.type) {
            case "TrackStartEvent":
                this.trackStart(player, track, payload);
                break;

            case "TrackEndEvent":
                this.trackEnd(player, track, payload);
                break;

            case "TrackExceptionEvent":
                this.trackError(player, track, payload);
                break;

            case "TrackStuckEvent":
                this.trackStuck(player, track, payload);
                break;

            case "WebSocketClosedEvent":
                this.socketClosed(player, payload);
                break;

            default:
                const error = new Error(`Node encountered an unknown event: '${payload.type}'`);
                this.riffy.emit("nodeError", this, error);
                break;
        }
        await this._runAfterHooks(payload.type, player, track, payload);
    }

    trackStart(player, track, payload) {
        this.playing = true;
        this.paused = false;
        this.riffy.emit(`debug`, `Player (${player.guildId}) has started playing ${track.info.title} by ${track.info.author}`);
        this.riffy.emit("trackStart", player, track, payload);
    }

    trackEnd(player, track, payload) {
        this.addToPreviousTrack(track)
        const previousTrack = this.previous;
        // By using lower case We handle both Lavalink Versions(v3, v4) Smartly 😎, 
        // If reason is replaced do nothing expect User do something hopefully else RIP.
        if(payload.reason.toLowerCase() === "replaced") return this.riffy.emit("trackEnd", player, track, payload);

        // Replacing & to lower case it Again Smartly 😎, Handled Both Lavalink Versions.
        // This avoids track that got cleaned-up or failed to load to be played again (Via Loop Mode).
        if(["loadfailed", "cleanup"].includes(payload.reason.replace("_", "").toLowerCase())) {

            if(player.queue.length === 0) { 
                this.playing = false;
                this.riffy.emit("debug", `Player (${player.guildId}) Track-Ended(${track.info.title}) with reason: ${payload.reason}, emitting queueEnd instead of trackEnd as queue is empty/finished`);
                return this.riffy.emit("queueEnd", player);
            }

            this.riffy.emit("trackEnd", player, track, payload);
            return this.play();
        }

        this.riffy.emit("debug", `Player (${player.guildId}) has the track ${track.info.title} by ${track.info.author} ended with reason: ${payload.reason}`);

        if (this.loop === "track") {
            player.queue.unshift(previousTrack);
            this.riffy.emit("debug", `Player (${player.guildId}) looped track ${track.info.title} by ${track.info.author}, as loop mode is set to 'track'`);
            this.riffy.emit("trackEnd", player, track, payload);
            return this.play();
        }

        else if (track && this.loop === "queue") {
            player.queue.push(previousTrack);
            this.riffy.emit("debug", `Player (${player.guildId}) looping Queue, as loop mode is set to 'queue'`);
            this.riffy.emit("trackEnd", player, track, payload);
            return this.play();
        }

        if (player.queue.length === 0) {
            this.playing = false;
            return this.riffy.emit("queueEnd", player);
        }

        else if (player.queue.length > 0) {
            this.riffy.emit("trackEnd", player, track, payload);
            return this.play();
        }

        this.playing = false;
        this.riffy.emit("queueEnd", player);
    }

    trackError(player, track, payload) {
        this.riffy.emit("debug", `Player (${player.guildId}) has an exception/error while playing ${track.info.title} by ${track.info.author} this track, exception received: ${inspect(payload.exception)}`);
        this.riffy.emit("trackError", player, track, payload);
        this.stop();
    }

    trackStuck(player, track, payload) {
        this.riffy.emit("trackStuck", player, track, payload);
        this.riffy.emit("debug", `Player (${player.guildId}) has been stuck track ${track.info.title} by ${track.info.author} for ${payload.thresholdMs}ms, skipping track...`);
        this.stop();
    }

    socketClosed(player, payload) {
        if ([4015, 4009].includes(payload.code)) {
            this.send({
                guild_id: payload.guildId,
                channel_id: this.voiceChannel,
                self_mute: this.mute,
                self_deaf: this.deaf,
            });
        }

        this.riffy.emit("socketClosed", player, payload);
        this.pause(true);
        this.riffy.emit("debug", `Player (${player.guildId}) Voice Connection has been closed with code: ${payload.code}, Player paused(to any track playing). some possible causes: Voice channel deleted, Or Client(Bot) was kicked`);
    }


    send(data) {
        this.riffy.send({ op: 4, d: data });
    }

    set(key, value) {
        return this.data[key] = value;
    }

    get(key) {
        return this.data[key];
    }

    /**
    * @description clears All custom Data set on the Player
    */ 
    clearData() {
      for (const key in this.data) {
        if (this.data.hasOwnProperty(key)) {
          delete this.data[key];
        }
      }
      return this;
    }

    /**
     * Per-guild/user config for this player. Falls back to riffy.options.
     * @type {object}
     */
    config = {};
    /**
     * Sets a config value for this player.
     * @param {string} key
     * @param {any} value
     */
    setConfig(key, value) {
        this.config[key] = value;
        this.riffy.emit('playerConfigChanged', this, key, value);
    }
    /**
     * Gets a config value for this player, falling back to riffy.options.
     * @param {string} key
     * @returns {any}
     */
    getConfig(key) {
        return this.config[key] !== undefined ? this.config[key] : this.riffy.options[key];
    }
    /**
     * Returns diagnostics for this player (state, queue, track info).
     * @returns {object}
     */
    getDiagnostics() {
        return {
            guildId: this.guildId,
            textChannel: this.textChannel,
            voiceChannel: this.voiceChannel,
            playing: this.playing,
            paused: this.paused,
            connected: this.connected,
            volume: this.volume,
            loop: this.loop,
            queueLength: this.queue.length,
            currentTrack: this.current ? {
                title: this.current.info?.title,
                author: this.current.info?.author,
                length: this.current.info?.length,
                identifier: this.current.info?.identifier,
            } : null,
            previousTracks: this.previousTracks.map(t => t.info?.title),
            config: { ...this.config },
        };
    }

    /**
     * Serialize the full player state for autoResume.
     * @returns {object}
     */
    toJSON() {
        return {
            guildId: this.guildId,
            textChannel: this.textChannel,
            voiceChannel: this.voiceChannel,
            volume: this.volume,
            loop: this.loop,
            playing: this.playing,
            paused: this.paused,
            connected: this.connected,
            position: this.position,
            timestamp: this.timestamp,
            ping: this.ping,
            current: this.current,
            queue: this.queue,
            previousTracks: this.previousTracks,
            data: this.data,
            filters: this.filters && typeof this.filters.getPayload === 'function' ? this.filters.getPayload() : null
        };
    }

    /**
     * Reconstruct a Player from saved state (for autoResume).
     * @param {import("./Riffy").Riffy} riffy
     * @param {Node} node
     * @param {object} data
     * @returns {Player}
     */
    static fromJSON(riffy, node, data) {
        const player = new Player(riffy, node, {
            guildId: data.guildId,
            textChannel: data.textChannel,
            voiceChannel: data.voiceChannel,
            defaultVolume: data.volume,
            loop: data.loop,
        });
        player.playing = data.playing;
        player.paused = data.paused;
        player.connected = data.connected;
        player.position = data.position;
        player.timestamp = data.timestamp;
        player.ping = data.ping;
        player.current = data.current;
        player.queue = data.queue || [];
        player.previousTracks = data.previousTracks || [];
        player.data = data.data || {};
        if (data.filters && player.filters && typeof player.filters.setPayload === 'function') {
            player.filters.setPayload(data.filters);
        }
        return player;
    }

    /**
     * Resume playback at the saved position, with filters and volume.
     */
    async restart() {
        try {
            if (!this.current || !this.connected) return;
            const resumePosition = this.position || 0;
            const data = {
                track: { encoded: this.current.track },
                position: resumePosition,
                paused: this.paused,
                volume: this.volume,
            };
            if (this.filters && typeof this.filters.getPayload === 'function') {
                const filterPayload = this.filters.getPayload();
                if (filterPayload && Object.keys(filterPayload).length > 0) {
                    data.filters = filterPayload;
                }
            }
            await this.node.rest.updatePlayer({
                guildId: this.guildId,
                data,
            });
            this.position = resumePosition;
            this.playing = !this.paused;
            this.riffy.emit("debug", this.guildId, `Player state restored after node reconnect (autoResume) at position ${resumePosition}ms`);
        } catch (err) {
            this.riffy.emit('playerError', this, err);
            throw err;
        }
    }

    /**
     * Fetch lyrics (plain and synced) for the current track or a custom query.
     * @param {Object|null} queryOverride - Optional custom query { track_name, artist_name, album_name }
     * @returns {Promise<{lyrics?: string, syncedLyrics?: string, error?: string, metadata?: Object}>}
     */
    async getLyrics(queryOverride = null) {
        if (!this.current && !queryOverride) {
            return { error: 'No track is currently playing.' };
        }
        if (!lrclibClient) {
            return { error: 'Lyrics functionality not available. Install lrclib-api package.' };
        }
        try {
            let query;
            if (queryOverride) {
                query = { ...queryOverride };
            } else {
                const info = this.current.info;
                let author = info.author;
                if (!author && info.requester && info.requester.username) {
                    author = info.requester.username;
                }
                if (!author) {
                    author = 'Unknown Artist';
                }
                query = {
                    track_name: info.title,
                    artist_name: author
                };
                if (info.pluginInfo?.albumName) {
                    query.album_name = info.pluginInfo.albumName;
                }
            }
            this.riffy.emit('debug', this.guildId, `Lyrics query: ${JSON.stringify(query)}`);
            if (!query.track_name || !query.artist_name) {
                return { error: 'Track information incomplete.' };
            }
            const meta = await lrclibClient.findLyrics(query);
            if (!meta) {
                return { error: 'Lyrics not found for this track.' };
            }
            const result = {
                metadata: {
                    id: meta.id,
                    trackName: meta.trackName,
                    artistName: meta.artistName,
                    albumName: meta.albumName,
                    duration: meta.duration,
                    instrumental: meta.instrumental
                }
            };
            if (meta.syncedLyrics) {
                result.syncedLyrics = meta.syncedLyrics;
                result.lyrics = meta.plainLyrics;
            } else if (meta.plainLyrics) {
                result.lyrics = meta.plainLyrics;
            } else {
                return { error: 'No lyrics available for this track.' };
            }
            return result;
        } catch (error) {
            this.riffy.emit('debug', this.guildId, `Lyrics fetch error: ${error.message}`);
            return { error: `Failed to fetch lyrics: ${error.message}` };
        }
    }

    /**
     * Get the current lyric line based on playback position (for synced lyrics)
     * @param {string} syncedLyrics - LRC formatted lyrics string
     * @param {number} currentTimeMs - Current playback position in milliseconds
     * @returns {string} Current lyric line or empty string
     */
    getCurrentLyricLine(syncedLyrics, currentTimeMs = this.position) {
        if (!syncedLyrics || !currentTimeMs) {
            return '';
        }
        try {
            const lines = syncedLyrics.split('\n');
            let currentLine = '';
            for (const line of lines) {
                const timeMatch = line.match(/\[(\d{2}):(\d{2})\.(\d{2})\]/);
                if (timeMatch) {
                    const minutes = parseInt(timeMatch[1]);
                    const seconds = parseInt(timeMatch[2]);
                    const centiseconds = parseInt(timeMatch[3]);
                    const lineTimeMs = (minutes * 60 + seconds) * 1000 + centiseconds * 10;
                    if (currentTimeMs >= lineTimeMs) {
                        currentLine = line.replace(/\[\d{2}:\d{2}\.\d{2}\]/, '').trim();
                    } else {
                        break;
                    }
                }
            }
            return currentLine;
        } catch (error) {
            this.riffy.emit('debug', this.guildId, `Lyric line parsing error: ${error.message}`);
            return '';
        }
    }
}

module.exports = { Player };
