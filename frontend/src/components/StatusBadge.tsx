import { ClientStatus, CarStatus } from "@/data/mockData";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: ClientStatus | CarStatus;
  className?: string;
}

const labels: Record<string, { text: string; classes: string }> = {
  lead: { text: "Lead nuevo", classes: "bg-info/15 text-info" },
  negotiation: { text: "Negociando", classes: "bg-warning/15 text-warning" },
  sold: { text: "Vendido", classes: "bg-success/15 text-success" },
  lost: { text: "Perdido", classes: "bg-destructive/15 text-destructive" },
  available: { text: "Disponible", classes: "bg-success/15 text-success" },
  reserved: { text: "Apartado", classes: "bg-warning/15 text-warning" },
};

export const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const cfg = labels[status] ?? { text: status, classes: "bg-muted text-muted-foreground" };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide",
        cfg.classes,
        className
      )}
    >
      {cfg.text}
    </span>
  );
};
