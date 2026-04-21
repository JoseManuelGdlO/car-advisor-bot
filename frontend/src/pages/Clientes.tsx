import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronRight } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { ChannelIcon } from "@/components/ChannelIcon";
import { ClientStatus } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { crmApi } from "@/services/crm";

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
  const { data } = useQuery({ queryKey: ["clients"], queryFn: () => crmApi.getClients(token!), enabled: Boolean(token) });
  const clients = (data || []) as any[];
  const [filter, setFilter] = useState<"all" | ClientStatus>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      const matchF = filter === "all" || c.status === filter;
      const matchQ = !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.interestedIn.toLowerCase().includes(q.toLowerCase());
      return matchF && matchQ;
    });
  }, [filter, q]);

  return (
    <>
      <ScreenHeader title="Clientes" subtitle={`${clients.length} contactos en total`} />

      <div className="px-4 py-3 space-y-3 sticky top-[65px] bg-background/95 backdrop-blur z-10 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cliente o auto…"
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-muted text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-3.5 h-8 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border",
                filter === f.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

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
                  <span className="text-[10px] text-muted-foreground shrink-0">{c.lastMessageAt}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{c.interestedIn}</p>
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
