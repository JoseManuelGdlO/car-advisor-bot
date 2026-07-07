import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { toast } from "sonner";
import { Bot } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ApiRequestError } from "@/lib/api";
import { splitApiRequestError, zodIssuesToFieldErrors } from "@/lib/formErrors";
import { cn } from "@/lib/utils";
import { authApi } from "@/services/auth";

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
    <div className="min-h-full flex flex-col bg-gradient-hero text-primary-foreground">
      <div className="px-6 pt-12 pb-8 flex flex-col items-center">
        <div className="w-20 h-20 rounded-3xl bg-white/15 backdrop-blur grid place-items-center mb-4 shadow-elevated">
          <Bot className="w-10 h-10" strokeWidth={2.2} />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">AutoBot</h1>
        <p className="text-sm text-primary-foreground/80 mt-1 text-center max-w-xs">
          Recupera el acceso a tu cuenta
        </p>
      </div>

      <div className="flex-1 bg-background text-foreground rounded-t-[2rem] px-6 pt-8 pb-6 shadow-elevated animate-fade-in">
        <h2 className="text-xl font-bold mb-1">¿Olvidaste tu contraseña?</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Te enviaremos un código de 6 dígitos a tu correo electrónico.
        </p>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">Correo electrónico</Label>
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

          <Button
            type="submit"
            className="w-full h-12 rounded-xl text-base font-semibold shadow-green"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Enviando…" : "Enviar código"}
          </Button>

          {infoMessage ? (
            <p className="text-xs text-muted-foreground" role="status">
              {infoMessage}
            </p>
          ) : null}

          {formError ? (
            <p className="text-xs text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
        </form>

        <p className="text-center text-xs text-muted-foreground mt-6">
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
