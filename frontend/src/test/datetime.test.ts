import { describe, expect, it } from "vitest";
import {
  formatChatDayLabel,
  formatDateTime,
  formatMessageTime,
  getZonedDayDifference,
  getZonedDayKey,
} from "@/lib/datetime";

describe("datetime formatting by bot timezone", () => {
  const instant = "2026-07-17T05:30:00.000Z";

  it("calculates the calendar day in the configured timezone", () => {
    expect(getZonedDayKey(instant, "America/Mexico_City")).toBe("2026-07-16");
    expect(getZonedDayKey(instant, "America/Bogota")).toBe("2026-07-17");
  });

  it("calculates relative day labels in the configured timezone", () => {
    const reference = new Date("2026-07-17T06:00:00.000Z");

    expect(formatChatDayLabel(instant, "America/Mexico_City", reference)).toBe("Ayer");
    expect(formatChatDayLabel(instant, "America/Bogota", reference)).toBe("Hoy");
    expect(getZonedDayDifference(instant, "America/Mexico_City", reference)).toBe(1);
  });

  it("formats message times and full dates in the configured timezone", () => {
    const midday = "2026-07-16T18:00:00.000Z";

    expect(formatMessageTime(midday, "America/Mexico_City")).toBe("12:00");
    expect(formatMessageTime(midday, "America/Bogota")).toBe("13:00");
    expect(formatDateTime(midday, "America/Mexico_City")).toContain("12:00");
  });
});
