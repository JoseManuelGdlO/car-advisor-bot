import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Bot, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ApiRequestError } from "@/lib/api";
import { splitApiRequestError, zodIssuesToFieldErrors } from "@/lib/formErrors";
import { cn } from "@/lib/utils";
import { authApi } from "@/services/auth";
import { VerificationCodeInput } from "@/components/VerificationCodeInput";

const resetPasswordSchema = z
  .object({
    email: z.string().trim().email("Introduce un correo electrónico válido."),
    code: z
      .string()
      .trim()
      .length(6, "El código debe tener 6 dígitos.")
      .regex(/^\d{6}$/, "El código debe contener solo números."),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
    confirmPassword: z.string().min(6, "Confirma tu contraseña."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialEmail = searchParams.get("email") ?? "";

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!initialEmail) {
      navigate("/forgot-password", { replace: true });
    }
  }, [initialEmail, navigate]);

  const errEmail = fieldErrors.email;
  const errCode = fieldErrors.code;
  const errPassword = fieldErrors.password;
  const errConfirmPassword = fieldErrors.confirmPassword;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFieldErrors({});
    setSuccessMessage("");

    const parsed = resetPasswordSchema.safeParse({ email, code, password, confirmPassword });
    if (!parsed.success) {
      setFieldErrors(zodIssuesToFieldErrors(parsed.error.issues));
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.resetPassword({
        email: parsed.data.email,
        code: parsed.data.code,
        password: parsed.data.password,
      });
      setSuccessMessage("Contraseña actualizada. Ya puedes iniciar sesión.");
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      if (ApiRequestError.is(err)) {
        const { formError: nextForm, fieldErrors: nextFields } = splitApiRequestError(err, {
          knownFields: ["email", "code", "password", "confirmPassword"],
        });
        setFormError(nextForm);
        setFieldErrors(nextFields);
        return;
      }
      setFormError(err instanceof Error ? err.message : "No se pudo restablecer la contraseña");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!initialEmail) return null;

  return (
    <div className="min-h-full flex flex-col bg-gradient-hero text-primary-foreground">
      <div className="px-6 pt-12 pb-8 flex flex-col items-center">
        <div className="w-20 h-20 rounded-3xl bg-white/15 backdrop-blur grid place-items-center mb-4 shadow-elevated">
          <Bot className="w-10 h-10" strokeWidth={2.2} />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">AutoBot</h1>
        <p className="text-sm text-primary-foreground/80 mt-1 text-center max-w-xs">
          Crea una nueva contraseña
        </p>
      </div>

      <div className="flex-1 bg-background text-foreground rounded-t-[2rem] px-6 pt-8 pb-6 shadow-elevated animate-fade-in">
        <h2 className="text-xl font-bold mb-1">Restablecer contraseña</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Ingresa el código que recibiste y elige una nueva contraseña.
        </p>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly
              className={cn("h-12 rounded-xl bg-muted/40", errEmail && "border-destructive focus-visible:ring-destructive")}
              aria-invalid={Boolean(errEmail)}
              aria-describedby={errEmail ? "email-error" : undefined}
            />
            {errEmail ? (
              <p id="email-error" className="text-xs text-destructive">
                {errEmail}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="code">Código de verificación</Label>
            <p className="text-xs text-muted-foreground">Ingresa el código de 6 dígitos que recibiste.</p>
            <VerificationCodeInput
              id="code"
              value={code}
              onChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
              disabled={isSubmitting}
              invalid={Boolean(errCode)}
              aria-describedby={errCode ? "code-error" : undefined}
            />
            {errCode ? (
              <p id="code-error" className="text-xs text-destructive text-center">
                {errCode}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Nueva contraseña</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={cn(
                  "h-12 rounded-xl pr-11",
                  errPassword && "border-destructive focus-visible:ring-destructive",
                )}
                aria-invalid={Boolean(errPassword)}
                aria-describedby={errPassword ? "password-error" : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground p-1"
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errPassword ? (
              <p id="password-error" className="text-xs text-destructive">
                {errPassword}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirmar contraseña</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className={cn(
                  "h-12 rounded-xl pr-11",
                  errConfirmPassword && "border-destructive focus-visible:ring-destructive",
                )}
                aria-invalid={Boolean(errConfirmPassword)}
                aria-describedby={errConfirmPassword ? "confirm-password-error" : undefined}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground p-1"
                aria-label={showConfirmPassword ? "Ocultar confirmación" : "Mostrar confirmación"}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errConfirmPassword ? (
              <p id="confirm-password-error" className="text-xs text-destructive">
                {errConfirmPassword}
              </p>
            ) : null}
          </div>

          <Button
            type="submit"
            className="w-full h-12 rounded-xl text-base font-semibold shadow-green"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Guardando…" : "Restablecer contraseña"}
          </Button>

          {successMessage ? (
            <p className="text-xs text-primary-dark" role="status">
              {successMessage}
            </p>
          ) : null}

          {formError ? (
            <p className="text-xs text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
        </form>

        <p className="text-center text-xs text-muted-foreground mt-6 space-x-1">
          <button
            type="button"
            onClick={() => navigate(`/forgot-password?email=${encodeURIComponent(email)}`)}
            className="text-primary-dark font-semibold hover:underline"
          >
            Reenviar código
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="text-primary-dark font-semibold hover:underline"
          >
            Volver al inicio de sesión
          </button>
        </p>
      </div>
    </div>
  );
}
