/**
 * The frame clock the animations run on. The default uses `requestAnimationFrame` and
 * `performance.now`; tests inject a clock they advance by hand.
 * @packageDocumentation
 */

/**
 * The frame source of {@link useTween} and {@link useSpring}: the current time, and one callback
 * per frame. `request` returns a handle that `cancel` takes back. The default is
 * {@link frameClock}; tests pass a clock they advance by hand, so no test waits on a real frame.
 *
 * @example
 * ```ts
 * import { createRoot, flushSync, useSignal } from "@shadow-js/core";
 * import { easings, type MotionClock, useTween } from "@shadow-js/motion";
 *
 * let time = 0;
 * const callbacks = new Map<number, (now: number) => void>();
 * let nextHandle = 1;
 * const clock: MotionClock = {
 *   now: () => time,
 *   request(callback) {
 *     const handle = nextHandle;
 *     nextHandle += 1;
 *     callbacks.set(handle, callback);
 *     return handle;
 *   },
 *   cancel(handle) {
 *     if (typeof handle === "number") callbacks.delete(handle);
 *   },
 * };
 * function frame(elapsed: number): void {
 *   time += elapsed;
 *   const due = [...callbacks.values()];
 *   callbacks.clear();
 *   for (const callback of due) callback(time);
 *   flushSync();
 * }
 *
 * const [target, setTarget] = useSignal(0);
 * const value = createRoot(() =>
 *   useTween(target, { duration: 100, ease: easings.linear, clock, reducedMotion: () => false }),
 * );
 * setTarget(100);
 * flushSync();
 * frame(50);
 * console.log(value()); // 50
 * ```
 * @since 1.0.0
 */
export interface MotionClock {
  /** The current time in milliseconds, on the same scale as the `now` passed to callbacks. */
  now(): number;
  /**
   * Calls `callback` once, at the next frame, with that frame's time in milliseconds.
   * @param callback The frame callback.
   * @returns A handle for {@link MotionClock.cancel}.
   */
  request(callback: (now: number) => void): unknown;
  /**
   * Stops a callback that was requested and has not run yet.
   * @param handle The value `request` returned.
   */
  cancel(handle: unknown): void;
}

/**
 * The browser's clock, the default of every motion hook. `now` is `performance.now()` (`Date.now()`
 * where `performance` is missing); frames come from `requestAnimationFrame`, or from a 16 ms
 * timer where it is missing.
 *
 * @example
 * ```ts
 * import { frameClock } from "@shadow-js/motion";
 *
 * const started = frameClock.now();
 * const handle = frameClock.request((now) => {
 *   console.log(`first frame after ${now - started} ms`);
 * });
 * // Changed our mind before the frame:
 * frameClock.cancel(handle);
 * ```
 * @since 1.0.0
 */
export const frameClock: MotionClock = {
  now: () => (typeof performance === "undefined" ? Date.now() : performance.now()),
  request: (callback) =>
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(callback)
      : globalThis.setTimeout(() => callback(frameClock.now()), 16),
  cancel: (handle) => {
    if (typeof cancelAnimationFrame === "function" && typeof handle === "number") {
      cancelAnimationFrame(handle);
    } else {
      globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
    }
  },
};
