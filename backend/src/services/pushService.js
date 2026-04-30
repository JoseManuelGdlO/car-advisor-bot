import admin from "firebase-admin";
import { env } from "../config/env.js";
import { PushDevice } from "../models/index.js";

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
  const devices = await PushDevice.findAll({
    where: { ownerUserId, isActive: true },
    attributes: ["id", "token"],
  });
  if (!devices.length) {
    console.info("[pushService] No active devices for owner", { ownerUserId });
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
        ownerUserId,
        deviceId: device.id,
        code,
        message: String(error?.message || ""),
      });
      if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) {
        await device.update({ isActive: false });
        deactivatedCount += 1;
      }
    }
  }

  console.info("[pushService] Push send result", { ownerUserId, sentCount, failedCount, deactivatedCount });
  return { sentCount, failedCount, deactivatedCount };
};
