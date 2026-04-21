import { useParams } from "react-router-dom";
import { Phone, MessageCircle, Car, FileText } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { ChannelIcon } from "@/components/ChannelIcon";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { crmApi } from "@/services/crm";

export default function ClienteDetalle() {
  const { id } = useParams();
  const { token } = useAuth();
  const { data: client } = useQuery({ queryKey: ["client", id], queryFn: () => crmApi.getClient(token!, id!), enabled: Boolean(token && id) });
  const { data: conversations } = useQuery({ queryKey: ["conversations"], queryFn: () => crmApi.getConversations(token!), enabled: Boolean(token) });
  const conv = (conversations || []).find((c: any) => c.clientLeadId === id);

  if (!client) {
    return (
      <>
        <ScreenHeader title="Cliente" back />
        <div className="p-6 text-center text-sm text-muted-foreground">Cliente no encontrado</div>
      </>
    );
  }

  return (
    <>
      <ScreenHeader title="Detalle del cliente" back />

      <div className="px-4 py-5 space-y-4">
        <div className="bg-card rounded-2xl p-5 shadow-card border border-border flex flex-col items-center text-center">
          <div className="relative">
            <Avatar name={client.name} color={client.avatarColor} size="lg" />
            <ChannelIcon channel={client.channel} size={12} className="absolute -bottom-1 -right-1 ring-2 ring-card" />
          </div>
          <h2 className="mt-3 font-bold text-lg">{client.name}</h2>
          <p className="text-xs text-muted-foreground">{client.phone}</p>
          <div className="mt-3">
            <StatusBadge status={client.status} />
          </div>

          <div className="grid grid-cols-2 gap-2 w-full mt-4">
            <Button variant="outline" className="h-10 rounded-xl gap-2">
              <Phone className="w-4 h-4" /> Llamar
            </Button>
            <Button className="h-10 rounded-xl gap-2 shadow-green">
              <MessageCircle className="w-4 h-4" /> Chat
            </Button>
          </div>
        </div>

        <div className="bg-card rounded-2xl p-4 shadow-card border border-border">
          <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wide mb-3">Auto de interés</h3>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-accent grid place-items-center text-accent-foreground">
              <Car className="w-6 h-6" />
            </div>
            <div>
              <p className="font-semibold text-sm">{client.interestedIn}</p>
              <p className="text-xs text-muted-foreground">Ver ficha del auto</p>
            </div>
          </div>
        </div>

        {client.notes && (
          <div className="bg-card rounded-2xl p-4 shadow-card border border-border">
            <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wide mb-2 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" /> Notas del vendedor
            </h3>
            <p className="text-sm text-foreground leading-relaxed">{client.notes}</p>
          </div>
        )}

        {conv && (
          <div className="bg-card rounded-2xl p-4 shadow-card border border-border">
            <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wide mb-3">Últimos mensajes</h3>
            <div className="space-y-2">
              {conv.messages.slice(-3).map((m) => (
                <div
                  key={m.id}
                  className={`p-3 rounded-xl text-sm ${
                    m.from === "client" ? "bg-muted text-foreground" : "bg-accent text-accent-foreground"
                  }`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-1 opacity-70">
                    {m.from === "client" ? client.name : m.from === "bot" ? "🤖 Bot" : "Tú"}
                  </p>
                  {m.text}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
