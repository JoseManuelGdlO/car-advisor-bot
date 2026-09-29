import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiRequestError } from "@/lib/api";
import { splitApiRequestError, zodIssuesToFieldErrors } from "@/lib/formErrors";
import { authApi } from "@/services/auth";
import { AuthActions, AuthField, AuthShell, AuthTextInput, authPillFill, authPillOutline } from "@/components/AuthShell";

const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Introduce un correo electrónico válido."),
});

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [infoMessage, setInfoMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const errEmail = fieldErrors.email;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFieldErrors({});
    setInfoMessage("");

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldErrors(zodIssuesToFieldErrors(parsed.error.issues));
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await authApi.requestPasswordReset(parsed.data.email);
      setInfoMessage(result.message);
      navigate(`/reset-password?email=${encodeURIComponent(parsed.data.email)}`);
    } catch (err) {
      if (ApiRequestError.is(err)) {
        if (err.status === 404) {
          toast.error("Usuario no válido.");
          return;
        }
        const { formError: nextForm, fieldErrors: nextFields } = splitApiRequestError(err, {
          knownFields: ["email"],
        });
        setFormError(nextForm);
        setFieldErrors(nextFields);
        return;
      }
      setFormError(err instanceof Error ? err.message : "No se pudo enviar el código");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Recuperar acceso"
      subtitle="Te enviaremos un código de 6 dígitos a tu correo electrónico."
    >
      <form onSubmit={submit} className="flex flex-1 flex-col" noValidate>
        <AuthField id="email" label="Correo electrónico" error={errEmail}>
          <AuthTextInput
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            error={errEmail}
          />
        </AuthField>

        {infoMessage ? (
          <p className="mt-4 text-xs text-muted-foreground" role="status">
            {infoMessage}
          </p>
        ) : null}

        {formError ? (
          <p className="mt-4 text-xs text-destructive" role="alert">
            {formError}
          </p>
        ) : null}

        <AuthActions>
          <Button type="submit" disabled={isSubmitting} className={authPillFill}>
            {isSubmitting ? "Enviando…" : "Enviar código"}
          </Button>
          <Link to="/login" className={authPillOutline}>
            Volver
          </Link>
        </AuthActions>
      </form>
    </AuthShell>
  );
}
