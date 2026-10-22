/**
 * Cleanup: disposing an owner cancels what it started (frames, a running exit), a second cancel is a
 * no-op, and a canceled animation resolves its `finished` promise without rejecting.
 */
import { createRoot, flushSync, useSignal } from "@shadow-js/core";
import { describe, expect, it } from "vitest";
import { animate, easings, usePresence, useSpring, useTween } from "../src/index";
import { fakeElement, settle } from "./support/fake-element";
import { manualClock } from "./support/manual-clock";

describe("owner disposal", () => {
  it("[MOT-34] disposing the owner of a tween cancels its frame, and a second dispose is a no-op", () => {
    const clock = manualClock();
    const [target, setTarget] = useSignal(0);
    let stop: (() => void) | undefined;
    const value = createRoot((dispose) => {
      stop = dispose;
      return useTween(target, {
        duration: 100,
        ease: easings.linear,
        clock,
        reducedMotion: () => false,
      });
    });
    setTarget(100);
    flushSync();
    clock.frame(30);
    expect(clock.pending()).toBe(1);
    stop?.();
    expect(clock.pending()).toBe(0);
    stop?.();
    clock.frame(100);
    expect(value()).toBeCloseTo(30);
  });

  it("[MOT-35] disposing the owner of a spring cancels its frame, and a second dispose is a no-op", () => {
    const clock = manualClock();
    const [target, setTarget] = useSignal(0);
    let stop: (() => void) | undefined;
    const value = createRoot((dispose) => {
      stop = dispose;
      return useSpring(target, { clock, reducedMotion: () => false });
    });
    setTarget(100);
    flushSync();
    clock.frame(16);
    const before = value();
    expect(clock.pending()).toBe(1);
    stop?.();
    expect(clock.pending()).toBe(0);
    stop?.();
    clock.frame(16);
    expect(value()).toBe(before);
  });

  it("[MOT-36] disposing the owner cancels a running presence exit, leaves the content as it is, and a second dispose is a no-op", async () => {
    const fake = fakeElement();
    const [open, setOpen] = useSignal(true);
    let stop: (() => void) | undefined;
    let mounted: (() => boolean) | undefined;
    createRoot((dispose) => {
      stop = dispose;
      const presence = usePresence({
        present: open,
        exit: [{ opacity: 1 }, { opacity: 0 }],
        duration: 100,
      });
      presence.ref(fake.element);
      mounted = presence.mounted;
    });
    flushSync();
    setOpen(false);
    flushSync();
    expect(fake.animations).toHaveLength(1);
    stop?.();
    expect(fake.animations[0]?.canceled).toBe(1);
    stop?.();
    await settle();
    flushSync();
    expect(mounted?.()).toBe(true);
    expect(fake.animations[0]?.canceled).toBe(1);
  });
});

describe("animate handles", () => {
  it("[MOT-37] cancel and finish are safe to call twice, and finished resolves (never rejects) once canceled", async () => {
    const fake = fakeElement();
    const handle = animate(fake.element, [{ opacity: 0 }, { opacity: 1 }], { duration: 100 });
    handle.cancel();
    handle.cancel();
    handle.finish();
    await expect(handle.finished).resolves.toBeUndefined();
  });
});
