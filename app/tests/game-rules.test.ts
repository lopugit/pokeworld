import { describe, expect, it } from "vitest";
import type { MapTile } from "../server/services/map/types";
import { hashUnit as serverHashUnit } from "../server/services/map/legacy/mods/terrain-life";
import {
  cavePagesFor,
  fieldItemFor,
  hashUnit,
  interactionFor,
  isFieldItemTile,
  isLedgeTile,
  isSignTile,
  isSolidFor,
  resolveMove,
  signPagesFor,
  tileCoordKey,
} from "../src/lib/game-rules";

const tile = (mapX: number, mapY: number, extra: Partial<MapTile> = {}): MapTile => ({
  uuid: `tile-${mapX}-${mapY}`,
  blockX: 0,
  blockY: 0,
  mapX,
  mapY,
  x: 0,
  y: 0,
  ...extra,
});

const lookupFrom = (tiles: MapTile[]) => {
  const db = new Map(tiles.map((entry) => [tileCoordKey(entry.mapX, entry.mapY), entry]));
  return (mapX: number, mapY: number) => db.get(tileCoordKey(mapX, mapY));
};

const nothingCollected = () => false;

describe("hashUnit client mirror", () => {
  it("matches the server implementation exactly", () => {
    const samples: Array<[number, number, string]> = [
      [0, 0, ""],
      [32, 64, "life"],
      [946647 * 512, 488524 * 512, "field-item"],
      [-320, 999999, "sign-text"],
      [123456, -654321, "route"],
    ];
    for (const [x, y, salt] of samples) {
      expect(hashUnit(x, y, salt)).toBe(serverHashUnit(x, y, salt));
    }
  });

  it("is deterministic and in [0, 1)", () => {
    for (let index = 0; index < 50; index += 1) {
      const value = hashUnit(index * 32, index * 64, "check");
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(hashUnit(index * 32, index * 64, "check")).toBe(value);
    }
  });
});

describe("feature detection", () => {
  it("detects ledges via feature or img2 prefix", () => {
    expect(isLedgeTile(tile(0, 0, { feature: "ledge" }))).toBe(true);
    expect(isLedgeTile(tile(0, 0, { img2: "ledge-middle-1" }))).toBe(true);
    expect(isLedgeTile(tile(0, 0, { img2: "tree-1" }))).toBe(false);
    expect(isLedgeTile(undefined)).toBe(false);
  });

  it("detects field items and signs", () => {
    expect(isFieldItemTile(tile(0, 0, { feature: "field-item" }))).toBe(true);
    expect(isFieldItemTile(tile(0, 0, { feature: "hidden-item", img2: "grass" }))).toBe(true);
    expect(isFieldItemTile(tile(0, 0, { img2: "field-item-1" }))).toBe(true);
    expect(isSignTile(tile(0, 0, { feature: "sign" }))).toBe(true);
    expect(isSignTile(tile(0, 0, { img2: "route-sign-1" }))).toBe(true);
  });
});

describe("resolveMove", () => {
  it("moves into empty void (unloaded tiles stay walkable)", () => {
    const result = resolveMove(lookupFrom([]), 0, 0, "moveRight", 32, nothingCollected);
    expect(result).toEqual({ kind: "move", toX: 32, toY: 0 });
  });

  it("blocks solid tiles", () => {
    const lookup = lookupFrom([tile(32, 0, { solid: true, img2: "tree-1" })]);
    expect(resolveMove(lookup, 0, 0, "moveRight", 32, nothingCollected)).toEqual({ kind: "blocked" });
  });

  it("walks onto walkable tiles", () => {
    const lookup = lookupFrom([tile(32, 0, { img: "grass" })]);
    expect(resolveMove(lookup, 0, 0, "moveRight", 32, nothingCollected)).toEqual({
      kind: "move",
      toX: 32,
      toY: 0,
    });
  });

  it("jumps ledges only when moving screen-down (world -y)", () => {
    // Player at y=64 moving down to the ledge at y=32 lands at y=0.
    const lookup = lookupFrom([
      tile(0, 32, { feature: "ledge", img2: "ledge-middle-1", solid: true }),
      tile(0, 0, { img: "grass" }),
    ]);
    expect(resolveMove(lookup, 0, 64, "moveDown", 32, nothingCollected)).toEqual({
      kind: "jump",
      toX: 0,
      toY: 0,
      overX: 0,
      overY: 32,
    });
    // Approaching the same ledge from below (moveUp) is blocked.
    expect(resolveMove(lookup, 0, 0, "moveUp", 32, nothingCollected)).toEqual({ kind: "blocked" });
    // Approaching sideways is blocked.
    const sideLookup = lookupFrom([tile(32, 0, { feature: "ledge", solid: true })]);
    expect(resolveMove(sideLookup, 0, 0, "moveRight", 32, nothingCollected)).toEqual({ kind: "blocked" });
  });

  it("refuses ledge jumps onto solid or ledge landings", () => {
    const solidLanding = lookupFrom([
      tile(0, 32, { feature: "ledge", solid: true }),
      tile(0, 0, { solid: true, img2: "rock-1" }),
    ]);
    expect(resolveMove(solidLanding, 0, 64, "moveDown", 32, nothingCollected)).toEqual({ kind: "blocked" });

    const doubleLedge = lookupFrom([
      tile(0, 32, { feature: "ledge", solid: true }),
      tile(0, 0, { feature: "ledge", solid: true }),
    ]);
    expect(resolveMove(doubleLedge, 0, 64, "moveDown", 32, nothingCollected)).toEqual({ kind: "blocked" });
  });

  it("treats collected field items as walkable", () => {
    const itemTile = tile(32, 0, { feature: "field-item", img2: "field-item-1", solid: true });
    const lookup = lookupFrom([itemTile]);
    expect(resolveMove(lookup, 0, 0, "moveRight", 32, nothingCollected)).toEqual({ kind: "blocked" });
    const collected = (key: string) => key === "32,0";
    expect(resolveMove(lookup, 0, 0, "moveRight", 32, collected)).toEqual({ kind: "move", toX: 32, toY: 0 });
    expect(isSolidFor(itemTile, collected)).toBe(false);
  });
});

describe("interactions", () => {
  it("offers an item for uncollected field items and nothing afterwards", () => {
    const itemTile = tile(64, 96, { feature: "field-item", solid: true });
    expect(interactionFor(itemTile, nothingCollected)).toEqual({ type: "item" });
    expect(interactionFor(itemTile, (key) => key === "64,96")).toEqual({ type: "none" });
  });

  it("returns deterministic seeded sign pages", () => {
    const pages = signPagesFor(320, 640);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages).toEqual(signPagesFor(320, 640));
    expect(pages[0]).toMatch(/^ROUTE \d+/);
  });

  it("returns cave and house dialog pages", () => {
    const cave = interactionFor(tile(0, 0, { feature: "cave-entrance" }), nothingCollected);
    expect(cave.type).toBe("cave");
    expect(cave.pages?.length).toBeGreaterThan(0);
    expect(cavePagesFor(0, 0)).toEqual(cavePagesFor(0, 0));

    const house = interactionFor(tile(0, 0, { feature: "house" }), nothingCollected);
    expect(house.type).toBe("house");
    expect(house.pages?.length).toBeGreaterThan(0);
  });

  it("returns none for plain tiles and undefined", () => {
    expect(interactionFor(tile(0, 0, { img: "grass" }), nothingCollected)).toEqual({ type: "none" });
    expect(interactionFor(undefined, nothingCollected)).toEqual({ type: "none" });
  });
});

describe("fieldItemFor", () => {
  it("is deterministic per coordinate", () => {
    expect(fieldItemFor(320, 640)).toEqual(fieldItemFor(320, 640));
  });

  it("produces a spread of items across coordinates", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 400; index += 1) {
      seen.add(fieldItemFor(index * 32, index * 96).id);
    }
    expect(seen.size).toBeGreaterThan(3);
    expect(seen.has("poke-ball")).toBe(true);
  });

  it("honours authored hidden Poké Balls while keeping ordinary finds seeded", () => {
    expect(fieldItemFor(320, 640, "pokeball").id).toBe("poke-ball");
    expect(fieldItemFor(320, 640, "poke-ball").id).toBe("poke-ball");
  });
});
