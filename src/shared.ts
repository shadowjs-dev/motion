/**
 * `createShared`: shared-element transitions. Two elements that carry the same id, one leaving and one
 * arriving (a highlight that moves from one nav link to the next, an underline that follows the active
 * tab), are joined: the arriving one starts where the leaving one was and glides to its own place.
 * @packageDocumentation
 */
import { type AnimationHandle, animate } from "./animate";
import { prefersReducedMotionNow } from "./reduced-motion";

/**
 * Options of {@link createShared}.
 * @since 1.1.0
 */
export interface SharedOptions {
  /** Duration of the glide in milliseconds. @default 320 */
  readonly duration?: number;
  /** The CSS easing of the glide. @default "cubic-bezier(0.22, 1, 0.36, 1)" */
  readonly easing?: string;
  /**
   * Whether a change of size is animated too (the element is scaled from its old box to its new one).
   * Use it for shapes: a background pill, an underline. Turn it off for text, which would stretch.
   * @default true
   */
  readonly scale?: boolean;
  /**
   * How long after the old element left a new one still counts as its continuation, in milliseconds.
   * @default 120
   */
  readonly window?: number;
  /** Whether reduced motion is on; with it elements simply appear. @default follows the system preference */
  readonly reducedMotion?: () => boolean;
}

/**
 * What {@link createShared} returns.
 * @since 1.1.0
 */
export interface Shared {
  /**
   * The ref for the element that carries `id`. Call it where the element is written, once per element:
   * `<span ref={shared.ref("nav-active")} />`. Elements of the same id are joined.
   */
  ref(id: string): (element: Element | undefined) => (() => void) | undefined;
  /**
   * Measures every element now. The library does this before each pointer, touch, focus and key event
   * on its own, which is when a change of state starts; call it before a change that starts any other
   * way (a timer, a message from the network).
   */
  snapshot(): void;
  /** Removes the listeners. Elements already in place stay where they are. */
  dispose(): void;
}

const INPUT_EVENTS = [
  "pointerover",
  "pointerdown",
  "touchstart",
  "focusin",
  "keydown",
  "click",
] as const;
/** Pointer movement fires often; one measurement per this many milliseconds is enough. */
const MIN_GAP = 16;

/**
 * Creates a registry of shared elements. Make one for a group of elements that join each other, usually
 * at the top of a component or in a module for a whole site.
 *
 * It works whichever of the two elements the framework creates first, and it does not depend on layout
 * being available at the time an element is removed: positions are measured when the user acts (see
 * {@link Shared.snapshot}) and when an element arrives.
 *
 * @param options Duration, easing, whether size animates, and reduced motion.
 * @returns The registry.
 * @example
 * ```tsx
 * import { createShared } from "@shadow-js/motion";
 *
 * const nav = createShared();
 *
 * export function Nav(props: { items: string[]; active: () => string }) {
 *   return (
 *     <nav>
 *       {props.items.map((item) => (
 *         <a href={`/${item}`}>
 *           {item}
 *           {props.active() === item ? <span class="dot" ref={nav.ref("dot")} /> : null}
 *         </a>
 *       ))}
 *     </nav>
 *   );
 * }
 * ```
 * @since 1.1.0
 */
export function createShared(options: SharedOptions = {}): Shared {
  const duration = options.duration ?? 320;
  const easing = options.easing ?? "cubic-bezier(0.22, 1, 0.36, 1)";
  const scale = options.scale ?? true;
  const window_ = options.window ?? 120;
  const reduced = (): boolean => (options.reducedMotion ?? prefersReducedMotionNow)();
  const now = (): number => (typeof performance === "undefined" ? Date.now() : performance.now());

  const live = new Map<string, Set<Element>>();
  const rects = new Map<string, DOMRect>();
  const gone = new Map<string, number>();
  const running = new WeakMap<Element, AnimationHandle>();
  /** Elements whose arrival was handled (their box is the one in `rects`). */
  const placed = new WeakSet<Element>();
  let listening = false;
  let lastSnapshot = -Infinity;

  const snapshot = (): void => {
    lastSnapshot = now();
    for (const [id, elements] of live) {
      // The newest element of an id is the one on screen.
      const element = [...elements].pop();
      if (element?.isConnected) rects.set(id, element.getBoundingClientRect());
    }
  };
  const onInput = (): void => {
    if (now() - lastSnapshot >= MIN_GAP) snapshot();
  };
  const listen = (): void => {
    if (listening || typeof document === "undefined") return;
    listening = true;
    for (const name of INPUT_EVENTS)
      document.addEventListener(name, onInput, { capture: true, passive: true });
  };
  const unlisten = (): void => {
    if (!listening) return;
    listening = false;
    for (const name of INPUT_EVENTS) document.removeEventListener(name, onInput, { capture: true });
  };

  const glide = (element: Element, from: DOMRect, to: DOMRect): void => {
    running.get(element)?.cancel();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const sx = scale && to.width > 0 ? from.width / to.width : 1;
    const sy = scale && to.height > 0 ? from.height / to.height : 1;
    if (
      Math.abs(dx) < 0.5 &&
      Math.abs(dy) < 0.5 &&
      Math.abs(sx - 1) < 0.01 &&
      Math.abs(sy - 1) < 0.01
    )
      return;
    const start = scale
      ? `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`
      : `translate(${dx}px, ${dy}px)`;
    const end = scale ? "translate(0px, 0px) scale(1, 1)" : "translate(0px, 0px)";
    running.set(
      element,
      animate(
        element,
        [
          { transform: start, transformOrigin: "0 0" },
          { transform: end, transformOrigin: "0 0" },
        ],
        // Reduced motion was already decided by `arrive`.
        { duration, easing, reducedMotion: false },
      ),
    );
  };

  const arrive = (id: string, element: Element): void => {
    if (!element.isConnected || !live.get(id)?.has(element)) return;
    placed.add(element);
    const to = element.getBoundingClientRect();
    const others = [...(live.get(id) ?? [])].filter(
      (other) => other !== element && other.isConnected,
    );
    const previous = rects.get(id);
    const left = gone.get(id);
    const continued = others.length > 0 || (left !== undefined && now() - left <= window_);
    gone.delete(id);
    if (previous && continued && !reduced()) glide(element, previous, to);
    rects.set(id, to);
  };

  return {
    ref(id) {
      let mine: Element | undefined;
      const leave = (old: Element): void => {
        if (mine === old) mine = undefined;
        const set = live.get(id);
        if (!set?.has(old)) return;
        // Still on screen while its owner is disposed: its box now is the freshest one.
        // Unless the element replacing it has already been placed and measured.
        const replaced = [...set].some((other) => other !== old && placed.has(other));
        if (old.isConnected && !replaced) rects.set(id, old.getBoundingClientRect());
        set.delete(old);
        if (set.size === 0) live.delete(id);
        running.get(old)?.cancel();
        running.delete(old);
        gone.set(id, now());
        if (live.size === 0) unlisten();
      };
      return (element) => {
        if (element) {
          if (mine !== undefined && mine !== element) leave(mine);
          mine = element;
          const set = live.get(id) ?? new Set<Element>();
          live.set(id, set);
          set.add(element);
          listen();
          // After the framework has put it in place, before the next paint.
          queueMicrotask(() => arrive(id, element));
          // ShadowJS and React 19 run a returned function when the element's owner is disposed.
          return () => leave(element);
        }
        if (mine !== undefined) leave(mine);
        return undefined;
      };
    },
    snapshot,
    dispose() {
      unlisten();
      live.clear();
      rects.clear();
      gone.clear();
    },
  };
}
