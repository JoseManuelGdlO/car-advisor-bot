import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type GoogleCalendarLinkHelpDialogProps = {
  triggerClassName?: string;
};

export function GoogleCalendarLinkHelpDialog({ triggerClassName }: GoogleCalendarLinkHelpDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={
            triggerClassName ||
            "text-xs font-semibold text-primary-dark hover:underline text-left"
          }
        >
          ¿No sabes de dónde obtenerlo?
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Obtener tu enlace de Google Calendar</DialogTitle>
          <DialogDescription>
            Sigue estos pasos para crear y copiar el enlace de reservas de citas.
          </DialogDescription>
        </DialogHeader>
        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
          <li>Abre Google Calendar con la cuenta donde quieres recibir las citas.</li>
          <li>En el menú lateral, entra a <strong className="text-foreground">Páginas de reservas</strong> (o Configuración de citas).</li>
          <li>Crea una página de reservas nueva o selecciona una existente.</li>
          <li>Configura duración, disponibilidad y datos que pedirás al cliente.</li>
          <li>Usa <strong className="text-foreground">Compartir</strong> o <strong className="text-foreground">Copiar enlace</strong>.</li>
          <li>Pega aquí el enlace que empiece por <code className="text-xs">https://calendar.app.google/</code> o <code className="text-xs">https://calendar.google.com/</code>.</li>
        </ol>
      </DialogContent>
    </Dialog>
  );
}
