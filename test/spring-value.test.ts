/**
 * `useSpringValue` and `stagger`: moves by command, delays, starting speed, replacing and stopping a
 * move, reduced motion, cleanup, and the delays of a group. Frames come from a manual clock.
 */
import { createRoot, flushSync, useEffect } from "@shadow-js/core";
import { describe, expect, it } from "vitest";
import { type SpringValue, type SpringValueOptions, stagger, useSpringValue } from "../src/index";
import { type ManualClock, manualClock } from "./support/manual-clock";

function setup(
  initial: number,
  options: Omit<SpringValueOptions, "clock"> = {},
): { value: SpringValue; clock: ManualClock; dispose: () => void } {
  const clock = manualClock(0);
  let value: SpringValue | undefined;
  const dispose = createRoot((disposeRoot) => {
    value = useSpringValue(initial, { reducedMotion: () => false, ...options, clock });
    return disposeRoot;
  });
  if (value === undefined) throw new Error("useSpringValue did not run");
  return { value, clock, dispose };
}

function run(clock: ManualClock, limit = 3000): number {
  let frames = 0;
  while (clock.pending() > 0 && frames < limit) {
    clock.frame(16);
    frames += 1;
  }
  return frames;
}

const flushPromises = async (): Promise<void> => {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
};

describe("useSpringValue", () => {
  it("[MOT-110] to() moves the value with the spring and resolves true on arrival", async () => {
    const { value, clock } = setup(0);
    const results: boolean[] = [];
    void value.to(100).then((arrived) => results.push(arrived));
    expect(value.moving()).toBe(true);
    clock.frame(16);
    expect(value()).toBeGreaterThan(0);
    expect(value()).toBeLessThan(100);
    expect(value.velocity()).toBeGreaterThan(0);
    run(clock);
    await flushPromises();
    expect(value()).toBe(100);
    expect(value.velocity()).toBe(0);
    expect(value.moving()).toBe(false);
    expect(results).toEqual([true]);
    expect(clock.pending()).toBe(0);
  });

  it("[MOT-111] a delay holds the value in place until it has passed", () => {
    const { value, clock } = setup(10);
    void value.to(50, { delay: 100 });
    clock.frame(16);
    clock.frame(16);
    clock.frame(60);
    expect(value()).toBe(10);
    expect(value.moving()).toBe(true);
    clock.frame(16);
    expect(value()).toBeGreaterThan(10);
  });

  it("[MOT-112] a starting velocity carries the value away from the target first", () => {
    const { value, clock } = setup(0);
    void value.to(0.5, { velocity: -2000 });
    clock.frame(16);
    expect(value()).toBeLessThan(0);
    run(clock);
    expect(value()).toBe(0.5);
  });

  it("[MOT-113] a new move replaces the running one, keeps its speed, and the old promise is false", async () => {
    const { value, clock } = setup(0);
    const first: boolean[] = [];
    void value.to(100).then((arrived) => first.push(arrived));
    clock.frame(16);
    clock.frame(16);
    const speed = value.velocity();
    expect(speed).toBeGreaterThan(0);
    void value.to(-100);
    await flushPromises();
    expect(first).toEqual([false]);
    const before = value();
    clock.frame(1);
    // Still going up for an instant: the speed was kept.
    expect(value()).toBeGreaterThan(before);
    run(clock);
    expect(value()).toBe(-100);
  });

  it("[MOT-114] moves chain with await: out, then back", async () => {
    const { value, clock } = setup(0);
    const seen: number[] = [];
    const done = (async () => {
      await value.to(300, { stiffness: 220, damping: 30 });
      seen.push(value());
      await value.to(0);
      seen.push(value());
    })();
    for (let i = 0; i < 400 && seen.length < 2; i += 1) {
      clock.frame(16);
      await flushPromises();
    }
    await done;
    expect(seen).toEqual([300, 0]);
  });

  it("[MOT-115] set() and stop() end the move where told, resolving false", async () => {
    const { value, clock } = setup(0);
    const results: boolean[] = [];
    void value.to(100).then((arrived) => results.push(arrived));
    clock.frame(16);
    value.set(42);
    expect(value()).toBe(42);
    expect(clock.pending()).toBe(0);
    void value.to(80).then((arrived) => results.push(arrived));
    clock.frame(16);
    const at = value();
    value.stop();
    expect(value()).toBe(at);
    expect(value.velocity()).toBe(0);
    expect(value.moving()).toBe(false);
    await flushPromises();
    expect(results).toEqual([false, false]);
  });

  it("[MOT-116] with reduced motion the value goes to the target at once", async () => {
    const { value, clock } = setup(0, { reducedMotion: () => true });
    const arrived = await value.to(64, { delay: 500 });
    expect(arrived).toBe(true);
    expect(value()).toBe(64);
    expect(clock.pending()).toBe(0);
  });

  it("[MOT-117] a move to where it already rests resolves at once without frames", async () => {
    const { value, clock } = setup(5);
    expect(await value.to(5)).toBe(true);
    expect(clock.requests()).toBe(0);
  });

  it("[MOT-118] physics that cannot settle snap to the target", () => {
    const { value, clock } = setup(0);
    void value.to(10, { stiffness: 0 });
    clock.frame(16);
    expect(value()).toBe(10);
    expect(clock.pending()).toBe(0);
  });

  it("[MOT-119] disposing the owner cancels the frame and resolves false", async () => {
    const { value, clock, dispose } = setup(0);
    const results: boolean[] = [];
    void value.to(100).then((arrived) => results.push(arrived));
    clock.frame(16);
    dispose();
    await flushPromises();
    expect(clock.pending()).toBe(0);
    expect(results).toEqual([false]);
  });

  it("[MOT-120] calling to() inside an effect does not subscribe it to the value", () => {
    const clock = manualClock(0);
    let runs = 0;
    const dispose = createRoot((disposeRoot) => {
      const value = useSpringValue(0, { clock, reducedMotion: () => false });
      useEffect(() => {
        runs += 1;
        void value.to(10);
      });
      return disposeRoot;
    });
    flushSync();
    run(clock);
    expect(runs).toBe(1);
    dispose();
  });
});

describe("stagger", () => {
  it("[MOT-121] spaces delays from the first, the last, the center or an index", () => {
    const first = stagger(60, { start: 300 });
    expect([0, 1, 2].map(first)).toEqual([300, 360, 420]);
    const last = stagger(10, { from: "last", count: 3 });
    expect([0, 1, 2].map(last)).toEqual([20, 10, 0]);
    const center = stagger(50, { from: "center", count: 5 });
    expect([0, 1, 2, 3, 4].map(center)).toEqual([100, 50, 0, 50, 100]);
    const fromTwo = stagger(5, { from: 2 });
    expect([0, 2, 5].map(fromTwo)).toEqual([10, 0, 15]);
  });

  it("[MOT-122] caps every delay at max", () => {
    const delay = stagger(60, { start: 300, max: 600 });
    expect(delay(20)).toBe(600);
    expect(delay(2)).toBe(420);
  });

  it("[MOT-123] from last or center without a count is a RangeError at the call", () => {
    expect(() => stagger(10, { from: "last" })).toThrow(RangeError);
    expect(() => stagger(10, { from: "center" })).toThrow(RangeError);
  });
});
