/** Ventana UTC de un día (0 = hoy, -1 = ayer). */
export const utcDayBounds = (now, dayOffset = 0) => {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset, 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset, 23, 59, 59, 999),
  );
  return { start, end };
};

/** Variación porcentual día a día; misma regla que la gráfica semanal del dashboard. */
export const calcDayOverDayChangePct = (today, yesterday) =>
  yesterday > 0 ? Math.round(((today - yesterday) / yesterday) * 100) : 0;
