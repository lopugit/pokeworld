import { GOOGLE_MAP_SOURCE_TAG } from "./legacy/coordinates";

// Bump when terrain semantics or sprite stitching changes so stored blocks are rebuilt.
// 2.5.0001: tile-legality port — pond-22/23 retired (SW/SE notch-fill),
// mountains/caves sit on rocky-1 aprons, mountain-8 hole → cave-door-1.
// 2.7.0000: building variety wave — whole-building harvests from real
// pret/pokeemerald town data (Littleroot/Petalburg/Mauville/Mossdeep/Oldale
// houses and shops) join the composed red-house ladder in the mid tiers.
const TERRAIN_REVISION = "2.7.0000";

// The Google Static Maps source parameters participate in the version string:
// changing the world's ground scale (zoom/scale/width) shifts every block
// coordinate, so it must invalidate every previously stored block too.
export const MAP_BLOCK_VERSION = `${TERRAIN_REVISION}-${GOOGLE_MAP_SOURCE_TAG}`;
