/**
 * An element stand-in with a recording `animate`, for the suites that run under node (no DOM).
 * Each animation settles its `finished` promise when the test finishes or cancels it, the way
 * Web Animations does, so `animate` and `usePresence` see the same events as in a browser.
 */

/** One animation the fake element started. */
export interface FakeAnimation {
  readonly keyframes: unknown;
  readonly options: unknown;
  /** The `duration` option the animation was given, read from `options` (`undefined` when none). */
  readonly duration: unknown;
  /** How many times `cancel` was called on this animation. */
  canceled: number;
  finish(): void;
  cancel(): void;
  readonly finished: Promise<void>;
}

/** The element and its recorded animations. */
export interface FakeElement {
  readonly element: Element;
  readonly animations: FakeAnimation[];
}

/** An element whose `animate` records every call; the tests finish or cancel them by hand. */
export function fakeElement(): FakeElement {
  const animations: FakeAnimation[] = [];
  const element = {
    animate(keyframes: unknown, options: unknown) {
      let settle: () => void = () => undefined;
      const finished = new Promise<void>((resolve) => {
        settle = () => resolve();
      });
      const animation: FakeAnimation = {
        keyframes,
        options,
        duration: (options as { duration?: unknown } | undefined)?.duration,
        canceled: 0,
        finished,
        finish: () => settle(),
        cancel() {
          animation.canceled += 1;
          settle();
        },
      };
      animations.push(animation);
      return animation;
    },
  };
  return { element: element as unknown as Element, animations };
}

/** Lets the pending promise callbacks run (a finished animation resumes the code waiting on it). */
export async function settle(): Promise<void> {
  for (let pass = 0; pass < 4; pass += 1) await Promise.resolve();
}
