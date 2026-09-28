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
    <nav
      className="absolute inset-x-0 z-30 flex justify-center bg-transparent pointer-events-none px-5 bottom-[calc(0.75rem+env(safe-area-inset-bottom))]"
      aria-label="Navegación principal"
    >
      <div className="pointer-events-auto flex h-14 items-center rounded-full bg-[hsl(160_8%_7%)] px-1.5 shadow-[0_18px_40px_-18px_hsl(160_20%_4%/0.7)]">
        {items.map(({ to, label, icon: Icon }) => {
          const active = isItemActive(pathname, to);
          return (
            <NavLink
              key={to}
              to={to}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-12 w-14 items-center justify-center rounded-full",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(160_8%_7%)]",
                "active:scale-[0.96] motion-safe:transition-transform",
                active ? "text-primary" : "text-white",
              )}
            >
              <Icon className={cn("h-[22px] w-[22px]", active && "scale-110")} strokeWidth={active ? 2.4 : 2} />
              <span className="sr-only">{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};
