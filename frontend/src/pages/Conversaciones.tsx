import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Filter } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Avatar } from "@/components/Avatar";
import { ChannelIcon } from "@/components/ChannelIcon";
import { Channel } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { normalizePhoneDigits, resolveClientDisplayPhone } from "@/lib/phone";
import { useConversationsQuery } from "@/hooks/useConversationsQuery";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const channelFilters: { key: "all" | Channel; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
];

// type ReadFilter = "all" | "unread" | "read";
type ControlFilter = "all" | "human" | "bot";
type SortOrder = "desc" | "asc";
type DateFilter = "all" | "today" | "7d" | "30d";

// const readFilters: { key: ReadFilter; label: string }[] = [
//   { key: "all", label: "Todas" },
//   { key: "unread", label: "Sin leer" },
//   { key: "read", label: "Leídas" },
// ];

const sortFilters: { key: SortOrder; label: string }[] = [
  { key: "desc", label: "Más recientes" },
  { key: "asc", label: "Más antiguas" },
];

const dateFilters: { key: DateFilter; label: string }[] = [
  { key: "all", label: "Todas las fechas" },
  { key: "today", label: "Hoy" },
  { key: "7d", label: "Últimos 7 días" },
  { key: "30d", label: "Último mes" },
];

const controlFilters: { key: ControlFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "human", label: "Control humano" },
  { key: "bot", label: "Bot activo" },
];

const getConversationTime = (conversation: any) => {
  const raw = conversation.lastTime;
  if (!raw) return 0;
  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const matchesDateFilter = (conversation: any, dateFilter: DateFilter) => {
  if (dateFilter === "all") return true;
  const time = getConversationTime(conversation);
  if (!time) return false;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  if (dateFilter === "today") return time >= startOfToday;
  if (dateFilter === "7d") return time >= startOfToday - 7 * dayMs;
  if (dateFilter === "30d") return time >= startOfToday - 30 * dayMs;
  return true;
};

const matchesConversationSearch = (conversation: any, query: string) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  const name = conversation.client?.name?.toLowerCase() ?? "";
  const phone = resolveClientDisplayPhone(conversation.client);
  const lastMessage = conversation.lastMessage?.toLowerCase() ?? "";
  const queryDigits = normalizePhoneDigits(query);
  const phoneDigits = normalizePhoneDigits(phone);

  return (
    name.includes(needle) ||
    phone.toLowerCase().includes(needle) ||
    lastMessage.includes(needle) ||
    (queryDigits.length >= 3 && phoneDigits.includes(queryDigits))
  );
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

export default function Conversaciones() {
  const navigate = useNavigate();
  const { data } = useConversationsQuery();
  const conversations = (data || []) as any[];
  const [filter, setFilter] = useState<"all" | Channel>("all");
  const [q, setQ] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  // const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [controlFilter, setControlFilter] = useState<ControlFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  const extraFiltersActive =
    controlFilter !== "all" || sortOrder !== "desc" || dateFilter !== "all";

  const list = useMemo(() => {
    const filtered = conversations.filter((c) => {
      if (filter !== "all" && c.channel !== filter) return false;
      // Sin estatus de lectura persistido aún:
      // if (readFilter === "unread" && !(c.unread > 0)) return false;
      // if (readFilter === "read" && c.unread > 0) return false;
      if (controlFilter === "human" && !c.isHumanControlled) return false;
      if (controlFilter === "bot" && c.isHumanControlled) return false;
      if (!matchesDateFilter(c, dateFilter)) return false;
      return matchesConversationSearch(c, q);
    });

    return [...filtered].sort((a, b) => {
      const diff = getConversationTime(a) - getConversationTime(b);
      return sortOrder === "asc" ? diff : -diff;
    });
  }, [conversations, filter, controlFilter, sortOrder, dateFilter, q]);

  const totalUnread = conversations.reduce((acc, c) => acc + c.unread, 0);

  const clearExtraFilters = () => {
    // setReadFilter("all");
    setControlFilter("all");
    setSortOrder("desc");
    setDateFilter("all");
  };

  return (
    <>
      <ScreenHeader
        title="Conversaciones"
        subtitle={totalUnread > 0 ? `${totalUnread} mensajes sin leer` : "Todo al día ✨"}
        action={
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className={cn(
              "relative w-9 h-9 grid place-items-center rounded-full transition-colors",
              extraFiltersActive ? "bg-primary/10 text-primary" : "hover:bg-muted",
            )}
            aria-label="Filtrar conversaciones"
          >
            <Filter className="w-4 h-4" />
            {extraFiltersActive ? (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
            ) : null}
          </button>
        }
      />

      <div className="px-4 py-3 space-y-3 sticky top-[65px] bg-background/95 backdrop-blur z-10 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, teléfono o mensaje…"
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-muted text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
          {channelFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-3.5 h-8 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border",
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
                    {formatDateTime(c.lastTime)}
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
        {list.length === 0 && (
          <li className="px-4 py-12 text-center text-sm text-muted-foreground">Sin resultados</li>
        )}
      </ul>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle>Filtros</SheetTitle>
            <SheetDescription>Refina la lista sin quitar los filtros de canal.</SheetDescription>
          </SheetHeader>

          <div className="mt-5 space-y-5 pb-safe">
            {/* Lectura: pendiente hasta persistir estatus de conversación en backend
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Lectura</p>
              <div className="flex flex-wrap gap-2">
                {readFilters.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setReadFilter(f.key)}
                    className={cn(
                      "px-3.5 h-8 rounded-full text-xs font-semibold transition-colors border",
                      readFilter === f.key
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            */}

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Orden</p>
              <div className="flex flex-wrap gap-2">
                {sortFilters.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setSortOrder(f.key)}
                    className={cn(
                      "px-3.5 h-8 rounded-full text-xs font-semibold transition-colors border",
                      sortOrder === f.key
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Fecha</p>
              <div className="flex flex-wrap gap-2">
                {dateFilters.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setDateFilter(f.key)}
                    className={cn(
                      "px-3.5 h-8 rounded-full text-xs font-semibold transition-colors border",
                      dateFilter === f.key
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Control</p>
              <div className="flex flex-wrap gap-2">
                {controlFilters.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setControlFilter(f.key)}
                    className={cn(
                      "px-3.5 h-8 rounded-full text-xs font-semibold transition-colors border",
                      controlFilter === f.key
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {extraFiltersActive ? (
              <button
                type="button"
                onClick={clearExtraFilters}
                className="w-full h-10 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                Limpiar filtros
              </button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
