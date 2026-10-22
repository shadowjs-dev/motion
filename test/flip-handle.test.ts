/**
 * `playFlip` returns a handle: `finished` waits for every move, and `cancel` stops the moves still
 * running, so each child shows its own place at once. Runs under node with fake elements.
 */
import { describe, expect, it } from "vitest";
import { playFlip } from "../src/index";
import { type FakeAnimation, fakeElement, settle } from "./support/fake-element";

/** A keyed child whose place now is `now` (its old place is in the `before` map the test passes). */
function movedChild(
  key: string,
  now: number,
): { child: Element; animation: () => FakeAnimation | undefined } {
  const fake = fakeElement();
  const child = Object.assign(fake.element, {
    getAttribute: (name: string) => (name === "data-key" ? key : null),
    getBoundingClientRect: () => ({ top: now, left: 0 }) as DOMRect,
  });
  return { child, animation: () => fake.animations[0] };
}

/** A container with the given children, as the flip reads them. */
function listOf(children: Element[]): Element {
  return { children } as unknown as Element;
}

describe("playFlip handle", () => {
  it("[MOT-56] cancel stops every running move, and finished then resolves", async () => {
    const a = movedChild("a", 20);
    const b = movedChild("b", 0);
    const before = new Map([
      ["a", { top: 0, left: 0 }],
      ["b", { top: 20, left: 0 }],
    ]);
    const handle = playFlip(listOf([a.child, b.child]), before, { reducedMotion: false });
    const animationA = a.animation();
    const animationB = b.animation();
    expect(animationA).toBeDefined();
    expect(animationB).toBeDefined();
    handle.cancel();
    expect(animationA?.canceled).toBe(1);
    expect(animationB?.canceled).toBe(1);
    await handle.finished;
  });

  it("[MOT-57] a second cancel is harmless: the moves stay canceled and nothing throws", () => {
    const a = movedChild("a", 20);
    const before = new Map([["a", { top: 0, left: 0 }]]);
    const handle = playFlip(listOf([a.child]), before, { reducedMotion: false });
    const animation = a.animation();
    handle.cancel();
    expect(() => handle.cancel()).not.toThrow();
    expect(animation?.canceled).toBeGreaterThanOrEqual(1);
  });

  it("[MOT-58] finished resolves only when every move has finished, not when the first one does", async () => {
    const fakeA = fakeElement();
    const fakeB = fakeElement();
    const a = Object.assign(fakeA.element, {
      getAttribute: () => "a",
      getBoundingClientRect: () => ({ top: 20, left: 0 }) as DOMRect,
    });
    const b = Object.assign(fakeB.element, {
      getAttribute: () => "b",
      getBoundingClientRect: () => ({ top: 0, left: 0 }) as DOMRect,
    });
    const before = new Map([
      ["a", { top: 0, left: 0 }],
      ["b", { top: 20, left: 0 }],
    ]);
    const handle = playFlip(listOf([a, b]), before, { reducedMotion: false });
    let done = false;
    void handle.finished.then(() => {
      done = true;
    });
    fakeA.animations[0]?.finish();
    await settle();
    expect(done).toBe(false);
    fakeB.animations[0]?.finish();
    await settle();
    expect(done).toBe(true);
  });

  it("[MOT-59] with reduced motion nothing moves: the handle is finished at once and cancel does nothing", async () => {
    const a = movedChild("a", 20);
    const before = new Map([["a", { top: 0, left: 0 }]]);
    const handle = playFlip(listOf([a.child]), before, { reducedMotion: true });
    expect(a.animation()).toBeUndefined();
    handle.cancel();
    await handle.finished;
  });

  it("[MOT-60] a list where nothing moved has a handle that is already finished", async () => {
    const a = movedChild("a", 0);
    const before = new Map([["a", { top: 0, left: 0 }]]);
    const handle = playFlip(listOf([a.child]), before, { reducedMotion: false });
    expect(a.animation()).toBeUndefined();
    await handle.finished;
  });
});
