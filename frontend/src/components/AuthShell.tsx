import { ComponentProps, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bot, ChevronLeft, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const authInputClass =
  "h-11 rounded-none border-0 border-b border-foreground/25 bg-transparent px-0 shadow-none ring-0 ring-offset-0 focus-visible:border-primary focus-visible:ring-0 focus-visible:ring-offset-0";

export const authPillBlack =
  "inline-flex h-[3.25rem] w-full items-center justify-center rounded-2xl border-0 bg-foreground px-6 text-[15px] font-semibold text-background shadow-[var(--shadow-soft)] transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px";

export const authPillWhite =
  "inline-flex h-[3.25rem] w-full items-center justify-center rounded-2xl border-0 bg-white px-6 text-[15px] font-semibold text-foreground shadow-[0_10px_24px_-12px_hsl(160_30%_12%/0.45)] transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px";

export const authPillOutline = authPillWhite;

export const authPillFill =
  "inline-flex h-[3.25rem] w-full items-center justify-center rounded-2xl border-0 bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-[var(--shadow-green)] transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px";

export function AuthActions({ children }: { children: ReactNode }) {
  return <div className="mt-auto flex w-full flex-col gap-3 pt-6">{children}</div>;
}

export function AuthShell({
  title,
  subtitle,
  hero = "compact",
  backTo,
  children,
}: {
  title?: string;
  subtitle?: string;
  hero?: "tall" | "compact";
  backTo?: string;
  children: ReactNode;
}) {
  const tall = hero === "tall";

  return (
    <div className="min-h-full flex flex-col bg-background text-foreground">
      <header
        className="relative shrink-0 overflow-hidden bg-gradient-to-b from-[hsl(162_75%_24%)] to-[hsl(var(--primary))] pt-8 text-primary-foreground"
      >
        {backTo ? (
          <Link
            to={backTo}
            className="absolute left-2 top-2 z-10 inline-flex h-11 items-center gap-0.5 rounded-full px-2 text-sm font-semibold text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            <ChevronLeft className="h-5 w-5" />
            Atrás
          </Link>
        ) : null}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-8 top-6 h-28 w-28 rounded-full bg-black/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-6 bottom-10 h-20 w-20 rounded-full bg-black/10"
        />
        <div className={cn("relative flex flex-col items-center px-6", tall ? "pb-3" : "pb-2")}>
          <div className={cn("grid place-items-center rounded-2xl border border-white/30", tall ? "h-16 w-16" : "h-14 w-14")}>
            <Bot className={tall ? "h-8 w-8" : "h-7 w-7"} strokeWidth={2.1} />
          </div>
          <p className={cn("mt-2.5 font-semibold tracking-tight", tall ? "text-xl" : "text-lg")}>AutoBot</p>
        </div>
        <svg
          className={cn("relative block w-full text-background", tall ? "h-12" : "h-14")}
          viewBox="0 0 390 56"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path fill="currentColor" d="M0 30C78 58 128 2 198 20C268 38 328 6 390 24V56H0V30Z" />
        </svg>
      </header>

      <div className="flex flex-1 flex-col px-6 pb-8">
        {title ? (
          <>
            <h1 className="text-[1.65rem] font-semibold leading-tight text-foreground">{title}</h1>
            <span aria-hidden className="mt-2.5 h-[3px] w-8 rounded-full bg-foreground" />
            {subtitle ? (
              <p className="mt-3 max-w-[32ch] text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
            ) : null}
          </>
        ) : null}
        <div className={cn("flex flex-1 flex-col", title && "mt-6")}>{children}</div>
      </div>
    </div>
  );
}

export function AuthField({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          {label}
        </Label>
        {hint}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AuthTextInput({
  id,
  error,
  className,
  ...props
}: ComponentProps<typeof Input> & { id: string; error?: string }) {
  return (
    <Input
      id={id}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${id}-error` : undefined}
      className={cn(authInputClass, error && "border-destructive focus-visible:border-destructive", className)}
      {...props}
    />
  );
}

export function AuthPasswordInput({
  id,
  error,
  shown,
  onToggle,
  toggleLabel,
  className,
  ...props
}: ComponentProps<typeof Input> & {
  id: string;
  error?: string;
  shown: boolean;
  onToggle: () => void;
  toggleLabel?: string;
}) {
  const noun = toggleLabel ?? "contraseña";
  return (
    <div className="relative">
      <AuthTextInput
        {...props}
        id={id}
        error={error}
        type={shown ? "text" : "password"}
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-muted-foreground hover:text-foreground"
        aria-label={shown ? `Ocultar ${noun}` : `Mostrar ${noun}`}
      >
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
