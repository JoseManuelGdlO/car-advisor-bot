import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, UserCheck } from "lucide-react";
import { ListToolbar } from "@/components/ListToolbar";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { ChannelIcon } from "@/components/ChannelIcon";
import { ClientStatus } from "@/data/mockData";
import { useAuth } from "@/context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { crmApi } from "@/services/crm";
import { resolveClientDisplayPhone } from "@/lib/phone";
import { formatDateTime } from "@/lib/datetime";
import { useBotTimezone } from "@/hooks/useBotTimezone";
import { useLongPress } from "@/hooks/useLongPress";
import { AssignSellerSheet, type AssignSellerTarget } from "@/components/AssignSellerSheet";

const GENERIC_CLIENT_NAME = "cliente";

const hasRegisteredClientName = (name?: string) => {
  const trimmed = String(name || "").trim();
  return trimmed.length > 0 && trimmed.toLowerCase() !== GENERIC_CLIENT_NAME;
};

const filters: { key: "all" | ClientStatus; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "lead", label: "Leads" },
  { key: "negotiation", label: "Negociando" },
  { key: "sold", label: "Vendidos" },
  { key: "lost", label: "Perdidos" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClientRowData = any;

type ClientRowProps = {
  client: ClientRowData;
  timeZone: string;
  canAssign: boolean;
  onOpen: () => void;
  onAssign: () => void;
};

function ClientRow({ client: c, timeZone, canAssign, onOpen, onAssign }: ClientRowProps) {
  // Long-press (solo admin) abre el sheet "Asignar vendedor"; un toque corto abre la ficha.
  const longPress = useLongPress(onAssign, { enabled: canAssign });
  const clientPhone = resolveClientDisplayPhone(c);
  const registeredName = hasRegisteredClientName(c.name) ? String(c.name).trim() : null;
  const primaryLabel =
    [registeredName, clientPhone].filter(Boolean).join(" · ") || String(c.name || "").trim() || "Cliente";
  const avatarName = registeredName || clientPhone || c.name;
  const sellerName = c.assignedSeller?.name as string | undefined;

  return (
    <li>
      <button
        onClick={onOpen}
        {...longPress}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors select-none"
      >
        <div className="relative">
          <Avatar name={avatarName} color={c.avatarColor} />
          <ChannelIcon channel={c.channel} size={10} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-background" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-sm truncate">{primaryLabel}</p>
            <span className="text-[10px] text-muted-foreground shrink-0">{formatDateTime(c.lastMessageAt, timeZone)}</span>
          </div>
          <p className="text-xs text-muted-foreground truncate">{c.interestedIn}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusBadge status={c.status} />
            {canAssign ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground truncate">
                <UserCheck className="w-3 h-3 shrink-0" />
                {sellerName || "Sin asignar"}
              </span>
            ) : null}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>
    </li>
  );
}

export default function Clientes() {
  const navigate = useNavigate();
  const { token, isAdmin } = useAuth();
  const [assignTarget, setAssignTarget] = useState<AssignSellerTarget | null>(null);
  const timeZone = useBotTimezone();
  const { data } = useQuery({ queryKey: ["clients"], queryFn: () => crmApi.getClients(token!), enabled: Boolean(token) });
  const clients = (data || []) as any[];
  const [filter, setFilter] = useState<"all" | ClientStatus>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (c.status === "eliminated") return false;
      const matchF = filter === "all" || c.status === filter;
      const needle = q.toLowerCase();
      const phone = resolveClientDisplayPhone(c).toLowerCase();
      const matchQ =
        !q ||
        String(c.name || "").toLowerCase().includes(needle) ||
        String(c.interestedIn || "").toLowerCase().includes(needle) ||
        phone.includes(needle);
      return matchF && matchQ;
    });
  }, [clients, filter, q]);

  return (
    <>
      <ListToolbar
        query={q}
        onQueryChange={setQ}
        placeholder="Buscar cliente o auto…"
        filter={filter}
        onFilterChange={(key) => setFilter(key as "all" | ClientStatus)}
        filters={filters}
      />

      <ul className="divide-y divide-border">
        {filtered.map((c) => (
          <ClientRow
            key={c.id}
            client={c}
            timeZone={timeZone}
            canAssign={isAdmin}
            onOpen={() => navigate(`/cliente/${c.id}`)}
            onAssign={() =>
              setAssignTarget({
                clientId: c.id,
                clientName: String(c.name || "").trim() || resolveClientDisplayPhone(c) || "este cliente",
                currentSellerId: c.assignedSellerUserId ?? null,
              })
            }
          />
        ))}
        {filtered.length === 0 && (
          <li className="px-4 py-12 text-center text-sm text-muted-foreground">Sin resultados</li>
        )}
      </ul>

      <AssignSellerSheet target={assignTarget} onOpenChange={(open) => !open && setAssignTarget(null)} />
    </>
  );
}
