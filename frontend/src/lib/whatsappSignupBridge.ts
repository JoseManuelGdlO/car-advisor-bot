import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import type { MetaSignupTicketStatusDto } from "@/services/integrations";

export const WHATSAPP_SIGNUP_SCHEME = "autobot";
export const WHATSAPP_SIGNUP_RETURN_EVENT = "whatsapp-signup-return";

export type WhatsappSignupResult = "success" | "cancel" | "error";

const CANCELLED_MESSAGE = "Se canceló la conexión de WhatsApp.";

export function parseWhatsappSignupReturnUrl(url: string): WhatsappSignupResult | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${WHATSAPP_SIGNUP_SCHEME}:`) return null;
    if (parsed.hostname !== "whatsapp-signup") return null;
    const result = parsed.searchParams.get("result");
    if (result === "success" || result === "cancel" || result === "error") return result;
    return null;
  } catch {
    return null;
  }
}

export function createSignupPollSleeper() {
  let wake: (() => void) | null = null;
  return {
    kick() {
      wake?.();
    },
    sleep(ms: number) {
      return new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          wake = null;
          resolve();
        }, ms);
        wake = () => {
          clearTimeout(timer);
          wake = null;
          resolve();
        };
      });
    },
  };
}

export async function pollSignupTicket(options: {
  fetchStatus: () => Promise<MetaSignupTicketStatusDto>;
  sleep: (ms: number) => Promise<void>;
  isAborted?: () => boolean;
  dismissed?: () => boolean;
  intervalMs?: number;
  maxDismissedPolls?: number;
}): Promise<MetaSignupTicketStatusDto> {
  const intervalMs = options.intervalMs ?? 1000;
  const maxDismissedPolls = options.maxDismissedPolls ?? 15;
  let dismissedPolls = 0;
  for (;;) {
    if (options.isAborted?.()) {
      return { status: "cancelled", message: CANCELLED_MESSAGE };
    }
    let status: MetaSignupTicketStatusDto;
    try {
      status = await options.fetchStatus();
    } catch {
      if (options.isAborted?.()) {
        return { status: "cancelled", message: CANCELLED_MESSAGE };
      }
      if (options.dismissed?.()) {
        dismissedPolls += 1;
        if (dismissedPolls >= maxDismissedPolls) {
          return { status: "cancelled", message: CANCELLED_MESSAGE };
        }
      }
      await options.sleep(intervalMs);
      continue;
    }
    if (status.status !== "pending") return status;
    if (options.dismissed?.()) {
      dismissedPolls += 1;
      if (dismissedPolls >= maxDismissedPolls) {
        return { status: "cancelled", message: CANCELLED_MESSAGE };
      }
    }
    await options.sleep(intervalMs);
  }
}

export async function runNativeWhatsappSignup(options: {
  signupUrl: string;
  fetchStatus: () => Promise<MetaSignupTicketStatusDto>;
  openBrowser: (url: string) => Promise<void>;
  closeBrowser: () => Promise<void>;
  subscribeWake: (kick: () => void, markDismissed: () => void) => () => void;
  intervalMs?: number;
}): Promise<MetaSignupTicketStatusDto> {
  const sleeper = createSignupPollSleeper();
  let dismissed = false;
  let aborted = false;
  const unsubscribe = options.subscribeWake(
    () => sleeper.kick(),
    () => {
      dismissed = true;
      sleeper.kick();
    },
  );
  try {
    await options.openBrowser(options.signupUrl);
    return await pollSignupTicket({
      fetchStatus: options.fetchStatus,
      sleep: (ms) => sleeper.sleep(ms),
      isAborted: () => aborted,
      dismissed: () => dismissed,
      intervalMs: options.intervalMs,
    });
  } finally {
    aborted = true;
    unsubscribe();
    await options.closeBrowser().catch(() => undefined);
  }
}

export function subscribeNativeSignupWake(kick: () => void, markDismissed: () => void) {
  const onReturn = () => kick();
  window.addEventListener(WHATSAPP_SIGNUP_RETURN_EVENT, onReturn);
  const listeners = [
    Browser.addListener("browserFinished", markDismissed),
    App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) kick();
    }),
  ];
  return () => {
    window.removeEventListener(WHATSAPP_SIGNUP_RETURN_EVENT, onReturn);
    for (const pending of listeners) {
      void pending.then((handle) => handle.remove()).catch(() => undefined);
    }
  };
}

export async function openSignupBrowser(url: string) {
  await Browser.open({ url, presentationStyle: "fullscreen" });
}

export async function closeSignupBrowser() {
  await Browser.close();
}
