/**
 * `animate` with durations that cannot be played: a duration that is not a finite non-negative
 * number is played as zero, so the animation ends at once instead of making the browser throw.
 */
import { describe, expect, it } from "vitest";
import { animate } from "../src/index";
import { fakeElement } from "./support/fake-element";

describe("animate durations", () => {
  it("[MOT-41] a duration that is NaN, negative or infinite is handed to element.animate as zero", () => {
    for (const duration of [Number.NaN, -300, Number.POSITIVE_INFINITY]) {
      const fake = fakeElement();
      animate(fake.element, [{ opacity: 0 }, { opacity: 1 }], { duration });
      expect(fake.animations[0]?.duration, `duration ${duration}`).toBe(0);
    }
  });
});
