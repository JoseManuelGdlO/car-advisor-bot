import { useMemo, useState } from "react";
import {
  Bell,
  TrendingUp,
  TrendingDown,
  MessageCircle,
  UserPlus,
  Trophy,
  ChevronRight,
  Trash2,
  Landmark,
  Headphones,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/context/AuthContext";
import { crmApi } from "@/services/crm";
import type { DashboardKpisDto } from "@/services/crm";
import {
  notificationsApi,
  type NotificationKindFilter,
  type OwnerNotificationDto,
} from "@/services/notifications";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { normalizeApiError } from "@/lib/formErrors";
import { toast } from "sonner";

function KpiTrend({ value }: { value: number }) {
  const isPositive = value > 0;
  const isNegative = value < 0;
  const colorClass = isPositive ? "text-success" : isNegative ? "text-warning" : "text-muted-foreground";
  const label = isPositive ? `+${value}%` : `${value}%`;

  return (
    <div className={`flex items-center gap-1 mt-2 text-xs font-semibold ${colorClass}`}>
      {isNegative ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
      {label} vs ayer
    </div>
  );
}

const WEEKDAY_LABELS = ["D", "L", "M", "X", "J", "V", "S"] as const;

function getLast7DayLabels(): string[] {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return WEEKDAY_LABELS[d.getDay()];
  });
}

const DEFAULT_KPIS: DashboardKpisDto = {
  activeChats: 0,
  newToday: 0,
  waiting: 0,
  newLeads: 0,
  newLeadsChange: 0,
  conversions: 0,
  conversionsChange: 0,
  weeklyChats: [0, 0, 0, 0, 0, 0, 0],
  topProducts: [],
};

type FilterChip = { id: NotificationKindFilter; label: string };

const FILTER_CHIPS: FilterChip[] = [
  { id: "", label: "Todas" },
  { id: "lead", label: "Leads" },
  { id: "advisor", label: "Asesor" },
  { id: "escalation", label: "Escalaciones" },
  { id: "inbound", label: "Mensajes" },
];

const formatRelativeTime = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Hace ${days} d`;
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
};

const pathForNotification = (item: OwnerNotificationDto) => {
  if (item.conversationId) return `/chat/${item.conversationId}`;
  if (item.kind === "lead_interest") return "/clientes";
  return "/chats";
};

const iconForKind = (kind: string | null) => {
  if (kind === "lead_interest") return UserPlus;
  if (kind === "human_advisor") return Headphones;
  if (kind === "financing_detail_help") return Landmark;
  if (kind === "new_inbound_message") return MessageCircle;
  return Bell;
};

const iconToneForKind = (kind: string | null) => {
  if (kind === "lead_interest") return "bg-primary/10 text-primary-dark";
  if (kind === "human_advisor") return "bg-warning/15 text-warning";
  if (kind === "financing_detail_help") return "bg-info/15 text-info";
  if (kind === "new_inbound_message") return "bg-accent text-accent-foreground";
  return "bg-muted text-muted-foreground";
};

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [notifOpen, setNotifOpen] = useState(false);
  const [filterKind, setFilterKind] = useState<NotificationKindFilter>("");
  const { token, user } = useAuth();

  const { data: kpis } = useQuery<DashboardKpisDto>({
    queryKey: ["kpis"],
    queryFn: () => crmApi.getKpis(token!),
    enabled: Boolean(token),
  });

  const { data: notificationsData, isLoading: notificationsLoading } = useQuery({
    queryKey: ["notifications", filterKind || "all"],
    queryFn: () =>
      notificationsApi.list(token!, {
        kind: filterKind || undefined,
        limit: 30,
      }),
    enabled: Boolean(token),
  });

  const items = notificationsData?.items ?? [];
  const unreadCount = notificationsData?.unreadCount ?? 0;
  const hasNotifDot = unreadCount > 0;

  const invalidateNotifications = () =>
    queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(token!, id),
    onSuccess: () => void invalidateNotifications(),
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(token!, filterKind ? { kind: filterKind } : {}),
    onSuccess: () => void invalidateNotifications(),
    onError: (error) => {
      toast.error(normalizeApiError(error, "No se pudieron marcar como leídas.").formError);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.delete(token!, id),
    onSuccess: () => void invalidateNotifications(),
    onError: (error) => {
      toast.error(normalizeApiError(error, "No se pudo eliminar la notificación.").formError);
    },
  });

  const emptyLabel = useMemo(() => {
    if (filterKind) return "No hay notificaciones de este tipo.";
    return "No hay notificaciones por ahora.";
  }, [filterKind]);

  const safeKpis = kpis ?? DEFAULT_KPIS;
  const weeklyChats = Array.from({ length: 7 }, (_, i) => safeKpis.weeklyChats[i] ?? 0);
  const max = Math.max(...weeklyChats, 1);
  const days = getLast7DayLabels();
  const currentWeekTotal = weeklyChats.reduce((acc, value) => acc + value, 0);
  const yesterdayChats = weeklyChats[weeklyChats.length - 2] ?? 0;
  const todayChats = weeklyChats[weeklyChats.length - 1] ?? 0;
  const weeklyTrendPct = yesterdayChats > 0 ? Math.round(((todayChats - yesterdayChats) / yesterdayChats) * 100) : 0;
  const hasWeeklyData = currentWeekTotal > 0;

  const openNotification = async (item: OwnerNotificationDto) => {
    setNotifOpen(false);
    if (!item.readAt) {
      markReadMutation.mutate(item.id);
    }
    navigate(pathForNotification(item));
  };

  return (
    <>
      <ScreenHeader
        title={`Hola, ${user?.name?.split(" ")[0] || "Usuario"} 👋`}
        subtitle="Esto es lo que pasa hoy"
        variant="primary"
        action={
          <button
            type="button"
            onClick={() => setNotifOpen(true)}
            className="w-9 h-9 grid place-items-center rounded-full bg-white/15 hover:bg-white/25 transition-colors relative"
            aria-label="Notificaciones"
            aria-expanded={notifOpen}
          >
            <Bell className="w-5 h-5" />
            {hasNotifDot ? <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-warning rounded-full" /> : null}
          </button>
        }
      />

      <div className="px-4 py-5 space-y-5">
        <button
          onClick={() => navigate("/chats")}
          className="w-full text-left bg-gradient-primary rounded-2xl p-5 shadow-green text-primary-foreground active:scale-[0.99] transition-transform"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider opacity-80 font-semibold">Conversaciones activas</p>
              <p className="text-5xl font-extrabold mt-1">{safeKpis.activeChats}</p>
              <p className="text-xs mt-2 opacity-90">
                <span className="font-semibold">{safeKpis.newToday}</span> nuevas hoy ·{" "}
                <span className="font-semibold">{safeKpis.waiting}</span> en espera
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white/15 grid place-items-center">
              <MessageCircle className="w-6 h-6" />
            </div>
          </div>
        </button>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card rounded-2xl p-4 shadow-card border border-border">
            <div className="w-9 h-9 rounded-xl bg-info/10 grid place-items-center text-info mb-3">
              <UserPlus className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-foreground">{safeKpis.newLeads}</p>
            <p className="text-xs text-muted-foreground">Leads nuevos</p>
            <KpiTrend value={safeKpis.newLeadsChange} />
          </div>

          <div className="bg-card rounded-2xl p-4 shadow-card border border-border">
            <div className="w-9 h-9 rounded-xl bg-success/10 grid place-items-center text-success mb-3">
              <Trophy className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-foreground">{safeKpis.conversions}</p>
            <p className="text-xs text-muted-foreground">Conversiones</p>
            <KpiTrend value={safeKpis.conversionsChange} />
          </div>
        </div>

        <div className="bg-card rounded-2xl p-4 shadow-card border border-border">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">Conversaciones por día</h3>
              <p className="text-xs text-muted-foreground">Últimos 7 días</p>
            </div>
            {hasWeeklyData ? (
              <div
                className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                  weeklyTrendPct >= 0 ? "text-success bg-success/10" : "text-warning bg-warning/10"
                }`}
              >
                {weeklyTrendPct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {weeklyTrendPct >= 0 ? `+${weeklyTrendPct}%` : `${weeklyTrendPct}%`}
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground bg-muted px-2 py-1 rounded-full">Sin datos</div>
            )}
          </div>
          <div className="flex items-end justify-between gap-2 h-28">
            {weeklyChats.map((v: number, i: number) => {
              const h = (v / max) * 100;
              const isLast = i === weeklyChats.length - 1;
              const height = v === 0 ? 8 : Math.max(h, 12);
              return (
                <div key={i} className="flex-1 h-full flex flex-col items-center gap-2">
                  <div className="w-full h-full flex items-end">
                    <div
                      className={`w-full rounded-t-md transition-all ${isLast ? "bg-gradient-primary" : "bg-primary/30"}`}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <span className={`text-[10px] font-medium ${isLast ? "text-primary-dark font-bold" : "text-muted-foreground"}`}>
                    {days[i]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-card rounded-2xl p-4 shadow-card border border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-foreground">Top autos consultados</h3>
            <button className="text-xs font-semibold text-primary-dark">Ver todos</button>
          </div>
          <ul className="space-y-2.5">
            {safeKpis.topProducts.map((p: { name: string; queries: number }, i: number) => {
              const pct = safeKpis.topProducts[0]?.queries ? (p.queries / safeKpis.topProducts[0].queries) * 100 : 0;
              return (
                <li key={`${p.name}-${i}`}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-foreground flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-accent text-accent-foreground grid place-items-center text-[10px] font-bold">
                        {i + 1}
                      </span>
                      {p.name}
                    </span>
                    <span className="text-muted-foreground font-semibold">{p.queries}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-primary rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {safeKpis.waiting > 0 ? (
          <button
            onClick={() => navigate("/chats")}
            className="w-full bg-warning/10 border border-warning/30 rounded-2xl p-4 flex items-center gap-3 text-left hover:bg-warning/15 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-warning/20 text-warning grid place-items-center">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">
                {safeKpis.waiting === 1
                  ? "1 conversación en espera"
                  : `${safeKpis.waiting} conversaciones en espera`}
              </p>
              <p className="text-xs text-muted-foreground">Toma el control para no perder ventas</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
        ) : null}
      </div>

      <Sheet open={notifOpen} onOpenChange={setNotifOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle>Notificaciones</SheetTitle>
            <SheetDescription>
              {unreadCount > 0
                ? `${unreadCount} sin leer · últimas alertas de tu cuenta`
                : "Últimas alertas de tu cuenta"}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {FILTER_CHIPS.map((chip) => {
              const active = filterKind === chip.id;
              return (
                <button
                  key={chip.id || "all"}
                  type="button"
                  onClick={() => setFilterKind(chip.id)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary-dark"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          {items.length > 0 || unreadCount > 0 ? (
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                disabled={markAllMutation.isPending || unreadCount === 0}
                onClick={() => markAllMutation.mutate()}
              >
                Marcar todas como leídas
              </Button>
            </div>
          ) : null}

          <div className="mt-3 space-y-2 pb-safe">
            {notificationsLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8 px-2">Cargando…</p>
            ) : null}

            {!notificationsLoading && items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8 px-2">{emptyLabel}</p>
            ) : null}

            {items.map((item) => {
              const Icon = iconForKind(item.kind);
              const unread = !item.readAt;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-stretch gap-1 rounded-xl border border-border bg-card overflow-hidden",
                    unread && "border-primary/25 bg-primary/[0.03]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => void openNotification(item)}
                    className="min-w-0 flex-1 flex items-center gap-3 p-3 text-left hover:bg-muted/40 transition-colors"
                  >
                    <div className={cn("w-10 h-10 shrink-0 rounded-xl grid place-items-center", iconToneForKind(item.kind))}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={cn("text-sm text-foreground truncate", unread ? "font-bold" : "font-semibold")}>
                          {item.title}
                        </p>
                        {unread ? <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-warning" /> : null}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{item.body}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">{formatRelativeTime(item.createdAt)}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 shrink-0 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    aria-label="Eliminar notificación"
                    className="shrink-0 px-3 grid place-items-center text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors border-l border-border"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(item.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
