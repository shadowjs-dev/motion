/**
 * `useTween`: an accessor that eases from its current value to a source's value over a duration.
 * Each frame writes one signal, so only the readers of the value update.
 * @packageDocumentation
 */
import { type Accessor, onCleanup, untrack, useEffect, useSignal } from "@shadow-js/core";
import { frameClock, type MotionClock } from "./clock";
import { type Easing, easings } from "./easing";
import { useReducedMotion } from "./reduced-motion";

/**
 * Options of {@link useTween}. Each is read once, when the hook is called.
 *
 * @example
 * ```ts
 * import { useSignal } from "@shadow-js/core";
 * import { easings, type TweenOptions, useTween } from "@shadow-js/motion";
 *
 * const options: TweenOptions = { duration: 500, ease: easings.easeInOut };
 * const [progress] = useSignal(1);
 * const bar = useTween(progress, options);
 * ```
 * @since 1.0.0
 */
export interface TweenOptions {
  /**
   * Duration of one tween in milliseconds. Zero, a negative number, or a value that is not finite
   * (NaN, Infinity) makes the value jump to the target.
   * @default 300
   */
  readonly duration?: number;
  /**
   * The easing applied to the progress of each tween.
   * @default easings.easeOut
   */
  readonly ease?: Easing;
  /**
   * The frame clock.
   * @default frameClock
   */
  readonly clock?: MotionClock;
  /**
   * Whether reduced motion is on; while it returns `true`, a new target is taken at once. When it is
   * not given, the hook calls {@link useReducedMotion} to follow the system preference.
   */
  readonly reducedMotion?: Accessor<boolean>;
}

/**
 * Eases a number toward `source()`: each time the source changes, the value moves from where it is
 * now to the new target over `duration`. A change in the middle of a tween starts a new tween from
 * the current value. With reduced motion, or a duration that is not a finite positive number, the
 * value jumps to the target. Once a tween ends no more frames are requested. Call it in a component
 * or another owner: it runs in an effect, and its pending frame is canceled when the owner is
 * disposed.
 *
 * @param source The target value.
 * @param options Duration, easing, clock and reduced motion.
 * @returns The animated value, starting at the source's current value.
 * @example
 * ```tsx
 * import { useSignal } from "@shadow-js/core";
 * import { useTween } from "@shadow-js/motion";
 *
 * export function Slider() {
 *   const [target, setTarget] = useSignal(0);
 *   const x = useTween(target, { duration: 200 });
 *   return (
 *     <div>
 *       <button type="button" onClick={() => setTarget(target() === 0 ? 240 : 0)}>
 *         Move
 *       </button>
 *       <div class="knob" style={`transform: translateX(${x()}px)`} />
 *     </div>
 *   );
 * }
 * ```
 * @see {@link useSpring}
 * @since 1.0.0
 */
export function useTween(source: Accessor<number>, options: TweenOptions = {}): Accessor<number> {
  const clock = options.clock ?? frameClock;
  const reduced = options.reducedMotion ?? useReducedMotion();
  const duration = options.duration ?? 300;
  const ease = options.ease ?? easings.easeOut;
  const [value, setValue] = useSignal(untrack(source));
  let handle: unknown;
  const stop = (): void => {
    if (handle !== undefined) clock.cancel(handle);
    handle = undefined;
  };
  useEffect(() => {
    const to = source();
    stop();
    const from = untrack(value);
    // A duration that is not a finite positive number (NaN, Infinity, zero, negative) cannot pace
    // frames, so the value jumps; a NaN here would otherwise make the value NaN for good.
    if (!(duration > 0 && duration < Number.POSITIVE_INFINITY) || reduced() || from === to) {
      setValue(to);
      return;
    }
    const startedAt = clock.now();
    const step = (now: number): void => {
      const progress = Math.min(1, Math.max(0, (now - startedAt) / duration));
      setValue(from + (to - from) * ease(progress));
      handle = progress < 1 ? clock.request(step) : undefined;
    };
    handle = clock.request(step);
  });
  onCleanup(stop);
  return value;
}
