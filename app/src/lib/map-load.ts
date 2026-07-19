import type { MapOffset } from "../../server/services/map/types";

export interface BlockCoordinates {
  x: number;
  y: number;
}

export function blockCoordinatesForWorldPosition(
  worldX: number,
  worldY: number,
  blockSize: number,
): BlockCoordinates {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
    throw new Error("World coordinates must be finite numbers");
  }
  if (!Number.isFinite(blockSize) || blockSize <= 0) {
    throw new Error("Block size must be a positive number");
  }
  return {
    x: Math.floor(worldX / blockSize),
    y: Math.floor(worldY / blockSize),
  };
}

export function blockKeyForWorldPosition(
  worldX: number,
  worldY: number,
  blockSize: number,
): string {
  const block = blockCoordinatesForWorldPosition(worldX, worldY, blockSize);
  return `${block.x},${block.y}`;
}

// Submit the complete preload window in one workflow request, but keep the
// centre and cardinal blocks first so the workflow runtime can schedule the
// most immediately useful terrain before diagonals and outer rings.
export function prioritizeMapPreloadOffsets(offsets: MapOffset[]): MapOffset[] {
  return offsets
    .map((offset, index) => ({ index, offset }))
    .sort((left, right) => {
      const [leftX, leftY] = left.offset;
      const [rightX, rightY] = right.offset;
      const ringDifference =
        Math.max(Math.abs(leftX), Math.abs(leftY)) -
        Math.max(Math.abs(rightX), Math.abs(rightY));
      if (ringDifference !== 0) return ringDifference;

      const distanceDifference =
        Math.abs(leftX) + Math.abs(leftY) -
        (Math.abs(rightX) + Math.abs(rightY));
      return distanceDifference || left.index - right.index;
    })
    .map(({ offset }) => offset);
}
