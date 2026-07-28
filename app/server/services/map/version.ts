import { GOOGLE_MAP_SOURCE_TAG } from "./legacy/coordinates";

// Bump when terrain semantics or sprite stitching changes so stored blocks are rebuilt.
const TERRAIN_REVISION = "2.4.0001";

// The Google Static Maps source parameters participate in the version string:
// changing the world's ground scale (zoom/scale/width) shifts every block
// coordinate, so it must invalidate every previously stored block too.
export const MAP_BLOCK_VERSION = `${TERRAIN_REVISION}-${GOOGLE_MAP_SOURCE_TAG}`;
