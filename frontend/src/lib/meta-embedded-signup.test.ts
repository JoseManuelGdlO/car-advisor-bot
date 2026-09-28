import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFacebookSdk, parseEmbeddedSignupMessage } from "@/lib/meta-embedded-signup";

describe("parseEmbeddedSignupMessage", () => {
  it("lee waba_id y phone_number_id del postMessage", () => {
    const session = parseEmbeddedSignupMessage({
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
      data: { waba_id: "W", phone_number_id: "P", business_id: "B" },
    });
    expect(session).toEqual({
      event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
      wabaId: "W",
      phoneNumberId: "P",
      businessId: "B",
    });
  });

  it("ignora orígenes/payloads que no son Embedded Signup", () => {
    expect(parseEmbeddedSignupMessage({ type: "other" })).toBeNull();
  });
});

describe("loadFacebookSdk", () => {
  afterEach(() => {
    document.getElementById("facebook-jssdk")?.remove();
    delete window.FB;
    delete window.fbAsyncInit;
  });

  it("reinyecta el script si existe #facebook-jssdk pero aún no hay window.FB", async () => {
    const stale = document.createElement("script");
    stale.id = "facebook-jssdk";
    document.body.appendChild(stale);

    const pending = loadFacebookSdk("app-id", "v21.0");
    const injected = document.getElementById("facebook-jssdk");
    expect(injected).not.toBeNull();
    expect(injected).not.toBe(stale);
    expect(String(injected?.getAttribute("src") || "")).toContain("connect.facebook.net");

    window.FB = { init: vi.fn(), login: vi.fn() };
    window.fbAsyncInit?.();
    await pending;
    expect(window.FB.init).toHaveBeenCalledWith(expect.objectContaining({ appId: "app-id", version: "v21.0" }));
  });
});
