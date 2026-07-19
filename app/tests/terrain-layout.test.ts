import { describe, expect, it } from "vitest";
import type { TerrainKind, TerrainSample } from "../server/services/map/terrain-classifier";
import { normalizeTerrainLayout } from "../server/services/map/terrain-layout";

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

const isRoute = (terrain: TerrainKind) => terrain === "road" || terrain === "path";

function largestSolidRouteSquare(values: TerrainSample[][]): number {
  let largest = 0;
  for (let y = 0; y < values.length; y += 1) {
    for (let x = 0; x < values[y].length; x += 1) {
      for (let size = 1; y + size <= values.length && x + size <= values[y].length; size += 1) {
        const solid = values
          .slice(y, y + size)
          .every((row) => row.slice(x, x + size).every((cell) => isRoute(cell.terrain)));
        if (!solid) break;
        largest = Math.max(largest, size);
      }
    }
  }
  return largest;
}

describe("adventure terrain layout", () => {
  it("reduces a broad vertical Google road to at most three tiles without breaking it", () => {
    const input = grid();
    for (let y = 0; y < 16; y += 1) {
      for (let x = 3; x <= 11; x += 1) input[y][x] = sample("road");
    }

    const output = normalizeTerrainLayout(input);
    for (const row of output) {
      const routeCount = row.filter((cell) => isRoute(cell.terrain)).length;
      expect(routeCount).toBeGreaterThan(0);
      expect(routeCount).toBeLessThanOrEqual(3);
    }
  });

  it("reduces a broad horizontal path to a narrow connected route", () => {
    const input = grid();
    for (let y = 4; y <= 10; y += 1) {
      for (let x = 0; x < 16; x += 1) input[y][x] = sample("path");
    }

    const output = normalizeTerrainLayout(input);
    for (let x = 0; x < 16; x += 1) {
      const routeCount = output.filter((row) => isRoute(row[x].terrain)).length;
      expect(routeCount).toBeGreaterThan(0);
      expect(routeCount).toBeLessThanOrEqual(3);
    }
  });

  it("bridges diagonal skeleton steps with cardinally connected square tiles", () => {
    const input = grid();
    for (let y = 0; y < 16; y += 1) {
      const center = Math.min(15, y);
      for (let x = Math.max(0, center - 2); x <= Math.min(15, center + 2); x += 1) {
        input[y][x] = sample("road");
      }
    }

    const output = normalizeTerrainLayout(input);
    const route = output.flatMap((row, y) =>
      row.flatMap((cell, x) => (isRoute(cell.terrain) ? [[x, y] as const] : [])),
    );
    const remaining = new Set(route.map(([x, y]) => `${x},${y}`));
    const queue = [route[0]];
    remaining.delete(`${route[0][0]},${route[0][1]}`);
    while (queue.length) {
      const [x, y] = queue.shift()!;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        const key = `${x + dx},${y + dy}`;
        if (!remaining.delete(key)) continue;
        queue.push([x + dx, y + dy]);
      }
    }
    expect(remaining.size).toBe(0);
    expect(largestSolidRouteSquare(output)).toBeLessThanOrEqual(3);
  });

  it("removes isolated semantic pixels that make terrain edges look noisy", () => {
    const input = grid();
    input[8][8] = sample("water");
    expect(normalizeTerrainLayout(input)[8][8].terrain).toBe("grass");
  });
});
