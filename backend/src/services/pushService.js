import admin from "firebase-admin";
import { env } from "../config/env.js";
import { PushDevice, User } from "../models/index.js";
import { appLog } from "../utils/appLogger.js";
import { shouldDeliverPush, toNotificationPreferencesDto } from "./notificationPreferences.js";

let firebaseApp;

const resolvePrivateKey = () => {
  const raw = String(env.push.firebasePrivateKey || "").trim();
  if (!raw) return "";
  return raw.replace(/\\n/g, "\n");
};

const getMessaging = () => {
  if (firebaseApp) {
    return admin.messaging(firebaseApp);
  }
  const privateKey = resolvePrivateKey();
  if (!env.push.firebaseProjectId || !env.push.firebaseClientEmail || !privateKey) {
    console.warn("[pushService] Firebase credentials are not configured; skipping push delivery");
    return null;
  }
  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.push.firebaseProjectId,
      clientEmail: env.push.firebaseClientEmail,
      privateKey,
    }),
  });
  return admin.messaging(firebaseApp);
};

const normalizePlatform = (platform) => String(platform || "").trim().toLowerCase();

export const upsertPushDevice = async ({ ownerUserId, token, platform }) => {
  const [device] = await PushDevice.findOrCreate({
    where: { token },
    defaults: {
      ownerUserId,
      token,
      platform: normalizePlatform(platform),
      isActive: true,
      lastSeenAt: new Date(),
    },
  });
  await device.update({
    ownerUserId,
    platform: normalizePlatform(platform),
    isActive: true,
    lastSeenAt: new Date(),
  });
  return device;
};

export const deactivatePushDevice = async ({ ownerUserId, token }) => {
  const updated = await PushDevice.update(
    { isActive: false },
    { where: { ownerUserId, token, isActive: true } }
  );
  return updated[0];
};

export const sendPushToOwner = async ({ ownerUserId, title, body, data = {} }) => {
  const user = await User.findByPk(ownerUserId, {
    attributes: ["id", "pushEnabled", "notifyLeadInterest", "notifyEscalations", "notifyInboundMessages"],
  });
  if (!user) {
    appLog.info("pushService", "Push skipped reason=owner_not_found");
    appLog.debug("pushService", { ownerUserId, skippedReason: "owner_not_found" });
    return {
      sentCount: 0,
      failedCount: 0,
      deactivatedCount: 0,
      skippedReason: "owner_not_found",
    };
  }

  const prefs = toNotificationPreferencesDto(user);
  const kind = data?.notification_kind ?? data?.notificationKind ?? "";
  const delivery = shouldDeliverPush({ prefs, kind });
  if (!delivery.deliver) {
    appLog.info("pushService", `Push skipped reason=${delivery.skippedReason}`);
    appLog.debug("pushService", { ownerUserId, kind, skippedReason: delivery.skippedReason });
    return {
      sentCount: 0,
      failedCount: 0,
      deactivatedCount: 0,
      skippedReason: delivery.skippedReason,
    };
  }

  const devices = await PushDevice.findAll({
    where: { ownerUserId, isActive: true },
    attributes: ["id", "token"],
  });
  if (!devices.length) {
    appLog.info("pushService", "No active devices for owner");
    appLog.debug("pushService", { ownerUserId });
    return { sentCount: 0, failedCount: 0, deactivatedCount: 0 };
  }

  const messaging = getMessaging();
  if (!messaging) {
    return { sentCount: 0, failedCount: 0, deactivatedCount: 0 };
  }
  let sentCount = 0;
  let failedCount = 0;
  let deactivatedCount = 0;

  for (const device of devices) {
    try {
      await messaging.send({
        token: device.token,
        notification: { title, body },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      });
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      const code = String(error?.code || "");
      console.error("[pushService] Failed sending push to device", {
        deviceId: device.id,
        code,
        message: String(error?.message || ""),
      });
      appLog.debug("pushService", { ownerUserId, deviceId: device.id, code, context: "send_failed" });
      if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) {
        await device.update({ isActive: false });
        deactivatedCount += 1;
      }
    }
  }

  appLog.info(
    "pushService",
    `Push send result sentCount=${sentCount} failedCount=${failedCount} deactivatedCount=${deactivatedCount}`,
  );
  appLog.debug("pushService", { ownerUserId });
  return { sentCount, failedCount, deactivatedCount };
};
