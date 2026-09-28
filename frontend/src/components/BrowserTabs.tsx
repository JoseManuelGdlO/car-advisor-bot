import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

export type BrowserTab = {
  to: string;
  label: string;
  badge?: number;
  match: (pathname: string) => boolean;
};

export function BrowserTabs({ tabs, label, pathname }: { tabs: BrowserTab[]; label: string; pathname: string }) {
  return (
    <div className="bg-[hsl(160_12%_90%)] px-2 pt-2" role="tablist" aria-label={label}>
      <div className="flex items-end gap-1">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          const badge = tab.badge && tab.badge > 0 ? tab.badge : 0;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              role="tab"
              aria-selected={active}
              className={cn(
                "relative flex-1 min-h-11 px-3 inline-flex items-center justify-center gap-1.5 rounded-t-[14px] text-[13px] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                active
                  ? "z-10 bg-background text-foreground font-semibold shadow-[inset_0_3px_0_0_hsl(var(--primary))]"
                  : "mb-1 text-muted-foreground font-medium hover:text-foreground hover:bg-background/70",
              )}
            >
              <span className="truncate">{tab.label}</span>
              {badge > 0 ? (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center tabular-nums">
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}
