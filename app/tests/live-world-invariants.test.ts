import { MongoClient } from "mongodb";
import { afterAll, describe, expect, it } from "vitest";
import terrainLife from "../server/services/map/legacy/mods/terrain-life";
import { MAP_BLOCK_VERSION } from "../server/services/map/version";
import { analyzeStructureWorld, formatReport } from "../scripts/map/audit-structure-duplicates.mjs";

// Live-world invariant audit. Opt-in: point POKEWORLD_LIVE_VERIFY at a Mongo
// deployment whose `blocks` collection holds generated map blocks, e.g.
//   POKEWORLD_LIVE_VERIFY="mongodb://127.0.0.1:27317/pokeworld" pnpm --dir app exec vitest run tests/live-world-invariants.test.ts
// It audits every stored block against the generation contract: current
// version stamps, deterministic re-generation, and exactly one structure per
// world-space google-building component. CI has no live world; it skips.
//
// HTTP deployments (production stores blocks in Thingtime, not Mongo) are
// audited through the read-only probe endpoint instead:
//   POKEWORLD_LIVE_VERIFY_URL="https://pokeworld.center" \
//     POKEWORLD_LIVE_VERIFY_BLOCK="473289,244292" pnpm --dir app exec vitest run tests/live-world-invariants.test.ts
const LIVE_URI = process.env.POKEWORLD_LIVE_VERIFY;
const LIVE_URL = process.env.POKEWORLD_LIVE_VERIFY_URL;

interface StoredTile {
  mapX: number;
  mapY: number;
  x: number;
  y: number;
  blockX: number;
  blockY: number;
  terrain?: string;
  feature?: string;
  img?: string;
  img2?: string;
  version?: string;
  houseId?: number;
  houseKind?: string;
  houseSite?: string;
  solid?: boolean;
}

interface StoredBlock {
  x: number;
  y: number;
  tiles?: StoredTile[];
}

const TILE = 32;
const localIndex = (value: number) => ((value % 16) + 16) % 16;
const isLanding = (gridX: number, gridY: number) =>
  localIndex(gridX) >= 6 && localIndex(gridX) <= 9 && localIndex(gridY) >= 6 && localIndex(gridY) <= 9;

describe.skipIf(!LIVE_URI)("live world invariants", () => {
  const client = new MongoClient(LIVE_URI ?? "mongodb://unused");
  afterAll(() => client.close());

  async function loadBlocks(): Promise<StoredBlock[]> {
    await client.connect();
    const database = LIVE_URI!.split("/").pop()?.split("?")[0] || "pokeworld";
    return (await client
      .db(database)
      .collection("blocks")
      .find({ tiles: { $exists: true } })
      .toArray()) as unknown as StoredBlock[];
  }

  it("stores only current-version tiles, one structure per building component", async () => {
    const blocks = await loadBlocks();
    expect(blocks.length).toBeGreaterThan(0);

    const terrain = new Map<string, string>();
    const structures = new Map<string, { kind: string; site: string; cells: Array<[number, number]> }>();
    for (const block of blocks) {
      for (const tile of block.tiles ?? []) {
        // Versioning contract: nothing off-version is ever served or kept.
        expect(tile.version, `tile ${tile.mapX},${tile.mapY} version`).toBe(MAP_BLOCK_VERSION);
        const gridX = tile.mapX / TILE;
        const gridY = tile.mapY / TILE;
        terrain.set(`${gridX},${gridY}`, tile.terrain ?? "grass");
        if (tile.feature === "house") {
          const key = `${block.x},${block.y}:${tile.houseId}`;
          const entry =
            structures.get(key) ?? { kind: String(tile.houseKind), site: String(tile.houseSite), cells: [] };
          expect(String(tile.houseKind)).toBe(entry.kind);
          expect(String(tile.houseSite)).toBe(entry.site);
          entry.cells.push([gridX, gridY]);
          structures.set(key, entry);
        }
      }
    }

    // World-space building components, mirroring the generator's mask.
    const inMask = (gridX: number, gridY: number) =>
      terrain.get(`${gridX},${gridY}`) === "building" && !isLanding(gridX, gridY);
    const cellComponent = new Map<string, number>();
    const components: Array<{ cells: number; centroidX: number; centroidY: number }> = [];
    for (const key of terrain.keys()) {
      const [startX, startY] = key.split(",").map(Number);
      if (cellComponent.has(key) || !inMask(startX, startY)) continue;
      const componentIndex = components.length;
      cellComponent.set(key, componentIndex);
      const queue: Array<[number, number]> = [[startX, startY]];
      let cells = 0;
      let sumX = 0;
      let sumY = 0;
      while (queue.length) {
        const [gridX, gridY] = queue.shift()!;
        cells += 1;
        sumX += gridX;
        sumY += gridY;
        for (let offsetY = -1; offsetY <= 1; offsetY++) {
          for (let offsetX = -1; offsetX <= 1; offsetX++) {
            if (!offsetX && !offsetY) continue;
            const nextX = gridX + offsetX;
            const nextY = gridY + offsetY;
            const nextKey = `${nextX},${nextY}`;
            if (cellComponent.has(nextKey) || !inMask(nextX, nextY)) continue;
            cellComponent.set(nextKey, componentIndex);
            queue.push([nextX, nextY]);
          }
        }
      }
      components.push({ cells, centroidX: sumX / cells, centroidY: sumY / cells });
    }

    // The clone-bug invariant: a structure site spawns AT MOST ONE structure
    // across every block that can see it. Site cells must be real building
    // mask cells, and each structure's footprint centre must hug its site
    // (|drift| <= ANCHOR_DRIFT = 4 per axis).
    const structuresBySite = new Map<string, string[]>();
    for (const [key, structure] of structures) {
      structuresBySite.set(structure.site, [...(structuresBySite.get(structure.site) ?? []), `${key}=${structure.kind}`]);
      const [siteX, siteY] = structure.site.split(",").map(Number);
      expect(
        terrain.get(structure.site),
        `structure ${key} (${structure.kind}) site ${structure.site} is not on a building`,
      ).toBe("building");
      const centerX = structure.cells.reduce((sum, [gridX]) => sum + gridX, 0) / structure.cells.length;
      const centerY = structure.cells.reduce((sum, [, gridY]) => sum + gridY, 0) / structure.cells.length;
      expect(Math.abs(centerX - siteX), `structure ${key} drifted from its site`).toBeLessThanOrEqual(4);
      expect(Math.abs(centerY - siteY), `structure ${key} drifted from its site`).toBeLessThanOrEqual(4);
    }
    for (const [site, assigned] of structuresBySite) {
      expect(
        assigned,
        `site ${site} spawned multiple structures: ${assigned.join(" + ")}`,
      ).toHaveLength(1);
    }
    expect(components.length).toBeGreaterThan(0);
    expect(cellComponent.size).toBeGreaterThan(0);
  });

  it("regenerates deterministically from the stored terrain", async () => {
    const blocks = await loadBlocks();
    const cache: Record<string, StoredTile> = {};
    const replayBlocks = blocks.map((block) => {
      const tiles = (block.tiles ?? []).map((tile) => ({ ...tile }));
      for (const tile of tiles) cache[`${tile.mapX},${tile.mapY}`] = tile;
      return { x: block.x, y: block.y, tiles };
    });
    const state = { version: MAP_BLOCK_VERSION, tiles: { cache } };

    for (const block of replayBlocks) terrainLife.run(state, block);

    const storedHouses = new Map<string, string>();
    for (const block of blocks) {
      for (const tile of block.tiles ?? []) {
        if (tile.feature === "house") storedHouses.set(`${tile.mapX},${tile.mapY}`, String(tile.img2));
      }
    }
    const replayedHouses = new Map<string, string>();
    for (const block of replayBlocks) {
      for (const tile of block.tiles) {
        if (tile.feature === "house") replayedHouses.set(`${tile.mapX},${tile.mapY}`, String(tile.img2));
      }
    }
    expect(replayedHouses).toEqual(storedHouses);
  });
});

describe.skipIf(!LIVE_URL)("live deployment structure audit (HTTP probe)", () => {
  it("shows one structure per google building in the probed region", { timeout: 120_000 }, async () => {
    const [blockX, blockY] = (process.env.POKEWORLD_LIVE_VERIFY_BLOCK ?? "473289,244292")
      .split(",")
      .map(Number);
    const radius = Number(process.env.POKEWORLD_LIVE_VERIFY_RADIUS ?? 2);
    const offsets: number[][] = [];
    for (let y = -radius; y <= radius; y += 1) {
      for (let x = -radius; x <= radius; x += 1) offsets.push([x, y]);
    }
    const response = await fetch(
      `${LIVE_URL}/api/blocks?blockX=${blockX}&blockY=${blockY}` +
        `&offsets=${encodeURIComponent(JSON.stringify(offsets))}&regenerate=false&probe=true`,
    );
    const payload = (await response.json()) as { blocks?: unknown[]; status?: string };
    expect(payload.status, "deployment must support the read-only probe").toBe("probe");
    expect(payload.blocks?.length ?? 0).toBeGreaterThan(0);

    const report = analyzeStructureWorld(payload.blocks);
    // eslint-disable-next-line no-console -- surfacing the audit summary is the point
    console.log(formatReport(report, { verbose: true }));
    expect(report.violations).toEqual([]);
  });
});
