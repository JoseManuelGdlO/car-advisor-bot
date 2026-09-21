import { describe, expect, it } from "vitest";
import { parseEmbeddedSignupMessage } from "@/lib/meta-embedded-signup";

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
