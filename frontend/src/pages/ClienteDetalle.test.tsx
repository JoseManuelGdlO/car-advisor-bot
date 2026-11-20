import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClienteDetalle from "@/pages/ClienteDetalle";

const authState = { token: "tok", isAdmin: true };
vi.mock("@/context/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const getClient = vi.fn();
vi.mock("@/services/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/crm")>();
  return {
    ...actual,
    crmApi: {
      ...actual.crmApi,
      getClient: (...args: unknown[]) => getClient(...args),
      getConversations: vi.fn().mockResolvedValue([]),
    },
  };
});

const client = {
  id: "c1",
  name: "Ana",
  phone: "5512345678",
  channel: "whatsapp" as const,
  status: "lead" as const,
  interestedIn: "Civic",
  lastMessage: "",
  lastMessageAt: "",
  notes: "",
  avatarColor: "bg-primary",
  assignedSeller: null,
};

function renderDetalle() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/clientes/c1"]}>
        <Routes>
          <Route path="/clientes/:id" element={<ClienteDetalle />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ClienteDetalle delete", () => {
  beforeEach(() => {
    authState.isAdmin = true;
    getClient.mockReset().mockResolvedValue(client);
  });

  it("el admin ve el botón de eliminar", async () => {
    renderDetalle();
    expect(await screen.findByRole("button", { name: "Eliminar cliente" })).toBeInTheDocument();
  });

  it("el vendedor no ve el botón de eliminar", async () => {
    authState.isAdmin = false;
    renderDetalle();
    await waitFor(() => expect(getClient).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Eliminar cliente" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar cliente" })).toBeInTheDocument();
  });
});
