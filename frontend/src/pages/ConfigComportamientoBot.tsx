import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircleHeart, Save } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/context/AuthContext";
import { crmApi, type BotSettingsDto } from "@/services/crm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type BehaviorForm = Pick<BotSettingsDto, "tone" | "emojiStyle" | "salesProactivity" | "customInstructions">;

const DEFAULT_FORM: BehaviorForm = {
  tone: "cercano",
  emojiStyle: "pocos",
  salesProactivity: "medio",
  customInstructions: "",
};

export default function ConfigComportamientoBot() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["bot-settings"],
    queryFn: () => crmApi.getBotSettings(token!),
    enabled: Boolean(token),
  });

  const [form, setForm] = useState<BehaviorForm>(DEFAULT_FORM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setForm({
      tone: data.tone,
      emojiStyle: data.emojiStyle,
      salesProactivity: data.salesProactivity,
      customInstructions: data.customInstructions || "",
    });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () =>
      crmApi.updateBotSettings(token!, {
        tone: form.tone,
        emojiStyle: form.emojiStyle,
        salesProactivity: form.salesProactivity,
        customInstructions: form.customInstructions,
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["bot-settings"] });
    },
    onError: (err: Error) => {
      setError(err.message || "No se pudo guardar el comportamiento del bot");
    },
  });

  const hasChanges = useMemo(() => {
    if (!data) return false;
    return (
      data.tone !== form.tone ||
      data.emojiStyle !== form.emojiStyle ||
      data.salesProactivity !== form.salesProactivity ||
      data.customInstructions !== form.customInstructions
    );
  }, [data, form]);

  return (
    <>
      <ScreenHeader title="Comportamiento del bot" subtitle="Define su forma de responder y vender" back />

      <div className="px-4 py-4 space-y-4">
        <div className="bg-card rounded-2xl p-4 shadow-card border border-border space-y-3">
          <div className="flex items-center gap-2">
            <MessageCircleHeart className="w-5 h-5 text-primary" />
            <p className="text-sm font-semibold">Personalidad conversacional</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Tono del bot</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.tone}
              onChange={(e) => setForm((prev) => ({ ...prev, tone: e.target.value as BehaviorForm["tone"] }))}
            >
              <option value="formal">Formal</option>
              <option value="cercano">Cercano</option>
              <option value="vendedor">Vendedor</option>
              <option value="tecnico">Técnico</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Uso de emojis</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.emojiStyle}
              onChange={(e) => setForm((prev) => ({ ...prev, emojiStyle: e.target.value as BehaviorForm["emojiStyle"] }))}
            >
              <option value="nunca">Nunca</option>
              <option value="pocos">Pocos</option>
              <option value="frecuentes">Frecuentes</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Proactividad comercial</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.salesProactivity}
              onChange={(e) => setForm((prev) => ({ ...prev, salesProactivity: e.target.value as BehaviorForm["salesProactivity"] }))}
            >
              <option value="bajo">Baja</option>
              <option value="medio">Media</option>
              <option value="alto">Alta</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Instrucciones personalizadas</label>
            <Textarea
              rows={6}
              maxLength={1200}
              placeholder="Ejemplo: prioriza agendar test drive, no inventes datos de precios, responde breve."
              value={form.customInstructions}
              onChange={(e) => setForm((prev) => ({ ...prev, customInstructions: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground text-right">{form.customInstructions.length}/1200</p>
          </div>
        </div>

        {error ? <p className="text-xs text-destructive px-1">{error}</p> : null}

        <Button className="w-full" disabled={!token || isLoading || saveMutation.isPending || !hasChanges} onClick={() => saveMutation.mutate()}>
          <Save className="w-4 h-4 mr-2" />
          {saveMutation.isPending ? "Guardando..." : "Guardar comportamiento"}
        </Button>
      </div>
    </>
  );
}
