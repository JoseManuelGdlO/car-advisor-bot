import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, MoreVertical, Send, Bot, Smile, Paperclip, User, Copy } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { ChannelIcon } from "@/components/ChannelIcon";
import type { Channel } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { crmApi } from "@/services/crm";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const QUICK_EMOJIS = ["😀", "👍", "🙏", "✅", "🚗", "💰", "📍", "⏰"];

type ChatClient = {
  id: string;
  name: string;
  phone?: string;
  avatarColor?: string;
  interestedIn?: string;
};

type ConversationWithClient = {
  id: string;
  channel: string;
  isHumanControlled?: boolean;
  client?: ChatClient;
};

type ChatMessageRow = {
  id: string;
  from: string;
  text: string;
  time: string;
};

type ParsedAttachmentText = {
  imageUrl: string;
  caption: string;
};

function parseAttachmentText(text: string): ParsedAttachmentText | null {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const imageOnlyMatch = raw.match(/^\[Imagen\]\s+(https?:\/\/\S+)$/i);
  if (imageOnlyMatch) {
    return { imageUrl: imageOnlyMatch[1], caption: "" };
  }

  const captionAndUrlMatch = raw.match(/^(.*)\n(https?:\/\/\S+)$/s);
  if (!captionAndUrlMatch) return null;

  const caption = captionAndUrlMatch[1].trim();
  const imageUrl = captionAndUrlMatch[2].trim();
  if (!imageUrl) return null;
  return { imageUrl, caption };
}

function normalizeConversationChannel(value: string): Channel {
  if (value === "whatsapp" || value === "instagram" || value === "facebook") return value;
  return "facebook";
}

function buildTelHref(phone: string | undefined): string | null {
  if (!phone?.trim()) return null;
  const compact = phone.replace(/\s/g, "");
  const digits = compact.replace(/\D/g, "");
  if (digits.length < 7) return null;
  const intl = compact.startsWith("+") ? `+${digits}` : digits;
  return `tel:${intl}`;
}

export default function ChatDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { data: conversations } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => crmApi.getConversations(token!),
    enabled: Boolean(token),
  });
  const conv = (conversations as ConversationWithClient[] | undefined)?.find((c) => c.id === id);
  const { data: messages } = useQuery({
    queryKey: ["messages", id],
    queryFn: () => crmApi.getConversationMessages(token!, id!),
    enabled: Boolean(token && id),
  });
  const client = conv?.client;
  const [draft, setDraft] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const hasAutoScrolledRef = useRef(false);
  const refreshConversationData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["messages", id] }),
      queryClient.invalidateQueries({ queryKey: ["conversations"] }),
    ]);
  };

  const telHref = buildTelHref(client?.phone);

  const handleCall = () => {
    if (!telHref) {
      toast.error("No hay un número de teléfono válido para llamar.");
      return;
    }
    window.location.href = telHref;
  };

  const handleCopyPhone = async () => {
    if (!client.phone?.trim()) {
      toast.error("No hay teléfono para copiar.");
      return;
    }
    try {
      await navigator.clipboard.writeText(client.phone.trim());
      toast.success("Teléfono copiado al portapapeles.");
    } catch {
      toast.message(client.phone.trim());
    }
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const sendMessageMutation = useMutation({
    mutationFn: (text: string) => crmApi.sendConversationMessage(token!, id!, { text }),
    onSuccess: async () => {
      setDraft("");
      await refreshConversationData();
      toast.success("Mensaje enviado.");
    },
    onError: (error: Error) => toast.error(error.message || "No se pudo enviar el mensaje."),
  });

  const sendAttachmentMutation = useMutation({
    mutationFn: (file: File) => crmApi.sendConversationAttachment(token!, id!, file),
    onSuccess: async () => {
      await refreshConversationData();
      toast.success("Adjunto enviado.");
    },
    onError: (error: Error) => toast.error(error.message || "No se pudo enviar el adjunto."),
  });

  const controlMutation = useMutation({
    mutationFn: (isHumanControlled: boolean) => crmApi.setConversationControl(token!, id!, { isHumanControlled }),
    onSuccess: async (_data, isHumanControlled) => {
      await refreshConversationData();
      toast.success(isHumanControlled ? "Tomaste el control de la conversación." : "Devolviste el control al bot.");
    },
    onError: (error: Error) => toast.error(error.message || "No se pudo actualizar el control de la conversación."),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten imágenes para envío por canal.");
      return;
    }
    const maxBytes = 8 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error("La imagen es muy grande. Máximo 8 MB.");
      return;
    }
    sendAttachmentMutation.mutate(file);
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) {
      toast.error("Escribe un mensaje antes de enviar.");
      return;
    }
    sendMessageMutation.mutate(text);
  };

  const handleTakeControl = () => {
    if (!conv) return;
    controlMutation.mutate(!conv.isHumanControlled);
  };

  useEffect(() => {
    hasAutoScrolledRef.current = false;
  }, [id]);

  useEffect(() => {
    if (hasAutoScrolledRef.current) return;
    const messageList = (messages || []) as ChatMessageRow[];
    if (!messageList.length) return;
    messagesContainerRef.current?.scrollTo({
      top: messagesContainerRef.current.scrollHeight,
      behavior: "auto",
    });
    hasAutoScrolledRef.current = true;
  }, [messages]);

  if (!conv || !client) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Chat no encontrado.
        <button type="button" onClick={() => navigate(-1)} className="block mx-auto mt-3 text-primary font-semibold">
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx" onChange={handleFileChange} />

      {/* WhatsApp-style header */}
      <header className="bg-gradient-hero text-primary-foreground px-3 pt-4 pb-3 flex items-center gap-2 shadow-soft z-10">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="min-h-[44px] min-w-[44px] shrink-0 grid place-items-center rounded-full hover:bg-white/15 touch-manipulation"
          aria-label="Volver"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="relative shrink-0">
          <Avatar name={client.name} color={client.avatarColor} size="sm" />
          <ChannelIcon channel={normalizeConversationChannel(conv.channel)} size={9} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-primary-dark" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{client.name}</p>
          <p className="text-[11px] text-primary-foreground/80 truncate">Interesado en {client.interestedIn}</p>
        </div>
        <button
          type="button"
          onClick={handleCall}
          className="min-h-[44px] min-w-[44px] shrink-0 grid place-items-center rounded-full hover:bg-white/15 touch-manipulation"
          aria-label="Llamar al cliente"
        >
          <Phone className="w-4 h-4" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="min-h-[44px] min-w-[44px] shrink-0 grid place-items-center rounded-full hover:bg-white/15 touch-manipulation outline-none"
              aria-label="Más opciones"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => {
                navigate(`/cliente/${client.id}`);
              }}
            >
              <User className="w-4 h-4" />
              Ver ficha del cliente
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onSelect={handleCopyPhone}>
              <Copy className="w-4 h-4" />
              Copiar teléfono
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-muted-foreground"
              onSelect={() => toast.info(`Canal: ${conv.channel}. El detalle del canal se administra en Configuración.`)}
            >
              Información del canal
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Bot-active banner */}
      <div className="bg-info/10 border-b border-info/20 px-4 py-2 flex items-center gap-2">
        <Bot className="w-4 h-4 text-info shrink-0" />
        <p className="text-xs text-foreground flex-1">
          {conv.isHumanControlled ? "Control humano activo para esta conversación" : "El bot está respondiendo automáticamente"}
        </p>
        <button
          type="button"
          onClick={handleTakeControl}
          disabled={controlMutation.isPending}
          className="text-[11px] font-bold text-info uppercase touch-manipulation py-2 px-1"
        >
          {controlMutation.isPending ? "Actualizando..." : conv.isHumanControlled ? "Devolver al bot" : "Tomar control"}
        </button>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto bg-chat-pattern px-3 py-4 space-y-2">
        {((messages || []) as ChatMessageRow[]).map((m) => {
          const mine = m.from !== "client";
          const isBot = m.from === "bot";
          const attachment = parseAttachmentText(m.text);
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[78%] px-3 py-2 rounded-2xl shadow-soft text-sm",
                  mine
                    ? isBot
                      ? "bg-chat-bot text-foreground rounded-br-md"
                      : "bg-chat-out text-foreground rounded-br-md"
                    : "bg-chat-in text-foreground rounded-bl-md",
                )}
              >
                {isBot && (
                  <p className="text-[10px] font-bold text-info mb-1 flex items-center gap-1 uppercase tracking-wide">
                    <Bot className="w-3 h-3" /> AutoBot
                  </p>
                )}
                {!isBot && mine && (
                  <p className="text-[10px] font-bold text-primary-dark mb-1 uppercase tracking-wide">Tú (vendedor)</p>
                )}
                {attachment ? (
                  <div className="space-y-2">
                    {attachment.caption ? <p className="leading-relaxed whitespace-pre-wrap">{attachment.caption}</p> : null}
                    <a href={attachment.imageUrl} target="_blank" rel="noreferrer" className="block">
                      <img
                        src={attachment.imageUrl}
                        alt={attachment.caption || "Imagen adjunta"}
                        loading="lazy"
                        className="max-h-64 w-auto rounded-lg border border-border/50"
                      />
                    </a>
                  </div>
                ) : (
                  <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>
                )}
                <p className="text-[10px] text-muted-foreground text-right mt-1">{m.time}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="border-t border-border bg-card px-2 py-2 flex items-center gap-2">
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="min-h-[44px] min-w-[44px] shrink-0 grid place-items-center rounded-full text-muted-foreground hover:bg-muted touch-manipulation"
              aria-label="Emojis"
            >
              <Smile className="w-5 h-5" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-auto p-2">
            <p className="text-[10px] text-muted-foreground mb-2 px-1">Toca para insertar</p>
            <div className="flex flex-wrap gap-1 max-w-[220px]">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="text-2xl min-h-[44px] min-w-[44px] grid place-items-center rounded-lg hover:bg-muted touch-manipulation"
                  onClick={() => {
                    setDraft((d) => d + emoji);
                    setEmojiOpen(false);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex-1 flex items-center bg-muted rounded-full pl-4 pr-2 min-h-[44px]">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Escribe un mensaje…"
            className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground py-2"
          />
          <button
            type="button"
            onClick={handleAttachClick}
            disabled={sendAttachmentMutation.isPending}
            className="min-h-[44px] min-w-[44px] shrink-0 grid place-items-center text-muted-foreground touch-manipulation"
            aria-label="Adjuntar archivo"
          >
            <Paperclip className="w-4 h-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={handleSend}
          disabled={sendMessageMutation.isPending}
          className="min-h-[44px] min-w-[44px] shrink-0 grid place-items-center rounded-full bg-primary text-primary-foreground shadow-green touch-manipulation"
          aria-label="Enviar"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
