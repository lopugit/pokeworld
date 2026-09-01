// Tall tile art: a 1-wide, 2-tall sprite (16x32 source pixels, e.g. the full
// Emerald tall tree tree-tall-1) whose tile owns only the bottom cell. The
// renderer draws it bottom-anchored two tiles high so the canopy half overlaps
// the tile to the north, and layers it in a shared north-to-south pass with
// the player so occlusion works the way Emerald's forests do.
export const isTallTileArt = (width: number, height: number): boolean =>
  width > 0 && height === width * 2;

export interface TallEntity {
  /** World-space Y of the entity's ground tile (world +y = north/up-screen). */
  mapY: number;
  /** The player breaks ties against tall art on the same row. */
  isPlayer?: boolean;
}

// Paint order for tall art and the player: north (higher mapY, higher on
// screen) first, so each southern sprite's canopy overlaps its northern
// neighbour's trunk. On the same row the player paints last so it is never
// swallowed by a neighbouring trunk.
export function sortTallEntities<T extends TallEntity>(entities: T[]): T[] {
  return [...entities].sort(
    (a, b) => b.mapY - a.mapY || Number(a.isPlayer ?? false) - Number(b.isPlayer ?? false),
  );
}
