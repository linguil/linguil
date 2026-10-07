import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { db } from "./init";

if (getApps().length === 0) {
  initializeApp();
}

const discordBotToken = defineSecret("DISCORD_BOT_TOKEN");

export const logDiscordServerCount = onSchedule(
  {
    schedule: "every 24 hours",
    secrets: [discordBotToken],
    timeZone: "UTC",
    region: "us-central1",
  },
  async (_event) => {
    logger.info("Starting logDiscordServerCount function run.");

    const url = "https://discord.com/api/v10/applications/@me";

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bot ${discordBotToken.value()}`,
          "Content-Type": "application/json",
          "User-Agent": "DiscordBot (https://linguil.app, 1.0)",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("Discord API Error:", {
          status: response.status,
          text: errorText,
        });
        return;
      }

      const json = (await response.json()) as { approximate_guild_count?: number };
      const serverCount = json.approximate_guild_count || 0;

      await db.collection("discord_metrics").add({
        serverCount: serverCount,
        createdAt: FieldValue.serverTimestamp(),
      });

      logger.info(`Successfully logged Discord server count: ${serverCount}`);
    } catch (error) {
      logger.error("Function execution error:", { fullError: error });
    }
  }
);