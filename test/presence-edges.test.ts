/**
 * Presence under interruption: a target change while the enter runs, closing again after a reopen,
 * and reduced motion. The element is a fake with a recording `animate`, so the test sees each
 * animation start and cancel.
 */
import { createRoot, flushSync, useSignal } from "@shadow-js/core";
import { describe, expect, it } from "vitest";
import { usePresence } from "../src/index";
import { fakeElement, settle } from "./support/fake-element";

const ENTER = [{ opacity: 0 }, { opacity: 1 }];
const EXIT = [{ opacity: 1 }, { opacity: 0 }];

describe("usePresence interruption", () => {
  it("[MOT-38] closing while the enter runs cancels the enter, starts the exit, and keeps the content until the exit ends", async () => {
    const fake = fakeElement();
    const [open, setOpen] = useSignal(true);
    let mounted: (() => boolean) | undefined;
    createRoot(() => {
      const presence = usePresence({ present: open, enter: ENTER, exit: EXIT, duration: 120 });
      presence.ref(fake.element);
      mounted = presence.mounted;
    });
    flushSync();
    expect(fake.animations).toHaveLength(1);
    expect(fake.animations[0]?.keyframes).toEqual(ENTER);
    setOpen(false);
    flushSync();
    expect(fake.animations[0]?.canceled).toBe(1);
    expect(fake.animations).toHaveLength(2);
    expect(fake.animations[1]?.keyframes).toEqual(EXIT);
    expect(mounted?.()).toBe(true);
    fake.animations[1]?.finish();
    await settle();
    flushSync();
    expect(mounted?.()).toBe(false);
  });

  it("[MOT-39] closing again after a reopen starts a second exit: the first is canceled and the content leaves only when the second ends", async () => {
    const fake = fakeElement();
    const [open, setOpen] = useSignal(true);
    let mounted: (() => boolean) | undefined;
    createRoot(() => {
      const presence = usePresence({ present: open, exit: EXIT, duration: 120 });
      presence.ref(fake.element);
      mounted = presence.mounted;
    });
    setOpen(false);
    flushSync();
    setOpen(true);
    flushSync();
    setOpen(false);
    flushSync();
    expect(fake.animations).toHaveLength(2);
    expect(fake.animations[0]?.canceled).toBe(1);
    await settle();
    flushSync();
    expect(mounted?.()).toBe(true);
    fake.animations[1]?.finish();
    await settle();
    flushSync();
    expect(mounted?.()).toBe(false);
  });

  it("[MOT-40] reducedMotion true gives the enter and the exit a duration of zero", () => {
    const fake = fakeElement();
    const [open, setOpen] = useSignal(true);
    createRoot(() => {
      const presence = usePresence({
        present: open,
        enter: ENTER,
        exit: EXIT,
        duration: 500,
        reducedMotion: true,
      });
      presence.ref(fake.element);
    });
    flushSync();
    setOpen(false);
    flushSync();
    expect(fake.animations.map((animation) => animation.duration)).toEqual([0, 0]);
  });
});
