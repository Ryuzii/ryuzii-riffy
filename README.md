# Riffy [![NPM version](https://img.shields.io/npm/v/riffy.svg?style=flat-square&color=informational)](https://npmjs.com/package/riffy)

A next-generation Lavalink client for Node.JS, designed to be powerful, reliable, and extensible—now with advanced diagnostics, plugin system, and developer experience features. Compatible with all Discord libraries (discord.js, Eris, etc.).

---

> **This is the improved, advanced Riffy by Ryuzii.**
> Focused on next-gen features: seamless auto-resume, advanced queue, plugin hot-reload, diagnostics, and more—these improvements are exclusive to this GitHub version.
> 
> **To use this improved version, install with:**
> ```shell
> npm i https://github.com/Ryuzii/ryuzii-riffy
> ```
> 
> **Want the original, stable Riffy?**
> Install from npm:
> ```shell
> npm install riffy
> ```
> See [npmjs.com/package/riffy](https://npmjs.com/package/riffy) for the official release and documentation.
> 
> For full details on this advanced version, see the code and examples below.

---

## Installation

```shell
npm install riffy
```

## Features

-   Supports versions 3 and 4 of the Lavalink protocols.
-   **Seamless auto-resume:** Bot rejoins VC and resumes playback after restart.
-   Health-based node selection, auto-failover, and exponential backoff reconnects.
-   Advanced diagnostics for Riffy, Node, Player, and Connection (`getDiagnostics()`).
-   Per-guild/user and global runtime config (`setConfig`, `getConfig`).
-   Hot-reloadable plugin system with event bus and plugin config API.
-   Gapless/crossfade playback, idle cleanup, and universal event hooks.
-   Advanced queue, track metadata, and custom filter API with presets.
-   REST request retry, rate limit handling, and request metrics.
-   Emits rich events: diagnostics, configChanged, pluginAction, playerConfigChanged, nodeHealthChanged, nodeFailover, restRequestSuccess, restRequestFailure, filterChanged, and more.
-   Full TypeScript/IDE support with up-to-date typings.
-   Compatible with all Discord libraries (discord.js, Eris, etc.).
-   Works with all Lavalink filters.

## Advanced Options Schema

Riffy now uses a powerful, focused options schema. Only the most important and advanced options are shown below. For full details, see the [documentation](https://riffy.js.org).

```js
const riffyOptions = {
  send: (payload) => {
    const guild = client.guilds.cache.get(payload.d.guild_id);
    if (guild) guild.shard.send(payload);
  },
  defaultSearchPlatform: "ytmsearch",
  rest: {
    version: 'v4',
    retryCount: 3,
    timeout: 5000
  },
  plugins: [
    // new MyCustomPlugin()
  ],
  resume: {
    enabled: true,
    key: 'riffy-resume', // or any custom filename
    timeout: 60000
  },
  node: {
    dynamicSwitching: true,
    autoReconnect: true,
    ws: {
      reconnectTries: 5,
      reconnectInterval: 5000
    }
  },
  performance: {
    autopauseOnEmpty: true,
    lazyLoad: {
      enabled: false,
      timeout: 5000
    }
  },
  track: {
    historyLimit: 20
  },
  debug: true
};
```

---

## Creating a Project (with the new Riffy options)

Below is an example of a modern Discord music bot using Discord.js v14 and the improved Riffy options. For more, see the [documentation](https://riffy.js.org).

```js
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

client.riffy = new Riffy(client, nodes, riffyOptions);

client.on("ready", () => {
  client.riffy.init(client.user.id);
  console.log(`Logged in as ${client.user.tag}`);
});

// ... (see documentation for full command and event examples)
```

---

> For advanced usage, plugin development, and full API, see the [Riffy documentation](https://riffy.js.org).

---

## License

This project is licensed under the [MIT License](./LICENSE)
