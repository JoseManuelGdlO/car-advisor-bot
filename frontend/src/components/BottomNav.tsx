import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, MessageCircle, User, Car } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { to: "/chats", label: "Chats", icon: MessageCircle },
  { to: "/vehiculos", label: "Vehículos", icon: Car },
  { to: "/perfil", label: "Perfil", icon: User },
];

const isItemActive = (pathname: string, to: string) => {
  if (to === "/dashboard") return pathname === "/dashboard";
  if (to === "/chats") {
    return (
      pathname.startsWith("/chats") ||
      pathname.startsWith("/chat/") ||
      pathname.startsWith("/clientes") ||
      pathname.startsWith("/cliente/")
    );
  }
  if (to === "/vehiculos") return pathname.startsWith("/vehiculos");
  if (to === "/perfil") return pathname.startsWith("/perfil") || pathname.startsWith("/config");
  return false;
};

export const BottomNav = () => {
  const { pathname } = useLocation();

  return (
    <nav className="absolute bottom-0 left-0 right-0 bg-card/95 backdrop-blur border-t border-border z-30 flex items-stretch px-2 pt-1 pb-[calc(0.5rem+env(safe-area-inset-bottom))] min-h-[72px]">
      {items.map(({ to, label, icon: Icon }) => {
        const active = isItemActive(pathname, to);
        return (
          <NavLink
            key={to}
            to={to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 rounded-xl transition-colors active:scale-[0.98]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <div className={cn("p-1.5 rounded-xl transition-colors", active && "bg-accent")}>
              <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.4 : 2} />
            </div>
            <span className={cn("text-[11px] font-medium leading-tight text-center", active && "font-semibold")}>
              {label}
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
};
