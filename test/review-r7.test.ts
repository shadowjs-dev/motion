/**
 * Review round seven: a second `playFlip` measures the layout and not the first move, the spring
 * stays bounded on slow frames, reduced motion drops delays, and a missing Web Animations leaves the
 * element's own transform alone.
 */
import { createRoot, flushSync, useSignal } from "@shadow-js/core";
import { describe, expect, it } from "vitest";
import { animate, playFlip, useSpring } from "../src/index";
import { type FakeAnimation, fakeElement } from "./support/fake-element";
import { manualClock } from "./support/manual-clock";

describe("a second playFlip while the first one runs", () => {
  it("[MOT-R7-1] measures the layout place, not the place the first move shows", () => {
    const fake = fakeElement();
    const layoutTop = 200;
    const running = (): FakeAnimation | undefined =>
      fake.animations.find((animation) => animation.canceled === 0);
    // The box a browser reports: layout plus the move still running (50 px below its layout place).
    const child = Object.assign(fake.element, {
      getAttribute: () => "a",
      getBoundingClientRect: () => ({
        top: layoutTop + (running() === undefined ? 0 : 50),
        left: 0,
      }),
    });
    const list = { children: [child] } as unknown as Element;
    playFlip(list, new Map([["a", { top: 0, left: 0 }]]), { reducedMotion: false });
    expect(fake.animations[0]?.keyframes).toEqual([
      { transform: "translateY(-200px)" },
      { transform: "translateY(0px)" },
    ]);
    // The list changes again while the first move runs; the child was captured where it showed, 50 px.
    playFlip(list, new Map([["a", { top: 50, left: 0 }]]), { reducedMotion: false });
    expect(fake.animations[0]?.canceled).toBe(1);
    expect(fake.animations[1]?.keyframes).toEqual([
      { transform: "translateY(-150px)" },
      { transform: "translateY(0px)" },
    ]);
  });
});

describe("the spring on slow frames", () => {
  it.each([
    ["the defaults", {}],
    ["stiffness 700", { stiffness: 700 }],
    ["stiffness 5000", { stiffness: 5000, damping: 100 }],
  ])("[MOT-R7-2] %s stay bounded and settle on the target at 64 ms frames", (_name, options) => {
    const clock = manualClock();
    const [target, setTarget] = useSignal(0);
    const value = createRoot(() =>
      useSpring(target, { ...options, clock, reducedMotion: () => false }),
    );
    setTarget(100);
    flushSync();
    let highest = 0;
    for (let frame = 0; frame < 400 && clock.pending() > 0; frame += 1) {
      clock.frame(64);
      highest = Math.max(highest, Math.abs(value()));
    }
    expect(highest).toBeLessThan(150);
    expect(value()).toBe(100);
    expect(clock.pending()).toBe(0);
  });
});

describe("reduced motion in animate", () => {
  it("[MOT-R7-3] delay and endDelay are zero, so the final state is not held back", () => {
    const fake = fakeElement();
    animate(fake.element, [{ opacity: 0 }, { opacity: 1 }], {
      duration: 300,
      delay: 500,
      endDelay: 400,
      reducedMotion: true,
    });
    expect(fake.animations[0]?.options).toMatchObject({ duration: 0, delay: 0, endDelay: 0 });
  });

  it("[MOT-R7-4] without reduced motion the delays are passed through", () => {
    const fake = fakeElement();
    animate(fake.element, [{ opacity: 0 }, { opacity: 1 }], {
      duration: 300,
      delay: 500,
      endDelay: 400,
      reducedMotion: false,
    });
    expect(fake.animations[0]?.options).toMatchObject({ duration: 300, delay: 500, endDelay: 400 });
  });
});
