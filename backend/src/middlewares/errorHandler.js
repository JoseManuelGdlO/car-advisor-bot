import { ZodError } from "zod";
import { formatZodIssues } from "../utils/zodErrors.js";

// Fallback para rutas no registradas.
export const notFoundHandler = (_req, res) => {
  res.status(404).json({ message: "Route not found" });
};

// Traductor uniforme de errores a respuesta JSON.
export const errorHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const { message, errors } = formatZodIssues(err.issues);
    return res.status(400).json({ message, errors });
  }

  const status = err.status || 500;
  if (status >= 500) {
    console.error("[errorHandler] Unhandled server error", {
      status,
      message: err?.message || "Internal server error",
      stack: err?.stack || "",
    });
  }
  res.status(status).json({ message: err.message || "Internal server error" });
};
