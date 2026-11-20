import { useEffect, useMemo, useRef } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { createLongPressController } from "@/lib/longPress";

type UseLongPressOptions = {
  delay?: number;
  tolerance?: number;
  /** Con `false` no se registra ningún gesto (p. ej. usuarios sin permiso). */
  enabled?: boolean;
};

/** Props para esparcir sobre el elemento que reacciona al long-press. */
export function useLongPress(onLongPress: () => void, { delay, tolerance, enabled = true }: UseLongPressOptions = {}) {
  const callbackRef = useRef(onLongPress);
  callbackRef.current = onLongPress;

  const controller = useMemo(
    () => createLongPressController({ delay, tolerance, onLongPress: () => callbackRef.current() }),
    [delay, tolerance],
  );

  useEffect(() => controller.cancel, [controller]);

  return useMemo(() => {
    if (!enabled) return {};
    return {
      onPointerDown: (event: PointerEvent) => controller.start(event.clientX, event.clientY),
      onPointerMove: (event: PointerEvent) => controller.move(event.clientX, event.clientY),
      onPointerUp: controller.cancel,
      onPointerLeave: controller.cancel,
      onPointerCancel: controller.cancel,
      // Evita el menú contextual nativo del long-press en móvil.
      onContextMenu: (event: MouseEvent) => event.preventDefault(),
      // Si el long-press ya se disparó, el click de soltar no debe navegar.
      onClickCapture: (event: MouseEvent) => {
        if (controller.consumeClick()) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
    };
  }, [controller, enabled]);
}
