import { afterEach, describe, expect, it, vi } from "vitest";
import { describeDeactivation, filterAssignableSellers, sellersApi, type SellerDto } from "@/services/sellers";

const seller = (overrides: Partial<SellerDto>): SellerDto => ({
  id: "s1",
  name: "Sol",
  email: "sol@x.com",
  phone: null,
  active: true,
  role: "seller",
  autoAssignLeads: false,
  weeklySchedule: {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  },
  createdAt: null,
  ...overrides,
});

describe("sellers service", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("describeDeactivation informa cuántos leads quedaron sin asignar", () => {
    expect(describeDeactivation(0)).toMatch(/no tenía leads/i);
    expect(describeDeactivation(1)).toMatch(/1 lead quedó sin asignar/);
    expect(describeDeactivation(5)).toMatch(/5 leads quedaron sin asignar/);
  });

  it("filterAssignableSellers excluye vendedores dados de baja", () => {
    const result = filterAssignableSellers([seller({ id: "a" }), seller({ id: "b", active: false })]);
    expect(result.map((s) => s.id)).toEqual(["a"]);
  });

  it("list pide includeInactive solo cuando se solicita", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "[]" });
    vi.stubGlobal("fetch", fetchMock);
    await sellersApi.list("tok");
    await sellersApi.list("tok", { includeInactive: true });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/sellers$/);
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/sellers\?includeInactive=1$/);
  });

  it("updateLeadSchedule envía interruptor y horario", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });
    vi.stubGlobal("fetch", fetchMock);
    await sellersApi.updateLeadSchedule("tok", "s1", {
      autoAssignLeads: true,
      weeklySchedule: {
        monday: [{ start: "09:00", end: "18:00" }],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: [],
      },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/sellers\/s1\/lead-schedule$/);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({
      autoAssignLeads: true,
      weeklySchedule: {
        monday: [{ start: "09:00", end: "18:00" }],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: [],
      },
    });
  });

  it("assignClient envía assignedSellerUserId (null desasigna)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });
    vi.stubGlobal("fetch", fetchMock);
    await sellersApi.assignClient("tok", "c1", null);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/clients\/c1\/assignment$/);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ assignedSellerUserId: null });
  });
});
