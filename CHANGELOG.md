# Changelog

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
