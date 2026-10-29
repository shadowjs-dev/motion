/** Review round seven, in happy-dom: playFlip without Web Animations keeps the element's own transform. */
import { describe, expect, it } from "vitest";
import { captureLayout, playFlip } from "../src/index";

/** A row whose box is at `top`. */
function row(key: string, top: number): HTMLElement {
  const element = document.createElement("li");
  element.setAttribute("data-key", key);
  element.getBoundingClientRect = () => ({ top, left: 0 }) as DOMRect;
  return element;
}

describe("playFlip without element.animate", () => {
  it("[MOT-R7-5] the inline transform of a moved child is the one it had, not translateY(0px)", async () => {
    const list = document.createElement("ul");
    const first = row("a", 0);
    first.style.transform = "rotate(5deg)";
    list.append(first);
    const before = captureLayout(list);
    first.getBoundingClientRect = () => ({ top: 20, left: 0 }) as DOMRect;
    (first as unknown as { animate?: unknown }).animate = undefined;
    await playFlip(list, before, { reducedMotion: false }).finished;
    expect(first.style.transform).toBe("rotate(5deg)");
  });
});
