import { useEffect, useMemo, useState } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/context/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { crmApi, type BotScheduleRangeDto, type BotSettingsDto } from "@/services/crm";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Ban, Clock3, Plus, Save, Trash2 } from "lucide-react";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { BotBlacklistDialog } from "@/components/BotBlacklistDialog";
import { hasInvalidRanges } from "@/lib/botSchedule";
import { normalizeApiError } from "@/lib/formErrors";
import { resolveTimezoneOptions, normalizeTimezoneValue, DEFAULT_BOT_TIMEZONE } from "@/lib/timezones";

const DAYS = [
  { key: "monday", label: "Lunes" },
  { key: "tuesday", label: "Martes" },
  { key: "wednesday", label: "Miércoles" },
  { key: "thursday", label: "Jueves" },
  { key: "friday", label: "Viernes" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
] as const;

const ALL_DAY_RANGE: BotScheduleRangeDto = { start: "00:00", end: "23:59" };
const DEFAULT_DAY_RANGE: BotScheduleRangeDto = { start: "08:00", end: "18:00" };

const TIME_INPUT_CLASS =
  "h-9 min-w-0 w-full overflow-hidden px-2 text-sm [&::-webkit-calendar-picker-indicator]:h-4 [&::-webkit-calendar-picker-indicator]:w-4 [&::-webkit-calendar-picker-indicator]:shrink-0 [&::-webkit-calendar-picker-indicator]:p-0 [&::-webkit-calendar-picker-indicator]:opacity-70";

const buildFallbackSchedule = (): BotSettingsDto["weeklySchedule"] => ({
  monday: [{ start: "08:00", end: "18:00" }],
  tuesday: [{ start: "08:00", end: "18:00" }],
  wednesday: [{ start: "08:00", end: "18:00" }],
  thursday: [{ start: "08:00", end: "18:00" }],
  friday: [{ start: "08:00", end: "18:00" }],
  saturday: [],
  sunday: [],
});

export default function ConfigBot() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["bot-settings"],
    queryFn: () => crmApi.getBotSettings(token!),
    enabled: Boolean(token),
  });

  const [isEnabled, setIsEnabled] = useState(true);
  const [timezone, setTimezone] = useState(DEFAULT_BOT_TIMEZONE);
  const [weeklySchedule, setWeeklySchedule] = useState<BotSettingsDto["weeklySchedule"]>(buildFallbackSchedule());
  const [error, setError] = useState<string | null>(null);
  const [settingsHydrated, setSettingsHydrated] = useState(false);

  useEffect(() => {
    if (!data) return;
    setIsEnabled(data.isEnabled);
    setTimezone(normalizeTimezoneValue(data.timezone));
    setWeeklySchedule(data.weeklySchedule);
    setSettingsHydrated(true);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () =>
      crmApi.updateBotSettings(token!, {
        isEnabled,
        timezone: normalizeTimezoneValue(timezone),
        weeklySchedule,
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["bot-settings"] });
    },
    onError: (err: unknown) => {
      const { formError } = normalizeApiError(err, "No se pudo guardar la configuración del bot");
      setError(formError);
    },
  });

  const hasChanges = useMemo(() => {
    if (!data) return false;
    return (
      data.isEnabled !== isEnabled ||
      normalizeTimezoneValue(data.timezone) !== normalizeTimezoneValue(timezone) ||
      JSON.stringify(data.weeklySchedule) !== JSON.stringify(weeklySchedule)
    );
  }, [data, isEnabled, timezone, weeklySchedule]);
  const invalidRanges = hasInvalidRanges(weeklySchedule);
  const timezoneOptions = useMemo(() => resolveTimezoneOptions(timezone), [timezone]);
  const selectedTimezone = normalizeTimezoneValue(timezone);

  const addRange = (day: keyof BotSettingsDto["weeklySchedule"]) => {
    setWeeklySchedule((prev) => ({
      ...prev,
      [day]: [...prev[day], { start: "09:00", end: "18:00" }],
    }));
  };

  const updateRange = (day: keyof BotSettingsDto["weeklySchedule"], index: number, patch: Partial<BotScheduleRangeDto>) => {
    setWeeklySchedule((prev) => ({
      ...prev,
      [day]: prev[day].map((range, i) => (i === index ? { ...range, ...patch } : range)),
    }));
  };

  const removeRange = (day: keyof BotSettingsDto["weeklySchedule"], index: number) => {
    setWeeklySchedule((prev) => ({
      ...prev,
      [day]: prev[day].filter((_, i) => i !== index),
    }));
  };

  const isAllDay = (day: keyof BotSettingsDto["weeklySchedule"]) =>
    weeklySchedule[day].length === 1 && weeklySchedule[day][0].start === "00:00" && weeklySchedule[day][0].end === "23:59";

  const toggleAllDay = (day: keyof BotSettingsDto["weeklySchedule"], checked: boolean) => {
    setWeeklySchedule((prev) => ({
      ...prev,
      [day]: checked ? [{ ...ALL_DAY_RANGE }] : [{ ...DEFAULT_DAY_RANGE }],
    }));
  };

  return (
    <>
      <ScreenHeader
        title="Horario del bot"
        subtitle="Control global y rangos de atención"
        back
        action={
          <BotBlacklistDialog>
            <Button size="sm" variant="outline" className="rounded-full h-9 px-3">
              <Ban className="w-4 h-4 mr-1" />
              Lista negra
            </Button>
          </BotBlacklistDialog>
        }
      />

      <div className="px-4 py-4 space-y-4">
        <div className="bg-card rounded-2xl p-4 shadow-card border border-border space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Bot encendido</p>
              <p className="text-xs text-muted-foreground">Apaga o enciende respuestas automáticas para todo tu usuario.</p>
            </div>
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="bot-timezone">
              Zona horaria
            </label>
            <Select
              value={selectedTimezone}
              onValueChange={setTimezone}
              disabled={isLoading || !settingsHydrated}
            >
              <SelectTrigger id="bot-timezone" aria-label="Zona horaria">
                <SelectValue placeholder="Selecciona una zona horaria" />
              </SelectTrigger>
              <SelectContent>
                {timezoneOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Horarios por día</h2>
          {DAYS.map((day) => (
            <div key={day.key} className="overflow-hidden bg-card rounded-2xl p-4 shadow-card border border-border space-y-3">
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
                <input type="checkbox" checked={isAllDay(day.key)} onChange={(e) => toggleAllDay(day.key, e.target.checked)} />
                Todo el dia
              </label>
              {weeklySchedule[day.key].length === 0 ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock3 className="w-3.5 h-3.5" /> Sin atención automática este día.
                </p>
              ) : (
                <div className="space-y-2">
                  {weeklySchedule[day.key].map((range, index) => (
                    <div
                      key={`${day.key}-${index}`}
                      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_2.25rem] items-center gap-1.5"
                    >
                      <div className="min-w-0 overflow-hidden">
                        <Input
                          type="time"
                          className={TIME_INPUT_CLASS}
                          value={range.start}
                          onChange={(e) => updateRange(day.key, index, { start: e.target.value })}
                          aria-label={`${day.label} inicio ${index + 1}`}
                          disabled={isAllDay(day.key)}
                        />
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">a</span>
                      <div className="min-w-0 overflow-hidden">
                        <Input
                          type="time"
                          className={TIME_INPUT_CLASS}
                          value={range.end}
                          onChange={(e) => updateRange(day.key, index, { end: e.target.value })}
                          aria-label={`${day.label} fin ${index + 1}`}
                          disabled={isAllDay(day.key)}
                        />
                      </div>
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
        </div>

        {invalidRanges ? <p className="text-xs text-destructive px-1">Revisa los horarios: la hora inicio debe ser menor que la final.</p> : null}
        <FormErrorAlert title="No se pudo guardar la configuración" message={error} className="mx-1" />

        <Button
          className="w-full"
          disabled={!token || saveMutation.isPending || isLoading || !hasChanges || invalidRanges}
          onClick={() => saveMutation.mutate()}
        >
          <Save className="w-4 h-4 mr-2" />
          {saveMutation.isPending ? "Guardando..." : "Guardar configuración"}
        </Button>
      </div>
    </>
  );
}
