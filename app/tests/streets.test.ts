import { describe, expect, it } from "vitest";
import {
  applyStreetNames,
  componentSample,
  extractHouseAddress,
  extractRouteName,
  gridCellLatLng,
  proceduralHouseNumber,
  proceduralStreetName,
  roadComponents,
  tagBlockTiles,
  worldPixelLatLng,
  STREETS_VERSION,
} from "../server/services/map/streets";
import {
  X_INCREMENT,
  getLatForBlock,
  getLngForBlock,
} from "../server/services/map/legacy/coordinates";

const TILE = 32;

const tile = (
  gridX: number,
  gridY: number,
  extra: Record<string, unknown> = {},
) => ({ mapX: gridX * TILE, mapY: gridY * TILE, ...extra });

describe("worldPixelLatLng", () => {
  it("matches the legacy block corner math including the half-block imagery offset", () => {
    // The imagery for block (X, Y) is CENTERED on the block's SW-corner
    // lat/lng, so world pixel (X*512, Y*512) — the block's SW world corner —
    // sits half a block west/south of that centre.
    const blockX = 262144;
    const blockY = 200000;
    const { lng } = getLngForBlock(blockX);
    const { lat } = getLatForBlock(blockY);
    const corner = worldPixelLatLng(blockX * 512, blockY * 512);
    expect(corner.lng).toBeCloseTo(lng - X_INCREMENT / 2, 9);
    expect(corner.lat).toBeLessThan(lat);
    // The block's imagery centre is the stored SW-corner lat/lng itself.
    const centre = worldPixelLatLng(blockX * 512 + 256, blockY * 512 + 256);
    expect(centre.lng).toBeCloseTo(lng, 9);
    expect(centre.lat).toBeCloseTo(lat, 6);
  });

  it("computes tile centres on the grid", () => {
    const cell = gridCellLatLng(100, 200);
    const pixel = worldPixelLatLng(100 * TILE + 16, 200 * TILE + 16);
    expect(cell).toEqual(pixel);
  });
});

describe("roadComponents", () => {
  it("groups 4-connected road/path tiles and sorts largest first", () => {
    const tiles = [
      tile(0, 0, { terrain: "road" }),
      tile(1, 0, { terrain: "road" }),
      tile(2, 0, { terrain: "path" }),
      tile(10, 10, { terrain: "road" }),
      tile(5, 5, { terrain: "grass" }),
    ];
    const components = roadComponents(tiles as never);
    expect(components).toHaveLength(2);
    expect(components[0]).toHaveLength(3);
    expect(components[1]).toHaveLength(1);
  });

  it("picks a central sample tile", () => {
    const component = [tile(0, 0), tile(1, 0), tile(2, 0)];
    expect(componentSample(component as never).mapX).toBe(TILE);
  });
});

describe("geocode extraction", () => {
  const results = [
    {
      types: ["street_address"],
      address_components: [
        { long_name: "12", short_name: "12", types: ["street_number"] },
        { long_name: "Wattle Street", short_name: "Wattle St", types: ["route"] },
      ],
    },
  ];

  it("extracts route and house address", () => {
    expect(extractRouteName(results)).toBe("Wattle Street");
    expect(extractHouseAddress(results)).toEqual({ number: "12", street: "Wattle Street" });
  });

  it("returns null when nothing matches", () => {
    expect(extractRouteName([])).toBeNull();
    expect(extractHouseAddress([])).toBeNull();
  });
});

describe("procedural fallback", () => {
  it("is deterministic per grid cell", () => {
    expect(proceduralStreetName(10, 20)).toBe(proceduralStreetName(10, 20));
    expect(proceduralHouseNumber(10, 20)).toBe(proceduralHouseNumber(10, 20));
    expect(Number(proceduralHouseNumber(3, 4))).toBeGreaterThan(0);
  });
});

describe("applyStreetNames (offline)", () => {
  const offlineEnv = { POKEWORLD_OFFLINE_MAP: "true" } as NodeJS.ProcessEnv;

  it("builds a procedural record and tags road, house, and sign tiles", async () => {
    const block = {
      x: 1,
      y: 1,
      tiles: [
        tile(1, 1, { terrain: "road" }),
        tile(2, 1, { terrain: "road" }),
        tile(5, 5, { terrain: "grass", feature: "house", houseSite: "5,6" }),
        tile(5, 4, { terrain: "grass", feature: "house-sign", houseSite: "5,6" }),
        tile(8, 8, { terrain: "grass" }),
      ],
    };
    await applyStreetNames([block as never], offlineEnv);
    expect(block).toHaveProperty("streets");
    const streets = (block as unknown as { streets: { version: number; source: string } }).streets;
    expect(streets.version).toBe(STREETS_VERSION);
    expect(streets.source).toBe("procedural");
    const tagged = block.tiles as Array<Record<string, unknown>>;
    expect(typeof tagged[0].streetName).toBe("string");
    expect(typeof tagged[2].houseNumber).toBe("string");
    expect(typeof tagged[3].houseNumber).toBe("string");
    expect(tagged[3].streetName).toBe(tagged[2].streetName);
    expect(tagged[4].streetName).toBeUndefined();
  });

  it("reuses a stored record instead of rebuilding it", async () => {
    const stored = {
      version: STREETS_VERSION,
      source: "procedural" as const,
      fetchedAt: 123,
      roads: [{ gridX: 1, gridY: 1, name: "KEPT STREET" }],
      houses: {},
    };
    const block = {
      x: 1,
      y: 1,
      streets: stored,
      tiles: [tile(1, 1, { terrain: "road" })],
    };
    await applyStreetNames([block as never], offlineEnv);
    expect(block.streets).toBe(stored);
    expect((block.tiles[0] as Record<string, unknown>).streetName).toBe("KEPT STREET");
  });

  it("never throws on blocks without tiles", async () => {
    await expect(applyStreetNames([{ x: 0, y: 0 } as never], offlineEnv)).resolves.toBeUndefined();
  });
});

describe("tagBlockTiles", () => {
  it("tags each road tile with the nearest sampled street", () => {
    const block = {
      x: 0,
      y: 0,
      streets: {
        version: STREETS_VERSION,
        source: "procedural" as const,
        fetchedAt: 0,
        roads: [
          { gridX: 0, gridY: 0, name: "WEST STREET" },
          { gridX: 10, gridY: 0, name: "EAST STREET" },
        ],
        houses: {},
      },
      tiles: [
        tile(1, 0, { terrain: "road" }),
        tile(9, 0, { terrain: "road" }),
      ],
    };
    tagBlockTiles(block as never);
    const tagged = block.tiles as Array<Record<string, unknown>>;
    expect(tagged[0].streetName).toBe("WEST STREET");
    expect(tagged[1].streetName).toBe("EAST STREET");
  });
});
