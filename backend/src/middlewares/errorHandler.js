// Fallback para rutas no registradas.
export const notFoundHandler = (_req, res) => {
  res.status(404).json({ message: "Route not found" });
};

// Traductor uniforme de errores a respuesta JSON.
export const errorHandler = (err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({ message: err.message || "Internal server error" });
};
