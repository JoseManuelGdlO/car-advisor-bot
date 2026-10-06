import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ApiRequestError } from "@/lib/api";
import { splitApiRequestError, zodIssuesToFieldErrors } from "@/lib/formErrors";
import { authApi } from "@/services/auth";
import { VerificationCodeInput } from "@/components/VerificationCodeInput";
import { AuthActions, AuthField, AuthPasswordInput, AuthShell, AuthTextInput, authPillFill, authPillOutline } from "@/components/AuthShell";

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
    <AuthShell
      title="Nueva contraseña"
      subtitle="Ingresa el código que recibiste y elige una contraseña nueva."
    >
      <form onSubmit={submit} className="flex flex-1 flex-col gap-5" noValidate>
        <AuthField id="email" label="Correo electrónico" error={errEmail}>
          <AuthTextInput
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            readOnly
            error={errEmail}
          />
        </AuthField>

        <div className="space-y-2">
          <Label htmlFor="code" className="text-xs font-medium text-muted-foreground">
            Código de verificación
          </Label>
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

        <AuthField id="password" label="Nueva contraseña" error={errPassword}>
          <AuthPasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            error={errPassword}
            shown={showPassword}
            onToggle={() => setShowPassword((s) => !s)}
          />
        </AuthField>

        <AuthField id="confirm-password" label="Confirmar contraseña" error={errConfirmPassword}>
          <AuthPasswordInput
            id="confirm-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            error={errConfirmPassword}
            shown={showConfirmPassword}
            toggleLabel="confirmación"
            onToggle={() => setShowConfirmPassword((s) => !s)}
          />
        </AuthField>

        {successMessage ? (
          <p className="text-xs text-primary" role="status">
            {successMessage}
          </p>
        ) : null}

        {formError ? (
          <p className="text-xs text-destructive" role="alert">
            {formError}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => navigate(`/forgot-password?email=${encodeURIComponent(email)}`)}
          className="self-start text-xs font-semibold text-primary hover:underline"
        >
          Reenviar código
        </button>

        <AuthActions>
          <Button type="submit" disabled={isSubmitting} className={authPillFill}>
            {isSubmitting ? "Guardando…" : "Restablecer"}
          </Button>
          <Link to="/login" className={authPillOutline}>
            Volver
          </Link>
        </AuthActions>
      </form>
    </AuthShell>
  );
}
