type FacebookLoginResponse = {
  authResponse?: { code?: string };
  status?: string;
};

type FacebookSdk = {
  init: (opts: { appId: string; cookie?: boolean; xfbml?: boolean; version: string; autoLogAppEvents?: boolean }) => void;
  login: (cb: (response: FacebookLoginResponse) => void, opts: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

export type EmbeddedSignupSession = {
  event: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  businessId: string | null;
};

const FB_ORIGINS = new Set(["https://www.facebook.com", "https://web.facebook.com"]);

export function parseEmbeddedSignupMessage(data: unknown): EmbeddedSignupSession | null {
  let parsed = data;
  if (typeof data === "string") {
    try {
      parsed = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const payload = parsed as { type?: string; event?: string; data?: Record<string, unknown> };
  if (payload.type !== "WA_EMBEDDED_SIGNUP") return null;
  const info = payload.data && typeof payload.data === "object" ? payload.data : {};
  const asId = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value) : null);
  return {
    event: payload.event ? String(payload.event) : null,
    wabaId: asId(info["waba_id"]),
    phoneNumberId: asId(info["phone_number_id"]),
    businessId: asId(info["business_id"]),
  };
}

export function isFacebookOrigin(origin: string) {
  return FB_ORIGINS.has(origin);
}

export function loadFacebookSdk(appId: string, version: string) {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Facebook SDK solo está disponible en el navegador."));
      return;
    }
    if (window.FB) {
      window.FB.init({
        appId,
        cookie: true,
        xfbml: false,
        version,
        autoLogAppEvents: true,
      });
      resolve();
      return;
    }
    window.fbAsyncInit = () => {
      window.FB?.init({
        appId,
        cookie: true,
        xfbml: false,
        version,
        autoLogAppEvents: true,
      });
      resolve();
    };
    const existing = document.getElementById("facebook-jssdk");
    if (existing) return;
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/es_LA/sdk.js";
    script.onerror = () => reject(new Error("No se pudo cargar el SDK de Facebook."));
    document.body.appendChild(script);
  });
}

export function launchEmbeddedSignup(opts: {
  configId: string;
  featureType: string;
  sessionInfoVersion?: string;
}) {
  return new Promise<{ code: string; session: EmbeddedSignupSession | null }>((resolve, reject) => {
    if (!window.FB) {
      reject(new Error("El SDK de Facebook no está listo. Recarga la página."));
      return;
    }

    let session: EmbeddedSignupSession | null = null;
    const onMessage = (event: MessageEvent) => {
      if (!isFacebookOrigin(event.origin)) return;
      const parsed = parseEmbeddedSignupMessage(event.data);
      if (!parsed) return;
      session = parsed;
    };
    window.addEventListener("message", onMessage);

    window.FB.login(
      (response) => {
        window.removeEventListener("message", onMessage);
        const code = String(response?.authResponse?.code || "").trim();
        if (!code) {
          reject(new Error("El flujo de WhatsApp se canceló o no devolvió un código."));
          return;
        }
        resolve({ code, session });
      },
      {
        config_id: opts.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: opts.featureType,
          sessionInfoVersion: opts.sessionInfoVersion || "3",
        },
      },
    );
  });
}
