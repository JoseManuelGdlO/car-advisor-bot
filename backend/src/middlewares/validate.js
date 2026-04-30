// Middleware genérico de validación con Zod para body/params/query.
export const validate = (schema) => (req, _res, next) => {
  const parsed = schema.safeParse({
    body: req.body,
    params: req.params,
    query: req.query,
  });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(", ");
    return next(new Error(msg));
  }
  req.validated = parsed.data;
  return next();
};
