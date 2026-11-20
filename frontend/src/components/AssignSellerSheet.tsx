import { Check, UserX, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Avatar } from "@/components/Avatar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/context/AuthContext";
import { normalizeApiError } from "@/lib/formErrors";
import { cn } from "@/lib/utils";
import { filterAssignableSellers, sellersApi } from "@/services/sellers";

export type AssignSellerTarget = {
  clientId: string;
  clientName: string;
  currentSellerId?: string | null;
};

type Props = {
  target: AssignSellerTarget | null;
  onOpenChange: (open: boolean) => void;
};

/** Sheet "Asignar vendedor": solo lista vendedores activos; permite desasignar. Solo admin. */
export function AssignSellerSheet({ target, onOpenChange }: Props) {
  const { token, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const open = Boolean(target) && isAdmin;

  const { data: sellers = [], isLoading } = useQuery({
    queryKey: ["sellers", "active"],
    queryFn: () => sellersApi.list(token!),
    enabled: Boolean(token) && open,
  });
  const assignable = filterAssignableSellers(sellers);

  const assignMutation = useMutation({
    mutationFn: (sellerId: string | null) => sellersApi.assignClient(token!, target!.clientId, sellerId),
    onSuccess: async (_data, sellerId) => {
      toast.success(sellerId ? "Vendedor asignado." : "Lead sin vendedor asignado.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["clients"] }),
        queryClient.invalidateQueries({ queryKey: ["client", target?.clientId] }),
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["sellers"] }),
      ]);
      onOpenChange(false);
    },
    onError: (error: unknown) => toast.error(normalizeApiError(error, "No se pudo asignar el vendedor.").formError),
  });

  const currentSellerId = target?.currentSellerId ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>Asignar vendedor</SheetTitle>
          <SheetDescription>
            {target ? `Elige quién atenderá a ${target.clientName}.` : "Elige quién atenderá este lead."}
          </SheetDescription>
        </SheetHeader>

        <ul className="mt-4 space-y-1 pb-safe" aria-label="Vendedores disponibles">
          {currentSellerId ? (
            <li>
              <button
                type="button"
                disabled={assignMutation.isPending}
                onClick={() => assignMutation.mutate(null)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground">
                  <UserX className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium">Sin asignar</span>
              </button>
            </li>
          ) : null}

          {assignable.map((seller) => {
            const selected = seller.id === currentSellerId;
            return (
              <li key={seller.id}>
                <button
                  type="button"
                  disabled={assignMutation.isPending || selected}
                  onClick={() => assignMutation.mutate(seller.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                    selected ? "bg-primary/10" : "hover:bg-muted/50",
                  )}
                >
                  <Avatar name={seller.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{seller.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{seller.email}</span>
                  </span>
                  {selected ? <Check className="h-4 w-4 text-primary" /> : null}
                </button>
              </li>
            );
          })}

          {!isLoading && assignable.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              <Users className="mx-auto mb-2 h-5 w-5" />
              No hay vendedores activos.{" "}
              <Link to="/vendedores" className="font-semibold text-primary underline underline-offset-2">
                Crear vendedor
              </Link>
            </li>
          ) : null}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
