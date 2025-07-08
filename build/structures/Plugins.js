/**
 * Base class for Riffy plugins.
 */
class Plugin {
    /**
     * Static array of loaded plugins.
     * @type {Plugin[]}
     */
    static loadedPlugins = [];
    /**
     * @param {string} name - The name of the plugin.
     */
    constructor(name) {
        this.name = name;
        this._config = {};
        Plugin.loadedPlugins.push(this);
    }
    /**
     * Called when the plugin is loaded.
     * @param {import("./Riffy").Riffy} riffy - The Riffy instance.
     */
    load(riffy) { }
    /**
     * Called when the plugin is unloaded.
     * @param {import("./Riffy").Riffy} riffy - The Riffy instance.
     */
    unload(riffy) {
        // Remove from loadedPlugins
        const idx = Plugin.loadedPlugins.indexOf(this);
        if (idx !== -1) Plugin.loadedPlugins.splice(idx, 1);
    }
    /**
     * Hot-reloads the plugin.
     * @param {import("./Riffy").Riffy} riffy - The Riffy instance.
     */
    reload(riffy) {
        this.unload(riffy);
        this.load(riffy);
    }
    /**
     * Emits a plugin event (event bus).
     * @param {string} event
     * @param  {...any} args
     */
    emitPluginEvent(event, ...args) {
        if (typeof this.onPluginEvent === 'function') {
            this.onPluginEvent(event, ...args);
        }
    }
    /**
     * Sets a config value for this plugin.
     * @param {string} key
     * @param {any} value
     */
    setConfig(key, value) {
        this._config[key] = value;
    }
    /**
     * Gets a config value for this plugin.
     * @param {string} key
     * @returns {any}
     */
    getConfig(key) {
        return this._config[key];
    }
    /**
     * Returns all loaded plugins.
     * @returns {Plugin[]}
     */
    static listLoaded() {
        return [...Plugin.loadedPlugins];
    }
    /**
     * Returns a loaded plugin by name.
     * @param {string} name
     * @returns {Plugin|null}
     */
    static getLoaded(name) {
        return Plugin.loadedPlugins.find(p => p.name === name) || null;
    }
}

module.exports = { Plugin };