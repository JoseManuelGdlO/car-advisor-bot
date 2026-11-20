import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLongPressController } from "@/lib/longPress";

describe("createLongPressController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("dispara onLongPress tras el delay y suprime el click siguiente una vez", () => {
    const onLongPress = vi.fn();
    const controller = createLongPressController({ delay: 500, onLongPress });
    controller.start(10, 10);
    vi.advanceTimersByTime(499);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(controller.consumeClick()).toBe(true);
    expect(controller.consumeClick()).toBe(false);
  });

  it("un toque corto no dispara y no suprime el click", () => {
    const onLongPress = vi.fn();
    const controller = createLongPressController({ delay: 500, onLongPress });
    controller.start(10, 10);
    vi.advanceTimersByTime(200);
    controller.cancel();
    vi.advanceTimersByTime(1000);
    expect(onLongPress).not.toHaveBeenCalled();
    expect(controller.consumeClick()).toBe(false);
  });

  it("cancela si el dedo se mueve más que la tolerancia (scroll)", () => {
    const onLongPress = vi.fn();
    const controller = createLongPressController({ delay: 500, tolerance: 10, onLongPress });
    controller.start(10, 10);
    controller.move(12, 11);
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);

    const second = vi.fn();
    const scrolling = createLongPressController({ delay: 500, tolerance: 10, onLongPress: second });
    scrolling.start(10, 10);
    scrolling.move(10, 40);
    vi.advanceTimersByTime(600);
    expect(second).not.toHaveBeenCalled();
  });
});
