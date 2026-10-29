/**
 * `useSpring`: an accessor that follows a source with a damped spring. It keeps its velocity when
 * the target moves, so it never jumps, and it overshoots when underdamped.
 * @packageDocumentation
 */
import { type Accessor, onCleanup, untrack, useEffect, useSignal } from "@shadow-js/core";
import { frameClock, type MotionClock } from "./clock";
import { useReducedMotion } from "./reduced-motion";

/**
 * Options of {@link useSpring}: the physics of the spring, the clock and reduced motion. Each is read
 * once, when the hook is called. Time in the integration is in seconds, and a single step is capped
 * at 64 ms, so a late frame does not make the spring jump.
 *
 * @example
 * ```ts
 * import { useSignal } from "@shadow-js/core";
 * import { type SpringOptions, useSpring } from "@shadow-js/motion";
 *
 * // Bouncy: low damping overshoots the target before it settles.
 * const bouncy: SpringOptions = { stiffness: 300, damping: 8 };
 * const [scale] = useSignal(1);
 * const animated = useSpring(scale, bouncy);
 * ```
 * @since 1.0.0
 */
export interface SpringOptions {
  /**
   * Spring stiffness: the pull toward the target per unit of distance. Higher reaches the target
   * faster. Must be positive: a spring with no restoring force, or one that pushes away from the
   * target, cannot settle, so it snaps to the target on its first frame.
   * @default 170
   */
  readonly stiffness?: number;
  /**
   * Damping: the drag per unit of velocity. Lower overshoots more; `0` never settles. Must not be
   * negative (a negative damping snaps to the target on the first frame).
   * @default 26
   */
  readonly damping?: number;
  /**
   * Mass of the moving value. Higher is slower. Must be positive (otherwise the spring snaps to the
   * target on its first frame).
   * @default 1
   */
  readonly mass?: number;
  /**
   * How close counts as settled: once both the distance to the target and the velocity are below
   * it, the value is set to the target exactly and no more frames are requested. Must be positive
   * and finite; invalid precision snaps on the next frame. A damped spring also settles when its
   * state reaches a floating-point fixed point, even if the requested precision is smaller.
   * @default 0.01
   */
  readonly precision?: number;
  /**
   * The frame clock.
   * @default frameClock
   */
  readonly clock?: MotionClock;
  /**
   * Whether reduced motion is on; while it returns `true`, a new target is taken at once with no
   * velocity. When it is not given, the hook calls {@link useReducedMotion} to follow the system
   * preference.
   */
  readonly reducedMotion?: Accessor<boolean>;
}

/** The longest step the integrator takes, in seconds: a frame that was late does not explode. */
const MAX_STEP = 0.064;

/**
 * Follows `source()` with a damped spring. A new target in the middle of a move keeps the current
 * velocity, so the value never jumps; an underdamped spring overshoots before it settles. The spring
 * stops asking for frames once it is settled, so an idle value costs nothing. With reduced motion
 * the value jumps to the target. Call it in a component or another owner: it runs in an effect, and
 * its pending frame is canceled when the owner is disposed.
 *
 * @param source The target value.
 * @param options Stiffness, damping, mass, precision, clock and reduced motion.
 * @returns The animated value, starting at the source's current value.
 * @example
 * ```tsx
 * import { useSignal } from "@shadow-js/core";
 * import { useSpring } from "@shadow-js/motion";
 *
 * export function PressableCard() {
 *   const [pressed, setPressed] = useSignal(false);
 *   const scale = useSpring(() => (pressed() ? 0.95 : 1), { stiffness: 220, damping: 18 });
 *   return (
 *     <button
 *       type="button"
 *       onPointerDown={() => setPressed(true)}
 *       onPointerUp={() => setPressed(false)}
 *       style={`transform: scale(${scale()})`}
 *     >
 *       Press
 *     </button>
 *   );
 * }
 * ```
 * @see {@link useTween}
 * @since 1.0.0
 */
export function useSpring(source: Accessor<number>, options: SpringOptions = {}): Accessor<number> {
  const clock = options.clock ?? frameClock;
  const reduced = options.reducedMotion ?? useReducedMotion();
  const stiffness = options.stiffness ?? 170;
  const damping = options.damping ?? 26;
  const mass = options.mass ?? 1;
  const precision = options.precision ?? 0.01;
  const [value, setValue] = useSignal(untrack(source));
  let position = untrack(source);
  let velocity = 0;
  let target = position;
  let last = 0;
  let handle: unknown;
  const stop = (): void => {
    if (handle !== undefined) clock.cancel(handle);
    handle = undefined;
  };
  const tick = (now: number): void => {
    const seconds = Math.min(Math.max(0, now - last) / 1000, MAX_STEP);
    last = now;
    const previousPosition = position;
    const previousVelocity = velocity;
    const force = -stiffness * (position - target) - damping * velocity;
    velocity += (force / mass) * seconds;
    position += velocity * seconds;
    // A non-finite state (a zero mass, a NaN option) never settles by the test below and would ask
    // for frames forever, so it snaps to the target.
    // The same goes for physics that cannot settle: with no restoring force (stiffness 0) the spring
    // never moves yet always misses the target, and a restoring force that points away (negative
    // stiffness, mass or damping) grows without bound.
    const diverged =
      !Number.isFinite(position) ||
      !Number.isFinite(velocity) ||
      !(stiffness > 0) ||
      !(mass > 0) ||
      !(damping >= 0);
    // Below floating-point resolution, damping can no longer change either state value. A zero
    // timestep and undamped oscillation are not convergence, so neither takes this exit.
    const stalled =
      seconds > 0 &&
      stiffness > 0 &&
      damping > 0 &&
      mass > 0 &&
      position === previousPosition &&
      velocity === previousVelocity;
    if (
      diverged ||
      !Number.isFinite(precision) ||
      precision <= 0 ||
      stalled ||
      (Math.abs(position - target) < precision && Math.abs(velocity) < precision)
    ) {
      position = target;
      velocity = 0;
      setValue(target);
      handle = undefined;
      return;
    }
    setValue(position);
    handle = clock.request(tick);
  };
  useEffect(() => {
    target = source();
    if (reduced()) {
      stop();
      position = target;
      velocity = 0;
      untrack(() => setValue(target));
      return;
    }
    if (handle === undefined && (position !== target || velocity !== 0)) {
      last = clock.now();
      handle = clock.request(tick);
    }
  });
  onCleanup(stop);
  return value;
}
