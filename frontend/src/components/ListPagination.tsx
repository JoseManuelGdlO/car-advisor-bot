import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type ListPaginationProps = {
  page: number;
  pageCount: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function ListPagination({
  page,
  pageCount,
  rangeStart,
  rangeEnd,
  total,
  onPageChange,
}: ListPaginationProps) {
  const navRef = useRef<HTMLElement>(null);

  if (pageCount <= 1) return null;

  const goTo = (nextPage: number) => {
    onPageChange(nextPage);
    const scroller = navRef.current?.closest(".overflow-y-auto");
    if (scroller instanceof HTMLElement) scroller.scrollTo({ top: 0 });
  };

  return (
    <nav
      ref={navRef}
      aria-label="Paginación"
      className="flex items-center justify-between gap-3 border-t border-border px-4 py-2"
    >
      <p className="text-xs text-muted-foreground tabular-nums">
        {rangeStart}–{rangeEnd} de {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => goTo(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
          className={cn(
            "grid min-h-11 min-w-11 place-items-center rounded-full transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:pointer-events-none disabled:opacity-40 hover:bg-muted",
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-12 text-center text-xs font-semibold tabular-nums">
          {page}/{pageCount}
        </span>
        <button
          type="button"
          onClick={() => goTo(page + 1)}
          disabled={page >= pageCount}
          aria-label="Página siguiente"
          className={cn(
            "grid min-h-11 min-w-11 place-items-center rounded-full transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:pointer-events-none disabled:opacity-40 hover:bg-muted",
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
