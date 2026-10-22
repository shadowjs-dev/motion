/**
 * `@shadow-js/motion`: signal-driven motion. Tween and spring accessors, Web Animations helpers,
 * presence for shown and hidden content, FLIP for keyed lists, and the reduced-motion preference.
 * Every export is independent: a bundle pays only for the ones it imports.
 * @packageDocumentation
 */
export { type AnimateOptions, type AnimationHandle, animate } from "./animate";
export { frameClock, type MotionClock } from "./clock";
export { type Easing, easings } from "./easing";
export { captureLayout, type FlipHandle, type FlipOptions, type Place, playFlip } from "./flip";
export { Presence, type PresenceOptions, type PresenceProps, usePresence } from "./presence";
export { prefersReducedMotionNow, useReducedMotion } from "./reduced-motion";
export { type SpringOptions, useSpring } from "./spring";
export { type TweenOptions, useTween } from "./tween";
