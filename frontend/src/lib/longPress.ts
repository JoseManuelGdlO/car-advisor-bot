export type LongPressOptions = {
  /** Milisegundos que hay que mantener presionado. */
  delay?: number;
  /** Píxeles de movimiento tolerados antes de cancelar (para no chocar con el scroll). */
  tolerance?: number;
  onLongPress: () => void;
};

/**
 * Lógica de long-press independiente de React (testeable con fake timers).
 * Tras un long-press disparado, `consumeClick()` devuelve true una sola vez para
 * que la fila no navegue al soltar el dedo.
 */
export function createLongPressController({ delay = 500, tolerance = 10, onLongPress }: LongPressOptions) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let origin: { x: number; y: number } | null = null;
  let fired = false;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    origin = null;
  };

  return {
    start(x: number, y: number) {
      cancel();
      fired = false;
      origin = { x, y };
      timer = setTimeout(() => {
        timer = null;
        fired = true;
        onLongPress();
      }, delay);
    },
    move(x: number, y: number) {
      if (!origin || !timer) return;
      if (Math.abs(x - origin.x) > tolerance || Math.abs(y - origin.y) > tolerance) cancel();
    },
    cancel,
    consumeClick() {
      const wasFired = fired;
      fired = false;
      return wasFired;
    },
  };
}
