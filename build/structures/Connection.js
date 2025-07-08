/**
 * Manages the voice connection state for a player.
 */
class Connection {
    /**
     * @param {import("../index").Player} player - The player instance this connection belongs to.
     */
    constructor(player) {
        this.player = player;
        this.sessionId = null;
        this.voice = {
            sessionId: null,
            event: null,
            endpoint: null,
        };
        this.region = null;
        this.self_deaf = false;
        this.self_mute = false;
        this.voiceChannel = player.voiceChannel;
        /** @private */
        this._beforeHooks = {};
        /** @private */
        this._afterHooks = {};
        /**
         * Arbitrary user/plugin data.
         * @type {object}
         */
        this.customData = {};
        this._idleTimeout = null;
        this._setupIdleCleanup();
    }

    /**
     * Sets up idle cleanup: destroys connection if not associated with a player for 5 minutes.
     * @private
     */
    _setupIdleCleanup() {
        const checkIdle = () => {
            if (!this.player || !this.player.connected) {
                this._cleanup();
            } else {
                this._idleTimeout = setTimeout(checkIdle, 5 * 60 * 1000);
            }
        };
        this._idleTimeout = setTimeout(checkIdle, 5 * 60 * 1000);
    }
    /**
     * Cleanup resources.
     * @private
     */
    _cleanup() {
        if (this._idleTimeout) clearTimeout(this._idleTimeout);
        // Null out references
        this.player = null;
        this.voice = null;
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
     * Handles VOICE_SERVER_UPDATE packets from Discord.
     * @param {object} data - The voice server update data.
     */
    async setServerUpdate(data) {
        try {
            await this._runBeforeHooks('setServerUpdate', data);
            const { endpoint, token } = data;
            if (!endpoint) throw new Error(`Missing 'endpoint' in VOICE_SERVER_UPDATE. Try disconnecting and reconnecting the bot to the voice channel.`);
            const previousVoiceRegion = this.region;
            this.voice.endpoint = endpoint;
            this.voice.token = token;
            this.region = endpoint.split(".").shift()?.replace(/[0-9]/g, "") || null;
            this.player.riffy.emit("debug", `[Player ${this.player.guildId} - CONNECTION] Received voice server, ${previousVoiceRegion !== null ? `Changed Voice Region from(oldRegion) ${previousVoiceRegion} to(newRegion) ${this.region}` : `Voice Server: ${this.region}`}, Updating Node's Voice Data.`)
            if (this.player.paused) {
                this.player.riffy.emit(
                    "debug",
                    this.player.node.name,
                    `unpaused ${this.player.guildId} player, expecting it was paused while the player moved to ${this.voiceChannel}`
                );
                this.player.pause(false);
            }
            this.updatePlayerVoiceData();
            await this._runAfterHooks('setServerUpdate', data);
        } catch (err) {
            this.player.riffy.emit('connectionError', this, err);
            throw err;
        }
    }

    /**
     * Handles VOICE_STATE_UPDATE packets from Discord.
     * @param {object} data - The voice state update data.
     */
    async setStateUpdate(data) {
        try {
            await this._runBeforeHooks('setStateUpdate', data);
            const { session_id, channel_id, self_deaf, self_mute } = data;
            this.player.riffy.emit("debug", `[Player ${this.player.guildId} - CONNECTION] Received Voice State Update Informing the player ${channel_id !== null ? `Connected to ${this.voiceChannel}` : `Disconnected from ${this.voiceChannel}`}`)
            if(channel_id == null) {
                this.player.destroy();
                this.player.riffy.emit("playerDestroy", this.player);
            }
            if (this.player.voiceChannel && channel_id && this.player.voiceChannel !== channel_id) {
                this.player.riffy.emit("playerMove", this.player.voiceChannel, channel_id)
                this.player.voiceChannel = channel_id;
                this.voiceChannel = channel_id
            }
            this.self_deaf = self_deaf;
            this.self_mute = self_mute;
            this.voice.sessionId = session_id || null;
            await this._runAfterHooks('setStateUpdate', data);
        } catch (err) {
            this.player.riffy.emit('connectionError', this, err);
            throw err;
        }
    }

    /**
     * Updates the player's voice data on the node.
     */
    updatePlayerVoiceData() {
        this.player.riffy.emit("debug", this.player.node.name, `[Rest Manager] Sending an Update Player request with data: ${JSON.stringify({ voice: this.voice })}`)
        this.player.node.rest.updatePlayer({
            guildId: this.player.guildId,
            data: Object.assign({ 
                voice: this.voice,
                /**
                 * Need a better way so that we don't the volume each time.
                 */
                volume: this.player.volume,
             }),
        });
    }

    /**
     * Returns diagnostics for this connection.
     * @returns {object}
     */
    getDiagnostics() {
        return {
            region: this.region,
            sessionId: this.sessionId,
            voiceChannel: this.voiceChannel,
            self_deaf: this.self_deaf,
            self_mute: this.self_mute,
            playerId: this.player?.guildId,
        };
    }
}

module.exports = { Connection };
