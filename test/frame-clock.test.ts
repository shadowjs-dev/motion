/**
 * The default frame clock where `requestAnimationFrame` is missing (node, workers): frames come from
 * a 16 ms timer, and cancel stops a frame that was requested. Fake timers, so nothing waits.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { frameClock } from "../src/index";

describe("frameClock without requestAnimationFrame", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("[MOT-52] a frame arrives after 16 ms with the time, and a canceled frame never arrives; cancel of nothing is a no-op", () => {
    expect(typeof requestAnimationFrame).toBe("undefined");
    const seen: number[] = [];
    frameClock.request((now) => seen.push(now));
    vi.advanceTimersByTime(15);
    expect(seen).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(seen).toHaveLength(1);
    expect(typeof seen[0]).toBe("number");

    const handle = frameClock.request(() => {
      throw new Error("a canceled frame ran");
    });
    frameClock.cancel(handle);
    frameClock.cancel(handle);
    expect(() => {
      vi.advanceTimersByTime(100);
    }).not.toThrow();
    expect(() => frameClock.cancel(undefined)).not.toThrow();
  });
});
