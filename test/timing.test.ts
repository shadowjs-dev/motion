/**
 * Deterministic timing on a fake clock: a tween's value depends only on the time that has passed, not
 * on how that time was split into frames, and it lands on the target exactly at its duration.
 */
import { createRoot, flushSync, useSignal } from "@shadow-js/core";
import { describe, expect, it } from "vitest";
import { easings, useSpring, useTween } from "../src/index";
import { manualClock } from "./support/manual-clock";

/** Runs a linear tween of `duration` ms to 100 with `frames` steps, and returns the value after `elapsed`. */
function tweenAfter(duration: number, frames: readonly number[]): number[] {
  const clock = manualClock();
  const [target, setTarget] = useSignal(0);
  const value = createRoot(() =>
    useTween(target, { duration, ease: easings.linear, clock, reducedMotion: () => false }),
  );
  setTarget(100);
  flushSync();
  const readings: number[] = [];
  for (const step of frames) {
    clock.frame(step);
    readings.push(value());
  }
  return readings;
}

describe("deterministic timing", () => {
  it("[MOT-54] the value depends on the elapsed time only: one 100 ms frame and ten 10 ms frames agree, and the target is exact at the duration", () => {
    const oneFrame = tweenAfter(200, [100]);
    const tenFrames = tweenAfter(
      200,
      Array.from({ length: 10 }, () => 10),
    );
    expect(oneFrame[0]).toBeCloseTo(50, 10);
    expect(tenFrames[9]).toBeCloseTo(50, 10);
    expect(tenFrames[9]).toBeCloseTo(oneFrame[0] ?? Number.NaN, 10);
    const atEnd = tweenAfter(200, [200]);
    expect(atEnd[0]).toBe(100);
    const past = tweenAfter(200, [400]);
    expect(past[0]).toBe(100);
  });

  it("[MOT-55] the same frames give the same spring values every time: the spring is a function of its frames", () => {
    const run = (): number[] => {
      const clock = manualClock();
      const [target, setTarget] = useSignal(0);
      const value = createRoot(() =>
        useSpring(target, { stiffness: 220, damping: 18, clock, reducedMotion: () => false }),
      );
      setTarget(80);
      flushSync();
      const readings: number[] = [];
      for (let step = 0; step < 30; step += 1) {
        clock.frame(step % 3 === 0 ? 8 : 16);
        readings.push(value());
      }
      return readings;
    };
    expect(run()).toEqual(run());
  });
});
