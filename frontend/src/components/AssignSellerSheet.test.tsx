import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssignSellerSheet } from "@/components/AssignSellerSheet";

const authState = { token: "tok", isAdmin: true };
vi.mock("@/context/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const list = vi.fn();
const assignClient = vi.fn();
vi.mock("@/services/sellers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/sellers")>();
  return { ...actual, sellersApi: { ...actual.sellersApi, list: (...a: unknown[]) => list(...a), assignClient: (...a: unknown[]) => assignClient(...a) } };
});

const sellers = [
  { id: "s1", name: "Sol Vendedora", email: "sol@x.com", active: true },
  { id: "s2", name: "Inactivo Perez", email: "old@x.com", active: false },
];

function renderSheet(target: { clientId: string; clientName: string; currentSellerId?: string | null } | null) {
  const onOpenChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AssignSellerSheet target={target} onOpenChange={onOpenChange} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

describe("AssignSellerSheet", () => {
  beforeEach(() => {
    authState.isAdmin = true;
    list.mockReset().mockResolvedValue(sellers);
    assignClient.mockReset().mockResolvedValue({});
  });

  it("lista solo vendedores activos y asigna al elegir uno", async () => {
    const { onOpenChange } = renderSheet({ clientId: "c1", clientName: "Juan", currentSellerId: null });
    const option = await screen.findByRole("button", { name: /Sol Vendedora/ });
    expect(screen.queryByText("Inactivo Perez")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin asignar")).not.toBeInTheDocument();

    fireEvent.click(option);
    await waitFor(() => expect(assignClient).toHaveBeenCalledWith("tok", "c1", "s1"));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("ofrece 'Sin asignar' cuando ya hay vendedor y desasigna con null", async () => {
    renderSheet({ clientId: "c1", clientName: "Juan", currentSellerId: "s1" });
    fireEvent.click(await screen.findByRole("button", { name: /Sin asignar/ }));
    await waitFor(() => expect(assignClient).toHaveBeenCalledWith("tok", "c1", null));
  });

  it("no se abre ni consulta vendedores si el usuario no es admin", () => {
    authState.isAdmin = false;
    renderSheet({ clientId: "c1", clientName: "Juan" });
    expect(screen.queryByText("Asignar vendedor")).not.toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
  });
});
