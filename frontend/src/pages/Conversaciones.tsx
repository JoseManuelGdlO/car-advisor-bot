import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Filter } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Avatar } from "@/components/Avatar";
import { ChannelIcon } from "@/components/ChannelIcon";
import { Channel } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { crmApi } from "@/services/crm";

const channelFilters: { key: "all" | Channel; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "facebook", label: "Facebook" },
];

export default function Conversaciones() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { data } = useQuery({ queryKey: ["conversations"], queryFn: () => crmApi.getConversations(token!), enabled: Boolean(token) });
  const conversations = (data || []) as any[];
  const [filter, setFilter] = useState<"all" | Channel>("all");
  const [q, setQ] = useState("");

  const list = conversations
    .filter((c) => filter === "all" || c.channel === filter)
    .filter((c) => !q || c.client?.name?.toLowerCase().includes(q.toLowerCase()));

  const totalUnread = conversations.reduce((acc, c) => acc + c.unread, 0);

  return (
    <>
      <ScreenHeader
        title="Conversaciones"
        subtitle={totalUnread > 0 ? `${totalUnread} mensajes sin leer` : "Todo al día ✨"}
        action={
          <button className="w-9 h-9 grid place-items-center rounded-full hover:bg-muted" aria-label="Filtrar">
            <Filter className="w-4 h-4" />
          </button>
        }
      />

      <div className="px-4 py-3 space-y-3 sticky top-[65px] bg-background/95 backdrop-blur z-10 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar conversación…"
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-muted text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-2">
          {channelFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-3.5 h-8 rounded-full text-xs font-semibold transition-colors border",
                filter === f.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="divide-y divide-border">
        {list.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => navigate(`/chat/${c.id}`)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="relative">
                <Avatar name={c.client.name} color={c.client.avatarColor} />
                <ChannelIcon channel={c.channel} size={10} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-background" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm truncate">{c.client.name}</p>
                  <span className={cn("text-[10px] shrink-0", c.unread > 0 ? "text-primary font-bold" : "text-muted-foreground")}>
                    {c.lastTime}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className={cn("text-xs truncate", c.unread > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
                    {c.lastMessage}
                  </p>
                  {c.unread > 0 && (
                    <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center">
                      {c.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
