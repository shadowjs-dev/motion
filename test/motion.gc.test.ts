import { createRoot, flushSync, useSignal } from "@shadow-js/core";
import { describe, expect, it } from "vitest";
import { animate, usePresence, useSpring, useTween } from "../src/index";
import { fakeElement } from "./support/fake-element";
import { type ManualClock, manualClock } from "./support/manual-clock";

/** The engine's garbage collector hook; the gc project always runs with --expose-gc. */
function exposedGc(): () => void {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (gc === undefined) throw new Error("the gc project must run with --expose-gc");
  return gc;
}

/** Yields to the next job: a WeakRef target made in the current job stays alive until that job ends. */
function nextJob(): Promise<void> {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

/**
 * One cycle of every motion hook: a tween, a spring and a presence exit on one element, plus an
 * animate on another. Each owner is disposed before the function returns, so nothing it started may
 * still run. The element is created here, not by the caller, so no slot of the caller's frame keeps
 * the last one alive.
 */
function runCycle(clock: ManualClock, refs: WeakRef<object>[]): void {
  const { element } = fakeElement();
  const { element: other } = fakeElement();
  refs.push(new WeakRef(element), new WeakRef(other));
  const [target, setTarget] = useSignal(0);
  const [open, setOpen] = useSignal(true);
  const disposers: Array<() => void> = [];
  createRoot((dispose) => {
    disposers.push(dispose);
    useTween(target, { duration: 100, clock, reducedMotion: () => false });
    useSpring(target, { clock, reducedMotion: () => false });
    const presence = usePresence({
      present: open,
      exit: [{ opacity: 1 }, { opacity: 0 }],
      duration: 100,
    });
    presence.ref(element);
  });
  flushSync();
  setTarget(100);
  setOpen(false);
  flushSync();
  clock.frame(16);
  animate(other, [{ opacity: 0 }, { opacity: 1 }], { duration: 100 });
  for (const dispose of disposers) dispose();
}

/**
 * Collects until `expected` targets are gone, at most 25 forced collections, each after a yield to the next job.
 */
async function collectUntil(
  gc: () => void,
  refs: readonly WeakRef<object>[],
  expected: number,
): Promise<number> {
  let released = 0;
  for (let pass = 0; pass < 25 && released < expected; pass += 1) {
    await nextJob();
    gc();
    gc();
    released = refs.filter((ref) => ref.deref() === undefined).length;
  }
  return released;
}

describe("motion memory", () => {
  it("[MOT-53] many create and dispose cycles of tween, spring, presence and animate retain no elements and no frame handles", async () => {
    const gc = exposedGc();
    const clock = manualClock();
    const { element: kept } = fakeElement();
    const keptRef = new WeakRef(kept);
    const refs: WeakRef<object>[] = [];
    for (let cycle = 0; cycle < 1000; cycle += 1) runCycle(clock, refs);
    expect(clock.pending()).toBe(0);
    const released = await collectUntil(gc, refs, refs.length);
    expect(released).toBe(refs.length);
    expect(keptRef.deref()).toBe(kept);
  });
});
