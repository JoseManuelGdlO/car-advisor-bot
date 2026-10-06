import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AuthActions,
  AuthField,
  AuthPasswordInput,
  AuthShell,
  AuthTextInput,
  authPillBlack,
  authPillWhite,
} from "@/components/AuthShell";
import { readLoginFormDefaults, useAuth } from "@/context/AuthContext";
import { ApiRequestError } from "@/lib/api";
import { GOOGLE_CALENDAR_URL_ERROR, isGoogleCalendarSchedulingUrl } from "@/lib/calendarUrl";
import { splitApiRequestError, zodIssuesToFieldErrors } from "@/lib/formErrors";
import { GoogleCalendarLinkHelpDialog } from "@/components/GoogleCalendarLinkHelpDialog";

const registerFormSchema = z
  .object({
    name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
    email: z.string().trim().email("Introduce un correo electrónico válido."),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
    confirmPassword: z.string().min(6, "Confirma tu contraseña."),
    calendarSchedulingUrl: z
      .string()
      .trim()
      .max(500, "El link de calendario no puede tener más de 500 caracteres.")
      .refine((value) => !value || isGoogleCalendarSchedulingUrl(value), {
        message: GOOGLE_CALENDAR_URL_ERROR,
      }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

const loginFormSchema = z.object({
  email: z.string().trim().min(1, "Indica tu correo electrónico."),
  password: z.string().min(4, "La contraseña debe tener al menos 4 caracteres."),
});

const LOGIN_KNOWN_FIELDS = ["name", "email", "password", "calendarSchedulingUrl"] as const;

export default function Login({ mode = "login" }: { mode?: "login" | "register" }) {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const isRegisterMode = mode === "register";
  const [formDefaults] = useState(readLoginFormDefaults());
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [email, setEmail] = useState(formDefaults.email);
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [calendarSchedulingUrl, setCalendarSchedulingUrl] = useState("");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [rememberMe, setRememberMe] = useState(formDefaults.rememberMe);
  const [sessionExpired, setSessionExpired] = useState(formDefaults.sessionExpired);
  const [submitting, setSubmitting] = useState(false);

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
        confirmPassword: confirm,
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

    setSubmitting(true);
    try {
      if (isRegisterMode) {
        await register(name.trim(), emailTrim, passVal, calendarSchedulingUrl.trim());
      }
      await login(emailTrim, passVal, rememberMe);
      setSessionExpired(false);
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
    } finally {
      setSubmitting(false);
    }
  };

  const errName = fieldErrors.name;
  const errEmail = fieldErrors.email;
  const errPassword = fieldErrors.password;
  const errConfirm = fieldErrors.confirmPassword;
  const errCalendarSchedulingUrl = fieldErrors.calendarSchedulingUrl;

  return (
    <AuthShell
      title={isRegisterMode ? "Crear cuenta" : "Entrar"}
      subtitle={
        isRegisterMode
          ? "Registra tu correo para empezar a atender clientes con AutoBot."
          : "Entra con la cuenta de tu negocio."
      }
      backTo={isRegisterMode ? "/" : undefined}
    >
      <form onSubmit={submit} className="flex flex-1 flex-col" autoComplete="on" noValidate>
        <div className="space-y-5">
          {!isRegisterMode && sessionExpired ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950" role="status">
              Tu sesión expiró. Vuelve a iniciar sesión.
            </p>
          ) : null}

          {isRegisterMode ? (
            <AuthField id="name" label="Nombre" error={errName}>
              <AuthTextInput
                id="name"
                name="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={errName}
              />
            </AuthField>
          ) : null}

          <AuthField id="email" label="Correo electrónico" error={errEmail}>
            <AuthTextInput
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              error={errEmail}
            />
          </AuthField>

          <AuthField id="pass" label="Contraseña" error={errPassword}>
            <AuthPasswordInput
              id="pass"
              name="password"
              autoComplete={isRegisterMode ? "new-password" : "current-password"}
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="••••••••"
              error={errPassword}
              shown={show}
              onToggle={() => setShow((s) => !s)}
            />
          </AuthField>

          {isRegisterMode ? (
            <AuthField id="confirm" label="Confirmar contraseña" error={errConfirm}>
              <AuthPasswordInput
                id="confirm"
                name="confirmPassword"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
error={errConfirm}
              shown={showConfirm}
              toggleLabel="confirmación"
              onToggle={() => setShowConfirm((s) => !s)}
              />
            </AuthField>
          ) : null}

          {isRegisterMode ? (
            <AuthField
              id="calendar-url"
              label="Link de calendario de Google (opcional)"
              error={errCalendarSchedulingUrl}
              hint={<GoogleCalendarLinkHelpDialog />}
            >
              <AuthTextInput
                id="calendar-url"
                name="calendar-url"
                type="url"
                autoComplete="off"
                value={calendarSchedulingUrl}
                onChange={(e) => setCalendarSchedulingUrl(e.target.value)}
                placeholder="https://calendar.app.google/..."
                error={errCalendarSchedulingUrl}
              />
            </AuthField>
          ) : null}

          {!isRegisterMode ? (
            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => navigate("/forgot-password")}
                className="text-xs font-semibold text-primary hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </button>
              <div className="flex items-center gap-2">
                <Label htmlFor="remember-me" className="text-xs text-muted-foreground cursor-pointer">
                  Recuérdame
                </Label>
                <Switch
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={setRememberMe}
                  aria-label="Activar recordar sesión"
                />
              </div>
            </div>
          ) : null}
        </div>

        {formError ? (
          <p className="mt-4 text-xs text-destructive" role="alert">
            {formError}
          </p>
        ) : null}

        <AuthActions>
          <Button type="submit" disabled={submitting} className={authPillBlack}>
            {submitting ? "Un momento…" : isRegisterMode ? "Crear cuenta" : "Entrar"}
          </Button>
          {isRegisterMode ? null : (
            <Link to="/registro" className={authPillWhite}>
              Crear cuenta
            </Link>
          )}
        </AuthActions>
      </form>
    </AuthShell>
  );
}
