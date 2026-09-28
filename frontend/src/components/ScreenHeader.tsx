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
  embedded?: boolean;
}

export const ScreenHeader = ({ title, subtitle, back, action, embedded = false }: ScreenHeaderProps) => {
  const navigate = useNavigate();

  return (
    <header
      className={cn(
        "px-4 pt-3 pb-3 text-foreground",
        embedded
          ? "bg-transparent"
          : "sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur",
      )}
    >
      <div className="flex items-center gap-2">
        {back && (
          <button
            onClick={() => navigate(-1)}
            aria-label="Volver"
            className="min-h-11 min-w-11 -ml-1 grid place-items-center rounded-full hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex flex-1 min-w-0 items-stretch gap-2.5">
          <span aria-hidden className="w-[3px] self-stretch rounded-full bg-primary shrink-0 my-0.5" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold leading-tight truncate">{title}</h1>
            {subtitle ? <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p> : null}
          </div>
        </div>
        {action}
      </div>
    </header>
  );
};
