/**
 * FLIP for keyed lists: record where each keyed child is, change the list, then animate each child
 * from its old place to its new one. The browser lays out once for the measurement and once for the
 * change; the animation itself only moves `transform`, so it does not re-layout.
 * @packageDocumentation
 */
import { type AnimationHandle, animate, NOTHING } from "./animate";
import { prefersReducedMotionNow } from "./reduced-motion";

/**
 * Where a keyed child was, as recorded by {@link captureLayout}: the top and left of its bounding
 * box, in pixels relative to the viewport.
 *
 * @example
 * ```ts
 * import { captureLayout, type Place } from "@shadow-js/motion";
 *
 * export function topOf(list: HTMLElement, key: string): number | undefined {
 *   const place: Place | undefined = captureLayout(list).get(key);
 *   return place?.top;
 * }
 * ```
 * @since 1.0.0
 */
export interface Place {
  /** The top of the child's bounding box (`getBoundingClientRect().top`), in pixels. */
  readonly top: number;
  /** The left of the child's bounding box (`getBoundingClientRect().left`), in pixels. */
  readonly left: number;
}

/**
 * Options of {@link playFlip}. `playFlip` also takes `keyAttribute`, the attribute that holds each
 * child's key (default `"data-key"`).
 *
 * @example
 * ```ts
 * import { captureLayout, type FlipOptions, playFlip } from "@shadow-js/motion";
 *
 * const quick: FlipOptions = { duration: 150, easing: "ease-in-out" };
 * export function shuffle(list: HTMLElement): void {
 *   const before = captureLayout(list);
 *   const rows = [...list.children].reverse();
 *   list.replaceChildren(...rows);
 *   playFlip(list, before, quick);
 * }
 * ```
 * @since 1.0.0
 */
export interface FlipOptions {
  /**
   * Duration of each move in milliseconds.
   * @default 250
   */
  readonly duration?: number;
  /**
   * The CSS easing of each move.
   * @default "ease-out"
   */
  readonly easing?: string;
  /**
   * `true` skips the animation: the children are left at their new places. When it is not given,
   * {@link prefersReducedMotionNow} decides.
   */
  readonly reducedMotion?: boolean;
}

/** The move each child is playing, so a second {@link playFlip} can end it before it measures. */
const running = new WeakMap<Element, AnimationHandle>();

/**
 * Records the place of every child of `container` that has the key attribute: the first step of
 * FLIP. Call it before the list changes, then {@link playFlip} after the change is in the DOM.
 * Children without the attribute are skipped.
 *
 * @param container The list element.
 * @param keyAttribute The attribute that holds each child's key. Default `"data-key"`.
 * @returns The places by key, in document order.
 * @example
 * ```tsx
 * import { flushSync, useSignal } from "@shadow-js/core";
 * import { For } from "@shadow-js/web";
 * import { captureLayout, playFlip } from "@shadow-js/motion";
 *
 * export function Sorter() {
 *   const [order, setOrder] = useSignal(["a", "b", "c"]);
 *   let list: HTMLElement | undefined;
 *   const reverse = () => {
 *     if (list === undefined) return;
 *     const before = captureLayout(list);
 *     setOrder([...order()].reverse());
 *     flushSync();
 *     playFlip(list, before);
 *   };
 *   return (
 *     <div>
 *       <button type="button" onClick={reverse}>
 *         Reverse
 *       </button>
 *       <ul
 *         ref={(element: HTMLElement) => {
 *           list = element;
 *         }}
 *       >
 *         <For each={order()}>{(key) => <li data-key={key}>{key}</li>}</For>
 *       </ul>
 *     </div>
 *   );
 * }
 * ```
 * @since 1.0.0
 */
export function captureLayout(container: Element, keyAttribute = "data-key"): Map<string, Place> {
  const places = new Map<string, Place>();
  for (const child of container.children) {
    const key = child.getAttribute(keyAttribute);
    if (key === null) continue;
    // The box is a `DOMRect`, a snapshot with the `top` and `left` a `Place` has.
    places.set(key, child.getBoundingClientRect());
  }
  return places;
}

/**
 * What {@link playFlip} returns: a way to wait for the moves and to stop them.
 *
 * @example
 * ```ts
 * import { captureLayout, type FlipHandle, playFlip } from "@shadow-js/motion";
 *
 * export function reorder(list: HTMLElement): FlipHandle {
 *   const before = captureLayout(list);
 *   list.prepend(list.lastElementChild as Element);
 *   return playFlip(list, before);
 * }
 * ```
 * @since 1.0.0
 */
export interface FlipHandle {
  /** Resolves when every move has finished or been canceled. Never rejects; finished at once when nothing moved. */
  readonly finished: Promise<void>;
  /**
   * Cancels the moves still running (`Animation.cancel`): each child shows its own place at once, and
   * `finished` resolves. A second call does nothing.
   */
  cancel(): void;
}

/**
 * Animates each keyed child that moved since {@link captureLayout}: the last steps of FLIP. Each
 * moved child plays a `transform` from its old place to its new one through {@link animate}, so the
 * animation does not re-layout the list. A child that did not move, is new, or has no key is left
 * alone. With reduced motion nothing is animated. The returned handle can wait for the moves or cancel
 * them.
 *
 * @param container The list element, after the change is in the DOM.
 * @param before The places recorded before the change.
 * @param options Duration, easing, the reduced-motion flag, and `keyAttribute` (default
 *   `"data-key"`; use the attribute given to `captureLayout`).
 * @example
 * ```ts
 * import { captureLayout, playFlip } from "@shadow-js/motion";
 *
 * export function moveToTop(list: HTMLElement, row: HTMLElement): void {
 *   const before = captureLayout(list, "data-id");
 *   list.prepend(row);
 *   playFlip(list, before, { keyAttribute: "data-id", duration: 200 });
 * }
 * ```
 * @since 1.0.0
 * @returns The handle: `finished` and `cancel`.
 */
export function playFlip(
  container: Element,
  before: ReadonlyMap<string, Place>,
  options: FlipOptions & { readonly keyAttribute?: string } = {},
): FlipHandle {
  const moves: AnimationHandle[] = [];
  if (!(options.reducedMotion ?? prefersReducedMotionNow())) {
    for (const child of container.children) {
      const key = child.getAttribute(options.keyAttribute ?? "data-key");
      const previous = key === null ? undefined : before.get(key);
      if (previous === undefined) continue;
      // A move still running would put its transform into the measurement: the new move would start
      // from the place the old one has left, not from where the child shows.
      running.get(child)?.cancel();
      // Without Web Animations the child is already at its new place; writing a transform would stay.
      if (typeof child.animate !== "function") continue;
      const now = child.getBoundingClientRect();
      const dx = previous.left - now.left;
      const dy = previous.top - now.top;
      if (dx === 0 && dy === 0) continue;
      const move = animate(child, moveKeyframes(dx, dy), {
        duration: options.duration ?? 250,
        easing: options.easing ?? "ease-out",
      });
      running.set(child, move);
      moves.push(move);
    }
  }
  return {
    finished: Promise.all(moves.map((move) => move.finished)).then(NOTHING),
    cancel: () => {
      for (const move of moves) move.cancel();
    },
  };
}

/** The keyframes of a move: from the old place to the new one, one axis when the move is on one axis. */
function moveKeyframes(dx: number, dy: number): Keyframe[] {
  if (dx === 0) return [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0px)" }];
  if (dy === 0) return [{ transform: `translateX(${dx}px)` }, { transform: "translateX(0px)" }];
  return [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0px, 0px)" }];
}
