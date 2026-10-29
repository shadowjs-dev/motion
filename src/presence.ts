/**
 * `usePresence`: keeps content mounted while its exit animation runs, so a `<Show>` can take the
 * element out after the animation rather than at once.
 * @packageDocumentation
 */
import { type Accessor, onCleanup, untrack, useEffect, useSignal } from "@shadow-js/core";
import { createComponent, Dynamic } from "@shadow-js/web";
import { type AnimationHandle, animate } from "./animate";

/**
 * Options of {@link usePresence}. They are read once, when the hook is called, except `present`,
 * which is followed reactively.
 *
 * @example
 * ```ts
 * import { useSignal } from "@shadow-js/core";
 * import { type PresenceOptions, usePresence } from "@shadow-js/motion";
 *
 * const [open] = useSignal(true);
 * const fade: PresenceOptions = {
 *   present: open,
 *   enter: [{ opacity: 0 }, { opacity: 1 }],
 *   exit: [{ opacity: 1 }, { opacity: 0 }],
 *   duration: 150,
 * };
 * const presence = usePresence(fade);
 * ```
 * @since 1.0.0
 */
export interface PresenceOptions {
  /** Whether the content should be shown. Read reactively. */
  readonly present: Accessor<boolean>;
  /**
   * The keyframes played on the element (through {@link animate}) when `present` turns false. Without
   * them, or without an element from `ref`, `mounted` turns false at once.
   */
  readonly exit?: Keyframe[] | PropertyIndexedKeyframes | undefined;
  /**
   * The keyframes played on the element when `present` is true and `ref` has an element: on the
   * first run of the hook's effect, each time `present` turns true again, and for a new element that
   * `ref` receives while `present` is true (content that was unmounted and shown again). Not waited for.
   */
  readonly enter?: Keyframe[] | PropertyIndexedKeyframes | undefined;
  /**
   * Duration of both animations in milliseconds.
   * @default 200
   */
  readonly duration?: number | undefined;
  /**
   * `true` gives both animations a duration of `0`; `false` plays them whatever the system says. When it is not given, {@link prefersReducedMotionNow} decides
   * each time an animation starts.
   */
  readonly reducedMotion?: boolean | undefined;
}

/**
 * What {@link usePresence} returns: whether the content belongs in the page, and the `ref` that
 * hands the hook the element to animate. (The same name is the {@link Presence} component.)
 *
 * @example
 * ```tsx
 * import { useSignal } from "@shadow-js/core";
 * import { Show } from "@shadow-js/web";
 * import { type Presence, usePresence } from "@shadow-js/motion";
 *
 * export function Hint() {
 *   const [open] = useSignal(true);
 *   const presence: Presence = usePresence({ present: open, exit: [{ opacity: 1 }, { opacity: 0 }] });
 *   return (
 *     <Show when={presence.mounted()}>
 *       <p ref={presence.ref}>Drag to reorder</p>
 *     </Show>
 *   );
 * }
 * ```
 * @since 1.0.0
 */
export interface Presence {
  /**
   * True while the content belongs in the page: while `present` is true, and while the exit
   * animation runs after it turns false. Reactive.
   */
  readonly mounted: Accessor<boolean>;
  /**
   * Pass to the animated element's `ref`. `null` forgets the element, so the next exit is instant.
   * @param element The element the enter and exit keyframes run on, or `null`.
   */
  ref(element: Element | null): void;
}

/**
 * Keeps content mounted while its exit animation runs, for `<Show when={presence.mounted()}>` or a
 * component of your own. When `present` turns false, the exit keyframes run on the element given to
 * `ref`, and `mounted` stays true until they finish. Turning `present` true again during the exit
 * cancels it and keeps the content. Call it during a component's setup: it runs in an effect, and a
 * running exit is canceled when the owner is disposed.
 *
 * @param options The presence signal, the keyframes and the duration.
 * @returns `mounted` and the `ref` for the element.
 * @example
 * ```tsx
 * import { useSignal } from "@shadow-js/core";
 * import { Show } from "@shadow-js/web";
 * import { usePresence } from "@shadow-js/motion";
 *
 * export function Banner() {
 *   const [open, setOpen] = useSignal(true);
 *   const presence = usePresence({
 *     present: open,
 *     exit: [{ opacity: 1 }, { opacity: 0 }],
 *     duration: 180,
 *   });
 *   return (
 *     <Show when={presence.mounted()}>
 *       <div ref={presence.ref} role="status">
 *         Saved.
 *         <button type="button" onClick={() => setOpen(false)}>
 *           Dismiss
 *         </button>
 *       </div>
 *     </Show>
 *   );
 * }
 * ```
 * @see {@link Presence}
 * @since 1.0.0
 */
export function usePresence(options: PresenceOptions): Presence {
  const [mounted, setMounted] = useSignal(untrack(options.present));
  let element: Element | undefined;
  // The animation that runs now, enter or exit. A new state cancels it, so an enter that is still
  // running when the content closes does not play under the exit, and disposal cancels it too.
  let running: AnimationHandle | undefined;
  const timing = { duration: options.duration ?? 200, reducedMotion: options.reducedMotion };
  const cancelRunning = (): void => {
    running?.cancel();
    running = undefined;
  };
  // The element whose enter was started by this presence, so a `ref` and the effect never start it twice.
  let entered: Element | undefined;
  // A new state cancels what runs, then plays the enter on the current element when there is one.
  const playEnter = (): void => {
    cancelRunning();
    if (element === undefined || options.enter === undefined) return;
    entered = element;
    running = animate(element, options.enter, timing);
  };
  useEffect(() => {
    if (options.present()) {
      setMounted(true);
      // The element already entered (its `ref` ran while `present` was true): its enter is running.
      if (element === undefined || entered !== element) playEnter();
      return;
    }
    entered = undefined;
    if (!untrack(mounted)) return;
    cancelRunning();
    if (element === undefined || options.exit === undefined) {
      setMounted(false);
      return;
    }
    const handle = animate(element, options.exit, timing);
    running = handle;
    void handle.finished.then(() => {
      if (running !== handle) return;
      running = undefined;
      if (!untrack(options.present)) setMounted(false);
    });
  });
  onCleanup(cancelRunning);
  return {
    mounted,
    ref(next) {
      element = next ?? undefined;
      if (element === undefined) entered = undefined;
      // Content that was unmounted and shown again arrives with a new element after the effect ran,
      // so the element itself starts its enter.
      else if (untrack(options.present) && entered !== element) playEnter();
    },
  };
}

/**
 * Props of the {@link Presence} component: the {@link PresenceOptions} without `present`, plus
 * `when`, the wrapper element and the children.
 *
 * @example
 * ```tsx
 * import { useSignal } from "@shadow-js/core";
 * import { Presence, type PresenceProps } from "@shadow-js/motion";
 *
 * const fade: Omit<PresenceProps, "when"> = {
 *   as: "section",
 *   exit: [{ opacity: 1 }, { opacity: 0 }],
 *   duration: 250,
 * };
 *
 * export function Panel() {
 *   const [open] = useSignal(true);
 *   return (
 *     <Presence when={open()} {...fade}>
 *       <p>Details</p>
 *     </Presence>
 *   );
 * }
 * ```
 * @since 1.0.0
 */
export interface PresenceProps extends Omit<PresenceOptions, "present"> {
  /** Whether the children are shown: a boolean (read reactively from the prop) or an accessor. */
  readonly when: boolean | Accessor<boolean>;
  /**
   * The tag name of the wrapper element the animations run on.
   * @default "div"
   */
  readonly as?: string | undefined;
  /** The `id` attribute of the wrapper element. */
  readonly id?: string | undefined;
  /** The content, rendered inside the wrapper while it is mounted. */
  readonly children?: unknown;
}

/**
 * A wrapper element whose content leaves with an exit animation: while `when` is true the children
 * are rendered; when it turns false they stay until the exit keyframes finish, then they are removed.
 * The wrapper itself stays in the page, so the animation has an element to run on. Opening again
 * during the exit cancels it. Built on {@link usePresence}.
 *
 * @param props `when`, the keyframes, the duration, the wrapper element and the children.
 * @returns The wrapper element.
 * @example
 * ```tsx
 * import { useSignal } from "@shadow-js/core";
 * import { Presence } from "@shadow-js/motion";
 *
 * export function Saved() {
 *   const [open, setOpen] = useSignal(true);
 *   return (
 *     <div>
 *       <button type="button" onClick={() => setOpen(!open())}>
 *         Toggle
 *       </button>
 *       <Presence when={open()} id="saved" exit={[{ opacity: 1 }, { opacity: 0 }]} duration={200}>
 *         <p>Saved</p>
 *       </Presence>
 *     </div>
 *   );
 * }
 * ```
 * @since 1.0.0
 */
export function Presence(props: PresenceProps): unknown {
  const when = typeof props.when === "function" ? props.when : () => props.when === true;
  const presence = usePresence({
    present: when as Accessor<boolean>,
    exit: props.exit,
    enter: props.enter,
    duration: props.duration,
    reducedMotion: props.reducedMotion,
  });
  return createComponent(Dynamic as (p: Record<string, unknown>) => unknown, {
    component: props.as ?? "div",
    id: props.id,
    ref: presence.ref,
    get children() {
      return presence.mounted() ? props.children : null;
    },
  });
}
