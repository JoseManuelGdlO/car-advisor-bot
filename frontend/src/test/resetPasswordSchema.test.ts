import { describe, expect, it } from "vitest";
import { z } from "zod";

const resetPasswordSchema = z
  .object({
    email: z.string().trim().email("Introduce un correo electrónico válido."),
    code: z
      .string()
      .trim()
      .length(6, "El código debe tener 6 dígitos.")
      .regex(/^\d{6}$/, "El código debe contener solo números."),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
    confirmPassword: z.string().min(6, "Confirma tu contraseña."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

describe("resetPasswordSchema", () => {
  it("accepts valid payload", () => {
    const parsed = resetPasswordSchema.safeParse({
      email: "user@example.com",
      code: "123456",
      password: "secret1",
      confirmPassword: "secret1",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects non-numeric code", () => {
    const parsed = resetPasswordSchema.safeParse({
      email: "user@example.com",
      code: "12ab56",
      password: "secret1",
      confirmPassword: "secret1",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects mismatched passwords", () => {
    const parsed = resetPasswordSchema.safeParse({
      email: "user@example.com",
      code: "123456",
      password: "secret1",
      confirmPassword: "secret2",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path.includes("confirmPassword"))).toBe(true);
    }
  });
});
