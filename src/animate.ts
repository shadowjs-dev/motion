/**
 * `animate`: plays keyframes on an element with the Web Animations API, and applies the final
 * keyframe at once where that API is missing. Reduced motion turns the duration and the delays to zero.
 * @packageDocumentation
 */
import { prefersReducedMotionNow } from "./reduced-motion";

/**
 * Options of {@link animate}: the Web Animations `KeyframeAnimationOptions` (`duration`, `easing`,
 * `delay`, `fill`, `iterations` and the rest, passed to `element.animate`), plus `reducedMotion`.
 *
 * @example
 * ```ts
 * import { type AnimateOptions, animate } from "@shadow-js/motion";
 *
 * const slideIn: AnimateOptions = { duration: 300, easing: "ease-out", fill: "both" };
 * export function show(drawer: HTMLElement): Promise<void> {
 *   return animate(drawer, [{ transform: "translateX(100%)" }, { transform: "none" }], slideIn)
 *     .finished;
 * }
 * ```
 * @since 1.0.0
 */
export interface AnimateOptions extends KeyframeAnimationOptions {
  /**
   * `true` sets the duration, `delay` and `endDelay` to `0`, so the animation ends at once on its last keyframe; `false`
   * plays it whatever the system says. When it is not given (or is `undefined`),
   * {@link prefersReducedMotionNow} decides when `animate` is called.
   */
  readonly reducedMotion?: boolean | undefined;
}

/**
 * What {@link animate} returns: a promise for the end of the animation, and controls to stop it.
 *
 * @example
 * ```ts
 * import { animate } from "@shadow-js/motion";
 *
 * export async function pulse(badge: HTMLElement, signal: AbortSignal): Promise<void> {
 *   const handle = animate(badge, [{ opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }], {
 *     duration: 1200,
 *     iterations: 3,
 *   });
 *   signal.addEventListener("abort", () => handle.cancel());
 *   await handle.finished;
 * }
 * ```
 * @since 1.0.0
 */
export interface AnimationHandle {
  /**
   * Resolves when the animation finishes or is canceled; it never rejects. Without Web Animations it
   * is already resolved.
   */
  readonly finished: Promise<void>;
  /**
   * Cancels the animation (`Animation.cancel`): its effect is removed, so the element shows its own
   * style again, and `finished` resolves. Does nothing without Web Animations.
   */
  cancel(): void;
  /**
   * Jumps to the end of the animation (`Animation.finish`), and `finished` resolves. Does nothing
   * without Web Animations.
   */
  finish(): void;
}

/** The no-op that ends a promise chain and stands in for a cancel that has nothing to cancel. @internal */
export const NOTHING = (): void => undefined;

/**
 * Animates `element` through `keyframes` with the Web Animations API (`element.animate`). The
 * keyframes are the Web Animations ones: an array of style objects, or an object of arrays. With
 * reduced motion the duration, `delay` and `endDelay` are `0`; the duration is `0` too when it is NaN,
 * negative or infinite.
 * Without `element.animate`, the last keyframe is written to the element's inline style at once (an
 * `HTMLElement` only; `offset`, `easing` and `composite` are skipped, and camelCase names become
 * kebab-case) and the returned handle is already finished.
 *
 * @param element The element to animate.
 * @param keyframes The keyframes.
 * @param options Duration, easing, fill and the reduced-motion flag.
 * @returns The handle: `finished`, `cancel` and `finish`.
 * @example
 * ```ts
 * import { animate } from "@shadow-js/motion";
 *
 * export async function flash(panel: HTMLElement): Promise<void> {
 *   const handle = animate(
 *     panel,
 *     [{ backgroundColor: "#fef08a" }, { backgroundColor: "transparent" }],
 *     { duration: 400, easing: "ease-out" },
 *   );
 *   await handle.finished;
 * }
 * ```
 * @see {@link Presence}
 * @since 1.0.0
 */
export function animate(
  element: Element,
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  options: AnimateOptions = {},
): AnimationHandle {
  const reduce = options.reducedMotion ?? prefersReducedMotionNow();
  // A duration the browser cannot play (NaN, negative, infinite) ends at once, as reduced motion does.
  // A missing duration is NaN here too, and plays as zero, which is the browser's default.
  const length = Number(options.duration);
  const timing: AnimateOptions = reduce
    ? { ...options, duration: 0, delay: 0, endDelay: 0 }
    : length >= 0 && length < Number.POSITIVE_INFINITY
      ? options
      : { ...options, duration: 0 };
  if (typeof element.animate === "function") {
    const animation = element.animate(keyframes, timing);
    return {
      finished: animation.finished.then(NOTHING, NOTHING),
      cancel: () => animation.cancel(),
      finish: () => animation.finish(),
    };
  }
  // Without Web Animations the last keyframe is the end state. Its values are written to the style
  // of an HTMLElement (`typeof` guards the server, where HTMLElement does not exist).
  if (typeof HTMLElement === "function" && element instanceof HTMLElement) {
    const last: Readonly<Record<string, unknown>> = Array.isArray(keyframes)
      ? { ...keyframes.at(-1) }
      : keyframes;
    for (const [key, values] of Object.entries(last)) {
      // A value is a list (its last entry is the end state) or a single value.
      const value = [values].flat().at(-1);
      if (value === undefined || key === "offset" || key === "easing" || key === "composite") {
        continue;
      }
      // A camelCase keyframe name (`marginTop`) is the CSS property (`margin-top`).
      element.style.setProperty(
        key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
        String(value),
      );
    }
  }
  return { finished: Promise.resolve(), cancel: NOTHING, finish: NOTHING };
}
