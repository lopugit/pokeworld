import { describe, expect, it } from "vitest";
import {
  OVERLAY_MAX_SPLIT,
  OVERLAY_MIN_SPLIT,
  clampOverlayOpacity,
  clampOverlaySplit,
  overlaySplitHit,
} from "../src/lib/game-overlay";

describe("game overlay comparator", () => {
  it("keeps the split divider inside the visible canvas", () => {
    expect(clampOverlaySplit(0.5)).toBe(0.5);
    expect(clampOverlaySplit(-1)).toBe(OVERLAY_MIN_SPLIT);
    expect(clampOverlaySplit(2)).toBe(OVERLAY_MAX_SPLIT);
    expect(clampOverlaySplit(Number.NaN)).toBe(0.5);
  });

  it("keeps opacity within the drawable alpha range", () => {
    expect(clampOverlayOpacity(0.35)).toBe(0.35);
    expect(clampOverlayOpacity(-0.2)).toBe(0);
    expect(clampOverlayOpacity(1.7)).toBe(1);
    expect(clampOverlayOpacity(Number.NaN)).toBe(0.5);
  });

  it("grabs the divider only near the line", () => {
    expect(overlaySplitHit(0.5, 0.5)).toBe(true);
    expect(overlaySplitHit(0.54, 0.5)).toBe(true);
    expect(overlaySplitHit(0.56, 0.5)).toBe(false);
    expect(overlaySplitHit(0.1, 0.9)).toBe(false);
    expect(overlaySplitHit(Number.NaN, 0.5)).toBe(false);
    // An out-of-range stored split is treated as its clamped position.
    expect(overlaySplitHit(OVERLAY_MAX_SPLIT, 3)).toBe(true);
  });
});
