import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
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

const filters: { key: "all" | ClientStatus; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "lead", label: "Leads" },
  { key: "negotiation", label: "Negociando" },
  { key: "sold", label: "Vendidos" },
  { key: "lost", label: "Perdidos" },
];

export default function Clientes() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const timeZone = useBotTimezone();
  const { data } = useQuery({ queryKey: ["clients"], queryFn: () => crmApi.getClients(token!), enabled: Boolean(token) });
  const clients = (data || []) as any[];
  const [filter, setFilter] = useState<"all" | ClientStatus>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (c.status === "eliminated") return false;
      const matchF = filter === "all" || c.status === filter;
      const matchQ = !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.interestedIn.toLowerCase().includes(q.toLowerCase());
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
          <li key={c.id}>
            <button
              onClick={() => navigate(`/cliente/${c.id}`)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="relative">
                <Avatar name={c.name} color={c.avatarColor} />
                <ChannelIcon channel={c.channel} size={10} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-background" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm truncate">{c.name}</p>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDateTime(c.lastMessageAt, timeZone)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{c.interestedIn}</p>
                {resolveClientDisplayPhone(c) ? (
                  <p className="text-[10px] text-muted-foreground truncate">{resolveClientDisplayPhone(c)}</p>
                ) : null}
                <div className="mt-1.5">
                  <StatusBadge status={c.status} />
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-4 py-12 text-center text-sm text-muted-foreground">Sin resultados</li>
        )}
      </ul>
    </>
  );
}
