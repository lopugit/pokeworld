import { MAX_ZOOM, MIN_ZOOM } from "./game-zoom";

// Two-finger pan/pinch math for the map canvas. All camera work happens in
// world units: game.zoom is "canvas-widths of world visible" (see game-zoom),
// so pixels-per-CSS-px depend on the current zoom and the canvas client size.
// The invariant maintained while a gesture is live: the world point that sat
// under the fingers' centroid when the gesture started stays under the
// centroid as it moves and as the finger distance rescales the zoom.

export interface GesturePoint {
  x: number;
  y: number;
}

export interface PinchStart {
  distance: number;
  centroid: GesturePoint;
  zoom: number;
  mapX: number;
  mapY: number;
}

export interface PinchViewport {
  canvasWidth: number;
  canvasHeight: number;
  clientWidth: number;
  clientHeight: number;
}

export interface PinchUpdate {
  zoom: number;
  mapX: number;
  mapY: number;
}

export const centroidOf = (a: GesturePoint, b: GesturePoint): GesturePoint => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

export const distanceOf = (a: GesturePoint, b: GesturePoint): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

export function clampPinchZoom(zoom: number, noMaxZoom: boolean): number {
  if (!Number.isFinite(zoom)) return MIN_ZOOM;
  const max = noMaxZoom ? Number.POSITIVE_INFINITY : MAX_ZOOM;
  return Math.min(Math.max(zoom, MIN_ZOOM), max);
}

/**
 * One combined pan+zoom step. Fingers moving apart shrink `zoom` (more
 * magnification), the centroid drag pans, and the world point under the
 * start centroid stays glued to the moving centroid throughout.
 */
export function computePinchUpdate(
  start: PinchStart,
  current: { distance: number; centroid: GesturePoint },
  view: PinchViewport,
  noMaxZoom = false,
): PinchUpdate {
  const zoom = clampPinchZoom(
    start.zoom * (start.distance > 0 && current.distance > 0 ? start.distance / current.distance : 1),
    noMaxZoom,
  );

  const startWorldPerCssX = (view.canvasWidth * start.zoom) / Math.max(1, view.clientWidth);
  const startWorldPerCssY = (view.canvasHeight * start.zoom) / Math.max(1, view.clientHeight);
  // The screen's top row shows the world's highest y (convertY flips), so a
  // CSS y measured from the top maps to worldY = mapY + span - cssY * scale.
  const anchorWorldX = start.mapX + start.centroid.x * startWorldPerCssX;
  const anchorWorldY = start.mapY + view.canvasHeight * start.zoom - start.centroid.y * startWorldPerCssY;

  const worldPerCssX = (view.canvasWidth * zoom) / Math.max(1, view.clientWidth);
  const worldPerCssY = (view.canvasHeight * zoom) / Math.max(1, view.clientHeight);
  return {
    zoom,
    mapX: anchorWorldX - current.centroid.x * worldPerCssX,
    mapY: anchorWorldY - (view.canvasHeight * zoom - current.centroid.y * worldPerCssY),
  };
}

/**
 * Keep a panned camera within reach of the player: the viewport centre may
 * drift at most `maxPanWorld` world units from the player on each axis, so a
 * free-look can never wander past the block-preload radius.
 */
export function clampPanToPlayer(
  update: PinchUpdate,
  player: GesturePoint,
  view: { canvasWidth: number; canvasHeight: number },
  maxPanWorld: number,
): PinchUpdate {
  const spanX = view.canvasWidth * update.zoom;
  const spanY = view.canvasHeight * update.zoom;
  const clampCentre = (value: number, target: number) =>
    Math.min(Math.max(value, target - maxPanWorld), target + maxPanWorld);
  return {
    zoom: update.zoom,
    mapX: clampCentre(update.mapX + spanX / 2, player.x) - spanX / 2,
    mapY: clampCentre(update.mapY + spanY / 2, player.y) - spanY / 2,
  };
}

/** Snap a camera coordinate to the tile grid (movement logic steps by tiles). */
export const snapToTileGrid = (value: number, tileSize: number): number =>
  Math.round(value / tileSize) * tileSize;
