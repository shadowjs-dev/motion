import { createRoot, flushSync, useSignal } from "@shadow-js/core";
import { describe, expect, it } from "vitest";
import { useSpring } from "../src/index";
import { manualClock } from "./support/manual-clock";

describe("spring precision", () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "[MOT-PRECISION-1] invalid precision %s snaps on the next frame and releases the frame handle",
    (precision) => {
      const clock = manualClock();
      const [target, setTarget] = useSignal(0);
      const value = createRoot(() =>
        useSpring(target, { precision, clock, reducedMotion: () => false }),
      );
      setTarget(100);
      flushSync();
      clock.frame(16);
      expect(value()).toBe(100);
      expect(clock.pending()).toBe(0);
      expect(clock.requests()).toBe(1);
      setTarget(-20);
      flushSync();
      clock.frame(16);
      expect(value()).toBe(-20);
      expect(clock.pending()).toBe(0);
    },
  );

  it.each([
    [0, 1],
    [0, 100],
    [0, -100],
    [0, 1e20],
    [0, 1e-100],
    [1, 0],
  ])(
    "[MOT-PRECISION-2] a damped spring with sub-resolution precision settles exactly from %s to %s",
    (initialTarget, nextTarget) => {
      const clock = manualClock();
      const [target, setTarget] = useSignal(initialTarget);
      const value = createRoot(() =>
        useSpring(target, { precision: Number.MIN_VALUE, clock, reducedMotion: () => false }),
      );
      setTarget(nextTarget);
      flushSync();
      for (let frame = 0; frame < 10000 && clock.pending() > 0; frame += 1) clock.frame(16);
      expect(value()).toBe(nextTarget);
      expect(clock.pending()).toBe(0);
      const requests = clock.requests();
      clock.frame(16);
      expect(clock.requests()).toBe(requests);
      setTarget(initialTarget);
      flushSync();
      for (let frame = 0; frame < 10000 && clock.pending() > 0; frame += 1) clock.frame(16);
      expect(value()).toBe(initialTarget);
      expect(clock.pending()).toBe(0);
    },
  );

  it("[MOT-PRECISION-3] frames with no elapsed time do not count as numerical convergence", () => {
    const clock = manualClock();
    const [target, setTarget] = useSignal(0);
    const value = createRoot(() =>
      useSpring(target, { precision: Number.MIN_VALUE, clock, reducedMotion: () => false }),
    );
    setTarget(100);
    flushSync();
    clock.frame(0);
    expect(value()).toBe(0);
    expect(clock.pending()).toBe(1);
    clock.frame(16);
    expect(value()).toBeGreaterThan(0);
    expect(value()).toBeLessThan(100);
  });

  it("[MOT-PRECISION-4] an undamped spring keeps oscillating instead of snapping to its target", () => {
    const clock = manualClock();
    const [target, setTarget] = useSignal(0);
    const value = createRoot(() =>
      useSpring(target, {
        damping: 0,
        precision: Number.MIN_VALUE,
        clock,
        reducedMotion: () => false,
      }),
    );
    setTarget(100);
    flushSync();
    for (let frame = 0; frame < 1000; frame += 1) clock.frame(16);
    expect(Number.isFinite(value())).toBe(true);
    expect(value()).not.toBe(100);
    expect(clock.pending()).toBe(1);
  });
});
