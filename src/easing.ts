/**
 * Easing functions: each maps progress in `[0, 1]` to a value that is 0 at the start and 1 at the
 * end. Each is a few arithmetic operations, so a bundle that uses one pays for one.
 * @packageDocumentation
 */

/**
 * An easing function: maps progress in `[0, 1]` (the share of the duration that has passed) to the
 * share of the distance covered. It returns `0` at `0` and `1` at `1`. Pass one to
 * {@link TweenOptions.ease}.
 *
 * @example
 * ```ts
 * import { type Easing, useTween } from "@shadow-js/motion";
 * import { useSignal } from "@shadow-js/core";
 *
 * // Quadratic ease-out.
 * const easeOutQuad: Easing = (progress) => 1 - (1 - progress) ** 2;
 * const [target] = useSignal(100);
 * const x = useTween(target, { duration: 250, ease: easeOutQuad });
 * ```
 * @see {@link easings}
 * @since 1.0.0
 */
export type Easing = (progress: number) => number;

/**
 * The built-in easings by name: `linear` and the cubic `easeIn`, `easeOut` and `easeInOut`. Each
 * returns `0` at progress `0` and `1` at progress `1`. `easeOut` is the default of
 * {@link useTween}.
 *
 * @example
 * ```ts
 * import { useSignal } from "@shadow-js/core";
 * import { easings, useTween } from "@shadow-js/motion";
 *
 * console.log(easings.easeInOut(0.5)); // 0.5
 * const [width] = useSignal(320);
 * const animated = useTween(width, { duration: 400, ease: easings.easeInOut });
 * ```
 * @since 1.0.0
 */
export const easings = {
  /** Constant speed: returns the progress unchanged. */
  linear: ((progress: number): number => progress) as Easing,
  /** Starts quickly and slows at the end (cubic): `1 - (1 - p) ** 3`. */
  easeOut: ((progress: number): number => 1 - (1 - progress) ** 3) as Easing,
  /** Starts slowly and speeds up (cubic): `p ** 3`. */
  easeIn: ((progress: number): number => progress ** 3) as Easing,
  /** Slow at both ends and fastest in the middle (cubic); `0.5` at the midpoint. */
  easeInOut: ((progress: number): number =>
    progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2) as Easing,
} as const;
