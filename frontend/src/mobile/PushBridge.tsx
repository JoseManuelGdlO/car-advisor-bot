import { useEffect, useRef } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { PushNotifications, Token, ActionPerformed } from "@capacitor/push-notifications";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { pushApi, type PushPlatform } from "@/services/push";

const PENDING_CHAT_KEY = "pending_push_chat_id";
const DEVICE_TOKEN_KEY = "push_device_token";

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
  const { token } = useAuth();
  const lastRegisteredDeviceTokenRef = useRef<string>("");

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
      let permissions = await PushNotifications.checkPermissions();
      if (permissions.receive === "prompt") {
        permissions = await PushNotifications.requestPermissions();
      }
      if (permissions.receive !== "granted") {
        return;
      }

      await PushNotifications.register();
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
      const conversationId =
        resolveConversationId(data.conversationId) ||
        resolveConversationId(data.conversation_id) ||
        resolveConversationId(data.chatId);
      openConversation(conversationId);
    };

    setupPush().catch(() => undefined);
    PushNotifications.addListener("registration", (registration) => {
      onRegistration(registration).catch(() => undefined);
    });
    PushNotifications.addListener("registrationError", () => undefined);
    PushNotifications.addListener("pushNotificationActionPerformed", onActionPerformed);
    const urlHandle = CapacitorApp.addListener("appUrlOpen", ({ url }) => {
      const conversationId = parseConversationIdFromUrl(url);
      openConversation(conversationId);
    });

    return () => {
      PushNotifications.removeAllListeners().catch(() => undefined);
      urlHandle.then((handle) => handle.remove()).catch(() => undefined);
    };
  }, [navigate, token]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !token) return;
    const pendingDeviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (pendingDeviceToken) {
      const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
      pushApi.registerDevice(token, pendingDeviceToken, platform as PushPlatform).catch(() => undefined);
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
