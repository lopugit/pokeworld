// Pure helpers for the Google-map overlay comparator on the game screen:
// an opacity blend plus an optional draggable left/right split divider.

export const OVERLAY_MIN_SPLIT = 0.05;
export const OVERLAY_MAX_SPLIT = 0.95;

// How close (as a fraction of canvas width) a pointer must be to the divider
// to grab it. Wide enough for touch, narrow enough not to swallow taps.
export const OVERLAY_SPLIT_GRAB_TOLERANCE = 0.05;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function clampOverlaySplit(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return clamp(value, OVERLAY_MIN_SPLIT, OVERLAY_MAX_SPLIT);
}

export function clampOverlayOpacity(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return clamp(value, 0, 1);
}

export function overlaySplitHit(
  pointerFraction: number,
  splitFraction: number,
  tolerance = OVERLAY_SPLIT_GRAB_TOLERANCE,
): boolean {
  if (!Number.isFinite(pointerFraction)) return false;
  return Math.abs(pointerFraction - clampOverlaySplit(splitFraction)) <= tolerance;
}
