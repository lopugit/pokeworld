import { GOOGLE_MAP_SOURCE_TAG } from "./legacy/coordinates";

// Bump when terrain semantics or sprite stitching changes so stored blocks are rebuilt.
// 2.5.0001: tile-legality port — pond-22/23 retired (SW/SE notch-fill),
// mountains/caves sit on rocky-1 aprons, mountain-8 hole → cave-door-1.
// 2.7.0000: building variety wave — whole-building harvests from real
// pret/pokeemerald town data (Littleroot/Petalburg/Mauville/Mossdeep/Oldale
// houses and shops) join the composed red-house ladder in the mid tiers.
// 2.8.0000: world-space building components — one structure per detected
// google-maps building even when its footprint spans block seams (8-way
// world flood fill + deterministic single-owner anchors), so previously
// duplicated seam houses and stale mountain/boulder stitches regenerate.
// 2.9.0000: store-backed seam convergence — public (Thingtime, no-Mongo)
// deployments now load stored neighbours and persist re-stitched edges, so
// the 2.8 site rule finally converges in production instead of planning
// sites against per-block truncated masks (which grew one structure per
// block on every seam-spanning building). Same imagery tag: stored terrain
// is reused and the migration re-stitches mods-only, without Google fetches.
// 3.0.0000: full tall trees — every standalone tree stamp switches from the
// half-crop tree-1 to tree-tall-1, the complete 16x32 Emerald slim tree
// (crown keyed transparent) that the client renders bottom-anchored two
// tiles high with north-to-south layering. Also plants a house-number sign
// beside each stitched house's door (feature "house-sign"). Same imagery
// tag: stored blocks re-stitch mods-only, without Google fetches.
// 3.0.0001: roads wear the general tileset's textured tan route art (the
// old road-1..9 held Rustboro's white plaza pavement, which read as snow on
// grass); one-tile centerlines pick the composed narrow variants road-10/11.
const TERRAIN_REVISION = "3.0.0001";

// The Google Static Maps source parameters participate in the version string:
// changing the world's ground scale (zoom/scale/width) shifts every block
// coordinate, so it must invalidate every previously stored block too.
export const MAP_BLOCK_VERSION = `${TERRAIN_REVISION}-${GOOGLE_MAP_SOURCE_TAG}`;

// Blocks whose version carries the same source tag were classified from the
// same ground imagery: their stored terrain remains valid across terrain
// revisions, so they can seed mods-only re-stitching instead of a refetch.
export { GOOGLE_MAP_SOURCE_TAG };

export function sharesMapSourceImagery(version: unknown): boolean {
  return typeof version === "string" && version.endsWith(`-${GOOGLE_MAP_SOURCE_TAG}`);
}
