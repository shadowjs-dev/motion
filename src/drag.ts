/**
 * `useDrag`: pointer dragging for one element, with limits, a rubber-band past them, throw momentum
 * and a spring back. It works with mouse, touch and pen through pointer events, and hands you the
 * position as signals, so rotation, shadows or a z-index can follow it.
 * @packageDocumentation
 */
import { type Accessor, onCleanup, untrack, useMemo, useSignal } from "@shadow-js/core";
import { frameClock, type MotionClock } from "./clock";
import { prefersReducedMotionNow } from "./reduced-motion";

/**
 * Limits for the `x` and `y` values. A side left out is free.
 * @since 1.1.0
 */
export interface DragBounds {
  readonly left?: number;
  readonly right?: number;
  readonly top?: number;
  readonly bottom?: number;
}

/**
 * What the drag callbacks receive: where the element is and how fast it moves (pixels per second).
 * @since 1.1.0
 */
export interface DragInfo {
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
}

/**
 * Options of {@link useDrag}. Each is read once, when the hook is called, except `bounds`, which may
 * be an accessor and is read when a drag starts and while it settles.
 * @since 1.1.0
 */
export interface DragOptions {
  /**
   * The axis the element moves on. On a single axis the other is left to the page, so a horizontal
   * drag does not stop a vertical scroll on touch screens.
   * @default "both"
   */
  readonly axis?: "x" | "y" | "both";
  /** Where the element starts and where `snapToOrigin` returns it. @default { x: 0, y: 0 } */
  readonly initial?: { readonly x?: number; readonly y?: number };
  /** Limits of `x` and `y`; an accessor may change them (a resized stage). */
  readonly bounds?: DragBounds | Accessor<DragBounds | undefined>;
  /**
   * How much of a pull past a limit the element follows, 0 to 1: `0` is a wall, `0.1` a firm rubber
   * band, `1` no limit while dragging. The element springs back on release.
   * @default 0.35
   */
  readonly elastic?: number;
  /** Whether the element keeps moving after release, slowing down. @default true */
  readonly momentum?: boolean;
  /**
   * How far a throw carries: the distance is `power` times the release speed in seconds.
   * @default 0.8
   */
  readonly power?: number;
  /** How quickly a throw slows, in milliseconds (the time to lose about 63% of its speed). @default 700 */
  readonly timeConstant?: number;
  /** Stiffness of the spring that returns the element from past a limit. @default 500 */
  readonly bounceStiffness?: number;
  /** Damping of that spring. @default 28 */
  readonly bounceDamping?: number;
  /** Return to `initial` on release instead of staying where it was dropped. @default false */
  readonly snapToOrigin?: boolean;
  /** Pixels the pointer must move before a drag starts, so a tap is still a click. @default 3 */
  readonly threshold?: number;
  /**
   * Decides whether a press may start a drag. By default any primary press does; return `false` for
   * the ones that should not (a button inside the element).
   */
  readonly allow?: (event: PointerEvent) => boolean;
  /** Called when the drag starts (past the threshold). */
  readonly onStart?: (info: DragInfo) => void;
  /** Called on every move while dragging. */
  readonly onMove?: (info: DragInfo) => void;
  /** Called when the pointer is released, before any momentum. */
  readonly onEnd?: (info: DragInfo) => void;
  /** Called when the element has stopped moving after a release (momentum and springs done). */
  readonly onSettle?: (info: DragInfo) => void;
  /** The frame clock. @default frameClock */
  readonly clock?: MotionClock;
  /**
   * Whether reduced motion is on at release; with it there is no momentum or spring: the element
   * stays where it is dropped, or goes at once to its limit or origin.
   * @default follows the system preference
   */
  readonly reducedMotion?: () => boolean;
}

/**
 * What {@link useDrag} returns.
 * @since 1.1.0
 */
export interface DragHandle {
  /** Attach it with `ref={drag.ref}`. The function it returns detaches the element. */
  readonly ref: (element: HTMLElement | undefined) => (() => void) | undefined;
  readonly x: Accessor<number>;
  readonly y: Accessor<number>;
  /** Speed in pixels per second: the pointer's while dragging, the element's while it glides. */
  readonly velocityX: Accessor<number>;
  readonly velocityY: Accessor<number>;
  /** `true` from the start of a drag until the pointer is released. */
  readonly dragging: Accessor<boolean>;
  /** `transform: translate3d(x, y, 0)`, ready for a `style` attribute. */
  readonly style: Accessor<string>;
  /** Puts the element at a position now, stopping any glide. */
  set(x: number, y: number): void;
  /** Glides to a position with the bounce spring. */
  moveTo(x: number, y: number): void;
}

interface Axis {
  pos: number;
  vel: number;
  mode: "idle" | "decay" | "spring";
  target: number;
}

const STEP = 1 / 120;
const MAX_FRAME = 0.064;
const SAMPLE_WINDOW = 100;
/** Below this speed (px/s) a throw has stopped. */
const STOP_SPEED = 8;
/** Within this distance (px) and this speed of its target a spring has arrived. */
const ARRIVE_DISTANCE = 0.4;
const ARRIVE_SPEED = 6;

/**
 * A position pulled past a limit, with the pull scaled by `elastic`. Pure; {@link useDrag} uses it while
 * dragging, and it helps when you move an element past its limits by your own means.
 *
 * @param value The unlimited position.
 * @param min The lower limit, or `undefined` for none.
 * @param max The upper limit, or `undefined` for none.
 * @param elastic How much of the pull past a limit is kept, 0 to 1.
 * @returns The position inside the limits, or past one by `elastic` times the overshoot.
 * @example
 * ```ts
 * import { rubberBand } from "@shadow-js/motion";
 *
 * console.log(rubberBand(120, 0, 100, 0.5)); // 110
 * console.log(rubberBand(50, 0, 100, 0.5)); // 50
 * ```
 * @since 1.1.0
 */
export function rubberBand(
  value: number,
  min: number | undefined,
  max: number | undefined,
  elastic: number,
): number {
  if (min !== undefined && value < min) return min + (value - min) * elastic;
  if (max !== undefined && value > max) return max + (value - max) * elastic;
  return value;
}

/** `value` when it is a finite number, else `fallback` (the option was left out, or is not a number). */
function finite(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

/**
 * Makes an element draggable. The element must be positioned by the `x` and `y` you get back (usually
 * `style={drag.style()}`, or your own transform built from `drag.x()` and `drag.y()`). While dragging,
 * the browser's own image and link dragging and text selection inside the element are prevented, and
 * the click that would follow a drag is swallowed, so a thumbnail can be both dragged and clicked.
 *
 * @param options Axis, limits, momentum and callbacks.
 * @returns The ref to attach and the position as signals.
 * @example
 * ```tsx
 * import { useDrag } from "@shadow-js/motion";
 *
 * export function Print() {
 *   const drag = useDrag({
 *     initial: { x: 40, y: 24 },
 *     bounds: { left: 0, right: 640, top: 0, bottom: 420 },
 *     elastic: 0.12,
 *   });
 *   return (
 *     <figure ref={drag.ref} style={`${drag.style()}; cursor: ${drag.dragging() ? "grabbing" : "grab"}`}>
 *       <img src="/print.jpg" alt="" />
 *     </figure>
 *   );
 * }
 * ```
 * @since 1.1.0
 */
export function useDrag(options: DragOptions = {}): DragHandle {
  const clock = options.clock ?? frameClock;
  const axisMode = options.axis ?? "both";
  // An option that is not a finite number (NaN, Infinity) takes its default: one NaN here would reach
  // every position after it, and the style with them.
  const elastic = Math.min(1, Math.max(0, finite(options.elastic, 0.35)));
  const momentum = options.momentum ?? true;
  const power = finite(options.power, 0.8);
  const timeConstant = Math.max(1, finite(options.timeConstant, 700));
  const bounceStiffness = finite(options.bounceStiffness, 500);
  const bounceDamping = finite(options.bounceDamping, 28);
  const threshold = finite(options.threshold, 3);
  // A spring with no pull toward its target never arrives, and one whose damping pushes grows without
  // end: either would ask for frames forever, so the element is put at the target instead.
  const cannotSettle = !(bounceStiffness > 0) || !(bounceDamping >= 0);
  const originX = options.initial?.x ?? 0;
  const originY = options.initial?.y ?? 0;

  const [x, setX] = useSignal(originX);
  const [y, setY] = useSignal(originY);
  const [velocityX, setVelocityX] = useSignal(0);
  const [velocityY, setVelocityY] = useSignal(0);
  const [dragging, setDragging] = useSignal(false);
  const style = useMemo(() => `transform: translate3d(${x()}px, ${y()}px, 0)`);

  const ax: Axis = { pos: originX, vel: 0, mode: "idle", target: originX };
  const ay: Axis = { pos: originY, vel: 0, mode: "idle", target: originY };
  const bounds = (): DragBounds | undefined =>
    typeof options.bounds === "function" ? untrack(options.bounds) : options.bounds;
  const limits = (axis: "x" | "y"): [number | undefined, number | undefined] => {
    const b = bounds();
    return axis === "x" ? [b?.left, b?.right] : [b?.top, b?.bottom];
  };
  const reduced = (): boolean => (options.reducedMotion ?? prefersReducedMotionNow)();
  const info = (): DragInfo => ({ x: ax.pos, y: ay.pos, velocityX: ax.vel, velocityY: ay.vel });
  const publish = (): void => {
    setX(ax.pos);
    setY(ay.pos);
    setVelocityX(ax.vel);
    setVelocityY(ay.vel);
  };

  let element: HTMLElement | undefined;
  let frame: unknown;
  let last = 0;
  let suppressClick = false;
  // The timer set when a drag ends: once it fires, the click the drag could have caused is not coming.
  // A timer, not a frame of the clock: the clock's frames are the glide's, and this is no motion.
  let clickTimer: ReturnType<typeof setTimeout> | undefined;
  const forgetClick = (): void => {
    if (clickTimer !== undefined) clearTimeout(clickTimer);
    clickTimer = undefined;
    suppressClick = false;
  };

  const stopGlide = (): void => {
    if (frame !== undefined) clock.cancel(frame);
    frame = undefined;
    ax.mode = "idle";
    ay.mode = "idle";
  };

  const stepAxis = (a: Axis, axis: "x" | "y", dt: number): void => {
    if (a.mode === "idle") return;
    if (a.mode === "decay") {
      a.vel *= Math.exp((-dt * 1000) / timeConstant);
      a.pos += a.vel * dt;
      const [min, max] = limits(axis);
      const past = (min !== undefined && a.pos < min) || (max !== undefined && a.pos > max);
      if (past) {
        // Thrown into a wall: bounce back with the speed it arrived with.
        a.target = a.pos < (min ?? Number.NEGATIVE_INFINITY) ? (min as number) : (max as number);
        a.mode = "spring";
      } else if (Math.abs(a.vel) < STOP_SPEED) {
        a.vel = 0;
        a.mode = "idle";
      }
      return;
    }
    const force = -bounceStiffness * (a.pos - a.target) - bounceDamping * a.vel;
    a.vel += force * dt;
    a.pos += a.vel * dt;
  };

  const tick = (now: number): void => {
    const seconds = Math.min(Math.max(0, now - last) / 1000, MAX_FRAME);
    last = now;
    const steps = Math.max(1, Math.ceil(seconds / STEP));
    const dt = seconds / steps;
    for (let i = 0; i < steps; i += 1) {
      stepAxis(ax, "x", dt);
      stepAxis(ay, "y", dt);
    }
    for (const a of [ax, ay]) {
      if (
        a.mode === "spring" &&
        (cannotSettle ||
          !Number.isFinite(a.pos) ||
          !Number.isFinite(a.vel) ||
          (Math.abs(a.pos - a.target) < ARRIVE_DISTANCE && Math.abs(a.vel) < ARRIVE_SPEED))
      ) {
        a.pos = a.target;
        a.vel = 0;
        a.mode = "idle";
      }
    }
    publish();
    if (ax.mode === "idle" && ay.mode === "idle") {
      frame = undefined;
      options.onSettle?.(info());
      return;
    }
    frame = clock.request(tick);
  };

  const startGlide = (): void => {
    if (ax.mode === "idle" && ay.mode === "idle") {
      publish();
      options.onSettle?.(info());
      return;
    }
    if (frame === undefined) {
      last = clock.now();
      frame = clock.request(tick);
    }
  };

  /** What an axis does after release, given the speed it was thrown with. */
  const release = (a: Axis, axis: "x" | "y", speed: number): void => {
    const [min, max] = limits(axis);
    const origin = axis === "x" ? originX : originY;
    const clamped = Math.min(
      max ?? Number.POSITIVE_INFINITY,
      Math.max(min ?? Number.NEGATIVE_INFINITY, a.pos),
    );
    if (options.snapToOrigin) {
      if (reduced()) {
        a.pos = origin;
        a.vel = 0;
        a.mode = "idle";
      } else {
        a.target = origin;
        a.vel = speed;
        a.mode = "spring";
      }
      return;
    }
    if (clamped !== a.pos) {
      if (reduced()) {
        a.pos = clamped;
        a.vel = 0;
        a.mode = "idle";
      } else {
        a.target = clamped;
        a.vel = speed;
        a.mode = "spring";
      }
      return;
    }
    if (momentum && !reduced() && Math.abs(speed) > STOP_SPEED) {
      // The first moment of the decay moves at the release speed (the slope of the curve, not its reach).
      a.vel = (power * speed) / (timeConstant / 1000);
      a.mode = "decay";
    } else {
      a.vel = 0;
      a.mode = "idle";
    }
  };

  const attach = (el: HTMLElement): (() => void) => {
    let pointerId: number | undefined;
    let startPointerX = 0;
    let startPointerY = 0;
    let startX = 0;
    let startY = 0;
    let started = false;
    let samples: { t: number; x: number; y: number }[] = [];

    el.style.touchAction = axisMode === "x" ? "pan-y" : axisMode === "y" ? "pan-x" : "none";

    const speedOf = (): [number, number] => {
      const now = clock.now();
      const recent = samples.filter((s) => now - s.t <= SAMPLE_WINDOW);
      // Held still before release: no throw.
      if (recent.length < 2) return [0, 0];
      const first = recent[0] as { t: number; x: number; y: number };
      const end = recent[recent.length - 1] as { t: number; x: number; y: number };
      const span = (end.t - first.t) / 1000;
      if (span <= 0 || now - end.t > SAMPLE_WINDOW) return [0, 0];
      return [(end.x - first.x) / span, (end.y - first.y) / span];
    };

    const onDown = (event: PointerEvent): void => {
      if (pointerId !== undefined) return;
      if (event.button !== 0 && event.pointerType === "mouse") return;
      if (options.allow && !options.allow(event)) return;
      pointerId = event.pointerId;
      forgetClick();
      stopGlide();
      startPointerX = event.clientX;
      startPointerY = event.clientY;
      startX = ax.pos;
      startY = ay.pos;
      started = false;
      samples = [{ t: clock.now(), x: event.clientX, y: event.clientY }];
      el.setPointerCapture?.(event.pointerId);
    };

    const onMove = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return;
      const dx = event.clientX - startPointerX;
      const dy = event.clientY - startPointerY;
      if (!started) {
        const distance =
          axisMode === "x" ? Math.abs(dx) : axisMode === "y" ? Math.abs(dy) : Math.hypot(dx, dy);
        if (distance < threshold) return;
        started = true;
        suppressClick = true;
        setDragging(true);
        options.onStart?.(info());
      }
      samples.push({ t: clock.now(), x: event.clientX, y: event.clientY });
      if (samples.length > 24) samples.shift();
      if (axisMode !== "y") ax.pos = rubberBand(startX + dx, ...limits("x"), elastic);
      if (axisMode !== "x") ay.pos = rubberBand(startY + dy, ...limits("y"), elastic);
      const [vx, vy] = speedOf();
      ax.vel = axisMode === "y" ? 0 : vx;
      ay.vel = axisMode === "x" ? 0 : vy;
      publish();
      options.onMove?.(info());
    };

    const finish = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return;
      pointerId = undefined;
      el.releasePointerCapture?.(event.pointerId);
      if (!started) return;
      started = false;
      // The click of a press is dispatched in the same task as its pointerup. A drag that ends with no
      // click (a touch drag never has one) must not keep the flag: the next click may come from the
      // keyboard, with no pointer press to clear it, and would be swallowed.
      clickTimer ??= setTimeout(forgetClick, 0);
      const [vx, vy] = speedOf();
      setDragging(false);
      ax.vel = axisMode === "y" ? 0 : vx;
      ay.vel = axisMode === "x" ? 0 : vy;
      options.onEnd?.(info());
      if (axisMode !== "y") release(ax, "x", ax.vel);
      if (axisMode !== "x") release(ay, "y", ay.vel);
      startGlide();
    };

    const swallowClick = (event: Event): void => {
      if (!suppressClick) return;
      forgetClick();
      event.preventDefault();
      event.stopPropagation();
    };
    // The browser's own drag of images and links would take over the pointer.
    const noNativeDrag = (event: Event): void => event.preventDefault();

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", finish);
    el.addEventListener("pointercancel", finish);
    el.addEventListener("click", swallowClick, true);
    el.addEventListener("dragstart", noNativeDrag, true);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", finish);
      el.removeEventListener("pointercancel", finish);
      el.removeEventListener("click", swallowClick, true);
      el.removeEventListener("dragstart", noNativeDrag, true);
      el.style.touchAction = "";
    };
  };

  let detach: (() => void) | undefined;
  const ref = (next: HTMLElement | undefined): (() => void) | undefined => {
    if (next !== undefined && next === element) return undefined;
    detach?.();
    detach = undefined;
    element = next;
    if (next === undefined) return undefined;
    const own = attach(next);
    detach = own;
    // Run when the element's owner is disposed (ShadowJS and React 19 ref cleanup).
    return () => {
      if (detach !== own) return;
      own();
      detach = undefined;
      element = undefined;
    };
  };
  onCleanup(() => {
    stopGlide();
    forgetClick();
    detach?.();
    detach = undefined;
    element = undefined;
  });

  return {
    ref,
    x,
    y,
    velocityX,
    velocityY,
    dragging,
    style,
    set(nextX, nextY) {
      stopGlide();
      ax.pos = nextX;
      ay.pos = nextY;
      ax.vel = 0;
      ay.vel = 0;
      publish();
    },
    moveTo(nextX, nextY) {
      if (reduced()) {
        stopGlide();
        ax.pos = nextX;
        ay.pos = nextY;
        ax.vel = 0;
        ay.vel = 0;
        publish();
        return;
      }
      ax.target = nextX;
      ay.target = nextY;
      ax.mode = "spring";
      ay.mode = "spring";
      startGlide();
    },
  };
}
