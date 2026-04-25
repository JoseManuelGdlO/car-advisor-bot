import { apiRequest } from "@/lib/api";

export type PushPlatform = "android" | "ios";

export const pushApi = {
  registerDevice: (token: string, deviceToken: string, platform: PushPlatform) =>
    apiRequest("/push/devices", "POST", { token: deviceToken, platform }, token),
  unregisterDevice: (token: string, deviceToken: string) =>
    apiRequest(`/push/devices/${encodeURIComponent(deviceToken)}`, "DELETE", undefined, token),
};
