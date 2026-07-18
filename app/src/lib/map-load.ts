import type { MapOffset } from "../../server/services/map/types";

export function prioritizeInitialMapOffsets(
  offsets: MapOffset[],
  anyLoaded: boolean,
  batchSize = 4,
): MapOffset[] {
  if (!anyLoaded) {
    const center = offsets.find(([x, y]) => x === 0 && y === 0);
    if (center) return [center];
  }
  return offsets.slice(0, batchSize);
}
