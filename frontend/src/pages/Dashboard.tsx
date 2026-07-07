import { useState } from "react";
import { Bell, TrendingUp, TrendingDown, MessageCircle, UserPlus, Trophy, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { crmApi } from "@/services/crm";
import type { DashboardKpisDto } from "@/services/crm";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

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

export default function Dashboard() {
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const { token, user } = useAuth();
  const { data: kpis } = useQuery<DashboardKpisDto>({
    queryKey: ["kpis"],
    queryFn: () => crmApi.getKpis(token!),
    enabled: Boolean(token),
  });
  const safeKpis = kpis ?? DEFAULT_KPIS;
  const weeklyChats = Array.from({ length: 7 }, (_, i) => safeKpis.weeklyChats[i] ?? 0);
  const max = Math.max(...weeklyChats, 1);
  const days = ["L", "M", "X", "J", "V", "S", "D"];
  const currentWeekTotal = weeklyChats.reduce((acc, value) => acc + value, 0);
  const yesterdayChats = weeklyChats[weeklyChats.length - 2] ?? 0;
  const todayChats = weeklyChats[weeklyChats.length - 1] ?? 0;
  const weeklyTrendPct = yesterdayChats > 0 ? Math.round(((todayChats - yesterdayChats) / yesterdayChats) * 100) : 0;
  const hasWeeklyData = currentWeekTotal > 0;
  const hasNotifDot =
    safeKpis.waiting > 0 || safeKpis.newToday > 0 || safeKpis.newLeads > 0 || safeKpis.activeChats > 0;

  const go = (path: string) => {
    setNotifOpen(false);
    navigate(path);
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
        {/* Hero KPI */}
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

        {/* KPI grid */}
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

        {/* Weekly chart */}
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

        {/* Top products */}
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

        {/* Quick action */}
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
            <SheetDescription>Lo que necesita tu atención hoy, según el panel.</SheetDescription>
          </SheetHeader>
          <div className="mt-5 space-y-2 pb-safe">
            {safeKpis.waiting > 0 ? (
              <button
                type="button"
                onClick={() => go("/chats")}
                className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 shrink-0 rounded-xl bg-warning/15 text-warning grid place-items-center">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">Chats en espera</p>
                  <p className="text-xs text-muted-foreground">
                    {safeKpis.waiting === 1
                      ? "Hay 1 conversación esperando respuesta."
                      : `Hay ${safeKpis.waiting} conversaciones esperando respuesta.`}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 shrink-0 text-muted-foreground" />
              </button>
            ) : null}
            {safeKpis.newToday > 0 ? (
              <button
                type="button"
                onClick={() => go("/chats")}
                className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 shrink-0 rounded-xl bg-info/15 text-info grid place-items-center">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">Conversaciones nuevas hoy</p>
                  <p className="text-xs text-muted-foreground">
                    {safeKpis.newToday === 1
                      ? "1 conversación iniciada hoy."
                      : `${safeKpis.newToday} conversaciones iniciadas hoy.`}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 shrink-0 text-muted-foreground" />
              </button>
            ) : null}
            {safeKpis.newLeads > 0 ? (
              <button
                type="button"
                onClick={() => go("/clientes")}
                className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 shrink-0 rounded-xl bg-primary/10 text-primary-dark grid place-items-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">Leads nuevos</p>
                  <p className="text-xs text-muted-foreground">
                    {safeKpis.newLeads === 1
                      ? "Tienes 1 lead nuevo para revisar."
                      : `Tienes ${safeKpis.newLeads} leads nuevos para revisar.`}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 shrink-0 text-muted-foreground" />
              </button>
            ) : null}
            {safeKpis.activeChats > 0 && safeKpis.waiting === 0 && safeKpis.newToday === 0 && safeKpis.newLeads === 0 ? (
              <button
                type="button"
                onClick={() => go("/chats")}
                className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 shrink-0 rounded-xl bg-accent grid place-items-center text-accent-foreground">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">Conversaciones activas</p>
                  <p className="text-xs text-muted-foreground">
                    {safeKpis.activeChats === 1
                      ? "1 conversación activa en curso."
                      : `${safeKpis.activeChats} conversaciones activas en curso.`}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 shrink-0 text-muted-foreground" />
              </button>
            ) : null}
            {!safeKpis.waiting && !safeKpis.newToday && !safeKpis.newLeads && !safeKpis.activeChats ? (
              <p className="text-sm text-muted-foreground text-center py-8 px-2">
                No hay alertas por ahora. Cuando haya chats en espera, leads o actividad nueva, aparecerán aquí.
              </p>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
