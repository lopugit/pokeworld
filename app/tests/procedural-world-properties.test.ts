import { describe, expect, it } from "vitest";
import type { MapTile } from "../server/services/map/types";
import type { TerrainKind, TerrainSample } from "../server/services/map/terrain-classifier";
import { normalizeTerrainLayout } from "../server/services/map/terrain-layout";
import terrainLife from "../server/services/map/legacy/mods/terrain-life";

const TERRAIN_KINDS: TerrainKind[] = [
  "grass",
  "natural",
  "mountain",
  "water",
  "road",
  "path",
  "building",
  "sand",
];
const CARDINAL = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;

function sample(terrain: TerrainKind): TerrainSample {
  return {
    terrain,
    confidence: 1,
    coverage: Object.fromEntries(
      TERRAIN_KINDS.map((kind) => [kind, kind === terrain ? 1 : 0]),
    ) as Record<TerrainKind, number>,
  };
}

function grid(terrain: TerrainKind = "grass"): TerrainSample[][] {
  return Array.from({ length: 16 }, () =>
    Array.from({ length: 16 }, () => sample(terrain)),
  );
}

const isRoute = (terrain: TerrainKind | undefined) => terrain === "road" || terrain === "path";

function routeCoordinates(values: TerrainSample[][]): Array<readonly [number, number]> {
  return values.flatMap((row, y) =>
    row.flatMap((cell, x) => (isRoute(cell.terrain) ? [[x, y] as const] : [])),
  );
}

function cardinalComponents(points: ReadonlyArray<readonly [number, number]>): number {
  const remaining = new Set(points.map(([x, y]) => `${x},${y}`));
  let components = 0;
  while (remaining.size) {
    components += 1;
    const start = remaining.values().next().value as string;
    remaining.delete(start);
    const queue = [start.split(",").map(Number) as [number, number]];
    while (queue.length) {
      const [x, y] = queue.shift()!;
      for (const [dx, dy] of CARDINAL) {
        const key = `${x + dx},${y + dy}`;
        if (!remaining.delete(key)) continue;
        queue.push([x + dx, y + dy]);
      }
    }
  }
  return components;
}

function largestSolidRouteSquare(values: TerrainSample[][]): number {
  let largest = 0;
  for (let y = 0; y < values.length; y += 1) {
    for (let x = 0; x < values[y].length; x += 1) {
      for (let size = 1; y + size <= values.length && x + size <= values[y].length; size += 1) {
        if (
          !values
            .slice(y, y + size)
            .every((row) => row.slice(x, x + size).every((cell) => isRoute(cell.terrain)))
        ) break;
        largest = Math.max(largest, size);
      }
    }
  }
  return largest;
}

function broadWalk(seed: number): TerrainSample[][] {
  const values = grid();
  let x = 1 + (seed % 4);
  let y = 0;
  for (let step = 0; step < 28; step += 1) {
    const width = 2 + ((seed + step) % 6);
    for (let offsetY = -Math.floor(width / 2); offsetY <= Math.floor(width / 2); offsetY += 1) {
      for (let offsetX = -Math.floor(width / 2); offsetX <= Math.floor(width / 2); offsetX += 1) {
        if (values[y + offsetY]?.[x + offsetX]) values[y + offsetY][x + offsetX] = sample("road");
      }
    }
    const roll = (Math.imul(seed + 17, step + 31) >>> 0) % 5;
    if (roll <= 1) x = Math.max(0, x - 1);
    else if (roll === 2) x = Math.min(15, x + 1);
    else y = Math.min(15, y + 1);
  }
  return values;
}

function makeUniformState(blockX = 0, blockY = 0) {
  const cache: Record<string, MapTile> = {};
  const tiles: MapTile[] = [];
  for (let x = 0; x < 16; x += 1) {
    for (let sourceY = 0; sourceY < 16; sourceY += 1) {
      const tile: MapTile = {
        uuid: `${blockX}-${blockY}-${x}-${sourceY}`,
        blockX,
        blockY,
        mapX: blockX * 512 + x * 32,
        mapY: blockY * 512 + (15 - sourceY) * 32,
        x,
        y: 15 - sourceY,
        terrain: "grass",
      };
      cache[`${tile.mapX},${tile.mapY}`] = tile;
      tiles.push(tile);
    }
  }
  return {
    block: { x: blockX, y: blockY, tiles },
    state: { version: "test", tiles: { cache } },
  };
}

function sourceY(tile: MapTile): number {
  return 15 - tile.y;
}

describe("procedural world acceptance properties", () => {
  it("normalizes broad deterministic route shapes into replayable cardinal routes at most three tiles wide", () => {
    for (let seed = 0; seed < 64; seed += 1) {
      const input = broadWalk(seed);
      const first = normalizeTerrainLayout(input);
      const second = normalizeTerrainLayout(input);
      const route = routeCoordinates(first);
      expect(first).toEqual(second);
      expect(route.length).toBeGreaterThan(0);
      expect(cardinalComponents(route)).toBe(1);
      expect(largestSolidRouteSquare(first)).toBeLessThanOrEqual(3);
    }
  });

  it("preserves matching cross-block route portals", () => {
    for (let portalStart = 1; portalStart <= 11; portalStart += 2) {
      const left = grid();
      const right = grid();
      for (let y = portalStart; y < portalStart + 4; y += 1) {
        for (let x = 8; x < 16; x += 1) left[y][x] = sample("road");
        for (let x = 0; x <= 7; x += 1) right[y][x] = sample("road");
      }
      const normalizedLeft = normalizeTerrainLayout(left);
      const normalizedRight = normalizeTerrainLayout(right);
      const leftPortals = normalizedLeft.flatMap((row, y) =>
        isRoute(row[15].terrain) ? [y] : [],
      );
      const rightPortals = normalizedRight.flatMap((row, y) =>
        isRoute(row[0].terrain) ? [y] : [],
      );
      expect(leftPortals).toEqual(rightPortals);
      expect(leftPortals).toHaveLength(1);
    }
  });

  it("keeps the spawn landing walkable and connected to an intentional route", () => {
    for (const [blockX, blockY] of [[0, 0], [11, -7], [-29, 41]] as const) {
      const generated = makeUniformState(blockX, blockY);
      terrainLife.run(generated.state, generated.block);
      const walkable = generated.block.tiles.filter((tile) => tile.solid !== true);
      const walkableKeys = new Set(walkable.map((tile) => `${tile.x},${sourceY(tile)}`));
      const spawn = walkable.filter(
        (tile) => tile.x >= 6 && tile.x <= 9 && sourceY(tile) >= 6 && sourceY(tile) <= 9,
      );
      expect(spawn).toHaveLength(16);

      const queue = spawn.map((tile) => [tile.x, sourceY(tile)] as [number, number]);
      const visited = new Set(queue.map(([x, y]) => `${x},${y}`));
      while (queue.length) {
        const [x, y] = queue.shift()!;
        for (const [dx, dy] of CARDINAL) {
          const key = `${x + dx},${y + dy}`;
          if (!walkableKeys.has(key) || visited.has(key)) continue;
          visited.add(key);
          queue.push([x + dx, y + dy]);
        }
      }
      expect(
        generated.block.tiles.some(
          (tile) => visited.has(`${tile.x},${sourceY(tile)}`) && isRoute(tile.terrain),
        ),
      ).toBe(true);

      const plain = generated.block.tiles.filter((tile) =>
        ["grass", "short-grass-pocket"].includes(String(tile.feature)),
      );
      expect(cardinalComponents(plain.map((tile) => [tile.x, sourceY(tile)]))).toBeGreaterThan(0);
      const plainKeys = new Set(plain.map((tile) => `${tile.x},${sourceY(tile)}`));
      let largestPlainRegion = 0;
      while (plainKeys.size) {
        const start = plainKeys.values().next().value as string;
        plainKeys.delete(start);
        const component = [start.split(",").map(Number) as [number, number]];
        let size = 0;
        while (component.length) {
          const [x, y] = component.shift()!;
          size += 1;
          for (const [dx, dy] of CARDINAL) {
            const key = `${x + dx},${y + dy}`;
            if (!plainKeys.delete(key)) continue;
            component.push([x + dx, y + dy]);
          }
        }
        largestPlainRegion = Math.max(largestPlainRegion, size);
      }
      expect(largestPlainRegion).toBeLessThanOrEqual(48);
    }
  });

  it("uses shared global-coordinate portals across synthetic block routes", () => {
    const west = makeUniformState(4, -3);
    const east = makeUniformState(5, -3);
    terrainLife.run(west.state, west.block);
    terrainLife.run(east.state, east.block);
    expect(
      west.block.tiles
        .filter((tile) => tile.x === 15 && isRoute(tile.terrain))
        .map(sourceY),
    ).toEqual(
      east.block.tiles
        .filter((tile) => tile.x === 0 && isRoute(tile.terrain))
        .map(sourceY),
    );

    const south = makeUniformState(4, -3);
    const north = makeUniformState(4, -2);
    terrainLife.run(south.state, south.block);
    terrainLife.run(north.state, north.block);
    expect(
      south.block.tiles
        .filter((tile) => sourceY(tile) === 0 && isRoute(tile.terrain))
        .map((tile) => tile.x),
    ).toEqual(
      north.block.tiles
        .filter((tile) => sourceY(tile) === 15 && isRoute(tile.terrain))
        .map((tile) => tile.x),
    );
  });
});
