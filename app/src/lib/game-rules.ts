import type { MapTile } from "../../server/services/map/types";

export type Direction = "up" | "down" | "left" | "right";
export type MoveAction = "moveUp" | "moveRight" | "moveDown" | "moveLeft";

export const actionDirection: Record<MoveAction, Direction> = {
  moveUp: "up",
  moveDown: "down",
  moveLeft: "left",
  moveRight: "right",
};

// World-tile deltas. World +y is north/up-screen because tile y is flipped at
// creation (blocks.ts stores y = 15 - offsetY), so moveUp increases mapY.
export const actionDelta: Record<MoveAction, { dx: number; dy: number }> = {
  moveUp: { dx: 0, dy: 1 },
  moveDown: { dx: 0, dy: -1 },
  moveLeft: { dx: -1, dy: 0 },
  moveRight: { dx: 1, dy: 0 },
};

export const directionDelta: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: 1 },
  down: { dx: 0, dy: -1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

// Client mirror of the server's deterministic hash (legacy/mods/terrain-life.ts).
// A vitest parity test keeps the two implementations locked together.
export const hashUnit = (x: number, y: number, salt = ""): number => {
  let value = Math.imul((x | 0) ^ 0x9e3779b9, 0x85ebca6b);
  value ^= Math.imul((y | 0) ^ 0xc2b2ae35, 0x27d4eb2d);
  for (let index = 0; index < salt.length; index += 1) {
    value = Math.imul(value ^ salt.charCodeAt(index), 0x165667b1);
  }
  value ^= value >>> 16;
  return (value >>> 0) / 0x100000000;
};

export const tileCoordKey = (mapX: number, mapY: number) => `${mapX},${mapY}`;

const img2Of = (tile: MapTile | undefined) => String(tile?.img2 ?? "");

export const isLedgeTile = (tile: MapTile | undefined): boolean =>
  !!tile && (tile.feature === "ledge" || img2Of(tile).startsWith("ledge-"));

export const isFieldItemTile = (tile: MapTile | undefined): boolean =>
  !!tile && (tile.feature === "field-item" || img2Of(tile).startsWith("field-item"));

export const isSignTile = (tile: MapTile | undefined): boolean =>
  !!tile && (tile.feature === "sign" || img2Of(tile).startsWith("route-sign"));

export const isCaveEntranceTile = (tile: MapTile | undefined): boolean =>
  !!tile && tile.feature === "cave-entrance";

export type TileLookup = (mapX: number, mapY: number) => MapTile | undefined;
export type CollectedLookup = (coordKey: string) => boolean;

export const isSolidFor = (tile: MapTile | undefined, collected: CollectedLookup): boolean => {
  if (!tile || !tile.solid) return false;
  if (isFieldItemTile(tile) && collected(tileCoordKey(tile.mapX, tile.mapY))) return false;
  return true;
};

export type MoveResolution =
  | { kind: "move"; toX: number; toY: number }
  | { kind: "jump"; toX: number; toY: number; overX: number; overY: number }
  | { kind: "blocked" };

export function resolveMove(
  lookup: TileLookup,
  fromX: number,
  fromY: number,
  action: MoveAction,
  tileSize: number,
  collected: CollectedLookup,
): MoveResolution {
  const { dx, dy } = actionDelta[action];
  const toX = fromX + dx * tileSize;
  const toY = fromY + dy * tileSize;
  const target = lookup(toX, toY);
  if (!target) return { kind: "move", toX, toY };

  if (isLedgeTile(target)) {
    // Ledges are jumped from above, moving screen-down (world -y), landing on
    // the far side. Every other approach is a wall.
    if (action === "moveDown") {
      const landX = toX + dx * tileSize;
      const landY = toY + dy * tileSize;
      const landing = lookup(landX, landY);
      if (!isSolidFor(landing, collected) && !isLedgeTile(landing)) {
        return { kind: "jump", toX: landX, toY: landY, overX: toX, overY: toY };
      }
    }
    return { kind: "blocked" };
  }

  if (isSolidFor(target, collected)) return { kind: "blocked" };
  return { kind: "move", toX, toY };
}

export interface FieldItem {
  id: string;
  name: string;
  pocket: "items" | "pokeballs" | "keyItems";
  description: string;
}

const FIELD_ITEM_TABLE: Array<{ weight: number; item: FieldItem }> = [
  { weight: 30, item: { id: "poke-ball", name: "POKé BALL", pocket: "pokeballs", description: "A tool for catching wild POKéMON." } },
  { weight: 18, item: { id: "potion", name: "POTION", pocket: "items", description: "Restores 20 HP of one POKéMON." } },
  { weight: 10, item: { id: "super-potion", name: "SUPER POTION", pocket: "items", description: "Restores 50 HP of one POKéMON." } },
  { weight: 10, item: { id: "great-ball", name: "GREAT BALL", pocket: "pokeballs", description: "A good BALL with a higher catch rate." } },
  { weight: 8, item: { id: "antidote", name: "ANTIDOTE", pocket: "items", description: "Heals a poisoned POKéMON." } },
  { weight: 7, item: { id: "revive", name: "REVIVE", pocket: "items", description: "Revives a fainted POKéMON with half HP." } },
  { weight: 6, item: { id: "rare-candy", name: "RARE CANDY", pocket: "items", description: "Raises a POKéMON's level by one." } },
  { weight: 5, item: { id: "nugget", name: "NUGGET", pocket: "items", description: "A pure gold nugget. Sells high." } },
  { weight: 4, item: { id: "ultra-ball", name: "ULTRA BALL", pocket: "pokeballs", description: "A top-grade BALL with a great catch rate." } },
  { weight: 2, item: { id: "max-revive", name: "MAX REVIVE", pocket: "items", description: "Fully revives a fainted POKéMON." } },
];

export function fieldItemFor(mapX: number, mapY: number): FieldItem {
  const roll = hashUnit(mapX, mapY, "field-item");
  const total = FIELD_ITEM_TABLE.reduce((sum, entry) => sum + entry.weight, 0);
  let remaining = roll * total;
  for (const entry of FIELD_ITEM_TABLE) {
    remaining -= entry.weight;
    if (remaining < 0) return entry.item;
  }
  return FIELD_ITEM_TABLE[0].item;
}

const SIGN_PAGES: Array<(route: number) => string[]> = [
  (route) => [`ROUTE ${route}`, "TRAINER TIPS\nLong grass loves to hide\nsurprises... and POKéMON."],
  (route) => [`ROUTE ${route}`, "TRAINER TIPS\nLedges only work one way.\nGravity is famously stubborn."],
  (route) => [`ROUTE ${route}`, "Berry seedlings planted here\nwill grow one day. Probably."],
  (route) => [`ROUTE ${route} — scenic outlook`, "Someone has scratched a doodle\nof a MUDKIP into the corner."],
  (route) => [`ROUTE ${route}`, "NOTICE\nHidden items sparkle for those\nwho press A with conviction."],
  (route) => [`ROUTE ${route}`, "“The world is bigger than any\nmap of it.” — a wandering sage"],
  (route) => [`ROUTE ${route}`, "LOST: one BIKE.\nIf found, please ride it\nsomewhere fun."],
  (route) => [`ROUTE ${route}`, "TRAINER TIPS\nTalk to signs. You never know\nwhich ones talk back."],
];

export function signPagesFor(mapX: number, mapY: number): string[] {
  const route = 101 + Math.floor(hashUnit(mapX, mapY, "route") * 33);
  const index = Math.floor(hashUnit(mapX, mapY, "sign-text") * SIGN_PAGES.length);
  return SIGN_PAGES[Math.min(index, SIGN_PAGES.length - 1)](route);
}

const CAVE_PAGES: string[][] = [
  ["The cave mouth yawns darkly.", "A cool draft whispers from\nsomewhere deep within..."],
  ["Rough stone steps descend\ninto the dark.", "You'll need more courage\n(and a later update) to enter."],
  ["Something glitters faintly\ninside the cave.", "The darkness stares back,\npolitely, for now."],
];

export function cavePagesFor(mapX: number, mapY: number): string[] {
  const index = Math.floor(hashUnit(mapX, mapY, "cave-text") * CAVE_PAGES.length);
  return CAVE_PAGES[Math.min(index, CAVE_PAGES.length - 1)];
}

const HOUSE_PAGES: string[][] = [
  ["Knock knock.", "...no one answered.\nThe curtains twitched, though."],
  ["The door is locked.", "A doormat reads:\n“GO AWAY (unless you brought\nBERRIES).”"],
  ["You hear a TV inside.", "Someone is watching a show\nabout dramatic WAILORD rescues."],
];

export function housePagesFor(mapX: number, mapY: number): string[] {
  const index = Math.floor(hashUnit(mapX, mapY, "house-text") * HOUSE_PAGES.length);
  return HOUSE_PAGES[Math.min(index, HOUSE_PAGES.length - 1)];
}

export interface Interaction {
  type: "sign" | "item" | "cave" | "house" | "none";
  pages?: string[];
}

export function interactionFor(tile: MapTile | undefined, collected: CollectedLookup): Interaction {
  if (!tile) return { type: "none" };
  if (isFieldItemTile(tile)) {
    if (collected(tileCoordKey(tile.mapX, tile.mapY))) return { type: "none" };
    return { type: "item" };
  }
  if (isSignTile(tile)) return { type: "sign", pages: signPagesFor(tile.mapX, tile.mapY) };
  if (isCaveEntranceTile(tile)) return { type: "cave", pages: cavePagesFor(tile.mapX, tile.mapY) };
  if (tile.feature === "house") return { type: "house", pages: housePagesFor(tile.mapX, tile.mapY) };
  return { type: "none" };
}
