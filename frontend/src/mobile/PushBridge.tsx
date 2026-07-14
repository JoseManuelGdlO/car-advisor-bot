import { useEffect, useRef } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { PushNotifications, Token, ActionPerformed, PushNotificationSchema } from "@capacitor/push-notifications";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { pushApi, type PushPlatform } from "@/services/push";
import { accountApi } from "@/services/account";
import { DEVICE_TOKEN_KEY, ensurePushRegistration } from "@/mobile/pushRegistration";

const PENDING_CHAT_KEY = "pending_push_chat_id";

const resolveConversationId = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const parseConversationIdFromUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const fromQuery = resolveConversationId(parsed.searchParams.get("conversationId"));
    if (fromQuery) return fromQuery;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[0] === "chat") {
      return resolveConversationId(parts[1]);
    }
    return "";
  } catch {
    return "";
  }
};

export function PushBridge() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const lastRegisteredDeviceTokenRef = useRef<string>("");

  const refreshConversationQueries = (conversationId?: string) => {
    void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    if (conversationId) {
      void queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
    }
  };

  const resolveConversationIdFromPushData = (data: Record<string, unknown>) =>
    resolveConversationId(data.conversationId) ||
    resolveConversationId(data.conversation_id) ||
    resolveConversationId(data.chatId);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const openConversation = (conversationId: string) => {
      if (!conversationId) return;
      if (token) {
        navigate(`/chat/${conversationId}`);
        return;
      }
      localStorage.setItem(PENDING_CHAT_KEY, conversationId);
      navigate("/login");
    };

    const setupPush = async () => {
      if (token) {
        try {
          const prefs = await accountApi.getNotificationPreferences(token);
          if (!prefs.pushEnabled) return;
        } catch {
          // Si falla el fetch de prefs, intenta registrar como hasta ahora.
        }
      }
      await ensurePushRegistration(token || "");
    };

    const onRegistration = async (registration: Token) => {
      const deviceToken = registration.value;
      if (!deviceToken) return;
      lastRegisteredDeviceTokenRef.current = deviceToken;
      localStorage.setItem(DEVICE_TOKEN_KEY, deviceToken);
      if (!token) return;
      const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
      await pushApi.registerDevice(token, deviceToken, platform as PushPlatform);
    };

    const onActionPerformed = (action: ActionPerformed) => {
      const data = action.notification.data || {};
      const conversationId = resolveConversationIdFromPushData(data);
      refreshConversationQueries(conversationId);
      openConversation(conversationId);
    };

    const onPushReceived = (notification: PushNotificationSchema) => {
      const data = notification.data || {};
      refreshConversationQueries(resolveConversationIdFromPushData(data));
    };

    // Capacitor: los listeners deben existir antes de register(), o el evento
    // "registration" puede perderse (sobre todo en iOS) y el token no se captura.
    void Promise.all([
      PushNotifications.addListener("registration", (registration) => {
        onRegistration(registration).catch(() => undefined);
      }),
      PushNotifications.addListener("registrationError", () => undefined),
      PushNotifications.addListener("pushNotificationReceived", onPushReceived),
      PushNotifications.addListener("pushNotificationActionPerformed", onActionPerformed),
    ])
      .then(() => setupPush())
      .catch(() => undefined);

    const urlHandle = CapacitorApp.addListener("appUrlOpen", ({ url }) => {
      const conversationId = parseConversationIdFromUrl(url);
      openConversation(conversationId);
    });

    return () => {
      PushNotifications.removeAllListeners().catch(() => undefined);
      urlHandle.then((handle) => handle.remove()).catch(() => undefined);
    };
  }, [navigate, queryClient, token]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !token) return;
    const pendingDeviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (pendingDeviceToken) {
      accountApi
        .getNotificationPreferences(token)
        .then((prefs) => {
          if (!prefs.pushEnabled) return;
          const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
          return pushApi.registerDevice(token, pendingDeviceToken, platform as PushPlatform);
        })
        .catch(() => undefined);
    }
    const pending = localStorage.getItem(PENDING_CHAT_KEY);
    if (!pending) return;
    localStorage.removeItem(PENDING_CHAT_KEY);
    navigate(`/chat/${pending}`);
  }, [navigate, token]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || token) return;
    const oldDeviceToken = lastRegisteredDeviceTokenRef.current;
    if (!oldDeviceToken) return;
    lastRegisteredDeviceTokenRef.current = "";
  }, [token]);

  return null;
}
