import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

const DELAY_MS = 1000;

/**
 * Full-screen loading hint when queries/mutations take longer than {@link DELAY_MS}.
 * Avoids flashing on fast responses while signaling the app is working on slow backends.
 */
export function DelayedQueryLoadingOverlay() {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const pending = fetching + mutating;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (pending === 0) {
      setVisible(false);
      return;
    }
    const t = window.setTimeout(() => setVisible(true), DELAY_MS);
    return () => window.clearTimeout(t);
  }, [pending]);

  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/55 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Cargando"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-card border border-border px-8 py-6 shadow-lg">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <p className="text-sm font-medium text-foreground">Cargando…</p>
      </div>
    </div>,
    document.body
  );
}
