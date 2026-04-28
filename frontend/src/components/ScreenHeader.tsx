import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  back?: boolean;
  action?: ReactNode;
  variant?: "default" | "primary";
}

export const ScreenHeader = ({ title, subtitle, back, action, variant = "default" }: ScreenHeaderProps) => {
  const navigate = useNavigate();
  const isPrimary = variant === "primary";

  return (
    <header
      className={cn(
        "sticky top-0 z-20 px-4 pt-4 pb-3 border-b",
        isPrimary
          ? "bg-gradient-hero text-primary-foreground border-transparent"
          : "bg-card/95 backdrop-blur border-border text-foreground"
      )}
    >
      <div className="flex items-center gap-3">
        {back && (
          <button
            onClick={() => navigate(-1)}
            aria-label="Volver"
            className={cn(
              "w-9 h-9 grid place-items-center rounded-full transition-colors",
              isPrimary ? "hover:bg-white/15" : "hover:bg-muted"
            )}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">{title}</h1>
          {subtitle && (
            <p className={cn("text-xs truncate", isPrimary ? "text-primary-foreground/80" : "text-muted-foreground")}>
              {subtitle}
            </p>
          )}
        </div>
        {action}
      </div>
    </header>
  );
};
