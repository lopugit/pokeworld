import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  analyzeStructureWorld,
  predictStructureSites,
  SITE_WINDOW,
} from "../scripts/map/audit-structure-duplicates.mjs";
import type { MapBlock } from "../server/services/map/types";

// Regression test for the production duplicate-structure defect (PR #16 /
// TERRAIN_REVISION 2.8): public deployments store blocks in Thingtime with no
// MongoDB, and the legacy generator silently skipped its neighbour sync +
// edge re-stitch there — every block planned structure sites against a mask
// truncated at its own edges, so each seam-spanning google building grew one
// structure per block. This drives the REAL workflow entry point
// (generateMapBlocks) one block at a time — the exact production pattern —
// against an in-memory stand-in for the durable store, in several generation
// orders, and asserts the world converges to the canonical single-site-per-
// building result regardless of order.

const BLOCK_X = 473290; // Melbourne-ish; any valid mid-latitude block works.
const BLOCK_Y = 244290;
const GRID_X = BLOCK_X * 16;
const GRID_Y = BLOCK_Y * 16;

// World-grid building rectangles (inclusive), all clear of the 4x4 central
// landings that ensureSpawnRoute flattens to grass:
const BUILDINGS = [
  // (a) spans the vertical seam between (BLOCK_X, BLOCK_Y) and (BLOCK_X+1, BLOCK_Y)
  { fromX: GRID_X + 12, toX: GRID_X + 18, fromY: GRID_Y + 2, toY: GRID_Y + 6 },
  // (b) spans the four-block corner at (BLOCK_X+2)*16 / (BLOCK_Y+1)*16
  { fromX: GRID_X + 29, toX: GRID_X + 34, fromY: GRID_Y + 13, toY: GRID_Y + 18 },
  // (c) long building across the seam between (BLOCK_X, BLOCK_Y+1) and (BLOCK_X+1, BLOCK_Y+1)
  { fromX: GRID_X + 4, toX: GRID_X + 23, fromY: GRID_Y + 16, toY: GRID_Y + 21 },
  // (d) small interior control building
  { fromX: GRID_X + 2, toX: GRID_X + 5, fromY: GRID_Y + 2, toY: GRID_Y + 4 },
] as const;

const REGION: Array<{ x: number; y: number }> = [];
for (let y = BLOCK_Y; y <= BLOCK_Y + 1; y += 1) {
  for (let x = BLOCK_X; x <= BLOCK_X + 2; x += 1) REGION.push({ x, y });
}

const BUILDING_RGB = [233, 234, 239] as const; // classifier "building"
const GROUND_RGB = [250, 245, 235] as const; // classifier "ground" -> grass

type GenerateMapBlocks = typeof import("../server/services/map/generate")["generateMapBlocks"];
type SetStoreOverride = typeof import("../server/services/map/block-store")["setMapBlockStoreOverrideForTests"];

let generateMapBlocks: GenerateMapBlocks;
let setStoreOverride: SetStoreOverride;
let clearImageryOverride: () => void;
const store = new Map<string, MapBlock>();

const inMemoryStore = {
  // Clone both ways: the real store hands back freshly decoded objects, so
  // shared references must never let one generation mutate another's copy.
  get: async (coordinatesList: Array<{ x: number; y: number }>) =>
    coordinatesList
      .map(({ x, y }) => store.get(`${x},${y}`))
      .filter((block): block is MapBlock => Boolean(block))
      .map((block) => structuredClone(block)),
  put: async (blocks: MapBlock[]) => {
    for (const block of blocks) store.set(`${block.x},${block.y}`, structuredClone(block));
  },
};

beforeAll(async () => {
  // The store-backed path must be exercised exactly like production Thingtime
  // deployments: no Mongo, no Google, no public-deployment permit gating.
  process.env.POKEWORLD_OFFLINE_MAP = "true";
  delete process.env.MONGODB_URI;
  delete process.env.MONGODB_SCHEME;
  delete process.env.THINGTIME_SERVICE_TOKEN;
  delete process.env.THINGTIME_API_URL;
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.POKEWORLD_PUBLIC_BUILD;

  const [generate, blockStore, functions, coordinates, png] = await Promise.all([
    import("../server/services/map/generate"),
    import("../server/services/map/block-store"),
    import("../server/services/map/legacy/functions"),
    import("../server/services/map/legacy/coordinates"),
    import("../server/services/map/legacy/png"),
  ]);
  generateMapBlocks = generate.generateMapBlocks;
  setStoreOverride = blockStore.setMapBlockStoreOverrideForTests;

  blockStore.setMapBlockStoreOverrideForTests(inMemoryStore);

  // Deterministic synthetic imagery: the generator asks for a block's ground
  // photo by lat/lng; answer with building rectangles from the plan above.
  const latToBlockY = new Map<number, number>();
  const lngToBlockX = new Map<number, number>();
  for (let y = BLOCK_Y - 3; y <= BLOCK_Y + 4; y += 1) latToBlockY.set(coordinates.getLatForBlock(y).lat, y);
  for (let x = BLOCK_X - 3; x <= BLOCK_X + 5; x += 1) lngToBlockX.set(coordinates.getLngForBlock(x).lng, x);

  const imageForBlock = (blockX: number, blockY: number) => {
    const solid = png.createSolidPngWithRgba(512, 512, {
      r: GROUND_RGB[0],
      g: GROUND_RGB[1],
      b: GROUND_RGB[2],
      alpha: 255,
    });
    const rgba = solid.rgba;
    for (const building of BUILDINGS) {
      for (let gridX = building.fromX; gridX <= building.toX; gridX += 1) {
        for (let gridY = building.fromY; gridY <= building.toY; gridY += 1) {
          const column = gridX - blockX * 16;
          const rowFromTop = 15 - (gridY - blockY * 16);
          if (column < 0 || column > 15 || rowFromTop < 0 || rowFromTop > 15) continue;
          for (let py = rowFromTop * 32; py < rowFromTop * 32 + 32; py += 1) {
            for (let px = column * 32; px < column * 32 + 32; px += 1) {
              const offset = (py * 512 + px) * 4;
              rgba.data[offset] = BUILDING_RGB[0];
              rgba.data[offset + 1] = BUILDING_RGB[1];
              rgba.data[offset + 2] = BUILDING_RGB[2];
              rgba.data[offset + 3] = 255;
            }
          }
        }
      }
    }
    return { image: png.encodePng(rgba), rgba, source: "google-static-maps" };
  };

  functions.setImageryOverrideForTests((lat: number, lng: number) => {
    const blockY = latToBlockY.get(lat);
    const blockX = lngToBlockX.get(lng);
    if (blockX === undefined || blockY === undefined) {
      throw new Error(`Unexpected imagery request at ${lat},${lng}`);
    }
    return Promise.resolve(imageForBlock(blockX, blockY));
  });

  clearImageryOverride = () => functions.setImageryOverrideForTests(undefined);
});

afterAll(() => {
  setStoreOverride?.(null);
  clearImageryOverride?.();
});

function shuffled<T>(items: T[], seed: number): T[] {
  const output = [...items];
  let state = seed;
  for (let index = output.length - 1; index > 0; index -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const pick = state % (index + 1);
    [output[index], output[pick]] = [output[pick], output[index]];
  }
  return output;
}

// Stable projection of world content: everything gameplay-visible, nothing
// run-specific (uuids, timestamps, encoded imagery).
function worldProjection(blocks: MapBlock[]): string {
  const sorted = [...blocks].sort((a, b) => a.x - b.x || a.y - b.y);
  return JSON.stringify(
    sorted.map((block) => ({
      x: block.x,
      y: block.y,
      tiles: [...(block.tiles ?? [])]
        .sort((a, b) => a.mapX - b.mapX || a.mapY - b.mapY)
        .map((tile) => [
          tile.mapX,
          tile.mapY,
          tile.terrain,
          tile.img,
          tile.img2,
          tile.feature,
          tile.solid ?? false,
          (tile as { houseKind?: string }).houseKind ?? "",
          (tile as { houseSite?: string }).houseSite ?? "",
          tile.version,
        ]),
    })),
  );
}

function expectedMask(): Set<string> {
  const mask = new Set<string>();
  const landing = (value: number) => ((value % 16) + 16) % 16 >= 6 && ((value % 16) + 16) % 16 <= 9;
  for (const building of BUILDINGS) {
    for (let gridX = building.fromX; gridX <= building.toX; gridX += 1) {
      for (let gridY = building.fromY; gridY <= building.toY; gridY += 1) {
        if (landing(gridX) && landing(gridY)) continue;
        mask.add(`${gridX},${gridY}`);
      }
    }
  }
  return mask;
}

async function generateWorld(order: Array<{ x: number; y: number }>): Promise<MapBlock[]> {
  store.clear();
  for (const { x, y } of order) {
    // One block per call — the production workflow's per-block pattern.
    const results = await generateMapBlocks({ blocks: [{ x, y }], regenerate: false });
    expect(results).toHaveLength(1);
    expect(results[0].inlineBlock).toBeUndefined(); // persisted by the store
  }
  return [...store.values()];
}

describe("structure sites converge on the store-backed (no-Mongo) path", () => {
  const orders = [
    REGION,
    [...REGION].reverse(),
    shuffled(REGION, 7),
    shuffled(REGION, 23),
    shuffled(REGION, 61),
  ];

  it(
    "yields exactly the canonical structures for every generation order",
    { timeout: 120_000 },
    async () => {
      const canonicalSites = predictStructureSites(expectedMask());
      expect(canonicalSites.size).toBeGreaterThanOrEqual(4);

      let baseline: string | undefined;
      for (const order of orders) {
        const world = await generateWorld(order);
        expect(world).toHaveLength(REGION.length);

        const report = analyzeStructureWorld(world);
        expect(Object.keys(report.versions)).toHaveLength(1); // fully converged, single version
        expect(report.violations).toEqual([]);
        expect(report.judgedComponents).toBe(BUILDINGS.length);

        // Every painted structure sits on a canonical site, one per building
        // that fits the window; the long building's sites stay well apart.
        const paintedSites = new Set<string>();
        for (const block of world) {
          for (const tile of block.tiles ?? []) {
            const site = (tile as { houseSite?: string }).houseSite;
            if (tile.feature === "house" && site) paintedSites.add(site);
          }
        }
        expect(paintedSites).toEqual(canonicalSites);

        for (const component of report.components) {
          if (component.boundary) continue;
          if (component.bbox.width <= SITE_WINDOW + 1 && component.bbox.height <= SITE_WINDOW + 1) {
            expect(component.structures.length).toBe(1);
          } else {
            expect(component.structures.length).toBeGreaterThanOrEqual(1);
          }
        }

        const projection = worldProjection(world);
        baseline ??= projection;
        expect(projection).toBe(baseline);
      }
    },
  );

  it(
    "the audit detects the pre-fix defect when blocks generate without the store",
    { timeout: 60_000 },
    async () => {
      // Disable the store: every block generates blind, exactly like the
      // broken production path — the audit must flag the seam duplicates.
      setStoreOverride(null);
      try {
        const blocks: MapBlock[] = [];
        for (const { x, y } of REGION) {
          const results = await generateMapBlocks({ blocks: [{ x, y }], regenerate: false });
          if (results[0].inlineBlock) blocks.push(results[0].inlineBlock);
        }
        expect(blocks).toHaveLength(REGION.length);
        const report = analyzeStructureWorld(blocks);
        expect(
          report.violations.filter((violation) => violation.type === "seam-duplicate").length,
        ).toBeGreaterThan(0);
      } finally {
        setStoreOverride(inMemoryStore);
      }
    },
  );
});
