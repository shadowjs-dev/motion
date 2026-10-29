# Changelog

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
