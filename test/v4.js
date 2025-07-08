const { Client, GatewayDispatchEvents, AttachmentBuilder } = require("discord.js");
const { Riffy } = require("../build/index.js");
const { inspect } = require("node:util")
/**
 * @type {import("discord.js").Client & { riffy: Riffy}}
 */
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
      host: "node.raidenbot.xyz",
      port: 5500,
      password: "pwd",
      secure: false
  }
];

// --- Riffy Essential Options Example ---
client.riffy = new Riffy(client, nodes, {
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
    key: 'riffy-resume',
    timeout: 3600000
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
});

client.on("ready", async () => {
  client.riffy.init(client.user.id);
  console.log(`Logged in as ${client.user.tag}`);
});

// --- ADVANCED RIFFY FEATURE TEST COMMANDS ---
client.on("messageCreate", async (message) => {
  if (!message.content.startsWith('.') || message.author.bot) return;

  const args = message.content.slice(1).trim().split(" ");
  const command = args.shift().toLowerCase();

  if (command === "play") {
    const query = args.join(" ");

    const player = client.riffy.createConnection({
      guildId: message.guild.id,
      voiceChannel: message.member.voice.channel.id,
      textChannel: message.channel.id,
      deaf: true
    });

    const resolve = await client.riffy.resolve({ query: query, requester: message.author });
    const { loadType, tracks, playlistInfo } = resolve;

    if (loadType === 'playlist') {
      for (const track of resolve.tracks) {
        track.info.requester = message.author;
        player.queue.add(track);
      }

      message.channel.send(`Added: \`${tracks.length} tracks\` from \`${playlistInfo.name}\``,);
      if (!player.playing && !player.paused) return player.play();
    } else if (loadType === 'search' || loadType === 'track') {
      const track = tracks.shift();
      track.info.requester = message.author;

      player.queue.add(track);
      message.channel.send(`Added: \`${track.info.title}\``);
      if (!player.playing && !player.paused) return player.play();
    } else {
      return message.channel.send('There are no results found.');
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

  if (command === "pause") {
    const player = client.riffy.players.get(message.guild.id);
    if (!player) return message.channel.send("No player found.");

    player.pause(true);
    message.channel.send("Paused the player.");
  }

  if (command === "resume") {
    const player = client.riffy.players.get(message.guild.id);
    if (!player) return message.channel.send("No player found.");

    player.pause(false);
    message.channel.send("Resumed the player.");
  }

  if (command === "volume") {
    const player = client.riffy.players.get(message.guild.id);
    if (!player) return message.channel.send("No player found.");

    const volume = parseInt(args[0]);
    if (!volume || isNaN(volume)) return message.channel.send("Please provide a valid number.");

    player.setVolume(volume);
    message.channel.send(`Set the player volume to: \`${volume}\`.`);
  }

  if (command === "queue") {
    const player = client.riffy.players.get(message.guild.id);
    if (!player) return message.channel.send("No player found.");

    const queue = player.queue;
    if (!queue.length) return message.channel.send("No songs in queue.");

    const embed = {
      title: "Queue",
      description: queue.map((track, i) => {
        return `${i + 1}) ${track.info.title} | ${track.info.author}`;
      }).join("\n")
    };

    message.channel.send({ embeds: [embed] });
  }

  if (command === "nowplaying") {
    const player = client.riffy.players.get(message.guild.id);
    if (!player) return message.channel.send("No player found.");

    console.log(player)
    const track = player.current;

    if (!track) return message.channel.send("No song currently playing.");

    const embed = {
      title: "Now Playing",
      description: `${track.info.title} | ${track.info.author}`
    };

    message.channel.send({ embeds: [embed] });
  }

  if (command === "loop") {
    const player = client.riffy.players.get(message.guild.id);
    if (!player) return message.channel.send("No player found.");

    const loop = args[0];
    if (!loop || !["queue", "track"].includes(loop))
      return message.channel.send(
        "Please provide a valid loop option: `queue` or `track`."
      );

    const toggleLoop = () => {
      const loopType = player.loop === loop ? "none" : loop;
      player.setLoop(loopType);
      message.channel.send(
        `${loop.charAt(0).toUpperCase() + loop.slice(1)} loop is now ${loopType === "none" ? "disabled" : "enabled"
        }.`
      );
    };

    toggleLoop();
  }

  if (command === "shuffle") {
    const player = client.riffy.players.get(message.guild.id);
    if (!player) return message.channel.send("No player found.");

    player.queue.shuffle();
    message.channel.send("Shuffled the queue.");
  }

  if (command === "remove") {
    const player = client.riffy.players.get(message.guild.id);
    if (!player) return message.channel.send("No player found.");

    const index = parseInt(args[0]);
    if (!index || isNaN(index))
      return message.channel.send("Please provide a valid number.");

    const removed = player.queue.remove(index);
    message.channel.send(`Removed: \`${removed.info.title}\` from the queue.`);
  }

  if (command === "clear") {
    const player = client.riffy.players.get(message.guild.id);
    if (!player) return message.channel.send("No player found.");

    player.queue.clear();
    message.channel.send("Cleared the queue.");
  }

  if (command === "filter") {
    const player = client.riffy.players.get(message.guild.id);
    if (!player) return message.channel.send("No player found.");

    const filter = args[0];

    const filterActions = {
      "8d": { method: "set8D", message: "8D filter enabled." },
      bassboost: {
        method: "setBassboost",
        message: "Bassboost filter enabled.",
      },
      channelmix: {
        method: "setChannelMix",
        message: "Channelmix filter enabled.",
      },
      distortion: {
        method: "setDistortion",
        message: "Distortion filter enabled.",
      },
      karaoke: { method: "setKaraoke", message: "Karaoke filter enabled." },
      lowpass: { method: "setLowPass", message: "Lowpass filter enabled." },
      nightcore: {
        method: "setNightcore",
        message: "Nightcore filter enabled.",
      },
      rotate: { method: "setRotation", message: "Rotate filter enabled." },
      slowmode: { method: "setSlowmode", message: "Slowmode filter enabled." },
      timescale: {
        method: "setTimescale",
        message: "Timescale filter enabled.",
      },
      tremolo: { method: "setTremolo", message: "Tremolo filter enabled." },
      vaporwave: {
        method: "setVaporwave",
        message: "Vaporwave filter enabled.",
      },
      vibrato: { method: "setVibrato", message: "Vibrato filter enabled." },
    };

    const action = filterActions[filter];
    if (action) {
      player.filters[action.method](true);
      message.channel.send(action.message);
    } else {
      message.channel.send("Please provide a valid filter option.");
    }

    // console.log(player.filters);
  }

  if (command === "dfilter") {
    const player = client.riffy.players.get(message.guild.id);
    if (!player) return message.channel.send("No player found.");

    const filter = args[0];

    const filterActions = {
      "8d": { method: "set8D", message: "8D filter disabled." },
      bassboost: {
        method: "setBassboost",
        message: "Bassboost filter disabled.",
      },
      channelmix: {
        method: "setChannelMix",
        message: "Channelmix filter disabled.",
      },
      distortion: {
        method: "setDistortion",
        message: "Distortion filter disabled.",
      },
      karaoke: { method: "setKaraoke", message: "Karaoke filter disabled." },
      lowpass: { method: "setLowPass", message: "Lowpass filter disabled." },
      nightcore: {
        method: "setNightcore",
        message: "Nightcore filter disabled.",
      },
      rotate: { method: "setRotation", message: "Rotate filter disabled." },
      slowmode: { method: "setSlowmode", message: "Slowmode filter disabled." },
      timescale: {
        method: "setTimescale",
        message: "Timescale filter disabled.",
      },
      tremolo: { method: "setTremolo", message: "Tremolo filter disabled." },
      vaporwave: {
        method: "setVaporwave",
        message: "Vaporwave filter disabled.",
      },
      vibrato: { method: "setVibrato", message: "Vibrato filter disabled." },
    };

    const action = filterActions[filter];
    if (action) {
      player.filters[action.method](false);
      message.channel.send(action.message);
    } else {
      message.channel.send("Please provide a valid filter option.");
    }

    // console.log(player.filters);
  }

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
    const { Plugin } = require("../build/structures/Plugins.js");
    const loaded = Plugin.listLoaded();
    message.channel.send(loaded.length ? loaded.map(p => `- ${p.name}`).join("\n") : "No plugins loaded.");
  }
  if (command === "pluginconfig") {
    const { Plugin } = require("../build/structures/Plugins.js");
    const [pluginName, key, ...val] = args;
    const plugin = Plugin.getLoaded(pluginName);
    if (!plugin) return message.channel.send("Plugin not found.");
    plugin.setConfig(key, val.join(" "));
    message.channel.send(`Set plugin \`${pluginName}\` config \`${key}\` to \`${val.join(" ")}\``);
  }

  if (command === "eval" && args[0]) {
    try {
      let evaled = await eval(args.join(" "));
      let string = inspect(evaled);

      if (string.includes(client.token))
        return message.reply("No token grabbing.");

      if (string.length > 2000) {
        let output = new AttachmentBuilder(Buffer.from(string), {
          name: "result.js",
        });
        return message.channel.send({ files: [output] });
      }

      message.channel.send(`\`\`\`js\n${string}\n\`\`\``);
    } catch (error) {
      message.reply(`\`\`\`js\n${error}\n\`\`\``);
    }
  }
})

client.riffy.on("nodeConnect", (node) => {
  console.log(
    `Node "${node.name}" connected, with sessionId ${node.sessionId}`
  );
});

client.riffy.on("nodeError", (node, error) => {
  console.log(`Node "${node.name}" encountered an error: ${error}`);
});

client.riffy.on("nodeReconnect", (node) => {
  console.log(`Node "${node.name}" reconnecting.`);
});

client.riffy.on("trackStart", async (player, track) => {
  const channel = client.channels.cache.get(player.textChannel);

  channel.send(
    `Now playing: \`${track.info.title}\` by \`${track.info.author}\`.`
  );
});

client.riffy.on("queueEnd", async (player) => {
  const channel = client.channels.cache.get(player.textChannel);

  const autoplay = false;

  if (autoplay) {
    player.autoplay(player);
  } else {
    player.destroy();
    channel.send("Queue has ended.");
  }
});

process.on("uncaughtException", (err, origin) =>
  console.log(
    `[UNCAUGHT ERRORS Reporting - Exception] >> origin: ${origin} | Error: ${err.stack ?? err}`
  )
);
process.on("unhandledRejection", (err, _) =>
  console.log(
    `[unhandled ERRORS Reporting - Rejection] >> ${err}, Promise: ignored/not included`
  )
);

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

client.riffy.on("debug", (...m) => {
  console.log(`[DEBUG - RIFFY]`, ...m);
});

// --- ADVANCED RIFFY EVENT LOGGING ---
const logEvent = (name) => (...args) => {
  console.log(`[RIFFY EVENT] ${name}`, ...args);
};
[
  "diagnostics", "configChanged", "pluginAction", "playerConfigChanged", "nodeHealthChanged", "nodeFailover", "restRequestSuccess", "restRequestFailure", "filterChanged"
].forEach(event => client.riffy.on(event, logEvent(event)));

client.login("<DISCORD-TOKEN>");
