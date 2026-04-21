import { useNavigate } from "react-router-dom";
import { LogOut, Bell, HelpCircle, Shield, ChevronRight, Star } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/context/AuthContext";

const items = [
  { icon: Bell, label: "Notificaciones", value: "Activas" },
  { icon: Shield, label: "Privacidad y seguridad" },
  { icon: HelpCircle, label: "Ayuda y soporte" },
  { icon: Star, label: "Plan: Pro", value: "Renovar" },
];

export default function Perfil() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  return (
    <>
      <ScreenHeader title="Mi perfil" variant="primary" />

      <div className="px-4 py-5 space-y-5">
        <div className="bg-card rounded-2xl p-5 shadow-card border border-border flex flex-col items-center text-center">
          <Avatar name={user?.name || "Usuario"} color="hsl(162 75% 30%)" size="lg" />
          <h2 className="font-bold text-lg mt-3">{user?.name || "Usuario"}</h2>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
          <p className="text-xs text-muted-foreground">Aislamiento de datos activo</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card rounded-2xl p-3 text-center shadow-card border border-border">
            <p className="text-xl font-extrabold text-primary-dark">42</p>
            <p className="text-[10px] uppercase font-semibold text-muted-foreground">Ventas mes</p>
          </div>
          <div className="bg-card rounded-2xl p-3 text-center shadow-card border border-border">
            <p className="text-xl font-extrabold text-primary-dark">128</p>
            <p className="text-[10px] uppercase font-semibold text-muted-foreground">Leads</p>
          </div>
          <div className="bg-card rounded-2xl p-3 text-center shadow-card border border-border">
            <p className="text-xl font-extrabold text-primary-dark">4.9</p>
            <p className="text-[10px] uppercase font-semibold text-muted-foreground">Rating</p>
          </div>
        </div>

        <ul className="bg-card rounded-2xl shadow-card border border-border overflow-hidden">
          {items.map((it, i) => (
            <li key={it.label} className={i > 0 ? "border-t border-border" : ""}>
              <button className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40">
                <div className="w-9 h-9 rounded-xl bg-accent grid place-items-center text-accent-foreground">
                  <it.icon className="w-4 h-4" />
                </div>
                <span className="flex-1 text-sm font-medium">{it.label}</span>
                {it.value && <span className="text-xs text-muted-foreground">{it.value}</span>}
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>

        <button
          onClick={() => {
            logout();
            navigate("/login");
          }}
          className="w-full h-12 rounded-2xl border border-destructive/30 text-destructive font-semibold flex items-center justify-center gap-2 hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Cerrar sesión
        </button>

        <p className="text-center text-[10px] text-muted-foreground">AutoBot v1.0 — Maqueta para React Native</p>
      </div>
    </>
  );
}
