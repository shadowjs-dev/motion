/**
 * `useScroll`: the scroll position of the page or of a scroll container, and the progress (0 to 1) of
 * an element through a window of that scroll. The progress is written straight from the scroll event, so
 * a value derived from it moves with the wheel or the finger and never lags behind.
 * @packageDocumentation
 */
import { type Accessor, batch, useEffect, useSignal } from "@shadow-js/core";

/**
 * One edge of an element or of the container: `"start"`, `"center"`, `"end"`, a fraction `0` to `1`,
 * a pixel distance from the start (`"120px"`), or a percentage (`"25%"`).
 * @since 1.1.0
 */
export type ScrollEdge = "start" | "center" | "end" | number | `${number}px` | `${number}%`;

/**
 * Where the progress is 0 or 1, written `"<target edge> <container edge>"`: the moment that edge of the
 * target meets that edge of the container. `"start end"` is the target's top touching the container's
 * bottom (the target is about to come into view); `"end start"` is its bottom leaving at the top.
 * @since 1.1.0
 */
export type ScrollPoint = `${ScrollEdge} ${ScrollEdge}`;

/**
 * Options of {@link useScroll}.
 * @since 1.1.0
 */
export interface ScrollOptions {
  /**
   * The element whose progress is tracked, read once after the first render (pass `() => ref.current`).
   * Without it the progress is the whole container's scroll, from the top to the end.
   */
  readonly target?: () => Element | null | undefined;
  /**
   * The scroll container, read once after the first render. Without it, the page.
   */
  readonly container?: () => Element | null | undefined;
  /**
   * The start and end points of the progress.
   * @default ["start end", "end start"]
   */
  readonly offset?: readonly [ScrollPoint, ScrollPoint];
}

/**
 * What {@link useScroll} returns. All four are accessors; they are `0` until the page is running in
 * the browser (on the server they stay `0`).
 * @since 1.1.0
 */
export interface ScrollValues {
  /** Horizontal scroll distance in pixels, from the start edge (the right edge in right-to-left text). */
  readonly x: Accessor<number>;
  /** Vertical scroll distance in pixels. */
  readonly y: Accessor<number>;
  /** Horizontal progress, 0 to 1. */
  readonly xProgress: Accessor<number>;
  /** Vertical progress, 0 to 1. */
  readonly yProgress: Accessor<number>;
}

/**
 * An edge as a fraction of a size plus a number of pixels: what {@link resolveEdge} returns.
 * @since 1.1.1
 */
export interface ResolvedEdge {
  /** The part of the size, 0 at the start edge and 1 at the end edge. */
  readonly fraction: number;
  /** Pixels added to it. */
  readonly pixels: number;
}

type Resolved = ResolvedEdge;

/**
 * Turns an edge of a scroll point into a fraction of the size plus a number of pixels. Pure: {@link useScroll} reads
 * its `offset` with it.
 *
 * @param edge `"start"`, `"center"`, `"end"`, a fraction (`0.25` or `"0.25"`), pixels (`"120px"`) or a percentage
 *   (`"25%"`).
 * @returns The fraction and the pixels.
 * @throws RangeError for anything else.
 * @example
 * ```ts
 * import { resolveEdge } from "@shadow-js/motion";
 *
 * console.log(resolveEdge("center")); // { fraction: 0.5, pixels: 0 }
 * console.log(resolveEdge("120px")); // { fraction: 0, pixels: 120 }
 * console.log(resolveEdge("25%")); // { fraction: 0.25, pixels: 0 }
 * ```
 * @since 1.1.0
 */
export function resolveEdge(edge: string | number): ResolvedEdge {
  if (typeof edge === "number") return { fraction: edge, pixels: 0 };
  if (edge === "start") return { fraction: 0, pixels: 0 };
  if (edge === "center") return { fraction: 0.5, pixels: 0 };
  if (edge === "end") return { fraction: 1, pixels: 0 };
  const pixels = /^(-?\d+(?:\.\d+)?)px$/.exec(edge);
  if (pixels) return { fraction: 0, pixels: Number(pixels[1]) };
  const percent = /^(-?\d+(?:\.\d+)?)%$/.exec(edge);
  if (percent) return { fraction: Number(percent[1]) / 100, pixels: 0 };
  const plain = Number(edge);
  if (edge.trim() !== "" && Number.isFinite(plain)) return { fraction: plain, pixels: 0 };
  throw new RangeError(`Unknown scroll edge "${edge}"`);
}

function resolvePoint(point: string): readonly [Resolved, Resolved] {
  const parts = point.trim().split(/\s+/);
  if (parts.length !== 2)
    throw new RangeError(`A scroll point is "<target edge> <container edge>", got "${point}"`);
  return [resolveEdge(parts[0] as string), resolveEdge(parts[1] as string)];
}

/**
 * The layout numbers of one axis, in pixels: what {@link scrollProgress} reads.
 * @since 1.1.0
 */
export interface AxisLayout {
  /** Distance from the start of the scrollable content to the target's start edge. */
  readonly targetStart: number;
  /** The target's size along the axis. */
  readonly targetSize: number;
  /** The visible size of the container. */
  readonly containerSize: number;
  /** The full scrollable size of the container. */
  readonly scrollSize: number;
}

/**
 * The progress, 0 to 1, of a scroll position through the offset window. Pure: {@link useScroll} calls it
 * with measured numbers.
 *
 * @param scroll The scroll distance.
 * @param layout The measured sizes; without a target, `targetStart` and `targetSize` are ignored.
 * @param offset The start and end points; `undefined` means the whole container's scroll.
 * @returns The progress, clamped to 0 to 1.
 * @example
 * ```ts
 * import { scrollProgress } from "@shadow-js/motion";
 *
 * // A 1000 px tall target 500 px down a 800 px viewport, from "start start" to "end end".
 * const layout = { targetStart: 500, targetSize: 1000, containerSize: 800, scrollSize: 3000 };
 * scrollProgress(500, layout, ["start start", "end end"]); // 0
 * scrollProgress(700, layout, ["start start", "end end"]); // 1
 * ```
 * @since 1.1.0
 */
export function scrollProgress(
  scroll: number,
  layout: AxisLayout,
  offset?: readonly [ScrollPoint, ScrollPoint],
): number {
  let from: number;
  let to: number;
  if (offset === undefined) {
    from = 0;
    to = layout.scrollSize - layout.containerSize;
  } else {
    const [a, b] = [resolvePoint(offset[0]), resolvePoint(offset[1])];
    const at = (point: readonly [Resolved, Resolved]): number =>
      layout.targetStart +
      point[0].fraction * layout.targetSize +
      point[0].pixels -
      (point[1].fraction * layout.containerSize + point[1].pixels);
    from = at(a);
    to = at(b);
  }
  if (to === from) return scroll >= to ? 1 : 0;
  return Math.min(1, Math.max(0, (scroll - from) / (to - from)));
}

const DEFAULT_OFFSET = ["start end", "end start"] as const;

/**
 * Tracks the scroll of the page or of a container, and of an element through it. Call it in a component:
 * listeners start after the first render and are removed when the component is disposed. The scroll
 * event is passive. Sizes are measured again when the window, the container, the content or the target
 * changes size, so a late image or font does not leave the progress off.
 *
 * Progress is position, not animation, so it does not change with reduced motion: the page scrolls
 * the same way, and what you do with the value is up to you.
 *
 * @param options The target, the container and the offset.
 * @returns The scroll distances and the progress.
 * @example
 * ```tsx
 * import { createRef } from "@shadow-js/core";
 * import { useScroll, useTransform } from "@shadow-js/motion";
 *
 * export function Stack() {
 *   const section = createRef<HTMLElement>();
 *   const { yProgress } = useScroll({ target: () => section.current, offset: ["start start", "end end"] });
 *   const scale = useTransform(yProgress, [0, 1], [1, 0.92]);
 *   return (
 *     <section ref={section} style="height: 300vh">
 *       <div style={`position: sticky; top: 0; transform: scale(${scale()})`}>Cards</div>
 *     </section>
 *   );
 * }
 * ```
 * @see {@link useTransform}
 * @since 1.1.0
 */
export function useScroll(options: ScrollOptions = {}): ScrollValues {
  const [x, setX] = useSignal(0);
  const [y, setY] = useSignal(0);
  const [xProgress, setXProgress] = useSignal(0);
  const [yProgress, setYProgress] = useSignal(0);
  const offset = options.offset ?? DEFAULT_OFFSET;
  // Fails at the call, not at the first scroll, when a point is malformed.
  resolvePoint(offset[0]);
  resolvePoint(offset[1]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const container = options.container?.() ?? undefined;
    const target = options.target?.() ?? undefined;
    const scroller: Element | Window = container ?? window;
    const rtl = (): boolean =>
      getComputedStyle(container ?? document.documentElement).direction === "rtl";

    let layoutX: AxisLayout | undefined;
    let layoutY: AxisLayout | undefined;

    const measure = (): void => {
      const root = document.documentElement;
      const box = container ?? root;
      const viewport = container
        ? { width: container.clientWidth, height: container.clientHeight }
        : { width: root.clientWidth, height: root.clientHeight };
      const scrollX = container ? Math.abs(container.scrollLeft) : Math.abs(window.scrollX);
      const scrollY = container ? container.scrollTop : window.scrollY;
      const containerRect = container ? container.getBoundingClientRect() : undefined;
      const rect = target?.getBoundingClientRect();
      let startY = 0;
      let startX = 0;
      if (rect) {
        startY = containerRect
          ? rect.top - containerRect.top - (container?.clientTop ?? 0) + scrollY
          : rect.top + scrollY;
        // In right-to-left text the start edge is the right one, so distances are measured from it.
        startX = rtl()
          ? (containerRect ? containerRect.right - rect.right : root.clientWidth - rect.right) +
            scrollX
          : containerRect
            ? rect.left - containerRect.left - (container?.clientLeft ?? 0) + scrollX
            : rect.left + scrollX;
      }
      layoutY = {
        targetStart: startY,
        targetSize: rect?.height ?? 0,
        containerSize: viewport.height,
        scrollSize: box.scrollHeight,
      };
      layoutX = {
        targetStart: startX,
        targetSize: rect?.width ?? 0,
        containerSize: viewport.width,
        scrollSize: box.scrollWidth,
      };
    };

    const read = (): void => {
      if (!layoutX || !layoutY) measure();
      const scrollX = container ? Math.abs(container.scrollLeft) : Math.abs(window.scrollX);
      const scrollY = container ? container.scrollTop : window.scrollY;
      const o = target ? offset : undefined;
      batch(() => {
        setX(scrollX);
        setY(scrollY);
        setXProgress(scrollProgress(scrollX, layoutX as AxisLayout, o));
        setYProgress(scrollProgress(scrollY, layoutY as AxisLayout, o));
      });
    };

    const remeasure = (): void => {
      measure();
      read();
    };

    scroller.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", remeasure);
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(remeasure);
      observer.observe(container ?? document.documentElement);
      if (target) observer.observe(target);
    }
    remeasure();
    // Fonts and images that settle after the first paint move the target.
    const settle =
      typeof requestAnimationFrame === "function" ? requestAnimationFrame(remeasure) : undefined;

    return () => {
      scroller.removeEventListener("scroll", read);
      window.removeEventListener("resize", remeasure);
      observer?.disconnect();
      if (settle !== undefined && typeof cancelAnimationFrame === "function")
        cancelAnimationFrame(settle);
    };
  });

  return { x, y, xProgress, yProgress };
}
