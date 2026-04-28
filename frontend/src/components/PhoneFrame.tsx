import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Signal, Wifi, BatteryFull } from "lucide-react";
import { BottomNav } from "./BottomNav";

interface PhoneFrameProps {
  children: ReactNode;
}

const HIDE_NAV_PREFIXES = ["/login"];

export const PhoneFrame = ({ children }: PhoneFrameProps) => {
  const { pathname } = useLocation();
  const showNav = !HIDE_NAV_PREFIXES.some((p) => pathname.startsWith(p)) && !pathname.startsWith("/chat/");
  const isNativeApp = Capacitor.isNativePlatform();

  if (isNativeApp) {
    return (
      <div className="min-h-screen w-full bg-background">
        <div className={`h-screen w-full flex flex-col ${showNav ? "pb-[calc(72px+var(--safe-area-bottom))]" : "pb-safe"}`}>
          <div className="flex-1 overflow-y-auto scrollbar-hide">{children}</div>
        </div>
        {showNav && <BottomNav />}
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-soft flex flex-col items-center justify-center p-0 lg:p-8">
      {/* Decorative side panel for desktop */}
      <div className="hidden lg:flex flex-col items-center mb-6 text-center max-w-md">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-primary grid place-items-center text-primary-foreground font-bold shadow-green">
            A
          </div>
          <span className="text-xl font-bold text-foreground">AutoBot</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Maqueta móvil — Chatbot manager para vendedores de autos
        </p>
      </div>

      {/* Phone frame */}
      <div className="relative w-full h-[100dvh] lg:h-[844px] lg:w-[390px] lg:rounded-[3rem] lg:border-[10px] lg:border-foreground/90 lg:shadow-elevated overflow-hidden bg-background">
        {/* Notch (desktop only) */}
        <div className="hidden lg:block absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-foreground/90 rounded-b-2xl z-50" />

        {/* Status bar (desktop only) */}
        <div className="hidden lg:flex absolute top-0 left-0 right-0 h-7 px-8 items-center justify-between text-[11px] font-semibold text-foreground z-40">
          <span>9:41</span>
          <div className="flex items-center gap-1 ml-auto pl-32">
            <Signal className="w-3 h-3" />
            <Wifi className="w-3 h-3" />
            <BatteryFull className="w-4 h-4" />
          </div>
        </div>

        {/* Screen content */}
        <div className={`h-full w-full flex flex-col pt-safe lg:pt-7 ${showNav ? "pb-[calc(72px+var(--safe-area-bottom))]" : "pb-safe"}`}>
          <div className="flex-1 overflow-y-auto scrollbar-hide">{children}</div>
        </div>

        {/* Bottom nav */}
        {showNav && <BottomNav />}
      </div>
    </div>
  );
};
