import { Plus, Pencil, Trash2, HelpCircle } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { crmApi } from "@/services/crm";

export default function ConfigFaqs() {
  const { token } = useAuth();
  const { data: faqs = [] } = useQuery({ queryKey: ["faqs"], queryFn: () => crmApi.getFaqs(token!), enabled: Boolean(token) });
  return (
    <>
      <ScreenHeader
        title="Preguntas frecuentes"
        subtitle={`${faqs.length} respuestas activas`}
        back
        action={
          <Button size="sm" className="rounded-full h-9 px-3 shadow-green">
            <Plus className="w-4 h-4" /> Nueva
          </Button>
        }
      />

      <ul className="px-4 py-4 space-y-3">
        {faqs.map((f) => (
          <li
            key={f.id}
            className="bg-card rounded-2xl p-4 shadow-card border border-border"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-info/10 text-info grid place-items-center shrink-0">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground">{f.question}</p>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{f.answer}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-1 mt-2 -mr-1">
              <button className="text-muted-foreground hover:text-foreground p-2 rounded-lg" aria-label="Editar">
                <Pencil className="w-4 h-4" />
              </button>
              <button className="text-muted-foreground hover:text-destructive p-2 rounded-lg" aria-label="Eliminar">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
