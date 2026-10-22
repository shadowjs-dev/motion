/**
 * Motion in a right-to-left page. Every move is measured and played in physical pixels (a bounding box has a `left`, not a
 * `start`), so a list that reorders in an RTL container is flipped from where each row was on screen: the transform needs no
 * mirroring, and these tests pin that down with rows of Arabic names.
 */
import { describe, expect, it } from "vitest";
import { captureLayout, playFlip } from "../src/index";
import { fakeElement } from "./support/fake-element";

interface Row {
  readonly key: string;
  readonly left: number;
  readonly top: number;
}

/** A row the fake layout puts at `place`. */
function row(key: string, place: { left: number; top: number }) {
  const fake = fakeElement();
  const element = Object.assign(fake.element, {
    getAttribute: (name: string) => (name === "data-key" ? key : null),
    getBoundingClientRect: () => ({ ...place, right: place.left + 100, width: 100 }) as DOMRect,
  });
  return { element, animations: fake.animations };
}

describe("FLIP in a right-to-left container", () => {
  it("[MOT-RTL-01] a row that moves toward the start of the line (to the right) is played from its old physical place", () => {
    // In an RTL row layout the first item is at the right edge, so putting the Arabic name first moves it from x = 100 to x = 300.
    const moved = row("علي", { left: 300, top: 0 });
    const before = new Map([["علي", { left: 100, top: 0 }]]);
    playFlip({ children: [moved.element] } as unknown as Element, before, { reducedMotion: false });
    expect(moved.animations[0]?.keyframes).toEqual([
      { transform: "translateX(-200px)" },
      { transform: "translateX(0px)" },
    ]);
  });

  it("[MOT-RTL-02] a row that moves toward the end of the line is played the other way, with both axes when both change", () => {
    const moved = row("فاطمة", { left: 50, top: 40 });
    const before = new Map([["فاطمة", { left: 250, top: 0 }]]);
    playFlip({ children: [moved.element] } as unknown as Element, before, { reducedMotion: false });
    expect(moved.animations[0]?.keyframes).toEqual([
      { transform: "translate(200px, -40px)" },
      { transform: "translate(0px, 0px)" },
    ]);
  });

  it("[MOT-RTL-03] captureLayout reads the physical left of every keyed child, Arabic keys included", () => {
    const places: Record<string, Row> = {
      أحمد: { key: "أحمد", left: 400, top: 10 },
      سارة: { key: "سارة", left: 300, top: 10 },
    };
    const children = Object.values(places).map((place) =>
      Object.assign(fakeElement().element, {
        getAttribute: (name: string) => (name === "data-key" ? place.key : null),
        getBoundingClientRect: () => ({ left: place.left, top: place.top }) as DOMRect,
      }),
    );
    const captured = captureLayout({ children } as unknown as Element);
    expect(captured.get("أحمد")).toEqual({ left: 400, top: 10 });
    expect(captured.get("سارة")).toEqual({ left: 300, top: 10 });
  });

  it("[MOT-RTL-04] a row that did not move is not animated", () => {
    const still = row("منى", { left: 120, top: 8 });
    const before = new Map([["منى", { left: 120, top: 8 }]]);
    playFlip({ children: [still.element] } as unknown as Element, before, { reducedMotion: false });
    expect(still.animations).toHaveLength(0);
  });
});
