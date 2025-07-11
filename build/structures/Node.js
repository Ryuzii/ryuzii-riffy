const Websocket = require("ws");
const { Rest } = require("./Rest");
const { Track } = require("./Track");

/**
 * Represents a Lavalink node connection and its state.
 * @extends EventEmitter
 */
class Node {
    /**
     * @param {Riffy} riffy - The Riffy instance.
     * @param {object} nodeOptions - Node config.
     * @param {object} riffyOptions - Riffy global options.
     */
    constructor(riffy, nodeOptions, riffyOptions) {
        this.riffy = riffy;
        this.options = nodeOptions;
        this.globalOptions = riffyOptions;
        // Use node management options
        this.dynamicSwitching = riffyOptions.node?.dynamicSwitching ?? true;
        this.autoReconnect = riffyOptions.node?.autoReconnect ?? true;
        this.wsReconnectTries = riffyOptions.node?.ws?.reconnectTries ?? 5;
        this.wsReconnectInterval = riffyOptions.node?.ws?.reconnectInterval ?? 5000;
        // Use REST options
        this.restRetryCount = riffyOptions.rest?.retryCount ?? 3;
        this.restTimeout = riffyOptions.rest?.timeout ?? 5000;
        // Use debug option
        this.debug = riffyOptions.debug ?? false;
        // TODO: Pass restRetryCount and restTimeout to Rest.js
        // TODO: Use dynamicSwitching and autoReconnect in reconnect/autoFailover logic
        // TODO: Use debug to control debug event emission
        this.name = nodeOptions.name || nodeOptions.host;
        this.host = nodeOptions.host || "localhost";
        this.port = nodeOptions.port || 2333;
        this.password = nodeOptions.password || "youshallnotpass";
        // Use REST version: prefer nodeOptions.restVersion, then riffyOptions.rest.version, then 'v4'
        this.restVersion = nodeOptions.restVersion || riffyOptions.rest?.version || 'v4';
        this.secure = nodeOptions.secure || false;
        this.sessionId = nodeOptions.sessionId || null;
        this.rest = new Rest(riffy, this);

        if (this.restVersion === "v4") {
            this.wsUrl = `ws${this.secure ? "s" : ""}://${this.host}:${this.port}/v4/websocket`;
        } else {
            this.wsUrl = `ws${this.secure ? "s" : ""}://${this.host}:${this.port}`;
        }

        this.restUrl = `http${this.secure ? "s" : ""}://${this.host}:${this.port}`;
        this.ws = null;
        this.regions = nodeOptions.regions;
        /**
         * Lavalink Info fetched While/After connecting.
         * @type {import("..").NodeInfo | null}
         */
        this.info = null;
        this.stats = {
            players: 0,
            playingPlayers: 0,
            uptime: 0,
            memory: {
                free: 0,
                used: 0,
                allocated: 0,
                reservable: 0,
            },
            cpu: {
                cores: 0,
                systemLoad: 0,
                lavalinkLoad: 0,
            },
            frameStats: {
                sent: 0,
                nulled: 0,
                deficit: 0,
            },
        };

        this.connected = false;

        this.resumeKey = riffyOptions.resume?.key || null;
        this.resumeTimeout = riffyOptions.resume?.timeout || 60;
        this.autoResume = riffyOptions.resume?.enabled || false;

        this.reconnectBaseTimeout = riffyOptions.node?.ws?.reconnectInterval || 5000; // New: base delay
        this.reconnectMaxTimeout = 120000; // New: max delay (2min)
        this.reconnectTimeout = this.reconnectBaseTimeout; // Use as current delay
        this.reconnectTries = riffyOptions.node?.ws?.reconnectTries || 3;
        this.reconnectAttempt = null;
        this.reconnectAttempted = 1;
        this.unhealthy = false; // New: health status

        this.lastStats = Date.now();
        /** @private */
        this._beforeHooks = {};
        /** @private */
        this._afterHooks = {};
        /**
         * Arbitrary user/plugin data.
         * @type {object}
         */
        this.customData = {};
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

    lyrics = {
        /**
         * Checks if the node has all the required plugins available.
         * @param {boolean} [eitherOne=true] If set to true, will return true if at least one of the plugins is present.
         * @param {...string} plugins The plugins to look for.
         * @returns {Promise<boolean>} If the plugins are available.
         * @throws {RangeError} If the plugins are missing.
         */
        checkAvailable: async (eitherOne=true,...plugins) => {
            console.log("checkAvailable - plugins", ...plugins)
            if (!this.sessionId) throw new Error(`Node (${this.name}) is not Ready/Connected.`)
            if (!plugins.length) plugins = ["lavalyrics-plugin", "java-lyrics-plugin", "lyrics"];

            const missingPlugins = [];

            plugins.forEach((plugin) => {
                const p = this.info.plugins.find((p) => p.name === plugin)

                if (!p) {
                    missingPlugins.push(plugin)
                    return false;
                }

                return true;
            });

            const AllPluginsMissing = missingPlugins.length === plugins.length;

            if (eitherOne && AllPluginsMissing) {
                throw new RangeError(`Node (${this.name}) is missing plugins: ${missingPlugins.join(", ")} (required for Lyrics)`)
            } else if (!eitherOne && missingPlugins.length) {
                throw new RangeError(`Node (${this.name}) is missing plugins: ${missingPlugins.join(", ")} (required for Lyrics)`)
            }

            return true
        },

        /**
         * Fetches lyrics for a given track or encoded track string.
         * 
         * @param {Track|string} trackOrEncodedTrackStr - The track object or encoded track string.
         * @param {boolean} [skipTrackSource=false] - Whether to skip the track source and fetch from the highest priority source (configured on Lavalink Server).
         * @returns {Promise<Object|null>} The lyrics data or null if the plugin is unavailable Or If no lyrics were found OR some Http request error occured.
         * @throws {TypeError} If `trackOrEncodedTrackStr` is not a `Track` or `string`.
         */
        get: async (trackOrEncodedTrackStr, skipTrackSource=false) => {
            if (!(await this.lyrics.checkAvailable(false, "lavalyrics-plugin"))) return null;
            if(!(trackOrEncodedTrackStr instanceof Track) && typeof trackOrEncodedTrackStr !== "string") throw new TypeError(`Expected \`Track\` or \`string\` for \`trackOrEncodedTrackStr\` in "lyrics.get" but got \`${typeof trackOrEncodedTrackStr}\``)

            let encodedTrackStr = typeof trackOrEncodedTrackStr === "string" ? trackOrEncodedTrackStr : trackOrEncodedTrackStr.track;

            return await this.rest.makeRequest("GET",`/v4/lyrics?skipTrackSource=${skipTrackSource}&track=${encodedTrackStr}`);
        },

        /** @description fetches Lyrics for Currently playing Track 
         * @param {string} guildId The Guild Id of the Player
         * @param {boolean} skipTrackSource skips the Track Source & fetches from highest priority source (configured on Lavalink Server) 
         * @param {string} [plugin] The Plugin to use(**Only required if you have too many known (i.e java-lyrics-plugin, lavalyrics-plugin) Lyric Plugins**)
         */
        getCurrentTrack: async (guildId, skipTrackSource=false, plugin) => {
            const DEFAULT_PLUGIN = "lavalyrics-plugin"
            if (!(await this.lyrics.checkAvailable())) return null;

            const nodePlugins = this.info?.plugins;
            let requestURL = `/v4/sessions/${this.sessionId}/players/${guildId}/track/lyrics?skipTrackSource=${skipTrackSource}&plugin=${plugin}`
            
            // If no `plugin` param is specified, check for `java-lyrics-plugin` or `lyrics` (also if lavalyrics-plugin is not available)
            if(!plugin && (nodePlugins.find((p) => p.name === "java-lyrics-plugin") || nodePlugins.find((p) => p.name === "lyrics")) && !(nodePlugins.find((p) => p.name === DEFAULT_PLUGIN))) {
                requestURL = `/v4/sessions/${this.sessionId}/players/${guildId}/lyrics?skipTrackSource=${skipTrackSource}`
            } else if(plugin && ["java-lyrics-plugin", "lyrics"].includes(plugin)) {
                // If `plugin` param is specified, And it's one of either `lyrics` or `java-lyrics-plugin`
                requestURL = `/v4/sessions/${this.sessionId}/players/${guildId}/lyrics?skipTrackSource=${skipTrackSource}`
            }

            return await this.rest.makeRequest("GET", `${requestURL}`)
        }
    }

    /**
     * @typedef {Object} fetchInfoOptions
     * @property {import("..").Version} [restVersion] The Rest Version to fetch info the from, Default: one set in the constructor(Node.restVersion)
     * @property {boolean} [includeHeaders=false] Whether to include headers in the response returned.
     * 
     * @param {fetchInfoOptions} options 
     */
    async fetchInfo(options = { restVersion: this.restVersion, includeHeaders: false }) {

        return await this.rest.makeRequest("GET", `/${options.restVersion || this.restVersion}/info`, null, options.includeHeaders)
    }

    /**
     * Fetches Lavalink Node's Version and checks If it's supported by Riffy (v3 and v4)
     * Destroys the Lavalink Node if it's not supported.
     * @todo Probably to wait until version checks are completed before continuing to connnect to Lavalink.
     * @todo Add option to skip the version checks in-case needed.
     * @private
     */
    // async #fetchAndCheckVersion() {
    //     console.log(this.restVersion == "v3" ? "v4" : "v3")
    //     await Promise.all([this.fetchInfo({ includeHeaders: true }), this.fetchInfo({ restVersion: this.restVersion == "v3" ? "v4" : "v3", includeHeaders: true })]).then(([restVersionRequest, flippedRestRequest]) => {
    //         console.log(restVersionRequest, flippedRestRequest)
    //         /**
    //          * Lavalink Node's Version that was fetched, checks and uses the succeeded request
    //          * Uses `lavalink-api-version` header if `major` property isn't available/is `0` in the request, it can use either one variable. Defaults to `0` if `lavalink-api-version` isn't available.
    //          */
    //         console.log((
    //             ("version" in restVersionRequest?.data && restVersionRequest.data) ||
    //             flippedRestRequest?.data
    //         ).version)
    //         const nodeFetchedVersionObj = Object.assign(
    //             (
    //                 ("version" in restVersionRequest?.data && restVersionRequest.data) ||
    //                 flippedRestRequest?.data
    //             ).version,
    //             {
    //                 major: !(restVersionRequest?.data?.version || flippedRestRequest?.data?.version)?.major
    //                     ? Number(
    //                         (restVersionRequest || flippedRestRequest).headers.get("lavalink-api-version")
    //                     ) || 0
    //                     : (restVersionRequest?.data?.version || flippedRestRequest?.data?.version)?.major,
    //             }
    //         );

    //         if (restVersionRequest?.data?.status == 404) this.riffy.emit(
    //             "debug",
    //             `[Node (${this.name}) - Version Check] ${this.restVersion
    //             } set By User/Defaulted Version Check Failed, attempted ${this.restVersion == "v3" ? "v4" : "v3"
    //             } For version Checking`
    //         );

    //         if (flippedRestRequest?.data?.status === 404 && restVersionRequest?.data?.status === 404) {
    //             this.riffy.emit("debug", `[Node (${this.name}) - Version Check] Both Version Checks failed, Disconnecting Gracefully & Throwing Error`)

    //             // Disconnect Websocket & Destroy the players(if any created - Just incase)
    //             this.destroy()

    //             throw new Error(`${this.name}(${this.host}) is using unsupported Lavalink Version, Supported Lavalink Versions are v3 and v4.`)
    //         }

    //         if (restVersionRequest?.data?.status !== 404 || flippedRestRequest?.data?.status !== 404) {
    //             this.riffy.emit(
    //                 "debug",
    //                 `[Node (${this.name}) - Version Check] Check ${restVersionRequest?.status === 404 ? "Un" : ""}successful Lavalink Server uses ${nodeFetchedVersionObj.semver} ${restVersionRequest.status === 404 ? `Doesn't match with restVersion: ${this.restVersion}, Provided in Riffy Options` : ""}`
    //             );

    //             // If defaulted/user-specified fails Graceful Destroy/close the node's connection.
    //             if (restVersionRequest?.data?.status === 404) {
    //                 this.riffy.emit("debug", `[Node (${this.name}) - Version Check] Disconnecting Gracefully & Throwing Error`)

    //                 // Disconnect Websocket & Destroy the players(if any created - Just incase)
    //                 this.destroy()

    //                 throw new Error(`${this.name} is specified/defaulted to use ${this.restVersion}, but found using Lavalink version v${nodeFetchedVersionObj.major}, TIP: Set 'restVersion' property to "v${nodeFetchedVersionObj.major}" in Riffy Class's Options(Riffy Options)`);
    //             }
    //         }

    //         const { headers, ...restVersionRequestWithoutHeaders } = restVersionRequest;

    //         // If `restVersionRequest` isn't failed then update the `info` or set it back to empty Object.
    //         this.info = !("status" in restVersionRequest.data) ? restVersionRequestWithoutHeaders : {};
    //     }).catch((error) => {
    //         this.destroy()
    //         throw new Error("Failed to validate Lavalink Node's Version, possible causes: Lavalink Server is offline, Request Timeout.", { cause: error});
    //     })
    // }

    async connect() {
        await this._runBeforeHooks('connect');
        if (this.ws) this.ws.close()
        this.riffy.emit('debug', this.name, `Checking Node Version`);

        // // Preform Version Check To see If Lavalink Version is supported by Riffy (v3, v4)
        // await this.#fetchAndCheckVersion();

        const headers = {
            "Authorization": this.password,
            "User-Id": this.riffy.clientId,
            "Client-Name": `Riffy/${this.riffy.version}`,
        };

        if (this.restVersion === "v4") {
            if (this.sessionId) headers["Session-Id"] = this.sessionId;
        } else {
            if (this.resumeKey) headers["Resume-Key"] = this.resumeKey;
        }

        this.ws = new Websocket(this.wsUrl, { headers });
        this.ws.on("open", this.open.bind(this));
        this.ws.on("error", this.error.bind(this));
        this.ws.on("message", this.message.bind(this));
        this.ws.on("close", this.close.bind(this));
        await this._runAfterHooks('connect');
    }

    async open() {
        if (this.reconnectAttempt) clearTimeout(this.reconnectAttempt);
        this.reconnectTimeout = this.reconnectBaseTimeout; // Reset backoff on success
        this.reconnectAttempted = 1;
        this.unhealthy = false;
        this.connected = true;
        this.riffy.emit('nodeReconnectSuccess', this);
        this.riffy.emit('debug', this.name, `Connection with Lavalink established on ${this.wsUrl}`);

        this.info = await this.fetchInfo().then((info) => this.info = info).catch((e) => (console.error(`Node (${this.name}) Failed to fetch info (${this.restVersion}/info) on WS-OPEN: ${e}`), null));

        if (!this.info && !this.options.bypassChecks.nodeFetchInfo) {
            throw new Error(`Node (${this.name} - URL: ${this.restUrl}) Failed to fetch info on WS-OPEN`);
        }

        if (this.autoResume) {
            for (const player of this.riffy.players.values()) {
                if (player.node === this) {
                    player.restart();
                }
            }
        }
    }

    error(event) {
        if (!event) return;
        this.riffy.emit("nodeError", this, event);
    }

    message(msg) {
        if (Array.isArray(msg)) msg = Buffer.concat(msg);
        else if (msg instanceof ArrayBuffer) msg = Buffer.from(msg);

        const payload = JSON.parse(msg.toString());
        if (!payload.op) return;

        this.riffy.emit("raw", "Node", payload);
        this.riffy.emit("debug", this.name, `Lavalink Node Update : ${JSON.stringify(payload)}`);

        if (payload.op === "stats") {
            this.stats = { ...payload };
            this.lastStats = Date.now();
        }

        if (payload.op === "ready") {
            if (this.sessionId !== payload.sessionId) {
                this.rest.setSessionId(payload.sessionId);
                this.sessionId = payload.sessionId;
            }

            this.riffy.emit("nodeConnect", this);

            this.riffy.emit("debug", this.name, `Ready Payload received ${JSON.stringify(payload)}`);

            if (this.restVersion === "v4") {
                if (this.sessionId) {
                    this.rest.makeRequest(`PATCH`, `/${this.rest.version}/sessions/${this.sessionId}`, { resuming: true, timeout: this.resumeTimeout });
                    this.riffy.emit("debug", this.name, `Resuming configured on Lavalink`);
                }
            } else {
                if (this.resumeKey) {
                    this.rest.makeRequest(`PATCH`, `/${this.rest.version}/sessions/${this.sessionId}`, { resumingKey: this.resumeKey, timeout: this.resumeTimeout });
                    this.riffy.emit("debug", this.name, `Resuming configured on Lavalink`);
                }
            }
        }

        const player = this.riffy.players.get(payload.guildId);
        if (payload.guildId && player) player.emit(payload.op, payload);
    }

    async close(event, reason) {
        await this._runBeforeHooks('close', event, reason);
        this.riffy.emit("nodeDisconnect", this, { event, reason });
        this.riffy.emit("debug", `Connection with Lavalink closed with Error code : ${event || "Unknown code"}, reason: ${reason || "Unknown reason"}`);

        this.connected = false;
        this.reconnect();
        await this._runAfterHooks('close', event, reason);
    }

    /**
     * Attempts to reconnect to the node with exponential backoff.
     * Emits events for each attempt, failure, and success.
     */
    async reconnect() {
        await this._runBeforeHooks('reconnect');
        if (this.unhealthy) return; // Don't reconnect if marked unhealthy
        this.riffy.emit("nodeReconnectAttempt", this, {
            attempt: this.reconnectAttempted,
            delay: this.reconnectTimeout,
        });
        this.reconnectAttempt = setTimeout(() => {
            if (this.reconnectAttempted >= this.reconnectTries) {
                this.unhealthy = true;
                const error = new Error(`Unable to connect with ${this.name} node after ${this.reconnectTries} attempts. Node marked as unhealthy.`);
                this.riffy.emit("nodeReconnectFailed", this, error);
                this.riffy.emit("nodeError", this, error);
                return this.destroy();
            }
            this.ws?.removeAllListeners();
            this.ws = null;
            this.riffy.emit("nodeReconnect", this, {
                attempt: this.reconnectAttempted,
                delay: this.reconnectTimeout,
            });
            this.connect();
            this.reconnectAttempted++;
            // Exponential backoff: double the delay, up to max
            this.reconnectTimeout = Math.min(this.reconnectTimeout * 2, this.reconnectMaxTimeout);
        }, this.reconnectTimeout);
        await this._runAfterHooks('reconnect');
    }

/**
 * Destroys the node connection and cleans up resources.
 * 
 * @param {boolean} [clean=false] - Determines if a clean destroy should be performed.
 *                                  ### If `clean` is `true`
 *                                  it removes all listeners and nullifies the websocket,
 *                                  emits a "nodeDestroy" event, and deletes the node from the nodes map.
 *                                  ### If `clean` is `false`
 *                                  it performs the full disconnect process which includes:
 *                                  - Destroying all players associated with this node.
 *                                  - Closing the websocket connection.
 *                                  - Removing all listeners and nullifying the websocket.
 *                                  - Clearing any reconnect attempts.
 *                                  - Emitting a "nodeDestroy" event.
 *                                  - Deleting the node from the node map.
 *                                  - Setting the connected state to false.
 */
    destroy(clean=false) {
        if(clean) {
            this.ws?.removeAllListeners();
            this.ws = null;
            this.riffy.emit("nodeDestroy", this);
            this.riffy.nodes.delete(this.name);
            return;
        }

        if (!this.connected) return;

        this.riffy.players.forEach((player) => {
            if (player.node !== this) return;

            player.destroy()
        });

        if (this.ws) this.ws.close(1000, "destroy");
        this.ws?.removeAllListeners();
        this.ws = null;

        clearTimeout(this.reconnectAttempt);

        this.riffy.emit("nodeDestroy", this);

        this.riffy.nodeMap.delete(this.name);
        this.connected = false;
    }

    disconnect() {
        if (!this.connected) return;
        this.riffy.players.forEach((player) => { if (player.node == this) { player.move() } });
        this.ws.close(1000, "destroy");
        this.ws?.removeAllListeners();
        this.ws = null;
        this.riffy.nodes.delete(this.name);
        this.riffy.emit("nodeDisconnect", this);
        this.connected = false;
    }

    get penalties() {
        let penalties = 0;
        if (!this.connected) return penalties;
        if (this.stats.players) {
            penalties += this.stats.players;
        }
        if (this.stats.cpu && this.stats.cpu.systemLoad) {
            penalties += Math.round(Math.pow(1.05, 100 * this.stats.cpu.systemLoad) * 10 - 10);
        }
        if (this.stats.frameStats) {
            if (this.stats.frameStats.deficit) {
                penalties += this.stats.frameStats.deficit;
            }
            if (this.stats.frameStats.nulled) {
                penalties += this.stats.frameStats.nulled * 2;
            }
        }
        return penalties;
    }

    /**
     * Returns a health score for this node (lower is better).
     * Considers penalties, reconnect attempts, and recent errors.
     * @returns {number}
     */
    get healthScore() {
        let score = this.penalties;
        score += (this.reconnectAttempted || 0) * 10;
        if (this.unhealthy) score += 1000;
        return score;
    }
    /**
     * Returns diagnostics for this node (penalties, healthScore, reconnects, etc).
     * @returns {object}
     */
    getDiagnostics() {
        return {
            name: this.name,
            host: this.host,
            port: this.port,
            connected: this.connected,
            penalties: this.penalties,
            healthScore: this.healthScore,
            reconnectAttempted: this.reconnectAttempted,
            unhealthy: this.unhealthy,
            stats: this.stats,
        };
    }
    /**
     * Moves all players to the healthiest available node if this node is unhealthy.
     * Emits 'nodeFailover' event for each player moved.
     * @param {Map<string, Node>} nodeMap - All nodes.
     */
    async autoFailover(nodeMap) {
        if (!this.unhealthy) return;
        const healthyNodes = [...nodeMap.values()].filter(n => n !== this && !n.unhealthy && n.connected);
        if (!healthyNodes.length) return;
        const bestNode = healthyNodes.sort((a, b) => a.healthScore - b.healthScore)[0];
        for (const player of this.riffy.players.values()) {
            if (player.node === this) {
                player.node = bestNode;
                player.connection.player = player;
                player.filters.player = player;
                await player.connect(player.options);
                this.riffy.emit('debug', `Auto-failover: moved player ${player.guildId} to node ${bestNode.name}`);
                this.riffy.emit('nodeFailover', player, this, bestNode);
            }
        }
    }
    /**
     * Set unhealthy and emit nodeHealthChanged event if status changes.
     * @param {boolean} value
     */
    setUnhealthy(value) {
        if (this.unhealthy !== value) {
            this.unhealthy = value;
            this.riffy.emit('nodeHealthChanged', this, value);
        }
    }
}

module.exports = { Node };
