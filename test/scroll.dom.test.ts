/**
 * `useScroll` in happy-dom: the window and a container, a target's progress, remeasuring, and cleanup.
 * happy-dom has no layout, so sizes and positions are set by the test.
 */
import { createRoot, flushSync } from "@shadow-js/core";
import { afterEach, describe, expect, it } from "vitest";
import { useScroll } from "../src/index";

function define(target: object, name: string, value: unknown): void {
  Object.defineProperty(target, name, { value, configurable: true, writable: true });
}

function rect(top: number, height: number, left = 0, width = 100): DOMRect {
  return {
    top,
    height,
    left,
    width,
    bottom: top + height,
    right: left + width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

afterEach(() => {
  document.body.innerHTML = "";
  define(window, "scrollY", 0);
  define(window, "scrollX", 0);
});

describe("useScroll on the page", () => {
  it("[MOT-73] reports the scroll and the progress of a target through 'start start' to 'end end'", () => {
    define(document.documentElement, "clientHeight", 800);
    define(document.documentElement, "clientWidth", 400);
    define(document.documentElement, "scrollHeight", 3000);
    define(document.documentElement, "scrollWidth", 400);
    define(window, "scrollY", 0);
    const target = document.createElement("section");
    document.body.append(target);
    // 1000 px tall, 500 px from the top of the page while the page is at the top.
    target.getBoundingClientRect = () => rect(500 - (window.scrollY as number), 1000);

    const dispose = createRoot((disposeRoot) => {
      const scroll = useScroll({ target: () => target, offset: ["start start", "end end"] });
      (globalThis as { __scroll?: unknown }).__scroll = scroll;
      return disposeRoot;
    });
    flushSync();
    const scroll = (globalThis as unknown as { __scroll: ReturnType<typeof useScroll> }).__scroll;
    expect(scroll.yProgress()).toBe(0);

    define(window, "scrollY", 600);
    window.dispatchEvent(new Event("scroll"));
    flushSync();
    expect(scroll.y()).toBe(600);
    expect(scroll.yProgress()).toBeCloseTo(0.5);

    define(window, "scrollY", 2000);
    window.dispatchEvent(new Event("scroll"));
    flushSync();
    expect(scroll.yProgress()).toBe(1);
    dispose();
  });

  it("[MOT-74] without a target the progress is the page's own scroll", () => {
    define(document.documentElement, "clientHeight", 800);
    define(document.documentElement, "scrollHeight", 2800);
    define(window, "scrollY", 0);
    let values!: ReturnType<typeof useScroll>;
    const dispose = createRoot((disposeRoot) => {
      values = useScroll();
      return disposeRoot;
    });
    flushSync();
    define(window, "scrollY", 1000);
    window.dispatchEvent(new Event("scroll"));
    flushSync();
    expect(values.yProgress()).toBeCloseTo(0.5);
    dispose();
  });

  it("[MOT-75] a resize measures again", () => {
    define(document.documentElement, "clientHeight", 800);
    define(document.documentElement, "scrollHeight", 2800);
    define(window, "scrollY", 1000);
    let values!: ReturnType<typeof useScroll>;
    const dispose = createRoot((disposeRoot) => {
      values = useScroll();
      return disposeRoot;
    });
    flushSync();
    expect(values.yProgress()).toBeCloseTo(0.5);
    define(document.documentElement, "scrollHeight", 4800);
    window.dispatchEvent(new Event("resize"));
    flushSync();
    expect(values.yProgress()).toBeCloseTo(0.25);
    dispose();
  });

  it("[MOT-76] after dispose the listeners are gone", () => {
    define(document.documentElement, "clientHeight", 800);
    define(document.documentElement, "scrollHeight", 2800);
    define(window, "scrollY", 0);
    let values!: ReturnType<typeof useScroll>;
    const dispose = createRoot((disposeRoot) => {
      values = useScroll();
      return disposeRoot;
    });
    flushSync();
    dispose();
    define(window, "scrollY", 1000);
    window.dispatchEvent(new Event("scroll"));
    flushSync();
    expect(values.y()).toBe(0);
  });

  it("[MOT-77] a malformed offset fails at the call", () => {
    expect(() => createRoot(() => useScroll({ offset: ["start", "end end"] as never }))).toThrow(
      RangeError,
    );
  });
});

describe("useScroll in a container", () => {
  it("[MOT-78] reads the container's own scroll and positions the target inside it", () => {
    const container = document.createElement("div");
    const target = document.createElement("div");
    container.append(target);
    document.body.append(container);
    define(container, "clientHeight", 400);
    define(container, "clientWidth", 300);
    define(container, "scrollHeight", 2000);
    define(container, "scrollWidth", 300);
    define(container, "clientTop", 0);
    define(container, "clientLeft", 0);
    define(container, "scrollTop", 0);
    define(container, "scrollLeft", 0);
    container.getBoundingClientRect = () => rect(100, 400);
    // The target is 300 px into the content and 200 px tall.
    target.getBoundingClientRect = () => rect(100 + 300 - (container.scrollTop as number), 200);

    let values!: ReturnType<typeof useScroll>;
    const dispose = createRoot((disposeRoot) => {
      values = useScroll({
        container: () => container,
        target: () => target,
        offset: ["start end", "end start"],
      });
      return disposeRoot;
    });
    flushSync();
    // The window runs from the target's start meeting the bottom (300 - 400 = -100) to its end leaving the
    // top (300 + 200 = 500): at scroll 0 that is 100 of 600.
    expect(values.yProgress()).toBeCloseTo(100 / 600);
    define(container, "scrollTop", 200);
    container.dispatchEvent(new Event("scroll"));
    flushSync();
    expect(values.y()).toBe(200);
    expect(values.yProgress()).toBeCloseTo(0.5);
    dispose();
  });
});
