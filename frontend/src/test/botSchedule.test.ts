import { describe, expect, it } from "vitest";
import { hasInvalidRanges } from "@/lib/botSchedule";

describe("bot schedule validation", () => {
  it("returns false for valid ranges", () => {
    const invalid = hasInvalidRanges({
      monday: [{ start: "08:00", end: "12:00" }],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: [],
    });
    expect(invalid).toBe(false);
  });

  it("returns true for invalid ranges", () => {
    const invalid = hasInvalidRanges({
      monday: [{ start: "18:00", end: "12:00" }],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: [],
    });
    expect(invalid).toBe(true);
  });
});
