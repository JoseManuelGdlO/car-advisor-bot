import { describe, expect, it } from "vitest";
import { formatUserFacingMessage } from "@/lib/formErrors";

describe("formatUserFacingMessage", () => {
  it("devuelve mensajes legibles sin tocar texto plano", () => {
    expect(formatUserFacingMessage("Credenciales incorrectas.")).toBe("Credenciales incorrectas.");
  });

  it("extrae un único mensaje de un array Zod serializado", () => {
    const raw = JSON.stringify([{ code: "unrecognized_keys", message: 'Unrecognized key: "calendarSchedulingUrl"' }]);
    expect(formatUserFacingMessage(raw)).toBe('Unrecognized key: "calendarSchedulingUrl"');
  });

  it("usa fallback cuando el JSON no tiene campos message", () => {
    const raw = JSON.stringify([{ code: "unrecognized_keys", keys: ["calendarSchedulingUrl"] }]);
    expect(formatUserFacingMessage(raw)).toBe("Revisa los datos del formulario.");
    expect(formatUserFacingMessage(raw, "No se pudo guardar el perfil.")).toBe("No se pudo guardar el perfil.");
  });

  it("usa fallback para arrays vacíos o JSON inválido", () => {
    expect(formatUserFacingMessage("[]")).toBe("Revisa los datos del formulario.");
    expect(formatUserFacingMessage("[{")).toBe("Revisa los datos del formulario.");
  });
});
