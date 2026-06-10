import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Eye, EyeOff, Bot } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/context/AuthContext";
import { ApiRequestError } from "@/lib/api";
import { GOOGLE_CALENDAR_URL_ERROR, isGoogleCalendarSchedulingUrl } from "@/lib/calendarUrl";
import { splitApiRequestError, zodIssuesToFieldErrors } from "@/lib/formErrors";
import { cn } from "@/lib/utils";
import { GoogleCalendarLinkHelpDialog } from "@/components/GoogleCalendarLinkHelpDialog";

const registerFormSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
  email: z.string().trim().email("Introduce un correo electrónico válido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
  calendarSchedulingUrl: z
    .string()
    .trim()
    .min(1, "El link de calendario es obligatorio.")
    .max(500, "El link de calendario no puede tener más de 500 caracteres.")
    .refine(isGoogleCalendarSchedulingUrl, { message: GOOGLE_CALENDAR_URL_ERROR }),
});

const loginFormSchema = z.object({
  email: z.string().trim().min(1, "Indica tu correo electrónico."),
  password: z.string().min(4, "La contraseña debe tener al menos 4 caracteres."),
});

const LOGIN_KNOWN_FIELDS = ["name", "email", "password", "calendarSchedulingUrl"] as const;

export default function Login() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");
  const [calendarSchedulingUrl, setCalendarSchedulingUrl] = useState("");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const clearErrors = () => {
    setFormError("");
    setFieldErrors({});
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();

    const emailTrim = email.trim();
    const passVal = pass;

    if (isRegisterMode) {
      const parsed = registerFormSchema.safeParse({
        name: name.trim(),
        email: emailTrim,
        password: passVal,
        calendarSchedulingUrl: calendarSchedulingUrl.trim(),
      });
      if (!parsed.success) {
        setFieldErrors(zodIssuesToFieldErrors(parsed.error.issues));
        return;
      }
    } else {
      const parsed = loginFormSchema.safeParse({
        email: emailTrim,
        password: passVal,
      });
      if (!parsed.success) {
        setFieldErrors(zodIssuesToFieldErrors(parsed.error.issues));
        return;
      }
    }

    try {
      if (isRegisterMode) {
        await register(name.trim(), emailTrim, passVal, calendarSchedulingUrl.trim());
      }
      await login(emailTrim, passVal, rememberMe);
      navigate("/dashboard");
    } catch (err) {
      if (ApiRequestError.is(err)) {
        const { formError: nextForm, fieldErrors: nextFields } = splitApiRequestError(err, {
          knownFields: LOGIN_KNOWN_FIELDS,
        });
        setFormError(nextForm);
        setFieldErrors(nextFields);
        return;
      }
      setFormError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
    }
  };

  const toggleMode = () => {
    setIsRegisterMode((v) => !v);
    clearErrors();
  };

  const errName = fieldErrors.name;
  const errEmail = fieldErrors.email;
  const errPassword = fieldErrors.password;
  const errCalendarSchedulingUrl = fieldErrors.calendarSchedulingUrl;

  return (
    <div className="min-h-full flex flex-col bg-gradient-hero text-primary-foreground">
      {/* Top brand */}
      <div className="px-6 pt-12 pb-8 flex flex-col items-center">
        <div className="w-20 h-20 rounded-3xl bg-white/15 backdrop-blur grid place-items-center mb-4 shadow-elevated">
          <Bot className="w-10 h-10" strokeWidth={2.2} />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">AutoBot</h1>
        <p className="text-sm text-primary-foreground/80 mt-1 text-center max-w-xs">
          Vende más autos por WhatsApp y Facebook con tu chatbot inteligente
        </p>
      </div>

      {/* Form card */}
      <div className="flex-1 bg-background text-foreground rounded-t-[2rem] px-6 pt-8 pb-6 shadow-elevated animate-fade-in">
        <h2 className="text-xl font-bold mb-1">Bienvenido de vuelta 👋</h2>
        <p className="text-sm text-muted-foreground mb-6">Inicia sesión para gestionar tus chats</p>

        <form onSubmit={submit} className="space-y-4" noValidate>
          {isRegisterMode && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={cn("h-12 rounded-xl", errName && "border-destructive focus-visible:ring-destructive")}
                aria-invalid={Boolean(errName)}
                aria-describedby={errName ? "name-error" : undefined}
              />
              {errName ? (
                <p id="name-error" className="text-xs text-destructive">
                  {errName}
                </p>
              ) : null}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email o teléfono</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className={cn("h-12 rounded-xl", errEmail && "border-destructive focus-visible:ring-destructive")}
              aria-invalid={Boolean(errEmail)}
              aria-describedby={errEmail ? "email-error" : undefined}
            />
            {errEmail ? (
              <p id="email-error" className="text-xs text-destructive">
                {errEmail}
              </p>
            ) : null}
          </div>

          {isRegisterMode && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="calendar-url">Link de calendario de Google</Label>
                <GoogleCalendarLinkHelpDialog />
              </div>
              <Input
                id="calendar-url"
                type="url"
                value={calendarSchedulingUrl}
                onChange={(e) => setCalendarSchedulingUrl(e.target.value)}
                placeholder="https://calendar.app.google/..."
                className={cn(
                  "h-12 rounded-xl",
                  errCalendarSchedulingUrl && "border-destructive focus-visible:ring-destructive",
                )}
                aria-invalid={Boolean(errCalendarSchedulingUrl)}
                aria-describedby={errCalendarSchedulingUrl ? "calendar-url-error" : undefined}
              />
              {errCalendarSchedulingUrl ? (
                <p id="calendar-url-error" className="text-xs text-destructive">
                  {errCalendarSchedulingUrl}
                </p>
              ) : null}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pass">Contraseña</Label>
            <div className="relative">
              <Input
                id="pass"
                type={show ? "text" : "password"}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="••••••••"
                className={cn("h-12 rounded-xl pr-11", errPassword && "border-destructive focus-visible:ring-destructive")}
                aria-invalid={Boolean(errPassword)}
                aria-describedby={errPassword ? "pass-error" : undefined}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground p-1"
                aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errPassword ? (
              <p id="pass-error" className="text-xs text-destructive">
                {errPassword}
              </p>
            ) : null}
          </div>

          <div className="text-right">
            <button type="button" className="text-xs font-semibold text-primary-dark hover:underline">
              ¿Olvidaste tu contraseña?
            </button>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2">
            <Label htmlFor="remember-me" className="text-sm cursor-pointer">
              Recuérdame
            </Label>
            <Switch
              id="remember-me"
              checked={rememberMe}
              onCheckedChange={setRememberMe}
              aria-label="Activar recordar sesión"
            />
          </div>

          <Button type="submit" className="w-full h-12 rounded-xl text-base font-semibold shadow-green">
            {isRegisterMode ? "Crear cuenta" : "Entrar"}
          </Button>
          {formError ? (
            <p className="text-xs text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
        </form>

        <p className="text-center text-xs text-muted-foreground mt-6">
          ¿Sin cuenta?{" "}
          <button type="button" onClick={toggleMode} className="text-primary-dark font-semibold hover:underline">
            {isRegisterMode ? "Ya tengo cuenta" : "Crear cuenta"}
          </button>
        </p>
      </div>
    </div>
  );
}
