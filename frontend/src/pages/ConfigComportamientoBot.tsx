import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Bot, MessageCircleHeart, MessageSquare, Save } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/context/AuthContext";
import { crmApi, type BotSettingsDto } from "@/services/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { normalizeApiError } from "@/lib/formErrors";

type BehaviorForm = Pick<
  BotSettingsDto,
  | "tone"
  | "emojiStyle"
  | "salesProactivity"
  | "customInstructions"
  | "botName"
  | "welcomeMessage"
  | "faqFallbackMessage"
  | "downPaymentMessage"
  | "visitIncentiveMessage"
>;

const DEFAULT_FORM: BehaviorForm = {
  tone: "cercano",
  emojiStyle: "pocos",
  salesProactivity: "medio",
  customInstructions: "",
  botName: "",
  welcomeMessage: "",
  faqFallbackMessage: "",
  downPaymentMessage: "",
  visitIncentiveMessage: "",
};

const BOT_NAME_MAX = 40;
const MESSAGE_MAX = 2000;

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
      botName: data.botName || "",
      welcomeMessage: data.welcomeMessage || "",
      faqFallbackMessage: data.faqFallbackMessage || "",
      downPaymentMessage: data.downPaymentMessage ?? "",
      visitIncentiveMessage: data.visitIncentiveMessage ?? "",
    });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () =>
      crmApi.updateBotSettings(token!, {
        tone: form.tone,
        emojiStyle: form.emojiStyle,
        salesProactivity: form.salesProactivity,
        customInstructions: form.customInstructions,
        botName: form.botName,
        welcomeMessage: form.welcomeMessage,
        faqFallbackMessage: form.faqFallbackMessage,
        downPaymentMessage: form.downPaymentMessage.trim() || null,
        visitIncentiveMessage: form.visitIncentiveMessage.trim() || null,
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["bot-settings"] });
    },
    onError: (err: unknown) => {
      const { formError } = normalizeApiError(err, "No se pudo guardar el comportamiento del bot");
      setError(formError);
    },
  });

  const hasChanges = useMemo(() => {
    if (!data) return false;
    return (
      data.tone !== form.tone ||
      data.emojiStyle !== form.emojiStyle ||
      data.salesProactivity !== form.salesProactivity ||
      data.customInstructions !== form.customInstructions ||
      data.botName !== form.botName ||
      data.welcomeMessage !== form.welcomeMessage ||
      data.faqFallbackMessage !== form.faqFallbackMessage ||
      (data.downPaymentMessage ?? "") !== form.downPaymentMessage ||
      (data.visitIncentiveMessage ?? "") !== form.visitIncentiveMessage
    );
  }, [data, form]);

  return (
    <>
      <ScreenHeader title="Comportamiento del bot" subtitle="Define su forma de responder y vender" back />

      <div className="px-4 py-4 space-y-4">
        <div className="bg-card rounded-2xl p-4 shadow-card border border-border space-y-3">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">Identidad del Bot</p>
              <p className="text-xs text-muted-foreground">Define el nombre de tu asistente virtual</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="bot-name">
              Nombre del Bot
            </label>
            <Input
              id="bot-name"
              maxLength={BOT_NAME_MAX}
              placeholder="Ej: AutoBot"
              value={form.botName}
              onChange={(e) => setForm((prev) => ({ ...prev, botName: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground">Nombre con el que se presenta el asistente al usuario.</p>
          </div>
        </div>

        <div className="bg-card rounded-2xl p-4 shadow-card border border-border space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">Mensajes predefinidos</p>
              <p className="text-xs text-muted-foreground">Configura los mensajes automáticos del bot</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="welcome-message">
              Mensaje de bienvenida
            </label>
            <Textarea
              id="welcome-message"
              rows={3}
              maxLength={MESSAGE_MAX}
              placeholder="¡Hola! ¿En qué puedo ayudarte?"
              value={form.welcomeMessage}
              onChange={(e) => setForm((prev) => ({ ...prev, welcomeMessage: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground text-right">{form.welcomeMessage.length}/{MESSAGE_MAX}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1" htmlFor="faq-fallback">
              <AlertCircle className="w-3.5 h-3.5" />
              Mensaje cuando no entiende
            </label>
            <Textarea
              id="faq-fallback"
              rows={3}
              maxLength={MESSAGE_MAX}
              placeholder="Lo siento, no tengo información sobre esa consulta..."
              value={form.faqFallbackMessage}
              onChange={(e) => setForm((prev) => ({ ...prev, faqFallbackMessage: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground">
              Se muestra cuando el bot no encuentra respuesta en las FAQs.
            </p>
            <p className="text-[11px] text-muted-foreground text-right">{form.faqFallbackMessage.length}/{MESSAGE_MAX}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="down-payment-message">
              Mensaje de enganche
            </label>
            <Textarea
              id="down-payment-message"
              rows={3}
              maxLength={MESSAGE_MAX}
              placeholder="Ej: El enganche mínimo para un carro es de 15%"
              value={form.downPaymentMessage}
              onChange={(e) => setForm((prev) => ({ ...prev, downPaymentMessage: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground">
              Se envía cuando el cliente pregunta por enganche y además se notifica al asesor. Solo aplica si hay texto guardado.
            </p>
            <p className="text-[11px] text-muted-foreground text-right">{form.downPaymentMessage.length}/{MESSAGE_MAX}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="visit-incentive-message">
              Incentivo de visita
            </label>
            <Textarea
              id="visit-incentive-message"
              rows={3}
              maxLength={MESSAGE_MAX}
              placeholder="Ej: Te invitamos a visitarnos en la agencia para conocer los vehículos en persona"
              value={form.visitIncentiveMessage}
              onChange={(e) => setForm((prev) => ({ ...prev, visitIncentiveMessage: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground">
              Se envía al escalar por financiamiento o al pedir hablar con un asesor humano. Solo aplica si hay texto
              guardado.
            </p>
            <p className="text-[11px] text-muted-foreground text-right">
              {form.visitIncentiveMessage.length}/{MESSAGE_MAX}
            </p>
          </div>
        </div>

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

        <FormErrorAlert title="No se pudo guardar el comportamiento" message={error} className="mx-1" />

        <Button className="w-full" disabled={!token || isLoading || saveMutation.isPending || !hasChanges} onClick={() => saveMutation.mutate()}>
          <Save className="w-4 h-4 mr-2" />
          {saveMutation.isPending ? "Guardando..." : "Guardar comportamiento"}
        </Button>
      </div>
    </>
  );
}
