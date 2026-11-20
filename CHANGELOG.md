# Changelog

## 1.2.0

### Fixed

- `useDrag`: a spring back that cannot settle (`bounceStiffness` of 0 or less, a negative `bounceDamping`, a state that is no longer finite) ends at its target instead of asking for frames forever.
- `useDrag`: an option that is not a finite number (`NaN`, `Infinity`) takes its default instead of reaching every position and the style.
- `useDrag`: a drag that no click follows (a touch drag) no longer swallows the next click made without a pointer press, such as a keyboard activation.
- `useReducedMotion` starts from `false` while hydrating, as the server rendered, and takes the preference once mounted, so markup that branches on it matches.
- `useScroll` parses its `offset` once, when it is called, not at every scroll event.

## 1.1.2

### Changed

- Released at 1.1.2 with the other packages. No change to this package.

## 1.1.1

### Added

- `ResolvedEdge`: the type `resolveEdge` returns, now exported.

### Changed

- `resolveEdge` and `AxisLayout` are documented in full, with an example.

## 1.1.0

### Added

- `useDrag` and `rubberBand`: pointer dragging with limits, a rubber band past them, a throw that slows down, a spring back, `snapToOrigin`, a click threshold, and a swallowed click after a drag.
- `useScroll`, `scrollProgress` and `resolveEdge`: scroll position and progress of the page, a container or a target, with `offset` points and right-to-left support.
- `useTransform` and `interpolate`: map a value along paired stops, clamped by default, with an optional easing per segment.
- `createShared`: shared-element transitions between a leaving and an arriving element of the same id.
- `useSpringValue` and `stagger`: a spring moved by command with a delay and a starting speed, returning a promise, and the delays of a group.

## 1.0.6

### Changed

- Released at 1.0.6 with the other packages. No change to this package.

## 1.0.5

### Changed

- Released at 1.0.5 with the other packages, which share one version. No change to this package.

## 1.0.4

### Fixed

- Smaller bundles with the same behavior.

## 1.0.3

### Fixed

- A second `playFlip` while the first one runs cancels the running move before it measures, so the new move starts from where the child shows and not from the old transform.
- `useSpring` cuts each frame into steps of at most 1/120 s, so a slow frame (64 ms) no longer makes a stiff spring diverge.
- `animate` with reduced motion sets `delay` and `endDelay` to zero too, so the final state is not held back.
- `playFlip` without Web Animations leaves the child's own inline `transform` alone instead of leaving `translateY(0px)` behind.

## 1.0.2

### Fixed

- `useTween` ends on the target value exactly, whatever the easing returns at the end and whatever floating-point rounding does.
- `useSpring` with a stiffness or mass that is not positive, or a negative damping, snaps to the target on its first frame; before, no stiffness requested frames for ever and a negative one flew away from the target.
- `usePresence` plays `enter` on an element that `ref` receives after the content was unmounted and shown again.

## 1.0.1

### Changed

- Released at 1.0.1 with the other packages, which share one version. No change to this package.

## 1.0.0

### Added

- Reactive animation helpers for springs, transitions, presence and layout motion.
- Reduced-motion handling and lifecycle cleanup for browser animations.

### Fixed

- Springs stop requesting frames for invalid precision and settle exactly when damped motion
  reaches a floating-point fixed point, including precision below the representable resolution.
