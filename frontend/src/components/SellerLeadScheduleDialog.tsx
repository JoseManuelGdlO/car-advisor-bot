import { useEffect, useState } from "react";
import { Clock3, Plus, Save, Trash2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import {
  ALL_DAY_RANGE,
  DEFAULT_DAY_RANGE,
  emptyWeeklySchedule,
  hasInvalidRanges,
  SCHEDULE_DAYS,
} from "@/lib/botSchedule";
import { normalizeApiError } from "@/lib/formErrors";
import { sellersApi, type SellerDto } from "@/services/sellers";
import type { BotScheduleRangeDto, BotWeeklyScheduleDto } from "@/services/crm";

const TIME_INPUT_CLASS =
  "h-9 min-w-0 w-full overflow-hidden px-2 text-sm [&::-webkit-calendar-picker-indicator]:h-4 [&::-webkit-calendar-picker-indicator]:w-4 [&::-webkit-calendar-picker-indicator]:shrink-0 [&::-webkit-calendar-picker-indicator]:p-0 [&::-webkit-calendar-picker-indicator]:opacity-70";

type Props = {
  seller: SellerDto | null;
  token: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void> | void;
};

export function SellerLeadScheduleDialog({ seller, token, open, onOpenChange, onSaved }: Props) {
  const [weeklySchedule, setWeeklySchedule] = useState<BotWeeklyScheduleDto>(emptyWeeklySchedule());
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !seller) return;
    setWeeklySchedule(seller.weeklySchedule ?? emptyWeeklySchedule());
    setError("");
  }, [open, seller]);

  const saveMutation = useMutation({
    mutationFn: () => sellersApi.updateLeadSchedule(token!, seller!.id, { weeklySchedule }),
    onSuccess: async () => {
      toast.success("Horario guardado.");
      setError("");
      onOpenChange(false);
      await onSaved();
    },
    onError: (err: unknown) => {
      setError(normalizeApiError(err, "No se pudo guardar el horario.").formError);
    },
  });

  const invalidRanges = hasInvalidRanges(weeklySchedule);

  const addRange = (day: keyof BotWeeklyScheduleDto) => {
    setWeeklySchedule((prev) => ({
      ...prev,
      [day]: [...prev[day], { start: "09:00", end: "18:00" }],
    }));
  };

  const updateRange = (day: keyof BotWeeklyScheduleDto, index: number, patch: Partial<BotScheduleRangeDto>) => {
    setWeeklySchedule((prev) => ({
      ...prev,
      [day]: prev[day].map((range, i) => (i === index ? { ...range, ...patch } : range)),
    }));
  };

  const removeRange = (day: keyof BotWeeklyScheduleDto, index: number) => {
    setWeeklySchedule((prev) => ({
      ...prev,
      [day]: prev[day].filter((_, i) => i !== index),
    }));
  };

  const isAllDay = (day: keyof BotWeeklyScheduleDto) =>
    weeklySchedule[day].length === 1 &&
    weeklySchedule[day][0].start === "00:00" &&
    weeklySchedule[day][0].end === "23:59";

  const toggleAllDay = (day: keyof BotWeeklyScheduleDto, checked: boolean) => {
    setWeeklySchedule((prev) => ({
      ...prev,
      [day]: checked ? [{ ...ALL_DAY_RANGE }] : [{ ...DEFAULT_DAY_RANGE }],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Horario de toma de leads</DialogTitle>
          <DialogDescription>
            Rangos en los que puede recibir leads cuando el bot cede el control.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {SCHEDULE_DAYS.map((day) => (
            <div key={day.key} className="overflow-hidden rounded-2xl border border-border p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{day.label}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => addRange(day.key)}
                  disabled={isAllDay(day.key)}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Agregar rango
                </Button>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={isAllDay(day.key)}
                  onChange={(e) => toggleAllDay(day.key, e.target.checked)}
                />
                Todo el dia
              </label>
              {weeklySchedule[day.key].length === 0 ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock3 className="w-3.5 h-3.5" /> Sin toma de leads este día.
                </p>
              ) : (
                <div className="space-y-2">
                  {weeklySchedule[day.key].map((range, index) => (
                    <div
                      key={`${day.key}-${index}`}
                      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_2.25rem] items-center gap-1.5"
                    >
                      <Input
                        type="time"
                        className={TIME_INPUT_CLASS}
                        value={range.start}
                        onChange={(e) => updateRange(day.key, index, { start: e.target.value })}
                        aria-label={`${day.label} inicio ${index + 1}`}
                        disabled={isAllDay(day.key)}
                      />
                      <span className="shrink-0 text-xs text-muted-foreground">a</span>
                      <Input
                        type="time"
                        className={TIME_INPUT_CLASS}
                        value={range.end}
                        onChange={(e) => updateRange(day.key, index, { end: e.target.value })}
                        aria-label={`${day.label} fin ${index + 1}`}
                        disabled={isAllDay(day.key)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        onClick={() => removeRange(day.key, index)}
                        disabled={isAllDay(day.key)}
                        aria-label={`Eliminar rango ${index + 1} de ${day.label}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {invalidRanges ? (
            <p className="text-xs text-destructive">Revisa los horarios: la hora inicio debe ser menor que la final.</p>
          ) : null}
          <FormErrorAlert title="No se pudo guardar el horario" message={error} />
          <Button
            className="w-full"
            disabled={!token || !seller || saveMutation.isPending || invalidRanges}
            onClick={() => saveMutation.mutate()}
          >
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? "Guardando..." : "Guardar horario"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
