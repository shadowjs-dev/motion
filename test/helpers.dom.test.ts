/**
 * The DOM helpers of the motion package in happy-dom: `animate` (Web Animations with its fallback),
 * `Presence` timing through `usePresence`, and the FLIP helpers over measured rectangles.
 */
import { createRoot, flushSync, useSignal } from "@shadow-js/core";
import { describe, expect, it } from "vitest";
import { animate, captureLayout, playFlip, usePresence } from "../src/index";

/** A `element.animate` stand-in that records calls and finishes when the test says so. */
function fakeAnimate(element: HTMLElement): { calls: unknown[][]; finish(): void } {
  const calls: unknown[][] = [];
  let finish: (() => void) | undefined;
  (element as unknown as { animate: unknown }).animate = (keyframes: unknown, options: unknown) => {
    calls.push([keyframes, options]);
    const animation = {
      finished: new Promise<void>((resolve) => {
        finish = () => resolve();
      }),
      cancel: () => undefined,
      finish: () => finish?.(),
      playState: "running",
    };
    return animation;
  };
  return { calls, finish: () => finish?.() };
}

describe("animate", () => {
  it("[MOT-10] uses element.animate with the keyframes and options, and resolves when it finishes", async () => {
    const element = document.createElement("div");
    const fake = fakeAnimate(element);
    const handle = animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    expect(fake.calls).toEqual([[[{ opacity: 0 }, { opacity: 1 }], { duration: 200 }]]);
    let done = false;
    void handle.finished.then(() => {
      done = true;
    });
    fake.finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(done).toBe(true);
  });

  it("[MOT-11] without Web Animations the last keyframe is applied as style and the animation finishes at once", async () => {
    const element = document.createElement("div");
    (element as unknown as { animate?: unknown }).animate = undefined;
    const handle = animate(
      element,
      [{ opacity: "0" }, { opacity: "0.5", transform: "translateX(4px)" }],
      {
        duration: 100,
      },
    );
    await handle.finished;
    expect(element.style.opacity).toBe("0.5");
    expect(element.style.transform).toBe("translateX(4px)");
  });

  it("[MOT-12] reduced motion turns the duration to zero unless respectReducedMotion is false", () => {
    const element = document.createElement("div");
    const fake = fakeAnimate(element);
    animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, reducedMotion: true });
    expect(fake.calls[0]?.[1]).toEqual({ duration: 0, delay: 0, endDelay: 0, reducedMotion: true });
    animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, reducedMotion: false });
    expect(fake.calls[1]?.[1]).toEqual({ duration: 300, reducedMotion: false });
  });
});

describe("usePresence", () => {
  it("[MOT-13] content stays mounted while its exit animation runs, and leaves when the animation finishes", async () => {
    const element = document.createElement("div");
    const fake = fakeAnimate(element);
    const [open, setOpen] = useSignal(true);
    let presence: ReturnType<typeof usePresence> | undefined;
    createRoot(() => {
      presence = usePresence({
        present: open,
        exit: [{ opacity: 1 }, { opacity: 0 }],
        duration: 120,
      });
      presence.ref(element);
    });
    flushSync();
    expect(presence?.mounted()).toBe(true);
    setOpen(false);
    flushSync();
    expect(presence?.mounted()).toBe(true);
    expect(fake.calls).toHaveLength(1);
    fake.finish();
    await Promise.resolve();
    await Promise.resolve();
    flushSync();
    expect(presence?.mounted()).toBe(false);
  });

  it("[MOT-14] without an element to animate the content leaves at once", () => {
    const [open, setOpen] = useSignal(true);
    let presence: ReturnType<typeof usePresence> | undefined;
    createRoot(() => {
      presence = usePresence({ present: open, exit: [{ opacity: 1 }, { opacity: 0 }] });
    });
    setOpen(false);
    flushSync();
    expect(presence?.mounted()).toBe(false);
  });

  it("[MOT-15] opening again while the exit runs keeps the content and cancels the exit", () => {
    const element = document.createElement("div");
    const fake = fakeAnimate(element);
    const [open, setOpen] = useSignal(true);
    let presence: ReturnType<typeof usePresence> | undefined;
    createRoot(() => {
      presence = usePresence({ present: open, exit: [{ opacity: 1 }, { opacity: 0 }] });
      presence.ref(element);
    });
    setOpen(false);
    flushSync();
    setOpen(true);
    flushSync();
    expect(presence?.mounted()).toBe(true);
    expect(fake.calls).toHaveLength(1);
  });
});

describe("FLIP over a keyed list", () => {
  function row(key: string, top: number): HTMLElement {
    const element = document.createElement("li");
    element.setAttribute("data-key", key);
    element.getBoundingClientRect = () =>
      ({
        top,
        left: 0,
        width: 100,
        height: 20,
        bottom: top + 20,
        right: 100,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;
    return element;
  }

  it("[MOT-20] captureLayout records the top of every keyed child", () => {
    const list = document.createElement("ul");
    list.append(row("a", 0), row("b", 20));
    const snapshot = captureLayout(list);
    expect([...snapshot.keys()]).toEqual(["a", "b"]);
    expect(snapshot.get("b")?.top).toBe(20);
  });

  it("[MOT-21] playFlip animates each moved child from its old position to its new one, and leaves unmoved ones alone", () => {
    const list = document.createElement("ul");
    const first = row("a", 0);
    const second = row("b", 20);
    list.append(first, second);
    const snapshot = captureLayout(list);
    // The list reorders: b moves to the top, a moves down.
    second.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        width: 100,
        height: 20,
        bottom: 20,
        right: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    first.getBoundingClientRect = () =>
      ({
        top: 20,
        left: 0,
        width: 100,
        height: 20,
        bottom: 40,
        right: 100,
        x: 0,
        y: 20,
        toJSON: () => ({}),
      }) as DOMRect;
    const fakeFirst = fakeAnimate(first);
    const fakeSecond = fakeAnimate(second);
    playFlip(list, snapshot, { duration: 200, reducedMotion: false });
    expect(fakeFirst.calls[0]?.[0]).toEqual([
      { transform: "translateY(-20px)" },
      { transform: "translateY(0px)" },
    ]);
    expect(fakeSecond.calls[0]?.[0]).toEqual([
      { transform: "translateY(20px)" },
      { transform: "translateY(0px)" },
    ]);
  });

  it("[MOT-22] with reduced motion the list moves without animation", () => {
    const list = document.createElement("ul");
    const item = row("a", 0);
    list.append(item);
    const snapshot = captureLayout(list);
    item.getBoundingClientRect = () =>
      ({
        top: 50,
        left: 0,
        width: 100,
        height: 20,
        bottom: 70,
        right: 100,
        x: 0,
        y: 50,
        toJSON: () => ({}),
      }) as DOMRect;
    const fake = fakeAnimate(item);
    playFlip(list, snapshot, { reducedMotion: true });
    expect(fake.calls).toHaveLength(0);
  });
});
