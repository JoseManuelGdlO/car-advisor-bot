import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, MoreVertical, Send, Bot, Smile, Paperclip } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { ChannelIcon } from "@/components/ChannelIcon";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { crmApi } from "@/services/crm";

export default function ChatDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { data: conversations } = useQuery({ queryKey: ["conversations"], queryFn: () => crmApi.getConversations(token!), enabled: Boolean(token) });
  const conv = (conversations || []).find((c: any) => c.id === id);
  const { data: messages } = useQuery({ queryKey: ["messages", id], queryFn: () => crmApi.getConversationMessages(token!, id!), enabled: Boolean(token && id) });
  const client = conv?.client;

  if (!conv || !client) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Chat no encontrado.
        <button onClick={() => navigate(-1)} className="block mx-auto mt-3 text-primary font-semibold">Volver</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* WhatsApp-style header */}
      <header className="bg-gradient-hero text-primary-foreground px-3 pt-4 pb-3 flex items-center gap-2 shadow-soft z-10">
        <button onClick={() => navigate(-1)} className="w-9 h-9 grid place-items-center rounded-full hover:bg-white/15">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="relative">
          <Avatar name={client.name} color={client.avatarColor} size="sm" />
          <ChannelIcon channel={conv.channel} size={9} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-primary-dark" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{client.name}</p>
          <p className="text-[11px] text-primary-foreground/80 truncate">Interesado en {client.interestedIn}</p>
        </div>
        <button className="w-9 h-9 grid place-items-center rounded-full hover:bg-white/15">
          <Phone className="w-4 h-4" />
        </button>
        <button className="w-9 h-9 grid place-items-center rounded-full hover:bg-white/15">
          <MoreVertical className="w-4 h-4" />
        </button>
      </header>

      {/* Bot-active banner */}
      <div className="bg-info/10 border-b border-info/20 px-4 py-2 flex items-center gap-2">
        <Bot className="w-4 h-4 text-info shrink-0" />
        <p className="text-xs text-foreground flex-1">
          El bot está respondiendo automáticamente
        </p>
        <button className="text-[11px] font-bold text-info uppercase">Tomar control</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-chat-pattern px-3 py-4 space-y-2">
        {(messages || []).map((m: any) => {
          const mine = m.from !== "client";
          const isBot = m.from === "bot";
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[78%] px-3 py-2 rounded-2xl shadow-soft text-sm",
                  mine
                    ? isBot
                      ? "bg-chat-bot text-foreground rounded-br-md"
                      : "bg-chat-out text-foreground rounded-br-md"
                    : "bg-chat-in text-foreground rounded-bl-md"
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
                <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>
                <p className="text-[10px] text-muted-foreground text-right mt-1">{m.time}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="border-t border-border bg-card px-2 py-2 flex items-center gap-2">
        <button className="w-10 h-10 grid place-items-center rounded-full text-muted-foreground hover:bg-muted">
          <Smile className="w-5 h-5" />
        </button>
        <div className="flex-1 flex items-center bg-muted rounded-full pl-4 pr-2 h-10">
          <input
            placeholder="Escribe un mensaje…"
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
          />
          <button className="w-8 h-8 grid place-items-center text-muted-foreground">
            <Paperclip className="w-4 h-4" />
          </button>
        </div>
        <button className="w-10 h-10 grid place-items-center rounded-full bg-primary text-primary-foreground shadow-green">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
