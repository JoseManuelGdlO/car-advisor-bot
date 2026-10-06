import { describe, expect, it } from "vitest";
import { parseWhatsappSignupReturnUrl, pollSignupTicket } from "@/lib/whatsappSignupBridge";

describe("parseWhatsappSignupReturnUrl", () => {
  it("acepta solo success, cancel y error", () => {
    expect(parseWhatsappSignupReturnUrl("autobot://whatsapp-signup?result=success")).toBe("success");
    expect(parseWhatsappSignupReturnUrl("autobot://whatsapp-signup?result=cancel")).toBe("cancel");
    expect(parseWhatsappSignupReturnUrl("autobot://whatsapp-signup?result=error")).toBe("error");
  });

  it("ignora un código o un resultado desconocido", () => {
    expect(parseWhatsappSignupReturnUrl("autobot://whatsapp-signup?result=success&code=abc&waba_id=1")).toBe("success");
    expect(parseWhatsappSignupReturnUrl("autobot://whatsapp-signup?result=nope")).toBeNull();
    expect(parseWhatsappSignupReturnUrl("autobot://otra-ruta?result=success")).toBeNull();
    expect(parseWhatsappSignupReturnUrl("https://api.example.com/whatsapp-signup?result=success")).toBeNull();
  });
});

describe("pollSignupTicket", () => {
  it("espera mientras el ticket sigue pendiente", async () => {
    const statuses = ["pending", "pending", "completed"] as const;
    let index = 0;
    const status = await pollSignupTicket({
      fetchStatus: async () => ({
        status: statuses[index++] ?? "completed",
        message: index >= 3 ? "WhatsApp conectado." : "Esperando",
      }),
      sleep: async () => undefined,
      intervalMs: 1000,
    });
    expect(status.status).toBe("completed");
    expect(index).toBe(3);
  });

  it("cancela si el navegador se cerró y el alta no termina", async () => {
    let calls = 0;
    const status = await pollSignupTicket({
      fetchStatus: async () => {
        calls += 1;
        return { status: "pending", message: "Esperando" };
      },
      sleep: async () => undefined,
      dismissed: () => true,
      maxDismissedPolls: 2,
    });
    expect(status.status).toBe("cancelled");
    expect(calls).toBe(2);
  });
});
