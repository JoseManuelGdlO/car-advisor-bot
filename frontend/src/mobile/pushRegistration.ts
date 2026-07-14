import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { AndroidSettings, IOSSettings, NativeSettings } from "capacitor-native-settings";
import { pushApi, type PushPlatform } from "@/services/push";

export const DEVICE_TOKEN_KEY = "push_device_token";

export type OsPushPermissionStatus = "granted" | "denied" | "prompt" | "unsupported";

export const getStoredDeviceToken = () => localStorage.getItem(DEVICE_TOKEN_KEY)?.trim() || "";

export const checkOsPushPermission = async (): Promise<OsPushPermissionStatus> => {
  if (!Capacitor.isNativePlatform()) return "unsupported";
  try {
    const permissions = await PushNotifications.checkPermissions();
    if (permissions.receive === "granted") return "granted";
    if (permissions.receive === "denied") return "denied";
    return "prompt";
  } catch {
    return "denied";
  }
};

export const openNativeAppSettings = async () => {
  if (!Capacitor.isNativePlatform()) return;
  await NativeSettings.open({
    optionAndroid: AndroidSettings.ApplicationDetails,
    optionIOS: IOSSettings.App,
  });
};

/**
 * Solicita permiso y registra el device en Capacitor/FCM (nativo).
 * El token se persiste en localStorage; el registro en backend ocurre via listener de PushBridge o aqui si ya hay token.
 */
export const ensurePushRegistration = async (authToken: string): Promise<OsPushPermissionStatus> => {
  if (!Capacitor.isNativePlatform()) return "unsupported";

  let permissions = await PushNotifications.checkPermissions();
  if (permissions.receive === "prompt") {
    permissions = await PushNotifications.requestPermissions();
  }
  if (permissions.receive !== "granted") {
    return permissions.receive === "denied" ? "denied" : "prompt";
  }

  await PushNotifications.register();

  const deviceToken = getStoredDeviceToken();
  if (deviceToken && authToken) {
    const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
    await pushApi.registerDevice(authToken, deviceToken, platform as PushPlatform);
  }

  return "granted";
};

export const unregisterStoredPushDevice = async (authToken: string) => {
  const deviceToken = getStoredDeviceToken();
  if (!authToken || !deviceToken) return;
  await pushApi.unregisterDevice(authToken, deviceToken).catch(() => undefined);
};
