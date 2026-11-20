import { describe, expect, it } from "vitest";
import { canAccessPath, isAdminOnlyPath, isAdminUser, isSellerUser, resolveUserRole } from "@/lib/roles";

describe("roles", () => {
  it("trata usuarios sin role como admin", () => {
    expect(resolveUserRole(null)).toBe("admin");
    expect(resolveUserRole({})).toBe("admin");
    expect(isAdminUser({ role: "admin" })).toBe(true);
  });

  it("detecta vendedor", () => {
    expect(resolveUserRole({ role: "seller" })).toBe("seller");
    expect(isSellerUser({ role: "seller" })).toBe(true);
    expect(isAdminUser({ role: "seller" })).toBe(false);
  });

  it("marca rutas solo-admin", () => {
    for (const path of [
      "/vendedores",
      "/config/faqs",
      "/config/bot",
      "/config/comportamiento-bot",
      "/perfil/integraciones",
    ]) {
      expect(isAdminOnlyPath(path)).toBe(true);
    }
    for (const path of ["/config", "/perfil", "/perfil/notificaciones", "/vehiculos", "/chats", "/clientes", "/privacidad"]) {
      expect(isAdminOnlyPath(path)).toBe(false);
    }
  });

  it("el vendedor no accede a rutas admin pero el admin sí", () => {
    expect(canAccessPath({ role: "seller" }, "/vendedores")).toBe(false);
    expect(canAccessPath({ role: "seller" }, "/perfil/notificaciones")).toBe(true);
    expect(canAccessPath({ role: "admin" }, "/vendedores")).toBe(true);
  });
});
