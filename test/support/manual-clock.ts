/**
 * A frame clock the tests step by hand, so no test waits on a real frame. Shared by the motion
 * suites; it is not part of the package.
 */
import { flushSync } from "@shadow-js/core";
import type { MotionClock } from "../../src/index";

/** A {@link MotionClock} the test advances with `frame`, and counts with `pending` and `requests`. */
export interface ManualClock extends MotionClock {
  /** Moves the time forward by `elapsed` ms, runs the frames requested so far, then flushes effects. */
  frame(elapsed: number): void;
  /** Frames requested and neither run nor canceled yet. */
  pending(): number;
  /** Every frame ever requested, so a test can tell whether a value asked for more frames. */
  requests(): number;
}

/** Creates a clock at `start` ms. */
export function manualClock(start = 0): ManualClock {
  let time = start;
  let next = 1;
  let requested = 0;
  const callbacks = new Map<number, (now: number) => void>();
  return {
    now: () => time,
    request(callback) {
      requested += 1;
      const handle = next;
      next += 1;
      callbacks.set(handle, callback);
      return handle;
    },
    cancel(handle) {
      if (typeof handle === "number") callbacks.delete(handle);
    },
    frame(elapsed) {
      time += elapsed;
      const due = [...callbacks.values()];
      callbacks.clear();
      for (const callback of due) callback(time);
      flushSync();
    },
    pending: () => callbacks.size,
    requests: () => requested,
  };
}
