import type { MapOffset } from "../../server/services/map/types";

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
