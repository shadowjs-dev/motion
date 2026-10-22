/**
 * Server-side rendering: under node there is no `window`, no `document` and no `HTMLElement`. Every
 * export's non-DOM path must run without throwing, and the hooks must read as "not reduced" and must
 * not start frames (effects never run on the server).
 */
import { createRoot } from "@shadow-js/core";
import { describe, expect, it } from "vitest";
import {
  animate,
  easings,
  frameClock,
  playFlip,
  prefersReducedMotionNow,
  usePresence,
  useReducedMotion,
  useSpring,
  useTween,
} from "../src/index";

describe("motion on the server", () => {
  it("[MOT-50] animate on an element that is not an HTMLElement, without element.animate, does not touch the DOM or throw", () => {
    const element = {} as unknown as Element;
    let handle: ReturnType<typeof animate> | undefined;
    expect(() => {
      handle = animate(element, [{ opacity: "0" }, { opacity: "1" }], { duration: 100 });
    }).not.toThrow();
    expect(handle?.finished).toBeInstanceOf(Promise);
    expect(() => {
      handle?.cancel();
      handle?.finish();
    }).not.toThrow();
  });

  it("[MOT-51] every other export's non-DOM path runs without a window: the preference reads false and no frame is requested", () => {
    expect(prefersReducedMotionNow()).toBe(false);
    expect(frameClock.now()).toBeTypeOf("number");
    expect(easings.easeOut(1)).toBe(1);
    let reduced: (() => boolean) | undefined;
    let tween: (() => number) | undefined;
    let spring: (() => number) | undefined;
    let presenceMounted: (() => boolean) | undefined;
    createRoot(() => {
      reduced = useReducedMotion();
      tween = useTween(() => 12);
      spring = useSpring(() => 7);
      const presence = usePresence({ present: () => true, exit: [{ opacity: 1 }, { opacity: 0 }] });
      presence.ref(null);
      presenceMounted = presence.mounted;
    });
    expect(reduced?.()).toBe(false);
    expect(tween?.()).toBe(12);
    expect(spring?.()).toBe(7);
    expect(presenceMounted?.()).toBe(true);
    expect(() =>
      playFlip({} as unknown as Element, new Map(), { reducedMotion: true }),
    ).not.toThrow();
  });
});
