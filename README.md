# Riffy [![NPM version](https://img.shields.io/npm/v/riffy.svg?style=flat-square&color=informational)](https://npmjs.com/package/riffy)

A next-generation Lavalink client for Node.JS, designed to be powerful, reliable, and extensible—now with advanced diagnostics, plugin system, and developer experience features. Compatible with all Discord libraries (discord.js, Eris, etc.).

## Installation

```shell
npm install riffy
```

## Features

-   Supports versions 3 and 4 of the Lavalink protocols.
-   **Autoplay support for YouTube, SoundCloud, Spotify, and Apple Music.**
-   Health-based node selection, auto-failover, and exponential backoff reconnects.
-   Advanced diagnostics for Riffy, Node, Player, and Connection (`getDiagnostics()`).
-   Per-guild/user and global runtime config (`setConfig`, `getConfig`).
-   Hot-reloadable plugin system with event bus and plugin config API.
-   Gapless/crossfade playback, idle cleanup, and universal event hooks.
-   Queue events, advanced track metadata, and custom filter API with presets.
-   REST request retry, rate limit handling, and request metrics.
-   Emits rich events: diagnostics, configChanged, pluginAction, playerConfigChanged, nodeHealthChanged, nodeFailover, restRequestSuccess, restRequestFailure, filterChanged, and more.
-   Full TypeScript/IDE support with up-to-date typings.
-   Compatible with all Discord libraries (discord.js, Eris, etc.).
-   Works with all Lavalink filters.

## Advanced Features

### Reliability & Performance
- **Healthiest node selection** and auto-failover for uninterrupted playback.
- **Exponential backoff reconnects** and node health monitoring.
- **Idle cleanup**: players auto-destroy if idle.

### Developer Experience
- **Diagnostics**: Inspect real-time stats for Riffy, Node, Player, and Connection with `.diagnostics` or programmatically via `getDiagnostics()`.
- **Config API**: Set and get runtime config globally or per-player with `.setconfig`, `.getconfig`, `.setplayerconfig`, `.getplayerconfig`.
- **Universal event hooks**: Register before/after hooks for any event.
- **Rich event system**: Listen for advanced events to monitor and react to everything.

### Extensibility
- **Plugin system**: Hot-reload plugins, emit/receive plugin events, and manage plugin config at runtime.
- **Plugin discovery**: List and get loaded plugins, set plugin config with `.plugins`, `.pluginconfig`.

### Playback & Queue
- **Gapless/crossfade playback** for seamless transitions.
- **Advanced autoplay**: Recommendations for YouTube, SoundCloud, Spotify, and Apple Music.
- **Queue events**: Add, remove, clear, shuffle, with event emission.
- **Track metadata**: Play count, last played, and custom metadata.

### REST & Filters
- **Request retry and rate limit handling** for robust REST calls.
- **Request metrics**: Track REST performance.
- **Custom filter API**: Add/remove filters, save/load presets, and listen for filter changes.

## Example Project

-   [Riffy Music Bot](https://github.com/riffy-team/riffy-music-bot)

## Documentation

-   [Documentation](https://riffy.js.org)
-   [Discord Server](https://discord.gg/TvjrWtEuyP)

## Quick Start

First things first, you need to have a Lavalink node running. You can download the latest version of Lavalink from [here](https://github.com/lavalink-devs/Lavalink), or you can use [these nodes](https://riffy.js.org/resources) for free.

> [!NOTE]
> This project uses `MessageContent` intent, so make sure to enable it in your application settings.

### Creating a Project

We are using [discord.js](https://discord.js.org/) for this example, but you can use any Discord library you prefer.

Import the `Riffy` class from the `riffy` package.

```js
// For CommonJS
const { Riffy } = require("riffy");
// For ES6
import { Riffy } from "riffy";
```

Below is an example of a basic Discord music bot using Discord.js and Riffy. (Lavalink V4)

```js
// index.js

const { Client, GatewayDispatchEvents } = require("discord.js");
const { Riffy } = require("riffy");

const client = new Client({
    intents: [
        "Guilds",
        "GuildMessages",
        "GuildVoiceStates",
        "GuildMessageReactions",
        "MessageContent",
        "DirectMessages",
    ],
});

const nodes = [
    {
        host: "localhost",
        password: "youshallnotpass",
        port: 2333,
        secure: false,
    },
];

client.riffy = new Riffy(client, nodes, {
    send: (payload) => {
        const guild = client.guilds.cache.get(payload.d.guild_id);
        if (guild) guild.shard.send(payload);
    },
    defaultSearchPlatform: "ytmsearch",
    restVersion: "v4", // Or "v3" based on your Lavalink version.
});

client.on("ready", () => {
    client.riffy.init(client.user.id);
    console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
    if (!message.content.startsWith("!") || message.author.bot) return;

    const args = message.content.slice(1).trim().split(" ");
    const command = args.shift().toLowerCase();

    if (command === "play") {
        const query = args.join(" ");

        // Create a player.
        const player = client.riffy.createConnection({
            guildId: message.guild.id,
            voiceChannel: message.member.voice.channel.id,
            textChannel: message.channel.id,
            deaf: true,
        });

        const resolve = await client.riffy.resolve({
            query: query,
            requester: message.author,
        });
        const { loadType, tracks, playlistInfo } = resolve;

        /**
         * Important: If you are using Lavalink V3, here are the changes you need to make:
         *
         * 1. Replace "playlist" with "PLAYLIST_LOADED"
         * 2. Replace "search" with "SEARCH_RESULT"
         * 3. Replace "track" with "TRACK_LOADED"
         */

        if (loadType === "playlist") {
            for (const track of resolve.tracks) {
                track.info.requester = message.author;
                player.queue.add(track);
            }

            message.channel.send(
                `Added: \`${tracks.length} tracks\` from \`${playlistInfo.name}\``
            );
            if (!player.playing && !player.paused) return player.play();
        } else if (loadType === "search" || loadType === "track") {
            const track = tracks.shift();
            track.info.requester = message.author;

            player.queue.add(track);
            message.channel.send(`Added: \`${track.info.title}\``);
            if (!player.playing && !player.paused) return player.play();
        } else {
            return message.channel.send("There are no results found.");
        }
    }

    // --- ADVANCED RIFFY FEATURE TEST COMMANDS ---
    if (command === "diagnostics") {
        const riffyDiag = client.riffy.getDiagnostics();
        const node = client.riffy.leastUsedNodes[0];
        const nodeDiag = node ? node.getDiagnostics() : null;
        const player = client.riffy.players.get(message.guild.id);
        const playerDiag = player ? player.getDiagnostics() : null;
        message.channel.send([
            "**Riffy Diagnostics:**",
            '```json\n' + JSON.stringify(riffyDiag, null, 2) + '\n```',
            nodeDiag ? "**Node Diagnostics:**\n```json\n" + JSON.stringify(nodeDiag, null, 2) + '\n```' : '',
            playerDiag ? "**Player Diagnostics:**\n```json\n" + JSON.stringify(playerDiag, null, 2) + '\n```' : ''
        ].filter(Boolean).join("\n"));
    }
    if (command === "setconfig") {
        const [key, ...val] = args;
        client.riffy.setConfig(key, val.join(" "));
        message.channel.send(`Set global config \`${key}\` to \`${val.join(" ")}\``);
    }
    if (command === "getconfig") {
        const key = args[0];
        const val = client.riffy.getConfig(key);
        message.channel.send(`Global config \`${key}\`: \`${val}\``);
    }
    if (command === "setplayerconfig") {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return message.channel.send("No player found.");
        const [key, ...val] = args;
        player.setConfig(key, val.join(" "));
        message.channel.send(`Set player config \`${key}\` to \`${val.join(" ")}\``);
    }
    if (command === "getplayerconfig") {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return message.channel.send("No player found.");
        const key = args[0];
        const val = player.getConfig(key);
        message.channel.send(`Player config \`${key}\`: \`${val}\``);
    }
    if (command === "plugins") {
        const { Plugin } = require("riffy");
        const loaded = Plugin.listLoaded();
        message.channel.send(loaded.length ? loaded.map(p => `- ${p.name}`).join("\n") : "No plugins loaded.");
    }
    if (command === "pluginconfig") {
        const { Plugin } = require("riffy");
        const [pluginName, key, ...val] = args;
        const plugin = Plugin.getLoaded(pluginName);
        if (!plugin) return message.channel.send("Plugin not found.");
        plugin.setConfig(key, val.join(" "));
        message.channel.send(`Set plugin \`${pluginName}\` config \`${key}\` to \`${val.join(" ")}\``);
    }
});

// This will send log when the lavalink node is connected.
client.riffy.on("nodeConnect", (node) => {
    console.log(`Node "${node.name}" connected.`);
});

// This will send log when the lavalink node faced an error.
client.riffy.on("nodeError", (node, error) => {
    console.log(`Node "${node.name}" encountered an error: ${error.message}.`);
});

// This is the event handler for track start.
client.riffy.on("trackStart", async (player, track) => {
    const channel = client.channels.cache.get(player.textChannel);

    channel.send(`Now playing: \`${track.info.title}\` by \`${track.info.author}\`.`);
});

// This is the event handler for queue end.
client.riffy.on("queueEnd", async (player) => {
    const channel = client.channels.cache.get(player.textChannel);

    // Set this to true if you want to enable autoplay.
    const autoplay = false;

    if (autoplay) {
        player.autoplay(player);
    } else {
        player.destroy();
        channel.send("Queue has ended.");
    }
});

// --- ADVANCED RIFFY EVENT LOGGING ---
const logEvent = (name) => (...args) => {
    console.log(`[RIFFY EVENT] ${name}", ...args);
};
[
    "diagnostics", "configChanged", "pluginAction", "playerConfigChanged", "nodeHealthChanged", "nodeFailover", "restRequestSuccess", "restRequestFailure", "filterChanged"
].forEach(event => client.riffy.on(event, logEvent(event)));

// This will update the voice state of the player.
client.on("raw", (d) => {
    if (
        ![
            GatewayDispatchEvents.VoiceStateUpdate,
            GatewayDispatchEvents.VoiceServerUpdate,
        ].includes(d.t)
    )
        return;
    client.riffy.updateVoiceState(d);
});

client.login("Discord-Bot-Token-Here");
```

### Running the Bot

Now that we have created our project, we can run our bot by typing the following command in the terminal.

```shell
# node.js
node index.js
# bun
bun run index.js
```

After running the bot, you can invite it to your server and use the `!play` command to play music. Try the advanced commands like `!diagnostics`, `!setconfig`, `!plugins`, etc. to explore all features.

### Conclusion

That's it! You have successfully created a discord music bot using riffy. If you have any questions, feel free to join our [discord server](https://discord.gg/TvjrWtEuyP).

We have set this example by keeping in mind that you know the basics of discord.js or any other discord library you are using.

## Our Team

🟪 Elitex

-   Github: [@Elitex](https://github.com/Elitex07)
-   Discord: @elitex

🟥 FlameFace

-   Github: [@FlameFace](https://github.com/flam3face)
-   Discord: @flameface

🟦 UnschooledGamer

-   Github: [@UnschooledGamer](https://github.com/UnschooledGamer)
-   Discord: @unschooledgamer

## License

This project is licensed under the [MIT License](./LICENSE)
