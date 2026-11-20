import { describe, expect, it } from "vitest";
import { formatClientPhoneForDisplay } from "@/lib/phone";

describe("formatClientPhoneForDisplay", () => {
  it("oculta el prefijo 521 de un número mexicano de 13 dígitos", () => {
    expect(formatClientPhoneForDisplay("5216183083714")).toBe("6183083714");
    expect(formatClientPhoneForDisplay("+521 618 308 3714")).toBe("6183083714");
  });

  it("deja igual un número que ya no trae 521", () => {
    expect(formatClientPhoneForDisplay("6183083714")).toBe("6183083714");
    expect(formatClientPhoneForDisplay("+526183083714")).toBe("+526183083714");
  });
});
