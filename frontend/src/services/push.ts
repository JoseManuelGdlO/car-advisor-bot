import { apiRequest, type ApiRequestOptions } from "@/lib/api";

export type PushPlatform = "android" | "ios";

const suppressExpiry: ApiRequestOptions = { suppressSessionExpiry: true };

export const pushApi = {
  registerDevice: (token: string, deviceToken: string, platform: PushPlatform) =>
    apiRequest("/push/devices", "POST", { token: deviceToken, platform }, token, suppressExpiry),
  unregisterDevice: (token: string, deviceToken: string) =>
    apiRequest(`/push/devices/${encodeURIComponent(deviceToken)}`, "DELETE", undefined, token, suppressExpiry),
};
