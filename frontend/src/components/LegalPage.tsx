import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ScreenHeader } from "@/components/ScreenHeader";
import { LEGAL_PAGES, LEGAL_UPDATED_AT } from "@/lib/legal";

export function LegalPage({
  kicker,
  title,
  intro,
  children,
}: {
  kicker: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-full bg-background">
      <ScreenHeader title={title} subtitle={kicker} back />
      <main className="px-4 py-5 space-y-6 pb-10">
        <p className="text-sm leading-relaxed text-muted-foreground">{intro}</p>
        <p className="text-[11px] text-muted-foreground">Última actualización: {LEGAL_UPDATED_AT}</p>
        <div className="space-y-8">{children}</div>
        <nav className="pt-2 border-t border-border flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {LEGAL_PAGES.map((page) => (
            <Link
              key={page.path}
              to={page.path}
              className="text-foreground underline underline-offset-4"
            >
              {page.label}
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}
