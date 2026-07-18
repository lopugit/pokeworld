export const MIN_ZOOM = 0.75;
export const MAX_ZOOM = 3;

// The map API accepts at most 25 offsets per job, which is a 5 x 5 block square.
// Unlimited zoom is therefore a visual/debug option and must not create an
// unbounded Google Maps generation request.
const MAX_MAP_OFFSET_LIMIT = 3;

export type ZoomDirection = "in" | "out";

export function nextZoomValue(
  currentZoom: number,
  direction: ZoomDirection,
  step: number,
  noMaxZoom: boolean,
): number | null {
  if (!Number.isFinite(currentZoom) || !Number.isFinite(step) || step <= 0) return null;

  if (direction === "in") {
    if (currentZoom <= MIN_ZOOM) return null;
    return Math.max(MIN_ZOOM, currentZoom - step);
  }

  if (!noMaxZoom && currentZoom >= MAX_ZOOM) return null;
  const nextZoom = currentZoom + step;
  return noMaxZoom ? nextZoom : Math.min(MAX_ZOOM, nextZoom);
}

export function mapOffsetLimitForZoom(zoom: number) {
  return Math.min(MAX_MAP_OFFSET_LIMIT, Math.max(2, Math.ceil(zoom)));
}
