import type { Accessor } from "@shadow-js/core";
import {
  type AnimateOptions,
  type AnimationHandle,
  animate,
  captureLayout,
  type Easing,
  easings,
  type FlipHandle,
  type FlipOptions,
  frameClock,
  type MotionClock,
  type Place,
  Presence,
  type PresenceOptions,
  type PresenceProps,
  type Presence as PresenceState,
  playFlip,
  type prefersReducedMotionNow,
  type SpringOptions,
  type TweenOptions,
  usePresence,
  useReducedMotion,
  useSpring,
  useTween,
} from "../src/index";
import type { Equal, Expect } from "./support";

const element = document.createElement("div");
const fade: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
const source: Accessor<number> = () => 0;
const shown: Accessor<boolean> = () => true;

// Positive: animate returns a handle with finished, cancel and finish.
const handle = animate(element, fade, { duration: 200, reducedMotion: false });
type _Handle = Expect<Equal<typeof handle, AnimationHandle>>;
type _Finished = Expect<Equal<AnimationHandle["finished"], Promise<void>>>;
type _Options = Expect<Equal<AnimateOptions["reducedMotion"], boolean | undefined>>;

// Positive: the easing table holds Easing functions by name.
type _EasingKeys = Expect<
  Equal<keyof typeof easings, "linear" | "easeOut" | "easeIn" | "easeInOut">
>;
const eased: Easing = easings.easeOut;
type _Eased = Expect<Equal<typeof eased, Easing>>;
type _EasingOutput = Expect<Equal<ReturnType<Easing>, number>>;

// Positive: the clock, tween and spring take accessors and return accessors.
const clock: MotionClock = frameClock;
type _Clock = Expect<Equal<typeof clock, MotionClock>>;
type _ClockNow = Expect<Equal<ReturnType<MotionClock["now"]>, number>>;

const tweened = useTween(source, { duration: 300, ease: easings.linear });
type _Tween = Expect<Equal<typeof tweened, Accessor<number>>>;
type _TweenOptions = Expect<Equal<TweenOptions["duration"], number | undefined>>;

const sprung = useSpring(source, { stiffness: 170, damping: 26 });
type _Spring = Expect<Equal<typeof sprung, Accessor<number>>>;
type _SpringOptions = Expect<Equal<SpringOptions["clock"], MotionClock | undefined>>;

// Positive: reduced motion is an accessor, and the sync check is a boolean.
const reduced = useReducedMotion();
type _Reduced = Expect<Equal<typeof reduced, Accessor<boolean>>>;
type _ReducedNow = Expect<Equal<ReturnType<typeof prefersReducedMotionNow>, boolean>>;

// Positive: presence hook returns mounted and ref.
const presenceOptions: PresenceOptions = { present: shown, duration: 150 };
const presence = usePresence(presenceOptions);
type _PresenceState = Expect<Equal<typeof presence, PresenceState>>;
type _Mounted = Expect<Equal<PresenceState["mounted"], Accessor<boolean>>>;
type _RefArgument = Expect<Equal<Parameters<PresenceState["ref"]>[0], Element | null>>;

// Positive: the Presence component takes a boolean or an accessor for when.
const _props: PresenceProps = { when: true, as: "section" };
type _PresenceProps = Expect<Equal<PresenceProps["when"], boolean | Accessor<boolean>>>;
const rendered = Presence({ when: shown, children: null });
type _Rendered = Expect<Equal<typeof rendered, unknown>>;
// Negative: present is an accessor on PresenceOptions, not a component prop.
// @ts-expect-error present is omitted from PresenceProps
const _withPresent: PresenceProps = { when: true, present: shown };

// Positive: FLIP captures places and returns a handle.
const places = captureLayout(element);
type _Places = Expect<Equal<typeof places, Map<string, Place>>>;
const flipOptions: FlipOptions = { duration: 250, easing: "ease-out" };
const flip = playFlip(element, places, flipOptions);
type _Flip = Expect<Equal<typeof flip, FlipHandle>>;
type _FlipFinished = Expect<Equal<FlipHandle["finished"], Promise<void>>>;

// Negative: animate options and keyframes are checked.
// @ts-expect-error reducedMotion is a boolean
animate(element, fade, { reducedMotion: "yes" });

// @ts-expect-error keyframes must be an array or an indexed object, not a number
animate(element, 1);

// Negative: tween and spring take an accessor for the source and numeric options.
// @ts-expect-error the source must be an accessor, not a number
useTween(0);

// @ts-expect-error duration must be a number
useTween(source, { duration: "slow" });

// @ts-expect-error the spring source must be an accessor
useSpring("0");

// @ts-expect-error stiffness must be a number
useSpring(source, { stiffness: "high" });

// Negative: the easing table has no entry past the four named curves.
// @ts-expect-error there is no bounce easing
const _bounce = easings.bounce;

// @ts-expect-error an easing takes one number and returns one
const _badEasing: Easing = (progress: string) => progress;

// Negative: presence requires an accessor for present.
// @ts-expect-error present must be an accessor, not a boolean
usePresence({ present: true });

// @ts-expect-error the component needs when
Presence({ children: null });

// Negative: the flip takes places as a map from key to Place.
// @ts-expect-error before must map keys to Place values
playFlip(element, new Map<string, number>());

// @ts-expect-error a handle needs finish as well as cancel
const _incomplete: AnimationHandle = { finished: Promise.resolve(), cancel: () => undefined };

// @ts-expect-error the clock needs cancel
const _partialClock: MotionClock = { now: () => 0, request: () => 0 };
