import { NavLink } from "react-router-dom";
import { LayoutDashboard, Users, MessageCircle, Settings, User, Car } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/chats", label: "Chats", icon: MessageCircle },
  { to: "/vehiculos", label: "Vehículos", icon: Car },
  { to: "/config", label: "Config", icon: Settings },
  { to: "/perfil", label: "Perfil", icon: User },
];

export const BottomNav = () => {
  return (
    <nav className="absolute bottom-0 left-0 right-0 bg-card/95 backdrop-blur border-t border-border z-30 flex items-stretch px-1 pt-1 pb-[calc(0.5rem+env(safe-area-inset-bottom))] min-h-[72px]">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/dashboard"}
          className={({ isActive }) =>
            cn(
              "flex-1 flex flex-col items-center justify-center gap-1 rounded-xl transition-colors",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )
          }
        >
          {({ isActive }) => (
            <>
              <div
                className={cn(
                  "p-1.5 rounded-xl transition-all",
                  isActive && "bg-accent"
                )}
              >
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.4 : 2} />
              </div>
              <span className={cn("text-[9px] font-medium leading-tight text-center", isActive && "font-semibold")}>
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
};
