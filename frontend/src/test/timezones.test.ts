import { describe, expect, it } from "vitest";
import { getTimezoneLabel, normalizeTimezoneValue } from "@/lib/timezones";

describe("timezone normalization", () => {
  it("maps case-insensitive values to canonical IANA ids", () => {
    expect(normalizeTimezoneValue("america/monterrey")).toBe("America/Monterrey");
    expect(normalizeTimezoneValue("AMERICA/BOGOTA")).toBe("America/Bogota");
  });

  it("returns friendly labels for known timezones", () => {
    expect(getTimezoneLabel("america/monterrey")).toBe("Monterrey");
  });
});
