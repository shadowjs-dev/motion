/**
 * `interpolate`, `useTransform`, `scrollProgress` and `resolveEdge`: the pure parts of the scroll-linked
 * values, tested without a DOM.
 */
import { createRoot, flushSync, useSignal } from "@shadow-js/core";
import { describe, expect, it } from "vitest";
import { easings, interpolate, resolveEdge, scrollProgress, useTransform } from "../src/index";

describe("interpolate", () => {
  it("[MOT-61] maps between stops and clamps outside them", () => {
    const map = interpolate([-300, 0, 300], [-14, 0, 14]);
    expect(map(150)).toBeCloseTo(7);
    expect(map(-150)).toBeCloseTo(-7);
    expect(map(900)).toBe(14);
    expect(map(-900)).toBe(-14);
  });

  it("[MOT-62] without clamping the end segments continue", () => {
    const map = interpolate([0, 1], [0, 10], { clamp: false });
    expect(map(2)).toBe(20);
    expect(map(-1)).toBe(-10);
  });

  it("[MOT-63] applies the easing inside each segment only", () => {
    const map = interpolate([0, 1, 2], [0, 10, 20], { ease: easings.easeIn });
    expect(map(0.5)).toBeCloseTo(10 * 0.5 ** 3);
    expect(map(1)).toBe(10);
    expect(map(1.5)).toBeCloseTo(10 + 10 * 0.5 ** 3);
  });

  it("[MOT-64] refuses stops that cannot map: unpaired, too few, not increasing, not finite", () => {
    expect(() => interpolate([0], [0])).toThrow(RangeError);
    expect(() => interpolate([0, 1], [0])).toThrow(RangeError);
    expect(() => interpolate([0, 0], [0, 1])).toThrow(RangeError);
    expect(() => interpolate([1, 0], [0, 1])).toThrow(RangeError);
    expect(() => interpolate([0, Number.NaN], [0, 1])).toThrow(RangeError);
  });
});

describe("useTransform", () => {
  it("[MOT-65] follows its source synchronously, with stops or a function", () => {
    const [source, setSource] = useSignal(0);
    const { scale, label } = createRoot(() => ({
      scale: useTransform(source, [0, 1], [1, 0.9]),
      label: useTransform(source, (value) => `${Math.round(value * 100)}%`),
    }));
    expect(scale()).toBe(1);
    setSource(0.5);
    flushSync();
    expect(scale()).toBeCloseTo(0.95);
    expect(label()).toBe("50%");
    setSource(2);
    flushSync();
    expect(scale()).toBe(0.9);
  });
});

describe("resolveEdge", () => {
  it("[MOT-66] reads names, fractions, pixels and percentages", () => {
    expect(resolveEdge("start")).toEqual({ fraction: 0, pixels: 0 });
    expect(resolveEdge("center")).toEqual({ fraction: 0.5, pixels: 0 });
    expect(resolveEdge("end")).toEqual({ fraction: 1, pixels: 0 });
    expect(resolveEdge(0.25)).toEqual({ fraction: 0.25, pixels: 0 });
    expect(resolveEdge("120px")).toEqual({ fraction: 0, pixels: 120 });
    expect(resolveEdge("-40px")).toEqual({ fraction: 0, pixels: -40 });
    expect(resolveEdge("25%")).toEqual({ fraction: 0.25, pixels: 0 });
    expect(() => resolveEdge("middle")).toThrow(RangeError);
  });
});

describe("scrollProgress", () => {
  // A 1000 px target that starts 500 px down a 3000 px page, seen through an 800 px window.
  const layout = { targetStart: 500, targetSize: 1000, containerSize: 800, scrollSize: 3000 };

  it("[MOT-67] 'start start' to 'end end' runs while the target is pinned from its top to its bottom", () => {
    const offset = ["start start", "end end"] as const;
    expect(scrollProgress(0, layout, offset)).toBe(0);
    expect(scrollProgress(500, layout, offset)).toBe(0);
    expect(scrollProgress(600, layout, offset)).toBeCloseTo(0.5);
    expect(scrollProgress(700, layout, offset)).toBe(1);
    expect(scrollProgress(2500, layout, offset)).toBe(1);
  });

  it("[MOT-68] the default window runs from entering the bottom to leaving the top", () => {
    const offset = ["start end", "end start"] as const;
    // Enters when scroll = 500 - 800 = -300, leaves when scroll = 500 + 1000 = 1500.
    expect(scrollProgress(-300, layout, offset)).toBe(0);
    expect(scrollProgress(600, layout, offset)).toBeCloseTo(0.5);
    expect(scrollProgress(1500, layout, offset)).toBe(1);
  });

  it("[MOT-69] pixel and percent edges move the points", () => {
    expect(scrollProgress(0, layout, ["start 100px", "end end"])).toBe(0);
    const early = scrollProgress(400, layout, ["start 100px", "end end"]);
    expect(early).toBeGreaterThanOrEqual(0);
    expect(scrollProgress(500 - 800 * 0.5, layout, ["start 50%", "end 50%"])).toBe(0);
  });

  it("[MOT-70] without a target it is the whole container's scroll", () => {
    expect(scrollProgress(0, layout)).toBe(0);
    expect(scrollProgress(1100, layout)).toBeCloseTo(0.5);
    expect(scrollProgress(2200, layout)).toBe(1);
  });

  it("[MOT-71] a window of no length is a step, not a divide by zero", () => {
    const flat = { targetStart: 100, targetSize: 0, containerSize: 100, scrollSize: 1000 };
    expect(scrollProgress(0, flat, ["start start", "start start"])).toBe(0);
    expect(scrollProgress(100, flat, ["start start", "start start"])).toBe(1);
  });

  it("[MOT-72] a malformed point fails loudly", () => {
    expect(() => scrollProgress(0, layout, ["start", "end end"] as never)).toThrow(RangeError);
  });
});
