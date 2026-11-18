/**
 * `useSpringValue` and `stagger`: a number you send somewhere with a spring, by command, with a delay
 * and a starting speed, and the delays that make several of them run one after another (prints dealt
 * onto a table, a list that comes in item by item).
 * @packageDocumentation
 */
import { type Accessor, batch, onCleanup, untrack, useSignal } from "@shadow-js/core";
import { frameClock, type MotionClock } from "./clock";
import { prefersReducedMotionNow } from "./reduced-motion";

/**
 * The physics of a spring. Each move may override them.
 * @since 1.1.0
 */
export interface SpringPhysics {
  /** The pull toward the target per unit of distance. Must be positive. @default 170 */
  readonly stiffness?: number;
  /** The drag per unit of speed. Lower overshoots more. Must not be negative. @default 26 */
  readonly damping?: number;
  /** Mass of the moving value; higher is slower. Must be positive. @default 1 */
  readonly mass?: number;
  /** Distance and speed under which the move has arrived. @default 0.01 */
  readonly precision?: number;
}

/**
 * Options of {@link useSpringValue}. Read once, when the hook is called.
 * @since 1.1.0
 */
export interface SpringValueOptions extends SpringPhysics {
  /** The frame clock. @default frameClock */
  readonly clock?: MotionClock;
  /**
   * Whether reduced motion is on when a move starts; with it the value goes to the target at once.
   * @default follows the system preference
   */
  readonly reducedMotion?: () => boolean;
}

/**
 * One move of a {@link SpringValue}.
 * @since 1.1.0
 */
export interface SpringMove extends SpringPhysics {
  /** Milliseconds to wait before moving. The value stays where it is meanwhile. @default 0 */
  readonly delay?: number;
  /** The speed to start with, in units per second (a throw). @default the current speed */
  readonly velocity?: number;
}

/**
 * What {@link useSpringValue} returns: the value as an accessor, and the commands that move it.
 * @since 1.1.0
 */
export interface SpringValue extends Accessor<number> {
  /** The current speed in units per second. */
  readonly velocity: Accessor<number>;
  /** `true` while a move is waiting for its delay or moving. */
  readonly moving: Accessor<boolean>;
  /**
   * Sends the value to `target`. A move already running is replaced: its promise resolves `false`,
   * and the new one starts from the current place and speed (unless `velocity` says otherwise).
   * @returns Resolves `true` when the value arrives, `false` when it is stopped or replaced first.
   */
  to(target: number, move?: SpringMove): Promise<boolean>;
  /** Puts the value at `value` now, with no speed; a running move resolves `false`. */
  set(value: number): void;
  /** Stops where it is; a running move resolves `false`. */
  stop(): void;
}

const MAX_FRAME = 0.064;
const SUBSTEP = 1 / 120;

/**
 * A number that moves with a spring when you tell it to. Unlike {@link useSpring}, which follows a
 * source, it is driven by commands: `to(target, { delay, velocity })` returns a promise, so moves can
 * be chained (`await x.to(900); await x.to(0)`) or run together (`Promise.all`). Use
 * {@link stagger} for the delays of a group. It asks for frames only while moving, and its pending
 * frame is canceled when the owner is disposed. A move writes the value's signals, so start it from
 * an event handler, `onMount` or an effect, not while a component renders.
 *
 * @param initial The starting value.
 * @param options Default physics, the clock and reduced motion.
 * @returns The value with its commands.
 * @example
 * ```tsx
 * import { onMount } from "@shadow-js/core";
 * import { stagger, useSpringValue } from "@shadow-js/motion";
 *
 * export function Card(props: { index: number }) {
 *   const y = useSpringValue(240, { stiffness: 140, damping: 20 });
 *   onMount(() => void y.to(0, { delay: stagger(75, { start: 350 })(props.index) }));
 *   return <article style={`transform: translateY(${y()}px)`}>Print</article>;
 * }
 * ```
 * @since 1.1.0
 */
export function useSpringValue(initial: number, options: SpringValueOptions = {}): SpringValue {
  const clock = options.clock ?? frameClock;
  const reduced = (): boolean => (options.reducedMotion ?? prefersReducedMotionNow)();
  const [value, setValue] = useSignal(initial);
  const [speed, setSpeed] = useSignal(0);
  const [moving, setMoving] = useSignal(false);

  let position = initial;
  let velocity = 0;
  let target = initial;
  let physics: Required<SpringPhysics> = {
    stiffness: 170,
    damping: 26,
    mass: 1,
    precision: 0.01,
  };
  let startAt = 0;
  let last = 0;
  let handle: unknown;
  let resolve: ((arrived: boolean) => void) | undefined;

  const publish = (): void => {
    batch(() => {
      setValue(position);
      setSpeed(velocity);
    });
  };
  const end = (arrived: boolean): void => {
    if (handle !== undefined) clock.cancel(handle);
    handle = undefined;
    setMoving(false);
    const done = resolve;
    resolve = undefined;
    done?.(arrived);
  };

  const tick = (now: number): void => {
    handle = undefined;
    if (now < startAt) {
      last = now;
      handle = clock.request(tick);
      return;
    }
    const seconds = Math.min(Math.max(0, now - Math.max(last, startAt)) / 1000, MAX_FRAME);
    last = now;
    const { stiffness, damping, mass, precision } = physics;
    const steps = Math.max(1, Math.ceil(seconds / SUBSTEP));
    const dt = seconds / steps;
    const before = position;
    const beforeVelocity = velocity;
    for (let step = 0; step < steps; step += 1) {
      const force = -stiffness * (position - target) - damping * velocity;
      velocity += (force / mass) * dt;
      position += velocity * dt;
    }
    // Physics that cannot settle (no restoring force, negative values, a NaN) snaps to the target,
    // as does a state that floating point can no longer change.
    const broken =
      !Number.isFinite(position) ||
      !Number.isFinite(velocity) ||
      !(stiffness > 0) ||
      !(mass > 0) ||
      !(damping >= 0) ||
      !(precision > 0) ||
      !Number.isFinite(precision);
    const stalled =
      seconds > 0 && damping > 0 && position === before && velocity === beforeVelocity;
    if (
      broken ||
      stalled ||
      (Math.abs(position - target) < precision && Math.abs(velocity) < precision)
    ) {
      position = target;
      velocity = 0;
      publish();
      end(true);
      return;
    }
    publish();
    handle = clock.request(tick);
  };

  const self = (() => value()) as SpringValue;
  Object.assign(self, {
    velocity: speed,
    moving,
    to(next: number, move: SpringMove = {}): Promise<boolean> {
      return untrack(() => {
        end(false);
        target = next;
        physics = {
          stiffness: move.stiffness ?? options.stiffness ?? 170,
          damping: move.damping ?? options.damping ?? 26,
          mass: move.mass ?? options.mass ?? 1,
          precision: move.precision ?? options.precision ?? 0.01,
        };
        if (reduced()) {
          position = next;
          velocity = 0;
          publish();
          return Promise.resolve(true);
        }
        if (move.velocity !== undefined) velocity = move.velocity;
        if (position === next && velocity === 0) return Promise.resolve(true);
        const delay = Math.max(0, move.delay ?? 0);
        const now = clock.now();
        startAt = now + (Number.isFinite(delay) ? delay : 0);
        last = now;
        setMoving(true);
        handle = clock.request(tick);
        return new Promise<boolean>((done) => {
          resolve = done;
        });
      });
    },
    set(next: number): void {
      untrack(() => {
        end(false);
        position = next;
        target = next;
        velocity = 0;
        publish();
      });
    },
    stop(): void {
      untrack(() => {
        end(false);
        velocity = 0;
        publish();
      });
    },
  });
  onCleanup(() => end(false));
  return self;
}

/**
 * Options of {@link stagger}.
 * @since 1.1.0
 */
export interface StaggerOptions {
  /** Milliseconds before the first item. @default 0 */
  readonly start?: number;
  /**
   * Which item goes first: `"first"`, `"last"`, `"center"` (spreading outward) or an index. `"last"`
   * and `"center"` need `count`.
   * @default "first"
   */
  readonly from?: "first" | "last" | "center" | number;
  /** How many items there are; needed by `from: "last"` and `"center"`. */
  readonly count?: number;
  /** The most any item waits, in milliseconds (a long list still finishes on time). */
  readonly max?: number;
}

/**
 * The delays of a group of moves that start one after another, `each` milliseconds apart.
 *
 * @param each Milliseconds between two neighbors.
 * @param options The first delay, the item that goes first, the count and a ceiling.
 * @returns A function from an item's index to its delay in milliseconds.
 * @example
 * ```ts
 * import { stagger } from "@shadow-js/motion";
 *
 * const delay = stagger(60, { start: 300, max: 600 });
 * console.log(delay(0), delay(2), delay(20)); // 300 420 600
 * const fromCenter = stagger(50, { from: "center", count: 5 });
 * console.log(fromCenter(0), fromCenter(2)); // 100 0
 * ```
 * @since 1.1.0
 */
export function stagger(each: number, options: StaggerOptions = {}): (index: number) => number {
  const start = options.start ?? 0;
  const from = options.from ?? "first";
  const count = options.count;
  if ((from === "last" || from === "center") && (count === undefined || !(count >= 0))) {
    throw new RangeError(`stagger: from "${from}" needs a count of items`);
  }
  const origin =
    from === "first"
      ? 0
      : from === "last"
        ? (count as number) - 1
        : from === "center"
          ? ((count as number) - 1) / 2
          : from;
  return (index) => {
    const delay = start + Math.abs(index - origin) * each;
    return options.max === undefined ? delay : Math.min(options.max, delay);
  };
}
