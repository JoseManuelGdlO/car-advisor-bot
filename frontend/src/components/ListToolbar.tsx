import { ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToolbarSlot } from "@/components/SectionTabsLayout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ListFilterOption = {
  key: string;
  label: string;
  count?: number;
};

type ListToolbarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
  filter: string;
  onFilterChange: (key: string) => void;
  filters: ListFilterOption[];
  extra?: ReactNode;
};

export function ListToolbar({
  query,
  onQueryChange,
  placeholder,
  filter,
  onFilterChange,
  filters,
  extra,
}: ListToolbarProps) {
  const slot = useToolbarSlot();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const visible = open || query.length > 0;
  const active = filters.find((item) => item.key === filter) ?? filters[0];
  const filtered = Boolean(active && active.key !== filters[0]?.key);

  useEffect(() => {
    if (visible) inputRef.current?.focus();
  }, [visible]);

  const dismissSearch = () => {
    if (query) {
      onQueryChange("");
      inputRef.current?.focus();
      return;
    }
    setOpen(false);
  };

  const toolbar = (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background">
      {visible ? (
        <div className="relative flex-1 min-w-0 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                dismissSearch();
              }
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            className="w-full h-11 pl-10 pr-11 rounded-xl bg-muted text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={dismissSearch}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-background/80"
            aria-label={query ? "Limpiar búsqueda" : "Cerrar búsqueda"}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-11 w-11 shrink-0 grid place-items-center rounded-xl text-foreground hover:bg-muted active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Buscar"
        >
          <Search className="w-5 h-5" />
        </button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "h-11 min-w-0 rounded-xl border px-3 text-sm font-medium inline-flex items-center justify-between gap-2",
              "hover:bg-muted/70 active:scale-[0.98] transition-transform",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              visible ? "max-w-[46%] shrink-0" : "flex-1",
              filtered
                ? "border-primary/40 bg-primary/10 text-primary-dark"
                : "border-border bg-card text-foreground",
            )}
          >
            <span className="truncate">{active?.label ?? "Filtrar"}</span>
            <ChevronDown className="w-4 h-4 shrink-0 opacity-70" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuRadioGroup value={filter} onValueChange={onFilterChange}>
            {filters.map((item) => (
              <DropdownMenuRadioItem key={item.key} value={item.key}>
                <span className="flex flex-1 items-center justify-between gap-3 min-w-0">
                  <span className="truncate">{item.label}</span>
                  {typeof item.count === "number" ? (
                    <span className="tabular-nums text-xs text-muted-foreground">{item.count}</span>
                  ) : null}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {extra}
    </div>
  );

  if (slot) return createPortal(toolbar, slot);
  if (slot === null) return null;
  return toolbar;
}
