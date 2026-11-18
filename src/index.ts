/**
 * `@shadow-js/motion`: signal-driven motion. Tween and spring accessors, Web Animations helpers,
 * presence for shown and hidden content, springs moved by command and staggered, FLIP for keyed lists, dragging with momentum, scroll-linked
 * values, shared-element transitions, and the reduced-motion preference.
 * Every export is independent: a bundle pays only for the ones it imports.
 * @packageDocumentation
 */
export { type AnimateOptions, type AnimationHandle, animate } from "./animate";
export { frameClock, type MotionClock } from "./clock";
export {
  type DragBounds,
  type DragHandle,
  type DragInfo,
  type DragOptions,
  rubberBand,
  useDrag,
} from "./drag";
export { type Easing, easings } from "./easing";
export { captureLayout, type FlipHandle, type FlipOptions, type Place, playFlip } from "./flip";
export { Presence, type PresenceOptions, type PresenceProps, usePresence } from "./presence";
export { prefersReducedMotionNow, useReducedMotion } from "./reduced-motion";
export {
  type AxisLayout,
  type ResolvedEdge,
  resolveEdge,
  type ScrollEdge,
  type ScrollOptions,
  type ScrollPoint,
  type ScrollValues,
  scrollProgress,
  useScroll,
} from "./scroll";
export { createShared, type Shared, type SharedOptions } from "./shared";
export { type SpringOptions, useSpring } from "./spring";
export {
  type SpringMove,
  type SpringPhysics,
  type SpringValue,
  type SpringValueOptions,
  type StaggerOptions,
  stagger,
  useSpringValue,
} from "./spring-value";
export { interpolate, type TransformOptions, useTransform } from "./transform";
export { type TweenOptions, useTween } from "./tween";
