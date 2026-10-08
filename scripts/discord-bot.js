import {
  Client, GatewayIntentBits, Partials, SlashCommandBuilder,
  PermissionFlagsBits, ChannelType, MessageFlags,
  ActionRowBuilder, ButtonBuilder, ButtonStyle
} from 'discord.js';
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!TOKEN) {
  console.error("Missing DISCORD_BOT_TOKEN in environment variables.");
  process.exit(1);
}

// Initialize Firebase Admin SDK for persisting Discord bot configs and scores.
let db = null;
try {
  if (getApps().length === 0) {
    const candidatePaths = [
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
      path.resolve('./service-account.json'),
      path.resolve(__dirname, '../service-account.json'),
      path.resolve(__dirname, './service-account.json'),
      path.resolve(process.env.HOME || '', 'service-account.json'),
      path.resolve(process.env.HOME || '', 'linguil/service-account.json'),
    ].filter(Boolean);

    const foundPath = candidatePaths.find(p => fs.existsSync(p));
    if (foundPath) {
      console.log(`[Firebase Admin] Loading service account credentials from: ${foundPath}`);
      const serviceAccount = JSON.parse(fs.readFileSync(foundPath, 'utf-8'));
      initializeApp({ credential: cert(serviceAccount) });
    } else {
      console.error(`[Firebase Admin] WARNING: No service-account.json found! Searched:`, candidatePaths);
      initializeApp();
    }
  }
  db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });
  console.log("Firebase Admin initialized for Discord bot.");
} catch (err) {
  console.error("Firebase Admin initialization error in discord-bot:", err);
}

// Local cache for server channel preferences (survives bot restarts if offline).
const configCandidate = [
  path.resolve('./server-configs.json'),
  path.resolve(__dirname, '../server-configs.json'),
  path.resolve(__dirname, './server-configs.json'),
].find(p => fs.existsSync(p));

const CONFIG_FILE = configCandidate || path.resolve(__dirname, '../server-configs.json');
let serverConfigs = {};

if (fs.existsSync(CONFIG_FILE)) {
  try {
    serverConfigs = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch (e) {
    console.error("Error reading local server-configs.json:", e);
    serverConfigs = {};
  }
} else {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({}));
}

// Load server configs from Firestore into memory cache on startup.
async function loadServerConfigsFromFirestore() {
  if (!db) return;
  try {
    const snapshot = await db.collection('discord_guilds').get();
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data && data.channelId) {
        serverConfigs[doc.id] = data.channelId;
      }
    });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(serverConfigs, null, 2));
    console.log(`Loaded ${snapshot.size} server configuration(s) from Firestore.`);
  } catch (err) {
    console.error("Failed to load server configs from Firestore:", err);
  }
}

async function saveConfig(guildId, channelId) {
  serverConfigs[guildId] = channelId;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(serverConfigs, null, 2));

  if (db) {
    try {
      await db.collection('discord_guilds').doc(guildId).set({
        channelId,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.error(`Failed to save server config to Firestore for server ${guildId}:`, err);
    }
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// In-memory store for today's scores. Key: guildId, Value: Map<userId, { userId, username, score, total, bear }>.
const guildScores = new Map();

// Regex matching Linguil score share format: linguil | DD/MM/YY ... score/total | bear
const linguilRegex = /linguil\s+\|\s+(\d{2})\/(\d{2})\/(\d{2})[\s\S]*?(\d+)\/(\d+)\s+\|\s+(.*?)(?=\n|$)/;

// Format today's date in UTC (YYYY-MM-DD).
function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

// Generate leaderboard text combining daily results and server all-time leaderboard.
async function buildLeaderboardText(guildId) {
  const medals = ["🥇", "🥈", "🥉"];
  const today = getTodayDateKey();

  // Fetch the current name of the server for display.
  let serverName = 'server';
  try {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (guild && guild.name) {
      serverName = guild.name;
    }
  } catch (err) {
    console.warn(`Could not resolve server name for ${guildId}:`, err.message);
  }

  // 1. Gather daily scores:
  let serverMap = guildScores.get(guildId);

  // If in-memory is empty (e.g. after a restart), try loading today's scores from Firestore.
  if ((!serverMap || serverMap.size === 0) && db) {
    try {
      const dailySnap = await db.collection('discord_guilds').doc(guildId)
        .collection('daily_scores').doc(today)
        .collection('scores').get();

      if (!dailySnap.empty) {
        if (!guildScores.has(guildId)) {
          guildScores.set(guildId, new Map());
        }
        serverMap = guildScores.get(guildId);
        dailySnap.forEach(doc => {
          const data = doc.data();
          serverMap.set(data.userId, data);
        });
      }
    } catch (err) {
      console.error(`Failed to fetch daily scores from Firestore for server ${guildId}:`, err);
    }
  }

  let dailyText = "";
  if (!serverMap || serverMap.size === 0) {
    dailyText = "No one shared a linguil score today! ʕノ•ᴥ•ʔノ ︵ ┻━┻";
  } else {
    const allScores = Array.from(serverMap.values());
    const groupedScores = allScores.reduce((acc, curr) => {
      if (!acc[curr.score]) acc[curr.score] = [];
      acc[curr.score].push(curr);
      return acc;
    }, {});

    const sortedScoreKeys = Object.keys(groupedScores).map(Number).sort((a, b) => b - a);

    sortedScoreKeys.forEach((score, index) => {
      const players = groupedScores[score];
      const rank = index < 3 ? medals[index] : `${index + 1}.`;
      const playerNames = players.map(p => `<@${p.userId}>`).join(', ');
      const bear = players[0].bear;
      const total = players[0].total;

      dailyText += `${rank} ${playerNames} • ${score}/${total} | ${bear}\n`;
    });
  }

  // 2. Gather all-time scores for this server (top 20 players):
  let allTimeText = "";
  if (db) {
    try {
      const allTimeSnap = await db.collection('discord_guilds').doc(guildId)
        .collection('all_time_scores')
        .orderBy('totalPoints', 'desc')
        .limit(20)
        .get();

      if (!allTimeSnap.empty) {
        allTimeText = `\n🏆 **${serverName.toLowerCase()} all-time leaderboard**\n`;
        allTimeSnap.docs.forEach((doc, index) => {
          const data = doc.data();
          const rank = index < 3 ? medals[index] : `${index + 1}.`;
          const gamesLabel = data.gamesPlayed === 1 ? 'game' : 'games';
          const perfectTag = data.perfectScores ? ` | 🌟 x${data.perfectScores}` : '';
          allTimeText += `${rank} <@${data.userId}> • **${data.totalPoints}** pts (${data.gamesPlayed || 0} ${gamesLabel}${perfectTag})\n`;
        });
      }
    } catch (err) {
      console.error(`Failed to fetch all-time scores from Firestore for server ${guildId}:`, err);
    }
  }

  let responseText = `<:linguil:1473408144259678444> **linguil daily leaderboard**\n\n${dailyText}`;
  if (allTimeText) {
    responseText += `\n${allTimeText}`;
  }

  return responseText;
}

// Generate play button.
function getPlayButtonRow() {
  const playButton = new ButtonBuilder()
    .setLabel('Play linguil')
    .setEmoji('1473408144259678444')
    .setStyle(ButtonStyle.Primary)
    .setCustomId('play_linguil_btn');

  return new ActionRowBuilder().addComponents(playButton);
}

client.once('clientReady', async () => {
  console.log(`linguil bot is online as ${client.user.tag}`);

  // Sync server configs from Firestore.
  await loadServerConfigsFromFirestore();

  // 1. Register the slash commands globally.
  const setChannelCmd = new SlashCommandBuilder()
    .setName('setchannel')
    .setDescription('Set the channel where the bot will listen for and post linguil scores.')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild |
      PermissionFlagsBits.ManageChannels |
      PermissionFlagsBits.ModerateMembers
    )
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel to use')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    );

  const leaderboardCmd = new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the daily and all-time linguil leaderboards for this server.');

  try {
    await client.application.commands.create(setChannelCmd);
    await client.application.commands.create(leaderboardCmd);
    console.log('Global slash commands registered.');
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }

  // 2. Schedule the automatic daily leaderboard to post every day at midnight UTC.
  cron.schedule('0 0 * * *', () => {
    postLeaderboardsToAllServers();
  }, { timezone: "UTC" });
});

// Handle the slash commands and button interactions.
client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton() && interaction.customId === 'play_linguil_btn') {
    try {
      await interaction.launchActivity();
    } catch (err) {
      console.error("Failed to launch activity:", err);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'setchannel') {
    // Check if user has moderator or admin permissions.
    const member = interaction.member;
    const isModOrAdmin = member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
      member?.permissions?.has(PermissionFlagsBits.ManageChannels) ||
      member?.permissions?.has(PermissionFlagsBits.ModerateMembers) ||
      member?.permissions?.has(PermissionFlagsBits.Administrator);

    if (!isModOrAdmin) {
      return interaction.reply({
        content: "Only server moderators or administrators can use this command.",
        flags: MessageFlags.Ephemeral
      });
    }

    const selectedChannel = interaction.options.getChannel('channel');
    await saveConfig(interaction.guildId, selectedChannel.id);

    await interaction.reply({
      content: `Setup complete! I will now track scores and post the daily leaderboard in <#${selectedChannel.id}>.`,
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.commandName === 'leaderboard') {
    const configuredChannelId = serverConfigs[interaction.guildId];
    if (!configuredChannelId) {
      return interaction.reply({
        content: "An admin hasn't set up the tracking channel yet! Tell them to run `/setchannel`.",
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply();
    try {
      const text = await buildLeaderboardText(interaction.guildId);
      await interaction.editReply({ content: text, components: [getPlayButtonRow()] });
    } catch (err) {
      console.error("Error creating leaderboard reply:", err);
      await interaction.editReply({ content: "Sorry, there was an error generating the leaderboard." });
    }
  }
});

// Listen for scores.
client.on('messageCreate', async (message) => {
  // Ignore bots and DMs.
  if (message.author.bot || !message.guildId) return;

  // Check if this server has configured a channel.
  const configuredChannelId = serverConfigs[message.guildId];
  if (!configuredChannelId || message.channel.id !== configuredChannelId) return;

  const match = message.content.match(linguilRegex);

  if (match) {
    const day = match[1];
    const month = match[2];
    const year = match[3];
    const score = parseInt(match[4], 10);
    const total = parseInt(match[5], 10);
    const bear = match[6].trim();

    // Scores must be 0, 1, 2, or 3.
    if (isNaN(score) || score < 0 || score > total || total !== 3) {
      return;
    }

    const guildId = message.guildId;
    const userId = message.author.id;
    const username = message.author.displayName || message.author.username;
    const wordIdentifier = `20${year}-${month}-${day}`;
    const today = getTodayDateKey();

    // Ensure a Map exists for this specific server.
    if (!guildScores.has(guildId)) {
      guildScores.set(guildId, new Map());
    }

    const serverMap = guildScores.get(guildId);

    // Only process the user's first shared score of the day for this server.
    if (serverMap.has(userId)) {
      return;
    }

    // Anti-Cheat Verification: verify against Firestore daily score record.
    if (db) {
      try {
        const userScoreDoc = await db.collection('users').doc(userId)
          .collection('dailyScores').doc(wordIdentifier).get();

        if (!userScoreDoc.exists) {
          // No record of this user playing this daily quiz in Firestore.
          console.warn(`[Anti-Cheat] No game score record found in Firestore for user ${username} (${userId}) on ${wordIdentifier}. Reacting with snake.`);
          try {
            await message.react('🐍');
          } catch (reactErr) {
            console.error("Failed to react with snake emoji:", reactErr);
          }
          return;
        }

        const recordedScore = userScoreDoc.data()?.score;
        if (recordedScore !== score) {
          // Score modified by the user (does not match actual game score).
          console.warn(`[Anti-Cheat] Score mismatch for user ${username} (${userId}) on ${wordIdentifier}. Claimed: ${score}, Recorded: ${recordedScore}. Reacting with snake.`);
          try {
            await message.react('🐍');
          } catch (reactErr) {
            console.error("Failed to react with snake emoji:", reactErr);
          }
          return;
        }
      } catch (err) {
        console.error(`[Anti-Cheat] Error verifying user score in Firestore:`, err);
        // On database read failure, do not falsely accuse, but log the error.
      }
    }

    // Record verified score in memory.
    serverMap.set(userId, {
      userId,
      username,
      score,
      total,
      bear
    });

    // Persist verified score to Firestore: daily score and all-time running total for this server.
    if (db) {
      try {
        const batch = db.batch();

        // 1. Daily score document.
        const dailyDocRef = db.collection('discord_guilds').doc(guildId)
          .collection('daily_scores').doc(today)
          .collection('scores').doc(userId);

        batch.set(dailyDocRef, {
          userId,
          username,
          score,
          total,
          bear,
          createdAt: FieldValue.serverTimestamp(),
        });

        // 2. All-time score document.
        const allTimeDocRef = db.collection('discord_guilds').doc(guildId)
          .collection('all_time_scores').doc(userId);

        batch.set(allTimeDocRef, {
          userId,
          username,
          totalPoints: FieldValue.increment(score),
          gamesPlayed: FieldValue.increment(1),
          perfectScores: FieldValue.increment(score === total ? 1 : 0),
          lastPlayed: FieldValue.serverTimestamp(),
        }, { merge: true });

        await batch.commit();
      } catch (err) {
        console.error(`Failed to persist Discord score to Firestore for server ${guildId}:`, err);
      }
    }

    // Honest player: react with the bear emoji.
    try {
      await message.react('🐻');
    } catch (err) {
      console.error("Failed to react. Ensure bot has 'Add Reactions' permission:", err);
    }
  }
});

// Automatic daily leaderboard posted at midnight UTC.
async function postLeaderboardsToAllServers() {
  for (const [guildId, channelId] of Object.entries(serverConfigs)) {
    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) continue;

      const text = await buildLeaderboardText(guildId);
      await channel.send({ content: text, components: [getPlayButtonRow()] });
    } catch (error) {
      console.error(`Failed to post leaderboard to server ${guildId}:`, error);
    }
  }

  // Clear daily in-memory cache for all servers for the new day.
  guildScores.clear();
}

client.login(TOKEN);