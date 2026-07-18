import { describe, expect, it } from "vitest";
import { MAX_ZOOM, MIN_ZOOM, mapOffsetLimitForZoom, nextZoomValue } from "../src/lib/game-zoom";

describe("game zoom", () => {
  it("stops at the normal zoom bounds", () => {
    expect(nextZoomValue(MIN_ZOOM, "in", 0.125, false)).toBeNull();
    expect(nextZoomValue(0.8, "in", 0.125, false)).toBe(MIN_ZOOM);
    expect(nextZoomValue(MAX_ZOOM, "out", 0.125, false)).toBeNull();
    expect(nextZoomValue(2.99, "out", 0.125, false)).toBe(MAX_ZOOM);
  });

  it("allows zooming out past the normal maximum when enabled", () => {
    expect(nextZoomValue(MAX_ZOOM, "out", 0.125, true)).toBe(3.125);
    expect(nextZoomValue(10, "out", 0.125, true)).toBe(10.125);
  });

  it("keeps map loading within the API's 25-offset boundary", () => {
    expect(mapOffsetLimitForZoom(1.25)).toBe(2);
    expect(mapOffsetLimitForZoom(3)).toBe(3);
    expect(mapOffsetLimitForZoom(100)).toBe(3);
  });
});
