import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, ApiRequestError, setUnauthorizedHandler } from "@/lib/api";

describe("apiRequest session expiry", () => {
  const handler = vi.fn();

  beforeEach(() => {
    handler.mockReset();
    setUnauthorizedHandler(handler);
  });

  afterEach(() => {
    setUnauthorizedHandler(null);
    vi.unstubAllGlobals();
  });

  it("invoca el handler global ante 401 con Bearer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: "Unauthorized" }),
      }),
    );

    await expect(apiRequest("/account/profile", "GET", undefined, "token-123")).rejects.toBeInstanceOf(
      ApiRequestError,
    );
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("no invoca el handler global ante 401 con suppressSessionExpiry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: "Unauthorized" }),
      }),
    );

    await expect(
      apiRequest("/account/profile", "GET", undefined, "token-123", { suppressSessionExpiry: true }),
    ).rejects.toBeInstanceOf(ApiRequestError);
    expect(handler).not.toHaveBeenCalled();
  });
});
