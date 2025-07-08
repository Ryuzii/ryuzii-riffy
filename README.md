# Riffy

A next-generation Lavalink client for Node.JS, designed to be powerful, reliable, and extensible — now with advanced diagnostics, plugin system, and developer experience features. Compatible with all Discord libraries (discord.js, Eris, etc.).

---

> **Install the improved, advanced Riffy by Ryuzii:**
> ```shell
> npm i https://github.com/Ryuzii/ryuzii-riffy
> ```
> Unlock next-gen features: seamless auto-resume, advanced queue, plugin hot-reload, diagnostics, and more—**exclusive to this GitHub version.**

---

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
-   Unified lyrics command: fetches plain or real-time synced (LRC) lyrics with karaoke-style updates.

## Advanced Options Schema

Riffy now uses a powerful, focused options schema. Only the most important and advanced options are shown below.

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

Below is an example of a modern Discord music bot using Discord.js v14 and the improved Riffy options.

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

// Example Usage: Basic Music Commands
client.on("messageCreate", async (message) => {
  if (!message.content.startsWith("!") || message.author.bot) return;

  const args = message.content.slice(1).trim().split(" ");
  const command = args.shift().toLowerCase();

  if (command === "play") {
    const query = args.join(" ");
    const player = client.riffy.createConnection({
      guildId: message.guild.id,
      voiceChannel: message.member.voice.channel.id,
      textChannel: message.channel.id,
      deaf: true,
    });

    const resolve = await client.riffy.resolve({ query, requester: message.author });
    const { loadType, tracks, playlistInfo } = resolve;

    if (loadType === "playlist") {
      for (const track of tracks) {
        track.info.requester = message.author;
        player.queue.add(track);
      }
      message.channel.send(`Added: \`${tracks.length} tracks\` from \`${playlistInfo.name}\``);
      if (!player.playing && !player.paused) player.play();
    } else if (loadType === "search" || loadType === "track") {
      const track = tracks.shift();
      track.info.requester = message.author;
      player.queue.add(track);
      message.channel.send(`Added: \`${track.info.title}\``);
      if (!player.playing && !player.paused) player.play();
    } else {
      message.channel.send("No results found.");
    }
  }

  if (command === "skip") {
    const player = client.riffy.players.get(message.guild.id);
    if (!player) return message.channel.send("No player found.");
    player.stop();
    message.channel.send("Skipped the current song.");
  }

  if (command === "stop") {
    const player = client.riffy.players.get(message.guild.id);
    if (!player) return message.channel.send("No player found.");
    player.destroy();
    message.channel.send("Stopped the player.");
  }

  if (command === "queue") {
    const player = client.riffy.players.get(message.guild.id);
    if (!player) return message.channel.send("No player found.");
    const queue = player.queue;
    if (!queue.length) return message.channel.send("No songs in queue.");
    const embed = {
      title: "Queue",
      description: queue.map((track, i) => `${i + 1}) ${track.info.title} | ${track.info.author}`).join("\n")
    };
    message.channel.send({ embeds: [embed] });
  }

  if (command === "lyrics") {
    const player = client.riffy.players.get(message.guild.id);
    if (!player) return message.channel.send("No player found.");
    if (!player.current) return message.channel.send("No track is currently playing.");
    const { title, author } = player.current.info;
    const result = await player.getLyrics({ track_name: title, artist_name: author });
    if (result.error) return message.channel.send(result.error);
    if (result.syncedLyrics) {
      const msg = await message.channel.send({ embeds: [{ title: "Live Lyrics", description: "Starting..." }] });
      let elapsed = 0;
      const interval = setInterval(() => {
        if (!player.playing || elapsed > 30) { clearInterval(interval); return; }
        const line = player.getCurrentLyricLine(result.syncedLyrics, player.position);
        msg.edit({ embeds: [{ title: "Live Lyrics", description: line || "..." }] });
        elapsed++;
      }, 500);
    } else if (result.lyrics) {
      message.channel.send({ embeds: [{ title: "Lyrics", description: result.lyrics.slice(0, 4000) }] });
    } else {
      message.channel.send("No lyrics found for this track.");
    }
  }
});

```

---

## License

This project is licensed under the [MIT License](./LICENSE)
