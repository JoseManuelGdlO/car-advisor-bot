import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

type FormErrorAlertProps = {
  message?: string | null;
  fieldErrors?: Record<string, string>;
  fieldLabels?: Record<string, string>;
  title?: string;
  className?: string;
};

export function FieldErrorText({
  id,
  error,
  className,
}: {
  id?: string;
  error?: string | null;
  className?: string;
}) {
  if (!error) return null;
  return (
    <p id={id} className={cn("text-xs text-destructive", className)} role="alert">
      {error}
    </p>
  );
}

export function FormErrorAlert({
  message,
  fieldErrors = {},
  fieldLabels = {},
  title = "No se pudo completar la acción",
  className,
}: FormErrorAlertProps) {
  const entries = Object.entries(fieldErrors).filter(([key]) => key !== "_form");
  const showMessage = Boolean(message?.trim());
  if (!showMessage && entries.length === 0) return null;

  return (
    <Alert variant="destructive" className={cn("py-3", className)} role="alert">
      <AlertTriangle className="h-4 w-4" />
      {showMessage ? <AlertTitle className="text-sm">{title}</AlertTitle> : null}
      <AlertDescription className="text-xs space-y-1">
        {showMessage ? <p>{message}</p> : null}
        {entries.length > 0 ? (
          <ul className="list-disc pl-4 space-y-0.5">
            {entries.map(([key, err]) => (
              <li key={key}>
                {fieldLabels[key] ? <span className="font-medium">{fieldLabels[key]}: </span> : null}
                {err}
              </li>
            ))}
          </ul>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
