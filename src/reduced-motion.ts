/**
 * The reduced-motion preference as a signal. It follows the operating system's setting through
 * `matchMedia` and updates when the setting changes. Motion code checks it and jumps to the end
 * state instead of animating.
 * @packageDocumentation
 */
import { type Accessor, onMount, useSignal } from "@shadow-js/core";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Reads the reduced-motion preference once, through `matchMedia("(prefers-reduced-motion: reduce)")`.
 * Use it outside a component, or for a one-off decision; {@link useReducedMotion} follows changes.
 *
 * @returns `true` when the user asks for reduced motion; `false` where there is no `window` or no
 *   `matchMedia` (servers, some test environments).
 * @example
 * ```ts
 * import { animate, prefersReducedMotionNow } from "@shadow-js/motion";
 *
 * export function highlight(element: HTMLElement): void {
 *   if (prefersReducedMotionNow()) {
 *     element.style.outline = "2px solid orange";
 *     return;
 *   }
 *   animate(element, [{ outlineColor: "orange" }, { outlineColor: "transparent" }], { duration: 600 });
 * }
 * ```
 * @since 1.0.0
 */
export function prefersReducedMotionNow(): boolean {
  // `typeof` is safe where there is no window at all, so one check covers servers and old engines.
  if (typeof matchMedia !== "function") return false;
  return matchMedia(QUERY).matches;
}

/**
 * An accessor that is true while the user asks for reduced motion. It starts with
 * {@link prefersReducedMotionNow}, then follows the `matchMedia` change event from the owner's
 * mount until the owner is disposed. Read it inside an effect or in JSX to follow changes. The
 * motion hooks use it when their `reducedMotion` option is not given.
 *
 * @returns The preference as an accessor. Always `false` where there is no `matchMedia`.
 * @example
 * ```tsx
 * import { useReducedMotion } from "@shadow-js/motion";
 *
 * export function Spinner() {
 *   const reduced = useReducedMotion();
 *   return <span class={reduced() ? "spinner-static" : "spinner"} aria-label="Loading" />;
 * }
 * ```
 * @since 1.0.0
 */
export function useReducedMotion(): Accessor<boolean> {
  const [reduced, setReduced] = useSignal(prefersReducedMotionNow());
  onMount(() => {
    if (typeof matchMedia !== "function") return undefined;
    const query = matchMedia(QUERY);
    const update = (): void => {
      setReduced(query.matches);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  });
  return reduced;
}
