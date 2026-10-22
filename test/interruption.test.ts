/**
 * Interruption, reversal, retargeting and time jumps of `useTween` and `useSpring`, on a clock the
 * test steps by hand. The tab-hidden case is a single frame that arrives minutes late.
 */
import { createRoot, flushSync, useSignal } from "@shadow-js/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { easings, useSpring, useTween } from "../src/index";
import { manualClock } from "./support/manual-clock";

describe("useTween interruption", () => {
  it("[MOT-23] moved back to its start mid-flight, a tween retraces toward it with no overshoot", () => {
    const clock = manualClock();
    const [target, setTarget] = useSignal(0);
    const value = createRoot(() =>
      useTween(target, { duration: 100, ease: easings.linear, clock, reducedMotion: () => false }),
    );
    setTarget(100);
    flushSync();
    clock.frame(60);
    expect(value()).toBeCloseTo(60);
    setTarget(0);
    flushSync();
    const seen: number[] = [];
    for (let step = 0; step < 10 && clock.pending() > 0; step += 1) {
      clock.frame(10);
      seen.push(value());
    }
    expect(seen.every((v) => v >= 0 && v <= 60)).toBe(true);
    expect(seen.every((v, index) => index === 0 || v <= (seen[index - 1] ?? Infinity))).toBe(true);
    expect(value()).toBe(0);
  });

  it("[MOT-24] a duration that is not a finite positive number jumps to the target with no frame", () => {
    for (const duration of [Number.NaN, Number.POSITIVE_INFINITY, -50, 0]) {
      const clock = manualClock();
      const [target, setTarget] = useSignal(0);
      const value = createRoot(() =>
        useTween(target, { duration, clock, reducedMotion: () => false }),
      );
      setTarget(40);
      flushSync();
      expect(value(), `duration ${duration}`).toBe(40);
      expect(clock.pending(), `duration ${duration}`).toBe(0);
      expect(clock.requests(), `duration ${duration}`).toBe(0);
    }
  });

  it("[MOT-25] a retarget cancels the frame it replaces: exactly one frame is pending at any time", () => {
    const clock = manualClock();
    const [target, setTarget] = useSignal(0);
    createRoot(() => useTween(target, { duration: 300, clock, reducedMotion: () => false }));
    setTarget(100);
    flushSync();
    clock.frame(10);
    expect(clock.pending()).toBe(1);
    setTarget(50);
    flushSync();
    expect(clock.pending()).toBe(1);
    setTarget(0);
    flushSync();
    expect(clock.pending()).toBe(1);
  });

  it("[MOT-26] a frame that arrives minutes late lands on the target at once and asks for no more frames", () => {
    const clock = manualClock();
    const [target, setTarget] = useSignal(0);
    const value = createRoot(() =>
      useTween(target, { duration: 300, clock, reducedMotion: () => false }),
    );
    setTarget(100);
    flushSync();
    clock.frame(16);
    clock.frame(5 * 60 * 1000);
    expect(value()).toBe(100);
    expect(clock.pending()).toBe(0);
  });

  it("[MOT-27] reduced motion switched on mid-tween jumps to the target and cancels the frame", () => {
    const clock = manualClock();
    const [target, setTarget] = useSignal(0);
    const [reduced, setReduced] = useSignal(false);
    const value = createRoot(() =>
      useTween(target, { duration: 100, ease: easings.linear, clock, reducedMotion: reduced }),
    );
    setTarget(100);
    flushSync();
    clock.frame(50);
    expect(value()).toBeCloseTo(50);
    setReduced(true);
    flushSync();
    expect(value()).toBe(100);
    expect(clock.pending()).toBe(0);
  });
});

describe("useSpring interruption", () => {
  it("[MOT-28] a retarget keeps the spring's velocity: it keeps moving in its old direction for the next frame", () => {
    const clock = manualClock();
    const [target, setTarget] = useSignal(0);
    const value = createRoot(() =>
      useSpring(target, { stiffness: 170, damping: 26, clock, reducedMotion: () => false }),
    );
    setTarget(100);
    flushSync();
    for (let step = 0; step < 10; step += 1) clock.frame(16);
    const before = value();
    expect(before).toBeGreaterThan(20);
    expect(before).toBeLessThan(100);
    setTarget(0);
    flushSync();
    clock.frame(16);
    // A spring at rest would turn back toward 0 at once; this one still has its upward speed.
    expect(value()).toBeGreaterThan(before);
  });

  it("[MOT-29] a reversal mid-flight changes the value by a small step per frame and settles on the start", () => {
    const clock = manualClock();
    const [target, setTarget] = useSignal(0);
    const value = createRoot(() =>
      useSpring(target, { stiffness: 170, damping: 26, clock, reducedMotion: () => false }),
    );
    setTarget(100);
    flushSync();
    for (let step = 0; step < 10; step += 1) clock.frame(16);
    setTarget(0);
    flushSync();
    let previous = value();
    let largest = 0;
    for (let step = 0; step < 600 && clock.pending() > 0; step += 1) {
      clock.frame(16);
      largest = Math.max(largest, Math.abs(value() - previous));
      previous = value();
    }
    // The fastest the spring moves is about 340 px/s here: under 6 px per 16 ms frame. A jump would be far larger.
    expect(largest).toBeLessThan(8);
    expect(value()).toBe(0);
    expect(clock.pending()).toBe(0);
  });

  it("[MOT-30] a frame that arrives minutes late is integrated as one 64 ms step, the same as a 64 ms frame", () => {
    const late = manualClock();
    const onTime = manualClock();
    const [lateTarget, setLateTarget] = useSignal(0);
    const [timeTarget, setTimeTarget] = useSignal(0);
    const lateValue = createRoot(() =>
      useSpring(lateTarget, { clock: late, reducedMotion: () => false }),
    );
    const timeValue = createRoot(() =>
      useSpring(timeTarget, { clock: onTime, reducedMotion: () => false }),
    );
    setLateTarget(100);
    setTimeTarget(100);
    flushSync();
    late.frame(5 * 60 * 1000);
    onTime.frame(64);
    expect(Number.isFinite(lateValue())).toBe(true);
    expect(lateValue()).toBeCloseTo(timeValue(), 10);
    for (let step = 0; step < 400 && late.pending() > 0; step += 1) late.frame(16);
    expect(lateValue()).toBe(100);
  });

  it("[MOT-31] a state that stops being finite (zero mass) snaps to the target and asks for no more frames", () => {
    const clock = manualClock();
    const [target, setTarget] = useSignal(0);
    const value = createRoot(() =>
      useSpring(target, { mass: 0, clock, reducedMotion: () => false }),
    );
    setTarget(10);
    flushSync();
    clock.frame(16);
    expect(value()).toBe(10);
    expect(clock.pending()).toBe(0);
  });

  it("[MOT-32] reduced motion switched on mid-flight snaps the spring to the target and cancels the frame", () => {
    const clock = manualClock();
    const [target, setTarget] = useSignal(0);
    const [reduced, setReduced] = useSignal(false);
    const value = createRoot(() => useSpring(target, { clock, reducedMotion: reduced }));
    setTarget(100);
    flushSync();
    clock.frame(16);
    expect(value()).toBeGreaterThan(0);
    setReduced(true);
    flushSync();
    expect(value()).toBe(100);
    expect(clock.pending()).toBe(0);
  });
});

describe("motion properties", () => {
  it("[MOT-33] for any durations and frame steps a tween stays between its start and its target", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 2000, noNaN: true }),
        fc.array(fc.double({ min: 0, max: 500, noNaN: true }), { minLength: 1, maxLength: 40 }),
        fc.double({ min: -500, max: 500, noNaN: true }),
        (duration, steps, to) => {
          const clock = manualClock();
          const [target, setTarget] = useSignal(0);
          const value = createRoot(() =>
            useTween(target, {
              duration,
              ease: easings.easeOut,
              clock,
              reducedMotion: () => false,
            }),
          );
          setTarget(to);
          flushSync();
          const low = Math.min(0, to);
          const high = Math.max(0, to);
          for (const step of steps) {
            clock.frame(step);
            const current = value();
            if (!(current >= low - 1e-9 && current <= high + 1e-9)) return false;
          }
          return true;
        },
      ),
      { seed: 42, numRuns: 300 },
    );
  });
});
