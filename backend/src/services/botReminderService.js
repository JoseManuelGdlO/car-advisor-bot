import { Op } from "sequelize";
import { env } from "../config/env.js";
import { sequelize } from "../config/database.js";
import { BotSetting, ClientLead, Conversation, Message } from "../models/index.js";
import { isWithinBotSchedule, toBotSettingsDto } from "../utils/botSettings.js";
import { sendConversationTextMessage } from "./conversationService.js";
import { isPhoneBlacklisted } from "./phoneBlacklistService.js";

const BOT_LAST_MESSAGE_FROM = ["bot", "assistant"];
const SUPPORTED_CHANNELS = ["whatsapp", "instagram"];

let intervalTimer = null;
let bootTimer = null;
let running = false;

const resolveDisplayPhone = (conversation) => {
  const client = conversation.client;
  return String(client?.displayPhone || client?.phone || "").trim();
};

const getLatestMessage = async (conversationId) =>
  Message.findOne({
    where: { conversationId },
    order: [
      ["createdAt", "DESC"],
      ["id", "DESC"],
    ],
  });

const processConversationReminder = async ({ conversation, reminderMessage }) => {
  const channel = String(conversation.channel || "").toLowerCase();
  if (!SUPPORTED_CHANNELS.includes(channel)) return;

  if (conversation.isHumanControlled) return;

  const displayPhone = resolveDisplayPhone(conversation);
  if (displayPhone) {
    const blacklisted = await isPhoneBlacklisted({
      ownerUserId: conversation.ownerUserId,
      displayPhone,
    });
    if (blacklisted) return;
  }

  const latest = await getLatestMessage(conversation.id);
  if (!latest || !BOT_LAST_MESSAGE_FROM.includes(String(latest.from || "").toLowerCase())) {
    return;
  }

  await sendConversationTextMessage({
    ownerUserId: conversation.ownerUserId,
    conversationId: conversation.id,
    text: reminderMessage,
    senderRole: "assistant",
  });

  await conversation.update({ lastReminderAt: new Date() });
};

const buildReminderWhere = ({ ownerUserId, reminderHours, oncePerConversation }) => {
  const cutoff = new Date(Date.now() - reminderHours * 60 * 60 * 1000);
  const where = {
    ownerUserId,
    isHumanControlled: false,
    channel: { [Op.in]: SUPPORTED_CHANNELS },
    lastTime: { [Op.lte]: cutoff },
  };

  if (oncePerConversation) {
    where.lastReminderAt = null;
  } else {
    where[Op.or] = [
      { lastReminderAt: null },
      sequelize.where(
        sequelize.col("conversations.last_reminder_at"),
        Op.lt,
        sequelize.col("conversations.last_time")
      ),
    ];
  }

  return where;
};

export const processBotReminders = async () => {
  const settingsRows = await BotSetting.findAll({
    where: { reminderEnabled: true },
  });

  for (const row of settingsRows) {
    const settings = toBotSettingsDto(row);
    const reminderMessage = settings.reminderMessage;
    const reminderHours = settings.reminderHours;
    if (!reminderMessage || !reminderHours) continue;
    if (!isWithinBotSchedule(settings)) continue;

    const conversations = await Conversation.findAll({
      where: buildReminderWhere({
        ownerUserId: row.ownerUserId,
        reminderHours,
        oncePerConversation: settings.reminderOncePerConversation,
      }),
      include: [{ model: ClientLead, as: "client", required: false }],
      limit: 100,
    });

    for (const conversation of conversations) {
      try {
        await processConversationReminder({ conversation, reminderMessage });
      } catch (error) {
        console.error(
          `[bot-reminder] Failed conversation=${conversation.id} owner=${row.ownerUserId}`,
          error?.message || error
        );
      }
    }
  }
};

const tick = async () => {
  if (running) return;
  running = true;
  try {
    await processBotReminders();
  } catch (error) {
    console.error("[bot-reminder] Poller tick failed", error?.message || error);
  } finally {
    running = false;
  }
};

export const startBotReminderWorker = () => {
  if (intervalTimer || bootTimer) return;
  const pollMs = env.bot.reminderPollMs;
  console.log(`[bot-reminder] Starting worker (poll every ${pollMs}ms)`);
  // Primera pasada diferida para no bloquear el boot.
  bootTimer = setTimeout(() => {
    bootTimer = null;
    tick();
    intervalTimer = setInterval(tick, pollMs);
    if (typeof intervalTimer.unref === "function") intervalTimer.unref();
  }, Math.min(pollMs, 30_000));
  if (typeof bootTimer.unref === "function") bootTimer.unref();
};

export const stopBotReminderWorker = () => {
  if (bootTimer) {
    clearTimeout(bootTimer);
    bootTimer = null;
  }
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
};
