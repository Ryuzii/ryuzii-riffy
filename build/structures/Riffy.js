const { EventEmitter } = require("events");
const { Node } = require("./Node");
const { Player } = require("./Player");
const { Track } = require("./Track");
const { version: pkgVersion } = require("../../package.json")
const fs = require('fs');
const path = require('path');
const { joinVoiceChannel } = require('@discordjs/voice');

const versions = ["v3", "v4"];

/**
 * The main Riffy class for managing Lavalink nodes and players.
 * @extends EventEmitter
 */
class Riffy extends EventEmitter {
  /**
   * Creates a new Riffy instance.
   * @param {object} client - The Discord client or bot instance.
   * @param {Array<object>} nodes - Array of node configuration objects.
   * @param {object} options - Riffy options (see README for details).
   * @param {object} [options.rest] - REST API options.
   * @param {string} [options.rest.version] - Lavalink REST API version (default: 'v4').
   * @param {number} [options.rest.retryCount] - Retry failed REST requests (default: 3).
   * @param {number} [options.rest.timeout] - REST request timeout in ms (default: 5000).
   * @param {Array} [options.plugins] - Array of plugin instances to load.
   * @param {object} [options.resume] - AutoResume options.
   * @param {boolean} [options.resume.enabled] - Restore players on restart (default: false).
   * @param {string} [options.resume.key] - Unique key for session resuming.
   * @param {number} [options.resume.timeout] - Resume timeout in ms (default: 60000).
   * @param {object} [options.node] - Node management options.
   * @param {boolean} [options.node.dynamicSwitching] - Switch nodes automatically on failure (default: true).
   * @param {boolean} [options.node.autoReconnect] - Auto-reconnect on disconnect (default: true).
   * @param {object} [options.node.ws] - WebSocket reconnect options.
   * @param {number} [options.node.ws.reconnectTries] - WebSocket reconnect attempts (default: 5).
   * @param {number} [options.node.ws.reconnectInterval] - Interval between reconnects in ms (default: 5000).
   * @param {object} [options.performance] - Performance options.
   * @param {boolean} [options.performance.autopauseOnEmpty] - Auto-pause when everyone leaves (default: true).
   * @param {object} [options.performance.lazyLoad] - Lazy load options.
   * @param {boolean} [options.performance.lazyLoad.enabled] - Enable lazy load (default: false).
   * @param {number} [options.performance.lazyLoad.timeout] - Delay before loading tracks in ms (default: 5000).
   * @param {object} [options.track] - Track/queue features.
   * @param {number} [options.track.historyLimit] - How many tracks to keep in history (default: 20).
   * @param {boolean} [options.debug] - Enable debug logging (default: false).
   */
  constructor(client, nodes, options) {
    super();
    if (!client) throw new Error("Client is required to initialize Riffy");
    if (!nodes || !Array.isArray(nodes)) throw new Error(`Nodes are required & Must Be an Array(Received ${typeof nodes}) for to initialize Riffy`);
    if (!options.send || typeof options.send !== "function") throw new Error("Send function is required to initialize Riffy");

    // --- Essential Options Schema with Defaults ---
    const defaults = {
      rest: { version: 'v4', retryCount: 3, timeout: 5000 },
      plugins: [],
      resume: { enabled: false, key: 'riffy-resume', timeout: 60000 },
      node: { dynamicSwitching: true, autoReconnect: true, ws: { reconnectTries: 5, reconnectInterval: 5000 } },
      performance: { autopauseOnEmpty: true, lazyLoad: { enabled: false, timeout: 5000 } },
      track: { historyLimit: 20 },
      debug: false
    };
    // Deep merge user options with defaults
    this.options = this._deepMerge(defaults, options);

    this.client = client;
    this.nodes = nodes;
    this.nodeMap = new Map();
    this.players = new Map();
    this.clientId = null;
    this.initiated = false;
    this.send = this.options.send || null;
    this.defaultSearchPlatform = this.options.defaultSearchPlatform || "ytmsearch";
    this.restVersion = this.options.rest.version || "v3";
    this.tracks = [];
    this.loadType = null;
    this.playlistInfo = null;
    this.pluginInfo = null;
    this.plugins = this.options.plugins;
    /**
     * @description Package Version Of Riffy
     */
    this.version = pkgVersion;

    if (this.restVersion && !versions.includes(this.restVersion)) throw new RangeError(`${this.restVersion} is not a valid version`);
    /** @private */
    this._beforeGlobalHooks = {};
    /** @private */
    this._afterGlobalHooks = {};
    /**
     * Runtime config overrides for global options.
     * @type {object}
     */
    this._runtimeConfig = {};

    this._resumeFile = path.join(process.cwd(), `${this.options.resume.key || 'riffy-resume'}.json`);

    // --- Implement essential options behaviors ---
    // Pass options to Node and Player
    this._nodeOptions = this.options;
    this._playerOptions = this.options;
    // AutoResume: restore players on startup
    // (REMOVED: _tryRestorePlayers from constructor)
    if (this.options.resume.enabled) {
      // Save state on exit
      process.on('exit', () => this._savePlayerStates());
      process.on('SIGINT', () => { this._savePlayerStates(); process.exit(); });
      process.on('SIGTERM', () => { this._savePlayerStates(); process.exit(); });
    }
  }

  /**
   * Deep merge two objects (used for merging options with defaults)
   * @private
   */
  _deepMerge(target, source) {
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        this._deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }
  /**
   * Sets a global config value at runtime.
   * Emits 'configChanged' event.
   * @param {string} key
   * @param {any} value
   */
  setConfig(key, value) {
    this._runtimeConfig[key] = value;
    this.emit('configChanged', key, value);
  }
  /**
   * Gets a global config value, falling back to options.
   * @param {string} key
   * @returns {any}
   */
  getConfig(key) {
    return this._runtimeConfig[key] !== undefined ? this._runtimeConfig[key] : this.options[key];
  }
  /**
   * Emits a diagnostics event with current stats.
   */
  emitDiagnostics() {
    const stats = this.getDiagnostics();
    this.emit('diagnostics', stats);
  }
  /**
   * Loads a plugin and emits 'pluginAction' event.
   * @param {Plugin} plugin
   */
  loadPlugin(plugin) {
    plugin.load(this);
    this.emit('pluginAction', 'load', plugin);
  }
  /**
   * Unloads a plugin and emits 'pluginAction' event.
   * @param {Plugin} plugin
   */
  unloadPlugin(plugin) {
    plugin.unload(this);
    this.emit('pluginAction', 'unload', plugin);
  }
  /**
   * Register a function to run before a global event.
   * @param {string} event
   * @param {Function} fn
   */
  onBeforeGlobal(event, fn) {
    if (!this._beforeGlobalHooks[event]) this._beforeGlobalHooks[event] = [];
    this._beforeGlobalHooks[event].push(fn);
  }
  /**
   * Register a function to run after a global event.
   * @param {string} event
   * @param {Function} fn
   */
  onAfterGlobal(event, fn) {
    if (!this._afterGlobalHooks[event]) this._afterGlobalHooks[event] = [];
    this._afterGlobalHooks[event].push(fn);
  }
  async _runBeforeGlobalHooks(event, ...args) {
    if (this._beforeGlobalHooks[event]) {
      for (const fn of this._beforeGlobalHooks[event]) {
        await fn(...args);
      }
    }
  }
  async _runAfterGlobalHooks(event, ...args) {
    if (this._afterGlobalHooks[event]) {
      for (const fn of this._afterGlobalHooks[event]) {
        await fn(...args);
      }
    }
  }
  /**
   * Returns diagnostics (memory/cpu stats).
   * @returns {object}
   */
  getDiagnostics() {
    return {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      nodeCount: this.nodeMap.size,
      playerCount: this.players.size,
    };
  }

  /**
   * Returns the least used (least REST calls) connected nodes.
   * @returns {Array<Node>}
   */
  get leastUsedNodes() {
    return [...this.nodeMap.values()]
      .filter((node) => node.connected)
      .sort((a, b) => a.rest.calls - b.rest.calls);
  }

  /**
   * Try to restore players from disk if resume is enabled.
   * @private
   */
  _tryRestorePlayers() {
    console.log("AutoResume: Checking for saved players...");
    if (!fs.existsSync(this._resumeFile)) {
      console.log("AutoResume: No resume file found.");
      return;
    }
    try {
      const data = JSON.parse(fs.readFileSync(this._resumeFile, 'utf8'));
      const now = Date.now();
      if (!Array.isArray(data.players)) {
        console.log("AutoResume: No players array in resume file.");
        return;
      }
      for (const p of data.players) {
        console.log("AutoResume: Found saved player for guild", p.options.guildId, "timestamp:", p.timestamp, "now:", now);
        if (now - (p.timestamp || 0) > this.options.resume.timeout) {
          console.log("AutoResume: Skipping player, state too old.");
          continue;
        }
        try {
          const node = this.leastUsedNodes[0];
          if (!node) {
            console.log("AutoResume: No available node to restore player.");
            continue;
          }
          const player = this.createPlayer(node, { ...p.options, ...this._playerOptions });
          player.queue = p.queue || [];
          player.position = p.position || 0;
          player.current = p.current || null;
          player.paused = p.paused || false;
          player.playing = p.playing || false;

          // --- NEW: Auto-join voice channel and resume playback ---
          const guild = this.client.guilds.cache.get(player.guildId);
          if (guild && player.voiceChannel) {
            try {
              joinVoiceChannel({
                channelId: player.voiceChannel,
                guildId: player.guildId,
                adapterCreator: guild.voiceAdapterCreator,
                selfDeaf: player.deaf,
                selfMute: player.mute,
              });
              if (typeof player.restart === 'function') {
                player.restart();
              }
              console.log("AutoResume: Successfully rejoined VC and resumed for guild", player.guildId);
            } catch (vcErr) {
              console.log(`AutoResume: Failed to join voice channel for player ${player.guildId}:`, vcErr);
            }
          } else {
            if (!guild) console.log("AutoResume: Guild not found in cache for", player.guildId);
            if (!player.voiceChannel) console.log("AutoResume: No voiceChannel for player", player.guildId);
          }
        } catch (e) {
          console.log("AutoResume: Failed to restore player:", e);
        }
      }
      console.log('AutoResume: Player restore process complete.');
      if (this.options.debug) this.emit('debug', 'AutoResume: Players restored from disk');
    } catch (e) {
      console.log("AutoResume: Error restoring players:", e);
      if (this.options.debug) this.emit('debug', `AutoResume: Failed to restore players: ${e}`);
    }
  }

  /**
   * Save all active player states to disk for AutoResume.
   * @private
   */
  _savePlayerStates() {
    if (!this.options.resume.enabled) return;
    try {
      const players = Array.from(this.players.values()).map(p => ({
        options: p.options,
        queue: p.queue,
        position: p.position,
        current: p.current,
        paused: p.paused,
        playing: p.playing,
        timestamp: Date.now()
      }));
      fs.writeFileSync(this._resumeFile, JSON.stringify({ players }, null, 2));
      if (this.options.debug) this.emit('debug', 'AutoResume: Player states saved to disk');
    } catch (e) {
      if (this.options.debug) this.emit('debug', `AutoResume: Failed to save player states: ${e}`);
    }
  }

  /**
   * Initializes Riffy and connects to all nodes.
   * @param {string} clientId - The Discord client user ID.
   * @returns {Riffy}
   */
  init(clientId) {
    if (this.initiated) return this;
    this.clientId = clientId;
    this.nodes.forEach((node) => this.createNode(node));
    this.initiated = true;

    this.emit("debug", `Riffy initialized, connecting to ${this.nodes.length} node(s)`);

    if (this.plugins) {
      this.emit("debug", `Loading ${this.plugins.length} Riffy plugin(s)`);

      this.plugins.forEach((plugin) => {
        plugin.load(this);
      });
    }

    // --- NEW: Wait for at least one node to connect, then restore players ---
    if (this.options.resume.enabled) {
      this.once("nodeConnect", () => {
        this._tryRestorePlayers();
      });
    }

    return this;
  }

  /**
   * Creates and connects a new Lavalink node.
   * @param {object} options - Node configuration object.
   * @returns {Node}
   */
  createNode(options) {
    const node = new Node(this, options, this._nodeOptions);
    this.nodeMap.set(options.name || options.host, node);
    node.connect();
    this.emit("nodeCreate", node);
    return node;
  }

  /**
   * Destroys a node by identifier (name or host).
   * @param {string} identifier - Node name or host.
   */
  destroyNode(identifier) {
    const node = this.nodeMap.get(identifier);
    if (!node) return;
    node.disconnect();
    this.nodeMap.delete(identifier);
    this.emit("nodeDestroy", node);
  }

  /**
   * Handles Discord VOICE_STATE_UPDATE and VOICE_SERVER_UPDATE packets.
   * @param {object} packet - The raw Discord gateway packet.
   */
  updateVoiceState(packet) {
    if (!["VOICE_STATE_UPDATE", "VOICE_SERVER_UPDATE"].includes(packet.t)) return;
    const player = this.players.get(packet.d.guild_id);
    if (!player) return;

    if (packet.t === "VOICE_SERVER_UPDATE") {
      player.connection.setServerUpdate(packet.d);
    } else if (packet.t === "VOICE_STATE_UPDATE") {
      if (packet.d.user_id !== this.clientId) return;
      player.connection.setStateUpdate(packet.d);
    }
  }

  /**
   * Returns nodes matching a given region, sorted by load.
   * @param {string} region - The region to filter nodes by.
   * @returns {Array<Node>}
   */
  fetchRegion(region) {
    const nodesByRegion = [...this.nodeMap.values()]
      .filter((node) => node.connected && node.regions?.includes(region?.toLowerCase()))
      .sort((a, b) => {
        const aLoad = a.stats.cpu
          ? (a.stats.cpu.systemLoad / a.stats.cpu.cores) * 100
          : 0;
        const bLoad = b.stats.cpu
          ? (b.stats.cpu.systemLoad / b.stats.cpu.cores) * 100
          : 0;
        return aLoad - bLoad;
      });

    return nodesByRegion;
  }

  /**
   * Creates a player connection for a guild.
   * @param {object} options - Connection options (guildId, region, etc).
   * @returns {Player}
   */
  createConnection(options) {
    if (!this.initiated) throw new Error("You have to initialize Riffy in your ready event");

    const player = this.players.get(options.guildId);
    if (player) return player;

    if (this.leastUsedNodes.length === 0) throw new Error("No nodes are available");
    
    let node;
    if (options.region) {
      const region = this.fetchRegion(options.region)[0];
      node = this.nodeMap.get(region.name || this.leastUsedNodes[0].name);
    } else {
      node = this.nodeMap.get(this.leastUsedNodes[0].name);
    }

    if (!node) throw new Error("No nodes are available");

    return this.createPlayer(node, options);
  }

  /**
   * Creates a Player instance on a node.
   * @param {Node} node - The node to use.
   * @param {object} options - Player options.
   * @returns {Player}
   */
  createPlayer(node, options) {
    const player = new Player(this, node, { ...options, ...this._playerOptions });
    this.players.set(options.guildId, player);
    player.connect(options);
    this.emit('debug', `Created a player (${options.guildId}) on node ${node.name}`);
    this.emit("playerCreate", player);
    return player;
  }

  /**
   * Destroys a player by guild ID.
   * @param {string} guildId - The guild ID.
   */
  destroyPlayer(guildId) {
    const player = this.players.get(guildId);
    if (!player) return;
    player.destroy();
    this.players.delete(guildId);

    this.emit("playerDestroy", player);
  }

  /**
   * Removes a player connection by guild ID.
   * @param {string} guildId - The guild ID.
   */
  removeConnection(guildId) {
    this.players.get(guildId)?.destroy();
    this.players.delete(guildId);
  }

  /**
   * Resolves a search query to tracks using Lavalink.
   * @param {object} param0 - Search options (query, source, requester, node).
   * @returns {Promise<object>} - Lavalink response with tracks, playlistInfo, etc.
   */
  async resolve({ query, source, requester, node }) {
    try {
      if (!this.initiated) throw new Error("You have to initialize Riffy in your ready event");
      
      if(node && (typeof node !== "string" && !(node instanceof Node))) throw new Error(`'node' property must either be an node identifier/name('string') or an Node/Node Class, But Received: ${typeof node}`)
      // ^^(jsdoc) A source to search the query on example:ytmsearch for youtube music
      const querySource = source || this.defaultSearchPlatform;

      const requestNode = (node && typeof node === 'string' ? this.nodeMap.get(node) : node) || this.leastUsedNodes[0];
      if (!requestNode) throw new Error("No nodes are available.");

      const regex = /^https?:\/\//;
      const identifier = regex.test(query) ? query : `${querySource}:${query}`;

      this.emit("debug", `Searching for ${query} on node "${requestNode.name}"`);

      let response = await requestNode.rest.makeRequest(`GET`, `/${requestNode.rest.version}/loadtracks?identifier=${encodeURIComponent(identifier)}`);

      // for resolving identifiers - Only works in Spotify and Youtube
      if (response.loadType === "empty" || response.loadType === "NO_MATCHES") {
        response = await requestNode.rest.makeRequest(`GET`, `/${requestNode.rest.version}/loadtracks?identifier=https://open.spotify.com/track/${query}`);
        if (response.loadType === "empty" || response.loadType === "NO_MATCHES") {
          response = await requestNode.rest.makeRequest(`GET`, `/${requestNode.rest.version}/loadtracks?identifier=https://www.youtube.com/watch?v=${query}`);
        }
      }

      if (requestNode.rest.version === "v4") {
        if (response.loadType === "track") {
          this.tracks = response.data ? [new Track(response.data, requester, requestNode)] : [];

          this.emit("debug", `Search Success for "${query}" on node "${requestNode.name}", loadType: ${response.loadType}, Resulted track Title: ${this.tracks[0].info.title} by ${this.tracks[0].info.author}`);
        } else if (response.loadType === "playlist") {
          this.tracks = response.data?.tracks ? response.data.tracks.map((track) => new Track(track, requester, requestNode)) : [];

          this.emit("debug", `Search Success for "${query}" on node "${requestNode.name}", loadType: ${response.loadType} tracks: ${this.tracks.length}`);
        } else {
          this.tracks = response.loadType === "search" && response.data ? response.data.map((track) => new Track(track, requester, requestNode)) : [];

          this.emit("debug", `Search ${this.loadType !== "error" ? "Success" : "Failed"} for "${query}" on node "${requestNode.name}", loadType: ${response.loadType} tracks: ${this.tracks.length}`);
        }
      } else {
        // v3 (Legacy or Lavalink V3)
        this.tracks = response?.tracks ? response.tracks.map((track) => new Track(track, requester, requestNode)) : [];

        this.emit("debug", `Search ${this.loadType !== "error" || this.loadType !== "LOAD_FAILED" ? "Success" : "Failed"} for "${query}" on node "${requestNode.name}", loadType: ${response.loadType} tracks: ${this.tracks.length}`);
      }
      
      if (
        requestNode.rest.version === "v4" &&
        response.loadType === "playlist"
      ) {
        this.playlistInfo = response.data?.info ?? null;
      } else {
        this.playlistInfo = response.playlistInfo ?? null;
      }

      this.loadType = response.loadType ?? null
      this.pluginInfo = response.pluginInfo ?? {};

      return {
        loadType: this.loadType,
        exception: this.loadType == "error" ? response.data : this.loadType == "LOAD_FAILED" ? response.exception : null,
        playlistInfo: this.playlistInfo,
        pluginInfo: this.pluginInfo,
        tracks: this.tracks,
      };
    } catch (error) {
      this.emit("debug", `Search Failed for "${query}" on node "${requestNode.name}", Due to: ${error?.stack || error}`);
      throw error;
    }
  }

  /**
   * Gets a player by guild ID.
   * @param {string} guildId - The guild ID.
   * @returns {Player}
   */
  get(guildId) {
    const player = this.players.get(guildId);
    if (!player) throw new Error(`Player not found for ${guildId} guildId`);
    return player;
  }
}

module.exports = { Riffy };
