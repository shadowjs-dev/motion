/**
 * Review round: a tween ends on its target exactly, and a spring whose physics cannot settle
 * (no restoring force, or a restoring force pointing away) snaps to its target instead of asking for
 * frames for ever or flying off.
 */
import { createRoot, flushSync, useSignal } from "@shadow-js/core";
import { describe, expect, it } from "vitest";
import { easings, usePresence, useSpring, useTween } from "../src/index";
import { fakeElement, settle } from "./support/fake-element";
import { manualClock } from "./support/manual-clock";

describe("a tween ends on its target", () => {
  it("[MOT-REV-1] floating-point rounding does not leave the last value beside the target", () => {
    const clock = manualClock();
    const [target, setTarget] = useSignal(-3);
    const value = createRoot(() =>
      useTween(target, { duration: 100, ease: easings.linear, clock, reducedMotion: () => false }),
    );
    // -3 + (-0.9 - -3) * 1 is not -0.9 in floating point.
    setTarget(-0.9);
    flushSync();
    clock.frame(100);
    expect(value()).toBe(-0.9);
    expect(clock.pending()).toBe(0);
  });

  it("[MOT-REV-2] an easing that does not return exactly 1 at the end still ends on the target", () => {
    const clock = manualClock();
    const [target, setTarget] = useSignal(0);
    const value = createRoot(() =>
      useTween(target, {
        duration: 100,
        ease: (progress) => progress * 0.999,
        clock,
        reducedMotion: () => false,
      }),
    );
    setTarget(10);
    flushSync();
    clock.frame(100);
    expect(value()).toBe(10);
    expect(clock.pending()).toBe(0);
  });
});

describe("a spring that cannot settle", () => {
  it.each([
    ["no stiffness", { stiffness: 0 }],
    ["negative stiffness", { stiffness: -170 }],
    ["no mass", { mass: 0 }],
    ["negative mass", { mass: -1 }],
  ])("[MOT-REV-3] %s snaps to the target and releases the frame handle", (_name, physics) => {
    const clock = manualClock();
    const [target, setTarget] = useSignal(0);
    const value = createRoot(() =>
      useSpring(target, { ...physics, clock, reducedMotion: () => false }),
    );
    setTarget(100);
    flushSync();
    for (let frame = 0; frame < 5 && clock.pending() > 0; frame += 1) clock.frame(16);
    expect(value()).toBe(100);
    expect(clock.pending()).toBe(0);
  });
});

describe("usePresence with content that leaves the page", () => {
  it("[MOT-REV-4] an element that arrives with ref after the content was unmounted gets the enter animation", async () => {
    const first = fakeElement();
    const second = fakeElement();
    const [open, setOpen] = useSignal(true);
    let presence: ReturnType<typeof usePresence> | undefined;
    createRoot(() => {
      presence = usePresence({
        present: open,
        enter: [{ opacity: 0 }, { opacity: 1 }],
        exit: [{ opacity: 1 }, { opacity: 0 }],
        duration: 120,
      });
      presence.ref(first.element);
    });
    flushSync();
    expect(first.animations).toHaveLength(1);
    setOpen(false);
    flushSync();
    first.animations[1]?.finish();
    await settle();
    flushSync();
    expect(presence?.mounted()).toBe(false);
    // The content is gone: `<Show>` released the element.
    presence?.ref(null);
    setOpen(true);
    flushSync();
    expect(presence?.mounted()).toBe(true);
    // `<Show>` renders the content again, with a new element.
    presence?.ref(second.element);
    flushSync();
    expect(second.animations).toHaveLength(1);
    expect(second.animations[0]?.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  });
});
