<p align="center"><img src="https://raw.githubusercontent.com/shadowjs-dev/motion/main/.github/banner.png" alt="ShadowJS" width="100%"></p>

# @shadow-js/motion

[![npm](https://img.shields.io/npm/v/@shadow-js/motion.svg)](https://www.npmjs.com/package/@shadow-js/motion)
[![CI](https://github.com/shadowjs-dev/motion/actions/workflows/ci.yml/badge.svg)](https://github.com/shadowjs-dev/motion/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](https://github.com/shadowjs-dev/motion/blob/main/LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-blue.svg)](https://www.typescriptlang.org/)

Signal-driven motion for ShadowJS 1.0.0: tween and spring values (`useTween`, `useSpring`), an element
animation over the Web Animations API with a fallback (`animate`), presence for content that leaves
(`Presence` and `usePresence`), FLIP for reordered keyed lists (`captureLayout`, `playFlip`), and the
reduced-motion preference everywhere. Each export is in its own module with `sideEffects: false`.

## Install

```sh
npm install @shadow-js/motion
```

## Quick start

```ts title="motion.test.ts" test
import { createRoot, flushSync, useSignal } from "@shadow-js/core";
import { easings, useTween } from "@shadow-js/motion";
import { expect, it } from "vitest";

it("eases a value to its target", () => {
  const [target, setTarget] = useSignal(0);
  const value = createRoot(() =>
    useTween(target, { duration: 0, ease: easings.linear, reducedMotion: () => true }),
  );
  setTarget(100);
  flushSync();
  expect(value()).toBe(100);
});
```

In a component, `<Presence when={open()} exit={[{ opacity: 1 }, { opacity: 0 }]}>...</Presence>` keeps its
children in a wrapper until the exit keyframes finish.

## API

- `useTween(source, options)` and `useSpring(source, options)`: accessors that move toward `source()`.
  A retarget mid-flight starts from the value on screen (tween) or keeps the velocity (spring). Both
  stop requesting frames once they are done, and disposing their owner cancels the pending frame.
  Spring precision must be positive and finite; invalid precision snaps on the next frame. Damped
  springs also settle when floating-point rounding prevents further state changes, so precision
  below the representable resolution cannot keep an idle spring scheduling frames indefinitely.
- `animate(element, keyframes, options)`: the Web Animations call, with `finished`, `cancel` and `finish`.
  Without `element.animate` the last keyframe is written to the style of an `HTMLElement`.
- `Presence` (component) and `usePresence(options)`: content that leaves with an animation. Opening
  again during the exit cancels it.
- `captureLayout(container)` and `playFlip(container, before)`: FLIP for keyed children, returning a handle with `cancel()` and `finished`; moving only
  `transform`. It does nothing with reduced motion.
- `useReducedMotion()`, `prefersReducedMotionNow()`, `easings`, `frameClock`.

Reduced motion comes from `matchMedia("(prefers-reduced-motion: reduce)")`. Where there is no
`matchMedia` (servers, some test environments) it reads as "not reduced". Effects never run on the
server, so the hooks only return their starting values there.

## Links

- Recipes for a list that enters and exits, press feedback with a spring, a drawer, and canceling on abort.
- Reference: `/reference/motion/` on the documentation site.

## Dependencies

- Runtime: none.
- Peers: `@shadow-js/core` and `@shadow-js/web` `^1.0.3`: the reactive clock and the renderer the animation hooks drive.

## Types

- Names from the root: `AnimateOptions`, `AnimationHandle`, `FlipOptions`, `MotionClock`, `Presence`, `usePresence`, `useSpring`, `useTween`.
- Type tests in `test-types/` are compile-time checks; `npm run typecheck:types` runs them.

## Support

- Node.js `>=22.12.0`. ESM only: use `import`; `require` is not supported.
- Browsers: current evergreen releases.
- Versioning: every `@shadow-js/*` package releases together at one version. Upgrade them as one set.
- Documentation: [ShadowJS documentation](https://shadowjs.net).

## Using, changing and contributing

- **Use the package** (a person or a coding agent that builds with it): this README, and [SKILL.md](SKILL.md), the short page an agent reads first.
- **Change the package** (fix a bug, add a feature): [AGENTS.md](AGENTS.md) says how the repository is laid out, how to implement and test a change, and how a pull request is reviewed. It is written for people and coding agents alike.
- **Take part**: [CONTRIBUTING.md](CONTRIBUTING.md) is the short guide; [SECURITY.md](SECURITY.md) is for vulnerabilities.
