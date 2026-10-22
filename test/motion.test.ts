/**
 * Signal-driven motion without a browser: tween and spring over an injected frame clock (so the
 * tests step time by hand), easing functions, and the reduced-motion rule.
 */
import { createRoot, flushSync, useSignal } from "@shadow-js/core";
import { describe, expect, it } from "vitest";
import { easings, type MotionClock, useSpring, useTween } from "../src/index";

/** Runs `fn` in an owner, the way a component does; the hook's effects belong to it. */
function withRoot<T>(fn: () => T): T {
  return createRoot(() => fn());
}

/** A clock the test advances by hand: `frame(ms)` runs the pending callbacks at that time. */
function manualClock(): MotionClock & { frame(elapsed: number): void; pending(): number } {
  let time = 0;
  let next = 1;
  const callbacks = new Map<number, (now: number) => void>();
  return {
    now: () => time,
    request(callback) {
      const handle = next;
      next += 1;
      callbacks.set(handle, callback);
      return handle;
    },
    cancel(handle) {
      if (typeof handle === "number") callbacks.delete(handle);
    },
    frame(elapsed) {
      time += elapsed;
      const due = [...callbacks.entries()];
      callbacks.clear();
      for (const [, callback] of due) callback(time);
      flushSync();
    },
    pending: () => callbacks.size,
  };
}

describe("easing", () => {
  it("[MOT-1] every easing starts at 0, ends at 1 and stays inside the range it promises", () => {
    for (const ease of [easings.linear, easings.easeOut, easings.easeIn, easings.easeInOut]) {
      expect(ease(0)).toBeCloseTo(0);
      expect(ease(1)).toBeCloseTo(1);
    }
    expect(easings.easeOut(0.5)).toBeGreaterThan(0.5);
    expect(easings.easeIn(0.5)).toBeLessThan(0.5);
    expect(easings.easeInOut(0.5)).toBeCloseTo(0.5);
  });
});

describe("useTween", () => {
  it("[MOT-2] moves from the current value to the target over the duration, then stops asking for frames", () => {
    const clock = manualClock();
    const [target, setTarget] = useSignal(0);
    const value = withRoot(() =>
      useTween(target, { duration: 100, ease: easings.linear, clock, reducedMotion: () => false }),
    );
    flushSync();
    expect(value()).toBe(0);
    setTarget(100);
    flushSync();
    clock.frame(50);
    expect(value()).toBeCloseTo(50);
    clock.frame(50);
    expect(value()).toBe(100);
    expect(clock.pending()).toBe(0);
  });

  it("[MOT-3] a new target mid-flight starts from where the value is now", () => {
    const clock = manualClock();
    const [target, setTarget] = useSignal(0);
    const value = withRoot(() =>
      useTween(target, { duration: 100, ease: easings.linear, clock, reducedMotion: () => false }),
    );
    setTarget(100);
    flushSync();
    clock.frame(50);
    setTarget(0);
    flushSync();
    clock.frame(50);
    expect(value()).toBeCloseTo(25);
    clock.frame(100);
    expect(value()).toBe(0);
  });

  it("[MOT-4] reduced motion jumps to the target without frames", () => {
    const clock = manualClock();
    const [target, setTarget] = useSignal(0);
    const value = withRoot(() =>
      useTween(target, { duration: 500, clock, reducedMotion: () => true }),
    );
    setTarget(40);
    flushSync();
    expect(value()).toBe(40);
    expect(clock.pending()).toBe(0);
  });
});

describe("useSpring", () => {
  it("[MOT-5] a spring settles on its target and reports it exactly once it is still", () => {
    const clock = manualClock();
    const [target, setTarget] = useSignal(0);
    const value = withRoot(() =>
      useSpring(target, { stiffness: 200, damping: 26, clock, reducedMotion: () => false }),
    );
    setTarget(10);
    flushSync();
    for (let step = 0; step < 400 && clock.pending() > 0; step += 1) clock.frame(16);
    expect(value()).toBe(10);
    expect(clock.pending()).toBe(0);
  });

  it("[MOT-6] an underdamped spring overshoots its target on the way", () => {
    const clock = manualClock();
    const [target, setTarget] = useSignal(0);
    const value = withRoot(() =>
      useSpring(target, { stiffness: 300, damping: 8, clock, reducedMotion: () => false }),
    );
    setTarget(100);
    flushSync();
    let peak = 0;
    for (let step = 0; step < 200 && clock.pending() > 0; step += 1) {
      clock.frame(16);
      peak = Math.max(peak, value());
    }
    expect(peak).toBeGreaterThan(100);
    expect(value()).toBe(100);
  });

  it("[MOT-7] a spring with reduced motion takes the target at once", () => {
    const clock = manualClock();
    const [target, setTarget] = useSignal(0);
    const value = withRoot(() => useSpring(target, { clock, reducedMotion: () => true }));
    setTarget(7);
    flushSync();
    expect(value()).toBe(7);
  });
});
