/**
 * Reduced motion in happy-dom with a `matchMedia` the test controls: the preference follows the
 * change event, the listener is removed when the owner is disposed, every motion helper uses the
 * system setting when its option is not given, and a missing `matchMedia` means "not reduced".
 */
import { createRoot, flushSync, useSignal } from "@shadow-js/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  animate,
  playFlip,
  prefersReducedMotionNow,
  usePresence,
  useReducedMotion,
  useSpring,
  useTween,
} from "../src/index";
import { fakeElement } from "./support/fake-element";
import { manualClock } from "./support/manual-clock";

/** A media query list the test flips by hand; `set` fires the change listeners like a browser. */
function fakeQuery(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const list = {
    get matches() {
      return matches;
    },
    media: "(prefers-reduced-motion: reduce)",
    addEventListener(_type: string, listener: () => void) {
      listeners.add(listener);
    },
    removeEventListener(_type: string, listener: () => void) {
      listeners.delete(listener);
    },
  };
  return {
    list,
    listeners,
    set(next: boolean) {
      matches = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

/** Installs `matchMedia` on `window` returning `query`; restored after each test. */
function installMatchMedia(query: ReturnType<typeof fakeQuery>): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => query.list,
  });
}

const original = Object.getOwnPropertyDescriptor(window, "matchMedia");
afterEach(() => {
  if (original === undefined) Reflect.deleteProperty(window, "matchMedia");
  else Object.defineProperty(window, "matchMedia", original);
});

describe("reduced motion preference", () => {
  it("[MOT-42] useReducedMotion starts from the preference and follows the change event", () => {
    const query = fakeQuery(false);
    installMatchMedia(query);
    let reduced: (() => boolean) | undefined;
    createRoot(() => {
      reduced = useReducedMotion();
    });
    flushSync();
    expect(reduced?.()).toBe(false);
    query.set(true);
    flushSync();
    expect(reduced?.()).toBe(true);
    query.set(false);
    flushSync();
    expect(reduced?.()).toBe(false);
  });

  it("[MOT-43] disposing the owner of useReducedMotion removes its listener, and later changes do not reach it", () => {
    const query = fakeQuery(false);
    installMatchMedia(query);
    let reduced: (() => boolean) | undefined;
    let stop: (() => void) | undefined;
    createRoot((dispose) => {
      stop = dispose;
      reduced = useReducedMotion();
    });
    flushSync();
    expect(query.listeners.size).toBe(1);
    stop?.();
    expect(query.listeners.size).toBe(0);
    query.set(true);
    flushSync();
    expect(reduced?.()).toBe(false);
  });

  it("[MOT-44] prefersReducedMotionNow and useReducedMotion are false without matchMedia, and register nothing", () => {
    Reflect.deleteProperty(window, "matchMedia");
    expect(prefersReducedMotionNow()).toBe(false);
    let reduced: (() => boolean) | undefined;
    createRoot(() => {
      reduced = useReducedMotion();
    });
    flushSync();
    expect(reduced?.()).toBe(false);
  });

  it("[MOT-45] tween and spring follow the system setting when no reducedMotion option is given", () => {
    const query = fakeQuery(true);
    installMatchMedia(query);
    const clock = manualClock();
    const [target, setTarget] = useSignal(0);
    const tween = createRoot(() => useTween(target, { duration: 300, clock }));
    const spring = createRoot(() => useSpring(target, { clock }));
    setTarget(50);
    flushSync();
    expect(tween()).toBe(50);
    expect(spring()).toBe(50);
    expect(clock.pending()).toBe(0);
  });

  it("[MOT-46] animate and presence play with a duration of zero when the system asks for reduced motion", () => {
    const query = fakeQuery(true);
    installMatchMedia(query);
    const fake = fakeElement();
    animate(fake.element, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    expect(fake.animations[0]?.duration).toBe(0);

    const presenceEl = fakeElement();
    const [open, setOpen] = useSignal(true);
    createRoot(() => {
      const presence = usePresence({
        present: open,
        exit: [{ opacity: 1 }, { opacity: 0 }],
        duration: 300,
      });
      presence.ref(presenceEl.element);
    });
    flushSync();
    setOpen(false);
    flushSync();
    expect(presenceEl.animations[0]?.duration).toBe(0);
  });

  it("[MOT-47] playFlip does not move children when the system asks for reduced motion", () => {
    const query = fakeQuery(true);
    installMatchMedia(query);
    const list = document.createElement("ul");
    const item = document.createElement("li");
    item.setAttribute("data-key", "a");
    list.append(item);
    const fake = fakeElement();
    item.animate = fake.element.animate as typeof item.animate;
    const before = new Map([["a", { top: 40, left: 0 }]]);
    playFlip(list, before);
    expect(fake.animations).toHaveLength(0);
  });
});

describe("SVG fallback", () => {
  it("[MOT-49] animate without element.animate leaves an SVG element's style alone: it writes only HTML elements", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    expect(() =>
      animate(svg, [{ opacity: "0" }, { opacity: "0.5" }], { duration: 100 }),
    ).not.toThrow();
    expect(svg.getAttribute("style")).toBeNull();
  });
});
