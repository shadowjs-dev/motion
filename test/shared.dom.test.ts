/**
 * `createShared` in happy-dom: joining a leaving and an arriving element of the same id in either
 * order, the glide keyframes, when nothing should move, measuring before input, and cleanup. happy-dom
 * has no layout, so boxes are set by the test and `animate` is recorded.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createShared, type Shared, type SharedOptions } from "../src/index";

interface Recorded {
  readonly keyframes: Keyframe[];
  readonly options: KeyframeAnimationOptions;
  canceled: number;
}

const shareds: Shared[] = [];

afterEach(() => {
  for (const shared of shareds.splice(0)) shared.dispose();
  document.body.innerHTML = "";
});

function make(options: SharedOptions = {}): Shared {
  const shared = createShared({ reducedMotion: () => false, ...options });
  shareds.push(shared);
  return shared;
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

/** An element in the page with a box the test can move, and its recorded animations. */
function box(
  left: number,
  top: number,
  width = 40,
  height = 4,
): {
  el: HTMLElement;
  place: (l: number, t: number, w?: number, h?: number) => void;
  runs: Recorded[];
} {
  const el = document.createElement("span");
  document.body.append(el);
  let current = rect(left, top, width, height);
  el.getBoundingClientRect = () => current;
  const runs: Recorded[] = [];
  Object.assign(el, {
    animate(keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      const run: Recorded = { keyframes, options, canceled: 0 };
      runs.push(run);
      return {
        finished: new Promise<void>(() => undefined),
        cancel() {
          run.canceled += 1;
        },
        finish: () => undefined,
      };
    },
  });
  return {
    el,
    runs,
    place(l, t, w = width, h = height) {
      current = rect(l, t, w, h);
    },
  };
}

const tick = async (): Promise<void> => {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
};

describe("createShared", () => {
  it("[MOT-100] the first element of an id appears without moving", async () => {
    const shared = make();
    const a = box(0, 0);
    shared.ref("dot")(a.el);
    await tick();
    expect(a.runs).toHaveLength(0);
  });

  it("[MOT-101] old element leaves first, new arrives: it glides from the old box", async () => {
    const shared = make();
    const a = box(10, 20, 40, 4);
    const cleanup = shared.ref("dot")(a.el);
    await tick();
    cleanup?.();
    a.el.remove();
    const b = box(110, 20, 80, 4);
    shared.ref("dot")(b.el);
    await tick();
    expect(b.runs).toHaveLength(1);
    const run = b.runs[0] as Recorded;
    expect(run.keyframes[0]?.["transform"]).toBe("translate(-100px, 0px) scale(0.5, 1)");
    expect(run.keyframes[1]?.["transform"]).toBe("translate(0px, 0px) scale(1, 1)");
    expect(run.keyframes[0]?.["transformOrigin"]).toBe("0 0");
    expect(run.options.duration).toBe(320);
    expect(run.options.easing).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
  });

  it("[MOT-102] new element arrives before the old leaves: it glides from the old box", async () => {
    const shared = make({ duration: 200, easing: "linear" });
    const a = box(0, 0);
    const cleanupA = shared.ref("tab")(a.el);
    await tick();
    const b = box(0, 50);
    shared.ref("tab")(b.el);
    cleanupA?.();
    a.el.remove();
    await tick();
    expect(b.runs).toHaveLength(1);
    expect((b.runs[0] as Recorded).keyframes[0]?.["transform"]).toBe(
      "translate(0px, -50px) scale(1, 1)",
    );
    expect((b.runs[0] as Recorded).options.duration).toBe(200);
  });

  it("[MOT-103] the old element's box is taken where it was when the user acted", async () => {
    const shared = make();
    const a = box(0, 0);
    const cleanup = shared.ref("dot")(a.el);
    await tick();
    // The old element moved (a scroll, a resize) and the user pressed something.
    a.place(30, 0);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    a.el.remove();
    cleanup?.();
    const b = box(100, 0);
    shared.ref("dot")(b.el);
    await tick();
    expect((b.runs[0] as Recorded).keyframes[0]?.["transform"]).toBe(
      "translate(-70px, 0px) scale(1, 1)",
    );
  });

  it("[MOT-104] scale: false moves without stretching", async () => {
    const shared = make({ scale: false });
    const a = box(0, 0, 40, 10);
    const cleanup = shared.ref("label")(a.el);
    await tick();
    cleanup?.();
    a.el.remove();
    const b = box(20, 0, 80, 10);
    shared.ref("label")(b.el);
    await tick();
    expect((b.runs[0] as Recorded).keyframes[0]?.["transform"]).toBe("translate(-20px, 0px)");
    expect((b.runs[0] as Recorded).keyframes[1]?.["transform"]).toBe("translate(0px, 0px)");
  });

  it("[MOT-105] another id, an unchanged box, and reduced motion do not animate", async () => {
    const shared = make();
    const a = box(0, 0);
    const cleanupA = shared.ref("one")(a.el);
    await tick();
    cleanupA?.();
    a.el.remove();
    const other = box(100, 0);
    shared.ref("two")(other.el);
    await tick();
    expect(other.runs).toHaveLength(0);

    const c = box(5, 5);
    const cleanupC = shared.ref("same")(c.el);
    await tick();
    cleanupC?.();
    c.el.remove();
    const d = box(5, 5);
    shared.ref("same")(d.el);
    await tick();
    expect(d.runs).toHaveLength(0);

    const reduced = make({ reducedMotion: () => true });
    const e = box(0, 0);
    const cleanupE = reduced.ref("r")(e.el);
    await tick();
    cleanupE?.();
    e.el.remove();
    const f = box(200, 0);
    reduced.ref("r")(f.el);
    await tick();
    expect(f.runs).toHaveLength(0);
  });

  it("[MOT-106] an element that arrives after the window is a new start, not a continuation", async () => {
    let time = 1000;
    const original = performance.now.bind(performance);
    performance.now = () => time;
    try {
      const shared = make({ window: 120 });
      const a = box(0, 0);
      const cleanup = shared.ref("dot")(a.el);
      await tick();
      cleanup?.();
      a.el.remove();
      time += 500;
      const b = box(100, 0);
      shared.ref("dot")(b.el);
      await tick();
      expect(b.runs).toHaveLength(0);
    } finally {
      performance.now = original;
    }
  });

  it("[MOT-107] a second arrival cancels the glide still running on the element", async () => {
    const shared = make();
    const a = box(0, 0);
    const ref = shared.ref("dot");
    const cleanupA = ref(a.el);
    await tick();
    const b = box(100, 0);
    const refB = shared.ref("dot");
    const cleanupB = refB(b.el);
    cleanupA?.();
    a.el.remove();
    await tick();
    expect(b.runs).toHaveLength(1);
    cleanupB?.();
    expect((b.runs[0] as Recorded).canceled).toBe(1);
  });

  it("[MOT-108] calling the ref with undefined also counts as leaving", async () => {
    const shared = make();
    const a = box(0, 0);
    const ref = shared.ref("dot");
    ref(a.el);
    await tick();
    ref(undefined);
    a.el.remove();
    const b = box(60, 0);
    shared.ref("dot")(b.el);
    await tick();
    expect(b.runs).toHaveLength(1);
  });

  it("[MOT-109] dispose removes the input listeners", async () => {
    const shared = make();
    const a = box(0, 0);
    shared.ref("dot")(a.el);
    await tick();
    let measured = 0;
    a.el.getBoundingClientRect = () => {
      measured += 1;
      return rect(0, 0, 40, 4);
    };
    shared.dispose();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    document.body.dispatchEvent(new Event("keydown", { bubbles: true }));
    expect(measured).toBe(0);
  });
});
