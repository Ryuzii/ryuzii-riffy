/**
 * Manages audio filters for a player.
 */
class Filters {
    /**
     * @param {import("../index").Player} player - The player instance this filter belongs to.
     * @param {object} [options] - Filter options.
     */
    constructor(player, options = {}) {
        this.player = player;
        this.volume = options.volume || 1
        this.equalizer = options.equalizer || [];
        this.karaoke = options.karaoke || null;
        this.timescale = options.timescale || null;
        this.tremolo = options.tremolo || null;
        this.vibrato = options.vibrato || null;
        this.rotation = options.rotation || null;
        this.distortion = options.distortion || null;
        this.channelMix = options.channelMix || null;
        this.lowPass = options.lowPass || null;
        this.bassboost = options.bassboost || null;
        this.slowmode = options.slowmode || null;
        this.nightcore = options.nightcore || null;
        this.vaporwave = options.vaporwave || null;
        this._8d = options._8d || null;
        this._custom = {};
        this._presets = {};
        this._idleTimeout = null;
        this._setupIdleCleanup();
    }

    /**
     * Sets up idle cleanup: destroys filters if not used for 5 minutes.
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
        this.player = null;
        this.equalizer = null;
        this.karaoke = null;
        this.timescale = null;
        this.tremolo = null;
        this.vibrato = null;
        this.rotation = null;
        this.distortion = null;
        this.channelMix = null;
        this.lowPass = null;
        this.bassboost = null;
        this.slowmode = null;
        this.nightcore = null;
        this.vaporwave = null;
        this._8d = null;
    }

    /**
     * Saves the current filter chain as a named preset.
     * @param {string} name
     */
    savePreset(name) {
        this._presets[name] = this._getCurrentFilterState();
    }
    /**
     * Loads a named filter preset.
     * @param {string} name
     */
    loadPreset(name) {
        if (!this._presets[name]) throw new Error(`Preset '${name}' does not exist.`);
        Object.assign(this, this._presets[name]);
        this.updateFilters();
    }
    /**
     * Removes a named filter preset.
     * @param {string} name
     */
    removePreset(name) {
        delete this._presets[name];
    }
    /**
     * Lists all saved preset names.
     * @returns {string[]}
     */
    listPresets() {
        return Object.keys(this._presets);
    }
    /**
     * Returns the current filter state (for presets).
     * @private
     */
    _getCurrentFilterState() {
        return {
            volume: this.volume,
            equalizer: this.equalizer,
            karaoke: this.karaoke,
            timescale: this.timescale,
            tremolo: this.tremolo,
            vibrato: this.vibrato,
            rotation: this.rotation,
            distortion: this.distortion,
            channelMix: this.channelMix,
            lowPass: this.lowPass,
            bassboost: this.bassboost,
            slowmode: this.slowmode,
            nightcore: this.nightcore,
            vaporwave: this.vaporwave,
            _8d: this._8d,
            _custom: { ...this._custom },
        };
    }

    /**
     * Sets the equalizer bands.
     * @param {string[]} band
     * @returns {Filters}
     */
    setEqualizer(band) {
        this.equalizer = band;
        this.updateFilters();
        this.player.riffy.emit('filterChanged', this.player, 'equalizer', band);
        return this;
    }

    /**
     * Enables or disables karaoke filter.
     * @param {boolean} enabled
     * @param {object} [options]
     * @returns {Filters}
     */
    setKaraoke(enabled, options = {}) {
        if (!this.player) return;

        if (enabled == true) {
            this.karaoke = {
                level: options.level || 1.0,
                monoLevel: options.monoLevel || 1.0,
                filterBand: options.filterBand || 220.0,
                filterWidth: options.filterWidth || 100.0
            };

            this.updateFilters();
            this.player.riffy.emit('filterChanged', this.player, 'karaoke', this.karaoke);
            return this;
        } else {
            this.karaoke = null;
            this.updateFilters();
            this.player.riffy.emit('filterChanged', this.player, 'karaoke', null);
            return this;
        }
    }

    /**
     * 
     * @param {boolean} enabled 
     * @param {*} options 
     * @returns 
     */

    setTimescale(enabled, options = {}) {
        if (!this.player) return;

        if (enabled == true) {
            this.timescale = {
                speed: options.speed || 1.0,
                pitch: options.pitch || 1.0,
                rate: options.rate || 1.0
            };

            this.updateFilters();
            this.player.riffy.emit('filterChanged', this.player, 'timescale', this.timescale);
            return this;
        } else {
            this.timescale = null;
            this.updateFilters();
            this.player.riffy.emit('filterChanged', this.player, 'timescale', null);
            return this;
        }
    }

    /**
     * 
     * @param {boolean} enabled 
     * @param {*} options 
     * @returns 
     */

    setTremolo(enabled, options = {}) {
        if (!this.player) return;

        if (enabled == true) {
            this.tremolo = {
                frequency: options.frequency || 2.0,
                depth: options.depth || 0.5
            };

            this.updateFilters();
            this.player.riffy.emit('filterChanged', this.player, 'tremolo', this.tremolo);
            return this;
        } else {
            this.tremolo = null;
            this.updateFilters();
            this.player.riffy.emit('filterChanged', this.player, 'tremolo', null);
            return this;
        }
    }

    /**
     * 
     * @param {boolean} enabled 
     * @param {*} options 
     * @returns 
     */

    setVibrato(enabled, options = {}) {
        if (!this.player) return;

        if (enabled == true) {
            this.vibrato = {
                frequency: options.frequency || 2.0,
                depth: options.depth || 0.5
            };

            this.updateFilters();
            this.player.riffy.emit('filterChanged', this.player, 'vibrato', this.vibrato);
            return this;
        } else {
            this.vibrato = null;
            this.updateFilters();
            this.player.riffy.emit('filterChanged', this.player, 'vibrato', null);
            return this;
        }
    }

    /**
     * 
     * @param {boolean} enabled 
     * @param {*} options 
     * @returns 
     */

    setRotation(enabled, options = {}) {
        if (!this.player) return;

        if (enabled == true) {
            this.rotation = {
                rotationHz: options.rotationHz || 0.0
            };

            this.updateFilters();
            this.player.riffy.emit('filterChanged', this.player, 'rotation', this.rotation);
            return this;
        } else {
            this.rotation = null;
            this.updateFilters();
            this.player.riffy.emit('filterChanged', this.player, 'rotation', null);
            return this;
        }
    }

    /**
     * 
     * @param {boolean} enabled 
     * @param {*} options 
     * @returns 
     */

    setDistortion(enabled, options = {}) {
        if (!this.player) return;

        if (enabled == true) {
            this.distortion = {
                sinOffset: options.sinOffset || 0.0,
                sinScale: options.sinScale || 1.0,
                cosOffset: options.cosOffset || 0.0,
                cosScale: options.cosScale || 1.0,
                tanOffset: options.tanOffset || 0.0,
                tanScale: options.tanScale || 1.0,
                offset: options.offset || 0.0,
                scale: options.scale || 1.0
            };

            this.updateFilters();
            this.player.riffy.emit('filterChanged', this.player, 'distortion', this.distortion);
            return this;
        } else {
            this.distortion = null;
            this.updateFilters();
            this.player.riffy.emit('filterChanged', this.player, 'distortion', null);
            return this;
        }
    }

    /**
     * 
     * @param {boolean} enabled 
     * @param {*} options 
     * @returns 
     */

    setChannelMix(enabled, options = {}) {
        if (!this.player) return;

        if (enabled == true) {
            this.channelMix = {
                leftToLeft: options.leftToLeft || 1.0,
                leftToRight: options.leftToRight || 0.0,
                rightToLeft: options.rightToLeft || 0.0,
                rightToRight: options.rightToRight || 1.0
            };

            this.updateFilters();
            this.player.riffy.emit('filterChanged', this.player, 'channelMix', this.channelMix);
            return this;
        } else {
            this.channelMix = null;
            this.updateFilters();
            this.player.riffy.emit('filterChanged', this.player, 'channelMix', null);
            return this;
        }
    }

    /**
     * 
     * @param {boolean} enabled 
     * @param {*} options 
     * @returns 
     */

    setLowPass(enabled, options = {}) {
        if (!this.player) return;

        if (enabled == true) {
            this.lowPass = {
                smoothing: options.smoothing || 20.0
            };

            this.updateFilters();
            this.player.riffy.emit('filterChanged', this.player, 'lowPass', this.lowPass);
            return this;
        } else {
            this.lowPass = null;
            this.updateFilters();
            this.player.riffy.emit('filterChanged', this.player, 'lowPass', null);
            return this;
        }
    }

    /**
     * 
     * @param {boolean} enabled 
     * @param {*} options 
     * @returns 
     */

    setBassboost(enabled, options = {}) {
        if (!this.player) return;

        if (enabled) {
            if (options.value < 0 || options.value > 5) throw new Error("Bassboost value must be between 0 and 5");

            this.bassboost = options.value || 5;
            const num = (options.value || 5 - 1) * (1.25 / 9) - 0.25;

            this.setEqualizer(Array(13).fill(0).map((n, i) => ({
                band: i,
                gain: num
            })));
        } else {
            this.bassboost = null;
            this.setEqualizer([]);
        }
        this.player.riffy.emit('filterChanged', this.player, 'bassboost', this.bassboost);
    }

    setSlowmode(enabled, options = {}) {
        if (!this.player) return;

        if (enabled) {
            this.slowmode = true;

            this.setTimescale(true, {
                rate: options.rate || 0.8
            })
        } else {
            this.slowmode = null;
            this.setTimescale(false)
        }
        this.player.riffy.emit('filterChanged', this.player, 'slowmode', this.slowmode);
    }

    /**
     * 
     * @param {boolean} enabled 
     * @param {*} options 
     * @returns 
     */

    setNightcore(enabled, options = {}) {
        if (!this.player) return;

        if (enabled) {
            if (!this.player) return;
            this.nightcore = enabled;

            this.setTimescale(true, {
                rate: options.rate || 1.5
            })

            this.vaporwave = false;
        } else {
            this.nightcore = null;
            this.setTimescale(false)
        }
        this.player.riffy.emit('filterChanged', this.player, 'nightcore', this.nightcore);
    }

    /**
     * 
     * @param {boolean} enabled 
     * @param {*} options 
     * @returns 
     */

    setVaporwave(enabled, options = {}) {
        if (!this.player) return;

        if (enabled == true) {
            this.vaporwave = enabled;

            this.setTimescale(true, {
                pitch: options.pitch || 0.5
            })

            if (enabled) {
                this.nightcore = false;
            }
        } else {
            this.vaporwave = null;
            this.setTimescale(false)
        }
        this.player.riffy.emit('filterChanged', this.player, 'vaporwave', this.vaporwave);
    }

    /**
     * 
     * @param {boolean} enabled 
     * @param {*} options 
     * @returns 
     */

    set8D(enabled, options = {}) {
        if (!this.player) return;

        if (enabled == true) {
            this._8d = enabled;

            this.setRotation(true, {
                rotationHz: options.rotationHz || 0.2
            });
        } else {
            this._8d = null;
            this.setRotation(false)
        }
        this.player.riffy.emit('filterChanged', this.player, '_8d', this._8d);
    }

    /**
     * Sets a custom filter chain. Merges with existing filters.
     * @param {object} filters - Custom filter settings (Lavalink filter format).
     * @returns {Filters}
     */
    setCustom(filters) {
        this._custom = { ...this._custom, ...filters };
        this.updateFilters();
        return this;
    }
    /**
     * Clears all custom filters.
     * @returns {Filters}
     */
    clearCustom() {
        this._custom = {};
        this.updateFilters();
        return this;
    }

    /**
     * Clears all filters.
     * @returns {Promise<Filters>}
     */
    async clearFilters() {
        Object.assign(this, new Filters(this.player))
        
        await this.updateFilters();
        return this;
    }

    /**
     * Updates filters on the node.
     * @returns {Promise<Filters>}
     */
    async updateFilters() {
        const { equalizer, karaoke, timescale, tremolo, vibrato, rotation, distortion, channelMix, lowPass, volume } = this;
        // Merge in custom filters
        const filters = Object.assign({}, { volume, equalizer, karaoke, timescale, tremolo, vibrato, rotation, distortion, channelMix, lowPass }, this._custom);
        await this.player.node.rest.updatePlayer({
            guildId: this.player.guildId,
            data: {
                filters
            }
        });
        return this;
    }
}

module.exports = { Filters };
