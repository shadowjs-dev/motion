---
name: shadowjs-motion
description: "Work with @shadow-js/motion. Tween and spring values, exit animations and animated list reordering, driven by signals. Use when a project imports it, or when asked to add, configure or debug it."
---

# @shadow-js/motion

Version 1.0.3. Tween and spring values, exit animations and animated list reordering, driven by signals.

## Where to read more

- @shadow-js/motion: https://motion.shadowjs.net
- Source and issues: https://github.com/shadowjs-dev/motion
- The package README is the full reference for options and behavior; read it before changing a configuration.

## Install

```sh
npm install @shadow-js/motion @shadow-js/core @shadow-js/web
```

## Peer dependencies

| Package | Range | Required |
| --- | --- | --- |
| `@shadow-js/core` | `^1.0.3` | yes |
| `@shadow-js/web` | `^1.0.3` | yes |

## Import paths

Import only from these paths. Never from `dist` or `src`: files that are not listed here are private and change without notice.

- `@shadow-js/motion`

## Quick start

```ts
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

## Working rules

- Run `npm run check` before proposing a change; it lints, builds, type-checks and tests.
- Keep a public change documented: TSDoc on every exported symbol, and a CHANGELOG entry.
- To change this repository rather than use the package, read AGENTS.md: the layout, the commands, the rules and how a pull request is reviewed.
