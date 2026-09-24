import { Op } from "sequelize";
import { env } from "../config/env.js";
import { sequelize } from "../config/database.js";
import { BotSetting, ChannelConversationContext, ChannelIntegration, ClientLead, Conversation, Message } from "../models/index.js";
import { isWithinBotSchedule, toBotSettingsDto } from "../utils/botSettings.js";
import { sendConversationTemplateMessage, sendConversationTextMessage } from "./conversationService.js";
import { isPhoneBlacklisted } from "./phoneBlacklistService.js";
import { getFollowupTemplate, isFollowupTemplateApproved } from "./whatsappFollowupTemplateService.js";

const BOT_LAST_MESSAGE_FROM = ["bot", "assistant"];
const SUPPORTED_CHANNELS = ["whatsapp", "instagram"];
const CUSTOMER_WINDOW_MS = 24 * 60 * 60 * 1000;

let intervalTimer = null;
let bootTimer = null;
let running = false;

/** Combina el texto de seguimiento con la última pregunta del bot en el CRM. */
export const buildReminderOutboundText = ({ reminderMessage, lastBotText }) => {
  const reminder = String(reminderMessage || "").trim();
  const lastBot = String(lastBotText || "").trim();
  if (!lastBot) return null;
  if (!reminder || reminder === lastBot) return lastBot;
  return `${reminder}\n\n${lastBot}`;
};

export function isWhatsappCustomerWindowOpen(lastClientAt, now = Date.now()) {
  if (!lastClientAt) return false;
  return now - new Date(lastClientAt).getTime() < CUSTOMER_WINDOW_MS;
}

export const findLastClientMessageAt = async (conversationId) => {
  const row = await Message.findOne({
    where: { conversationId, from: "client" },
    order: [["createdAt", "DESC"]],
  });
  return row?.createdAt ?? null;
};

export async function getApprovedFollowupForOwner(ownerUserId) {
  return getFollowupTemplate({ ownerUserId });
}

export async function defaultResolveWhatsappProvider(conversation) {
  const context = await ChannelConversationContext.findOne({
    where: { ownerUserId: conversation.ownerUserId, conversationId: conversation.id },
    order: [["updatedAt", "DESC"]],
  });
  if (!context?.channelIntegrationId) return null;
  const integration = await ChannelIntegration.findByPk(context.channelIntegrationId);
  const provider = integration?.provider;
  if (provider == null || provider === "") return null;
  return String(provider);
}

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

export const processConversationReminder = async ({
  conversation,
  reminderMessage,
  sendTextMessage = sendConversationTextMessage,
  sendTemplateMessage = sendConversationTemplateMessage,
  loadFollowupTemplate = getApprovedFollowupForOwner,
  getLastClientAt = findLastClientMessageAt,
  resolveWhatsappProvider = defaultResolveWhatsappProvider,
}) => {
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

  const outboundText = buildReminderOutboundText({
    reminderMessage,
    lastBotText: latest.text,
  });
  if (!outboundText) return;

  if (channel === "whatsapp") {
    const lastClientAt = await getLastClientAt(conversation.id);
    if (!isWhatsappCustomerWindowOpen(lastClientAt)) {
      const followup = await loadFollowupTemplate(conversation.ownerUserId);
      const provider = followup?.metaConnected
        ? await resolveWhatsappProvider(conversation)
        : null;
      if (followup?.metaConnected && provider === "meta") {
        const tpl = followup.template;
        if (!isFollowupTemplateApproved(tpl)) {
          console.warn(
            `[bot-reminder] skip HSM (template not approved) conversation=${conversation.id}`
          );
          return;
        }
        await sendTemplateMessage({
          ownerUserId: conversation.ownerUserId,
          conversationId: conversation.id,
          templateName: tpl.name,
          language: tpl.language,
          persistText: tpl.body || reminderMessage,
        });
        await conversation.update({ lastReminderAt: new Date() });
        return;
      }
    }
  }

  try {
    await sendTextMessage({
      ownerUserId: conversation.ownerUserId,
      conversationId: conversation.id,
      text: outboundText,
      senderRole: "assistant",
    });
  } catch (error) {
    const details = `${error?.message || ""} ${error?.meta?.message || ""}`.toLowerCase();
    if (
      details.includes("24 hours") ||
      details.includes("24 horas") ||
      details.includes("re-engagement") ||
      details.includes("reengagement")
    ) {
      console.warn(
        `[bot-reminder] Graph 24h/re-engagement conversation=${conversation.id} owner=${conversation.ownerUserId}`,
        error?.message || error
      );
    } else {
      throw error;
    }
  }

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
