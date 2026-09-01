import { describe, expect, it } from "vitest";
import { MAX_ZOOM, MIN_ZOOM } from "../src/lib/game-zoom";
import {
  centroidOf,
  clampPanToPlayer,
  clampPinchZoom,
  computePinchUpdate,
  distanceOf,
  snapToTileGrid,
} from "../src/lib/pinch-zoom";

const view = { canvasWidth: 512, canvasHeight: 512, clientWidth: 512, clientHeight: 512 };

const start = (overrides: Partial<Parameters<typeof computePinchUpdate>[0]> = {}) => ({
  distance: 100,
  centroid: { x: 256, y: 256 },
  zoom: 1.25,
  mapX: 0,
  mapY: 0,
  ...overrides,
});

describe("gesture geometry", () => {
  it("computes centroid and distance", () => {
    expect(centroidOf({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
    expect(distanceOf({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("clamps pinch zoom to the shared zoom limits", () => {
    expect(clampPinchZoom(0.1, false)).toBe(MIN_ZOOM);
    expect(clampPinchZoom(99, false)).toBe(MAX_ZOOM);
    expect(clampPinchZoom(99, true)).toBe(99);
    expect(clampPinchZoom(Number.NaN, false)).toBe(MIN_ZOOM);
  });
});

describe("computePinchUpdate", () => {
  it("pans the camera opposite the centroid drag (content follows fingers)", () => {
    // Fingers move 32 CSS px right and 32 px down at constant distance.
    const update = computePinchUpdate(
      start(),
      { distance: 100, centroid: { x: 288, y: 288 } },
      view,
    );
    expect(update.zoom).toBeCloseTo(1.25);
    // 32 css px at zoom 1.25 = 40 world units; content right = camera west.
    expect(update.mapX).toBeCloseTo(-40);
    // Dragging down shows ground further north = camera up in world y.
    expect(update.mapY).toBeCloseTo(40);
  });

  it("zooms in when fingers spread, anchored at the centroid", () => {
    const update = computePinchUpdate(
      start(),
      { distance: 200, centroid: { x: 256, y: 256 } },
      view,
    );
    expect(update.zoom).toBeCloseTo(0.75); // 1.25 * 100/200 clamped to MIN_ZOOM
    // The world point that was under the centroid stays under it.
    const before = start();
    const anchorX = before.mapX + 256 * ((512 * before.zoom) / 512);
    const afterAnchorX = update.mapX + 256 * ((512 * update.zoom) / 512);
    expect(afterAnchorX).toBeCloseTo(anchorX);
  });

  it("zooms out when fingers close, respecting MAX_ZOOM", () => {
    const update = computePinchUpdate(
      start({ zoom: 2.5 }),
      { distance: 20, centroid: { x: 256, y: 256 } },
      view,
    );
    expect(update.zoom).toBe(MAX_ZOOM);
  });

  it("survives degenerate zero distances without NaN", () => {
    const update = computePinchUpdate(
      start({ distance: 0 }),
      { distance: 0, centroid: { x: 256, y: 256 } },
      view,
    );
    expect(Number.isFinite(update.mapX)).toBe(true);
    expect(update.zoom).toBeCloseTo(1.25);
  });
});

describe("clampPanToPlayer", () => {
  it("limits how far the viewport centre drifts from the player", () => {
    const player = { x: 1000, y: 1000 };
    const clamped = clampPanToPlayer(
      { zoom: 1, mapX: 100000, mapY: -100000 },
      player,
      { canvasWidth: 512, canvasHeight: 512 },
      1024,
    );
    expect(clamped.mapX + 256).toBe(player.x + 1024);
    expect(clamped.mapY + 256).toBe(player.y - 1024);
  });

  it("leaves an in-range camera untouched", () => {
    const clamped = clampPanToPlayer(
      { zoom: 1, mapX: 800, mapY: 900 },
      { x: 1000, y: 1000 },
      { canvasWidth: 512, canvasHeight: 512 },
      1024,
    );
    expect(clamped).toEqual({ zoom: 1, mapX: 800, mapY: 900 });
  });
});

describe("snapToTileGrid", () => {
  it("rounds to the nearest tile", () => {
    expect(snapToTileGrid(47, 32)).toBe(32);
    expect(snapToTileGrid(49, 32)).toBe(64);
    expect(snapToTileGrid(-17, 32)).toBe(-32);
  });
});
