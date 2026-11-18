/**
 * `interpolate` and `useTransform`: map one number onto another along a list of stops. The classic use
 * is scroll progress to scale, opacity or a translation: `useTransform(progress, [0, 1], [1, 0.9])`.
 * @packageDocumentation
 */
import { type Accessor, useMemo } from "@shadow-js/core";
import type { Easing } from "./easing";

/**
 * Options of {@link interpolate} and {@link useTransform}.
 * @since 1.1.0
 */
export interface TransformOptions {
  /**
   * Whether an input outside the first and last stop stays at the nearest output. With `false` the
   * first and last segment continue past the ends.
   * @default true
   */
  readonly clamp?: boolean;
  /**
   * The easing of each segment between two stops, applied to the progress inside that segment.
   * @default linear
   */
  readonly ease?: Easing;
}

/**
 * A function from an input value to an output value along the stops: where the input is between two
 * input stops, the output is between the two matching output stops.
 *
 * @param input The input stops, strictly increasing, at least two.
 * @param output The output stops, one per input stop.
 * @param options Clamping and the easing of each segment.
 * @returns The mapping function.
 * @throws RangeError when the stops are not paired, fewer than two, not finite, or not increasing.
 * @example
 * ```ts
 * import { interpolate } from "@shadow-js/motion";
 *
 * const tilt = interpolate([-300, 0, 300], [-14, 0, 14]);
 * tilt(150); // 7
 * tilt(900); // 14 (clamped)
 * ```
 * @since 1.1.0
 */
export function interpolate(
  input: readonly number[],
  output: readonly number[],
  options: TransformOptions = {},
): (value: number) => number {
  if (input.length < 2) throw new RangeError("interpolate needs at least two stops");
  if (input.length !== output.length) {
    throw new RangeError(
      `interpolate needs one output per input stop (got ${input.length} and ${output.length})`,
    );
  }
  for (let index = 0; index < input.length; index += 1) {
    const stop = input[index] as number;
    if (!Number.isFinite(stop) || !Number.isFinite(output[index] as number)) {
      throw new RangeError("interpolate stops must be finite numbers");
    }
    if (index > 0 && stop <= (input[index - 1] as number)) {
      throw new RangeError("interpolate input stops must be strictly increasing");
    }
  }
  const clamp = options.clamp ?? true;
  const ease = options.ease;
  const last = input.length - 1;
  return (value) => {
    if (clamp) {
      if (value <= (input[0] as number)) return output[0] as number;
      if (value >= (input[last] as number)) return output[last] as number;
    }
    // The segment holding the value; beyond the ends, the first or the last one.
    let segment = 0;
    while (segment < last - 1 && value > (input[segment + 1] as number)) segment += 1;
    const from = input[segment] as number;
    const to = input[segment + 1] as number;
    const raw = (value - from) / (to - from);
    const progress = ease !== undefined && raw >= 0 && raw <= 1 ? ease(raw) : raw;
    const start = output[segment] as number;
    const end = output[segment + 1] as number;
    return start + (end - start) * progress;
  };
}

/**
 * An accessor that maps `source()` along the stops (see {@link interpolate}), or through a function.
 * It is pure and synchronous: it moves exactly when the source moves, so tying it to scroll progress
 * keeps the result glued to the scroll position with no lag.
 *
 * @param source The value to map.
 * @param input The input stops.
 * @param output The output stops.
 * @param options Clamping and easing.
 * @returns The mapped value.
 * @example
 * ```tsx
 * import { useScroll, useTransform } from "@shadow-js/motion";
 *
 * export function Hero() {
 *   const { yProgress } = useScroll();
 *   const opacity = useTransform(yProgress, [0, 0.4], [1, 0]);
 *   return <h1 style={`opacity: ${opacity()}`}>Hello</h1>;
 * }
 * ```
 * @since 1.1.0
 */
export function useTransform(
  source: Accessor<number>,
  input: readonly number[],
  output: readonly number[],
  options?: TransformOptions,
): Accessor<number>;
/**
 * Maps `source()` through a function of your own.
 *
 * @param source The value to map.
 * @param map The function.
 * @returns The mapped value.
 * @since 1.1.0
 */
export function useTransform<T>(source: Accessor<number>, map: (value: number) => T): Accessor<T>;
export function useTransform<T>(
  source: Accessor<number>,
  second: readonly number[] | ((value: number) => T),
  output?: readonly number[],
  options?: TransformOptions,
): Accessor<number> | Accessor<T> {
  if (typeof second === "function") return useMemo(() => second(source()));
  const map = interpolate(second, output ?? [], options);
  return useMemo(() => map(source()));
}
