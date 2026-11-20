import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Vendedores from "@/pages/Vendedores";
import { emptyWeeklySchedule } from "@/lib/botSchedule";
import type { SellerDto } from "@/services/sellers";

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ token: "tok" }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const list = vi.fn();
const updateLeadSchedule = vi.fn();
vi.mock("@/services/sellers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/sellers")>();
  return {
    ...actual,
    sellersApi: {
      ...actual.sellersApi,
      list: (...args: unknown[]) => list(...args),
      updateLeadSchedule: (...args: unknown[]) => updateLeadSchedule(...args),
    },
  };
});

const seller = (overrides: Partial<SellerDto> = {}): SellerDto => ({
  id: "s1",
  name: "Sol Vendedora",
  email: "sol@x.com",
  phone: null,
  active: true,
  role: "seller",
  autoAssignLeads: false,
  weeklySchedule: emptyWeeklySchedule(),
  createdAt: null,
  assignedLeadsCount: 2,
  ...overrides,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Vendedores />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Vendedores lead schedule", () => {
  beforeEach(() => {
    list.mockReset().mockResolvedValue([
      seller(),
      seller({ id: "s2", name: "Baja Perez", email: "baja@x.com", active: false }),
    ]);
    updateLeadSchedule.mockReset().mockResolvedValue(seller({ autoAssignLeads: true }));
  });

  it("en vendedores activos muestra interruptor y abre el horario", async () => {
    renderPage();
    const toggle = await screen.findByRole("switch", { name: "Asignación automática de Sol Vendedora" });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);
    await waitFor(() =>
      expect(updateLeadSchedule).toHaveBeenCalledWith("tok", "s1", { autoAssignLeads: true }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Horario de Sol Vendedora" }));
    expect(await screen.findByRole("heading", { name: "Horario de toma de leads" })).toBeInTheDocument();
    expect(screen.getByText("Lunes")).toBeInTheDocument();
  });

  it("en inactivos no muestra interruptor ni horario", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Inactivos/ }));
    expect(await screen.findByText("Baja Perez")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Horario de/ })).not.toBeInTheDocument();
  });
});
