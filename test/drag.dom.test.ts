/**
 * `useDrag` in happy-dom: the threshold, axes, limits, throws, springs, reduced motion, clicks after a
 * drag, and cleanup. Frames come from a manual clock, so nothing waits on real time.
 */
import { createRoot, flushSync } from "@shadow-js/core";
import { afterEach, describe, expect, it } from "vitest";
import { type DragHandle, type DragOptions, rubberBand, useDrag } from "../src/index";
import { type ManualClock, manualClock } from "./support/manual-clock";

interface Setup {
  readonly drag: DragHandle;
  readonly el: HTMLElement;
  readonly clock: ManualClock;
  readonly dispose: () => void;
  readonly cleanupRef: (() => void) | undefined;
}

const disposers: (() => void)[] = [];

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.innerHTML = "";
});

function setup(options: Omit<DragOptions, "clock"> = {}): Setup {
  const clock = manualClock(1000);
  const el = document.createElement("div");
  document.body.append(el);
  let drag: DragHandle | undefined;
  let cleanupRef: (() => void) | undefined;
  const dispose = createRoot((disposeRoot) => {
    drag = useDrag({ reducedMotion: () => false, ...options, clock });
    cleanupRef = drag.ref(el);
    return disposeRoot;
  });
  flushSync();
  disposers.push(dispose);
  if (drag === undefined) throw new Error("useDrag did not run");
  return { drag, el, clock, dispose, cleanupRef };
}

function pointer(
  el: Element,
  type: string,
  clientX: number,
  clientY: number,
  extra: { pointerId?: number; button?: number; pointerType?: string } = {},
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    pointerId: extra.pointerId ?? 1,
    pointerType: extra.pointerType ?? "mouse",
    button: extra.button ?? 0,
    clientX,
    clientY,
  });
  el.dispatchEvent(event);
  return event;
}

/** Moves the pointer in `steps` equal parts, `ms` apart on the clock. */
function moveTo(
  s: Setup,
  from: [number, number],
  to: [number, number],
  steps: number,
  ms: number,
): void {
  for (let i = 1; i <= steps; i += 1) {
    s.clock.frame(ms);
    const t = i / steps;
    pointer(s.el, "pointermove", from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t);
  }
}

/** Runs frames until nothing is pending, at most `limit` of them. */
function settleFrames(clock: ManualClock, limit = 2000): number {
  let frames = 0;
  while (clock.pending() > 0 && frames < limit) {
    clock.frame(16);
    frames += 1;
  }
  return frames;
}

describe("useDrag: starting and moving", () => {
  it("[MOT-79] a press that moves less than the threshold is a click, not a drag", () => {
    const starts: number[] = [];
    const s = setup({ onStart: () => starts.push(1) });
    let clicks = 0;
    s.el.addEventListener("click", () => {
      clicks += 1;
    });
    pointer(s.el, "pointerdown", 10, 10);
    pointer(s.el, "pointermove", 12, 11);
    pointer(s.el, "pointerup", 12, 11);
    s.el.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    expect(starts).toEqual([]);
    expect(s.drag.dragging()).toBe(false);
    expect(s.drag.x()).toBe(0);
    expect(clicks).toBe(1);
  });

  it("[MOT-80] past the threshold the element follows the pointer and reports dragging", () => {
    const s = setup({ initial: { x: 5, y: 7 }, momentum: false });
    pointer(s.el, "pointerdown", 100, 100);
    s.clock.frame(16);
    pointer(s.el, "pointermove", 130, 90);
    flushSync();
    expect(s.drag.dragging()).toBe(true);
    expect(s.drag.x()).toBe(35);
    expect(s.drag.y()).toBe(-3);
    expect(s.drag.style()).toBe("transform: translate3d(35px, -3px, 0)");
  });

  it("[MOT-81] a single axis moves only that axis and leaves the other to the page", () => {
    const sx = setup({ axis: "x", momentum: false });
    expect(sx.el.style.touchAction).toBe("pan-y");
    pointer(sx.el, "pointerdown", 0, 0);
    pointer(sx.el, "pointermove", 40, 60);
    flushSync();
    expect(sx.drag.x()).toBe(40);
    expect(sx.drag.y()).toBe(0);

    const sy = setup({ axis: "y", momentum: false });
    expect(sy.el.style.touchAction).toBe("pan-x");
    const sb = setup({ momentum: false });
    expect(sb.el.style.touchAction).toBe("none");
  });

  it("[MOT-82] past a limit the pull is scaled by elastic", () => {
    const s = setup({ bounds: { left: 0, right: 100 }, elastic: 0.5, momentum: false, axis: "x" });
    pointer(s.el, "pointerdown", 0, 0);
    pointer(s.el, "pointermove", 140, 0);
    flushSync();
    expect(s.drag.x()).toBe(120);
    pointer(s.el, "pointermove", -40, 0);
    flushSync();
    expect(s.drag.x()).toBe(-20);
  });

  it("[MOT-83] a secondary mouse button and a press refused by allow() do not drag", () => {
    const s = setup({ allow: (event) => (event.target as Element).tagName !== "BUTTON" });
    pointer(s.el, "pointerdown", 0, 0, { button: 2 });
    pointer(s.el, "pointermove", 50, 0);
    flushSync();
    expect(s.drag.x()).toBe(0);
    pointer(s.el, "pointerup", 50, 0);

    const button = document.createElement("button");
    s.el.append(button);
    pointer(button, "pointerdown", 0, 0);
    pointer(s.el, "pointermove", 50, 0);
    flushSync();
    expect(s.drag.x()).toBe(0);
  });

  it("[MOT-84] a touch press with a non-zero button still drags", () => {
    const s = setup({ momentum: false });
    pointer(s.el, "pointerdown", 0, 0, { pointerType: "touch", button: -1 });
    pointer(s.el, "pointermove", 20, 0, { pointerType: "touch", button: -1 });
    flushSync();
    expect(s.drag.x()).toBe(20);
  });

  it("[MOT-85] moves from another pointer are ignored", () => {
    const s = setup({ momentum: false });
    pointer(s.el, "pointerdown", 0, 0, { pointerId: 1 });
    pointer(s.el, "pointermove", 50, 0, { pointerId: 2 });
    flushSync();
    expect(s.drag.x()).toBe(0);
  });
});

describe("useDrag: release", () => {
  it("[MOT-86] released past a limit, the element springs back to it and settles once", () => {
    const settles: number[] = [];
    const s = setup({
      axis: "x",
      bounds: { left: 0, right: 100 },
      elastic: 0.5,
      onSettle: (info) => settles.push(info.x),
    });
    pointer(s.el, "pointerdown", 0, 0);
    pointer(s.el, "pointermove", 160, 0);
    // Held still for longer than the sample window: no throw.
    s.clock.frame(200);
    pointer(s.el, "pointerup", 160, 0);
    expect(s.drag.dragging()).toBe(false);
    expect(s.drag.x()).toBe(130);
    settleFrames(s.clock);
    expect(s.drag.x()).toBe(100);
    expect(settles).toEqual([100]);
    expect(s.clock.pending()).toBe(0);
  });

  it("[MOT-G04] a spring back that cannot settle (no stiffness, a negative damping) ends at the limit at once", () => {
    for (const physics of [{ bounceStiffness: 0 }, { bounceDamping: -5 }]) {
      const settles: number[] = [];
      const s = setup({
        axis: "x",
        bounds: { left: 0, right: 100 },
        elastic: 0.5,
        onSettle: (info) => settles.push(info.x),
        ...physics,
      });
      pointer(s.el, "pointerdown", 0, 0);
      pointer(s.el, "pointermove", 160, 0);
      s.clock.frame(200);
      pointer(s.el, "pointerup", 160, 0);
      const frames = settleFrames(s.clock, 50);
      expect(frames).toBeLessThan(50);
      expect(s.drag.x()).toBe(100);
      expect(settles).toEqual([100]);
      expect(s.clock.pending()).toBe(0);
    }
  });

  it("[MOT-G04b] options that are not numbers (NaN, Infinity) fall back to the defaults: positions stay finite and the glide ends", () => {
    const s = setup({
      axis: "x",
      bounds: { left: 0, right: 100 },
      elastic: Number.NaN,
      power: Number.NaN,
      timeConstant: Number.NaN,
      bounceStiffness: Number.POSITIVE_INFINITY,
      bounceDamping: Number.NaN,
      threshold: Number.NaN,
    });
    pointer(s.el, "pointerdown", 0, 0);
    moveTo(s, [0, 0], [160, 0], 4, 8);
    expect(Number.isFinite(s.drag.x())).toBe(true);
    pointer(s.el, "pointerup", 160, 0);
    const frames = settleFrames(s.clock, 2000);
    expect(frames).toBeLessThan(2000);
    expect(s.drag.x()).toBe(100);
    expect(s.drag.style()).toBe("transform: translate3d(100px, 0px, 0)");
  });

  it("[MOT-87] a throw keeps moving, slows down and settles once", () => {
    const settles: number[] = [];
    const s = setup({ axis: "x", onSettle: (info) => settles.push(info.x) });
    pointer(s.el, "pointerdown", 0, 0);
    moveTo(s, [0, 0], [100, 0], 5, 16);
    pointer(s.el, "pointerup", 100, 0);
    const released = s.drag.x();
    expect(released).toBe(100);
    s.clock.frame(16);
    expect(s.drag.x()).toBeGreaterThan(released);
    expect(s.drag.velocityX()).toBeGreaterThan(0);
    settleFrames(s.clock);
    // Released at 1250 px/s; power 0.8 carries it about 1000 px further.
    expect(s.drag.x()).toBeGreaterThan(released + 900);
    expect(s.drag.x()).toBeLessThan(released + 1400);
    expect(s.drag.velocityX()).toBe(0);
    expect(settles).toHaveLength(1);
  });

  it("[MOT-88] held still before release, nothing is thrown", () => {
    const s = setup({ axis: "x" });
    pointer(s.el, "pointerdown", 0, 0);
    moveTo(s, [0, 0], [100, 0], 5, 16);
    s.clock.frame(150);
    pointer(s.el, "pointerup", 100, 0);
    expect(s.clock.pending()).toBe(0);
    expect(s.drag.x()).toBe(100);
  });

  it("[MOT-89] a throw into a wall turns into the bounce and ends at the wall", () => {
    const s = setup({ axis: "x", bounds: { left: 0, right: 200 } });
    pointer(s.el, "pointerdown", 0, 0);
    moveTo(s, [0, 0], [150, 0], 5, 16);
    pointer(s.el, "pointerup", 150, 0);
    let past = false;
    let frames = 0;
    while (s.clock.pending() > 0 && frames < 2000) {
      s.clock.frame(16);
      if (s.drag.x() > 200) past = true;
      frames += 1;
    }
    expect(past).toBe(true);
    expect(s.drag.x()).toBe(200);
  });

  it("[MOT-90] snapToOrigin returns to the initial place", () => {
    const s = setup({ initial: { x: 10, y: 20 }, snapToOrigin: true });
    pointer(s.el, "pointerdown", 0, 0);
    moveTo(s, [0, 0], [80, 60], 4, 16);
    pointer(s.el, "pointerup", 80, 60);
    settleFrames(s.clock);
    expect(s.drag.x()).toBe(10);
    expect(s.drag.y()).toBe(20);
  });

  it("[MOT-91] with reduced motion the element goes to its limit or origin at once and is not thrown", () => {
    const s = setup({ axis: "x", bounds: { right: 100 }, reducedMotion: () => true, elastic: 1 });
    const settles: number[] = [];
    pointer(s.el, "pointerdown", 0, 0);
    moveTo(s, [0, 0], [160, 0], 4, 16);
    pointer(s.el, "pointerup", 160, 0);
    expect(s.drag.x()).toBe(100);
    expect(s.clock.pending()).toBe(0);

    const t = setup({ axis: "x", reducedMotion: () => true, onSettle: (i) => settles.push(i.x) });
    pointer(t.el, "pointerdown", 0, 0);
    moveTo(t, [0, 0], [100, 0], 4, 16);
    pointer(t.el, "pointerup", 100, 0);
    expect(t.drag.x()).toBe(100);
    expect(t.clock.pending()).toBe(0);
    expect(settles).toEqual([100]);

    const o = setup({ snapToOrigin: true, reducedMotion: () => true });
    pointer(o.el, "pointerdown", 0, 0);
    moveTo(o, [0, 0], [40, 40], 2, 16);
    pointer(o.el, "pointerup", 40, 40);
    expect(o.drag.x()).toBe(0);
    expect(o.drag.y()).toBe(0);
  });

  it("[MOT-92] limits given as an accessor are read again when the throw settles", () => {
    let right = 1000;
    const s = setup({ axis: "x", bounds: () => ({ left: 0, right }) });
    pointer(s.el, "pointerdown", 0, 0);
    moveTo(s, [0, 0], [100, 0], 5, 16);
    pointer(s.el, "pointerup", 100, 0);
    right = 300;
    settleFrames(s.clock);
    expect(s.drag.x()).toBe(300);
  });

  it("[MOT-93] the click that follows a drag is swallowed once; the next click goes through", () => {
    const s = setup({ momentum: false });
    let clicks = 0;
    s.el.addEventListener("click", () => {
      clicks += 1;
    });
    pointer(s.el, "pointerdown", 0, 0);
    pointer(s.el, "pointermove", 30, 0);
    pointer(s.el, "pointerup", 30, 0);
    const first = new Event("click", { bubbles: true, cancelable: true });
    s.el.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    s.el.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    expect(clicks).toBe(1);
  });

  it("[MOT-G05] a drag that no click follows does not swallow a later click made without a pointer", async () => {
    const s = setup({ momentum: false });
    let clicks = 0;
    s.el.addEventListener("click", () => {
      clicks += 1;
    });
    pointer(s.el, "pointerdown", 0, 0);
    pointer(s.el, "pointermove", 30, 0);
    pointer(s.el, "pointerup", 30, 0);
    // A touch drag ends with no click. The click of a press comes in the same task as its pointerup,
    // so one task later none is coming.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const keyboard = new Event("click", { bubbles: true, cancelable: true });
    s.el.dispatchEvent(keyboard);
    expect(keyboard.defaultPrevented).toBe(false);
    expect(clicks).toBe(1);
    expect(s.clock.pending()).toBe(0);
  });

  it("[MOT-94] the browser's own dragstart is prevented", () => {
    const s = setup();
    const event = new Event("dragstart", { bubbles: true, cancelable: true });
    s.el.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("useDrag: control and cleanup", () => {
  it("[MOT-95] set() places the element at once and stops a glide; moveTo() springs there", () => {
    const s = setup({ axis: "x" });
    pointer(s.el, "pointerdown", 0, 0);
    moveTo(s, [0, 0], [100, 0], 5, 16);
    pointer(s.el, "pointerup", 100, 0);
    expect(s.clock.pending()).toBe(1);
    s.drag.set(40, 50);
    flushSync();
    expect(s.clock.pending()).toBe(0);
    expect(s.drag.x()).toBe(40);
    expect(s.drag.y()).toBe(50);

    s.drag.moveTo(200, 50);
    s.clock.frame(16);
    expect(s.drag.x()).toBeGreaterThan(40);
    expect(s.drag.x()).toBeLessThan(200);
    settleFrames(s.clock);
    expect(s.drag.x()).toBe(200);
  });

  it("[MOT-96] moveTo() with reduced motion jumps", () => {
    const s = setup({ reducedMotion: () => true });
    s.drag.moveTo(70, 80);
    flushSync();
    expect(s.drag.x()).toBe(70);
    expect(s.drag.y()).toBe(80);
    expect(s.clock.pending()).toBe(0);
  });

  it("[MOT-97] disposing the owner cancels the glide and removes the listeners", () => {
    const s = setup({ axis: "x" });
    pointer(s.el, "pointerdown", 0, 0);
    moveTo(s, [0, 0], [100, 0], 5, 16);
    pointer(s.el, "pointerup", 100, 0);
    expect(s.clock.pending()).toBe(1);
    s.dispose();
    expect(s.clock.pending()).toBe(0);
    expect(s.el.style.touchAction).toBe("");
    pointer(s.el, "pointerdown", 0, 0);
    pointer(s.el, "pointermove", 50, 0);
    flushSync();
    expect(s.drag.x()).toBe(100);
  });

  it("[MOT-98] the cleanup the ref returns detaches the element; a new element can be attached", () => {
    const s = setup({ momentum: false });
    expect(s.cleanupRef).toBeTypeOf("function");
    s.cleanupRef?.();
    expect(s.el.style.touchAction).toBe("");
    pointer(s.el, "pointerdown", 0, 0);
    pointer(s.el, "pointermove", 50, 0);
    flushSync();
    expect(s.drag.x()).toBe(0);

    const next = document.createElement("div");
    document.body.append(next);
    s.drag.ref(next);
    pointer(next, "pointerdown", 0, 0);
    pointer(next, "pointermove", 25, 0);
    flushSync();
    expect(s.drag.x()).toBe(25);
  });
});

describe("rubberBand", () => {
  it("[MOT-99] leaves values inside the limits, scales the pull past them, ignores missing sides", () => {
    expect(rubberBand(50, 0, 100, 0.5)).toBe(50);
    expect(rubberBand(120, 0, 100, 0.5)).toBe(110);
    expect(rubberBand(-20, 0, 100, 0.25)).toBe(-5);
    expect(rubberBand(-500, undefined, 100, 0)).toBe(-500);
    expect(rubberBand(500, 0, undefined, 0)).toBe(500);
    expect(rubberBand(130, 0, 100, 0)).toBe(100);
    expect(rubberBand(130, 0, 100, 1)).toBe(130);
  });
});
