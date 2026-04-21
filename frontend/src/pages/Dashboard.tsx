import { Bell, TrendingUp, TrendingDown, MessageCircle, UserPlus, Trophy, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { crmApi } from "@/services/crm";

export default function Dashboard() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { data: kpis } = useQuery({
    queryKey: ["kpis"],
    queryFn: () => crmApi.getKpis(token!),
    enabled: Boolean(token),
  });
  const safeKpis = kpis || { activeChats: 0, newToday: 0, waiting: 0, newLeads: 0, newLeadsChange: 0, conversions: 0, conversionsChange: 0, weeklyChats: [0, 0, 0, 0, 0, 0, 0], topProducts: [] };
  const max = Math.max(...safeKpis.weeklyChats, 1);
  const days = ["L", "M", "X", "J", "V", "S", "D"];

  return (
    <>
      <ScreenHeader
        title={`Hola, ${user?.name?.split(" ")[0] || "Usuario"} 👋`}
        subtitle="Esto es lo que pasa hoy"
        variant="primary"
        action={
          <button className="w-9 h-9 grid place-items-center rounded-full bg-white/15 hover:bg-white/25 transition-colors relative" aria-label="Notificaciones">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-warning rounded-full" />
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
            <div className="flex items-center gap-1 mt-2 text-success text-xs font-semibold">
              <TrendingUp className="w-3 h-3" />
              +{safeKpis.newLeadsChange}% vs ayer
            </div>
          </div>

          <div className="bg-card rounded-2xl p-4 shadow-card border border-border">
            <div className="w-9 h-9 rounded-xl bg-success/10 grid place-items-center text-success mb-3">
              <Trophy className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-foreground">{safeKpis.conversions}</p>
            <p className="text-xs text-muted-foreground">Conversiones</p>
            <div className="flex items-center gap-1 mt-2 text-success text-xs font-semibold">
              <TrendingUp className="w-3 h-3" />
              +{safeKpis.conversionsChange}% vs ayer
            </div>
          </div>
        </div>

        {/* Weekly chart */}
        <div className="bg-card rounded-2xl p-4 shadow-card border border-border">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">Conversaciones por día</h3>
              <p className="text-xs text-muted-foreground">Últimos 7 días</p>
            </div>
            <div className="flex items-center gap-1 text-success text-xs font-semibold bg-success/10 px-2 py-1 rounded-full">
              <TrendingUp className="w-3 h-3" />
              +18%
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 h-28">
            {safeKpis.weeklyChats.map((v: number, i: number) => {
              const h = (v / max) * 100;
              const isLast = i === safeKpis.weeklyChats.length - 1;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div
                    className={`w-full rounded-t-md transition-all ${isLast ? "bg-gradient-primary" : "bg-primary/30"}`}
                    style={{ height: `${h}%` }}
                  />
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
                <li key={p.name}>
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
        <button
          onClick={() => navigate("/chats")}
          className="w-full bg-warning/10 border border-warning/30 rounded-2xl p-4 flex items-center gap-3 text-left hover:bg-warning/15 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-warning/20 text-warning grid place-items-center">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">3 conversaciones esperando</p>
            <p className="text-xs text-muted-foreground">Toma el control para no perder ventas</p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>
    </>
  );
}
