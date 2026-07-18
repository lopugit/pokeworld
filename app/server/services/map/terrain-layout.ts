import type { TerrainKind, TerrainSample } from "./terrain-classifier";

type Mask = boolean[][];

const ROUTE_TERRAINS = new Set<TerrainKind>(["road", "path"]);
const CARDINAL_OFFSETS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

function cloneSamples(samples: TerrainSample[][]): TerrainSample[][] {
  return samples.map((row) =>
    row.map((sample) => ({
      ...sample,
      coverage: { ...sample.coverage },
    })),
  );
}

function replacement(sample: TerrainSample, terrain: TerrainKind): TerrainSample {
  return {
    ...sample,
    terrain,
    confidence: Math.max(sample.coverage[terrain] ?? 0, terrain === "grass" ? 0.35 : 0.25),
  };
}

function inBounds(mask: Mask, x: number, y: number): boolean {
  return y >= 0 && y < mask.length && x >= 0 && x < (mask[0]?.length ?? 0);
}

function emptyMask(rows: number, columns: number): Mask {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => false));
}

function squareSemanticEdges(samples: TerrainSample[][]): TerrainSample[][] {
  let output = cloneSamples(samples);

  for (let pass = 0; pass < 2; pass += 1) {
    const next = cloneSamples(output);
    for (let y = 0; y < output.length; y += 1) {
      for (let x = 0; x < output[y].length; x += 1) {
        const current = output[y][x];
        if (ROUTE_TERRAINS.has(current.terrain)) continue;

        const neighbours = CARDINAL_OFFSETS.flatMap(([dx, dy]) => {
          const row = output[y + dy];
          return row?.[x + dx] ? [row[x + dx].terrain] : [];
        }).filter((terrain) => !ROUTE_TERRAINS.has(terrain));
        if (neighbours.length < 3) continue;

        const counts = new Map<TerrainKind, number>();
        for (const terrain of neighbours) counts.set(terrain, (counts.get(terrain) ?? 0) + 1);
        const [dominant, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
        const sameCount = counts.get(current.terrain) ?? 0;
        if (dominant && dominant !== current.terrain && (count >= 3 || (sameCount === 0 && count >= 2))) {
          next[y][x] = replacement(current, dominant);
        }
      }
    }
    output = next;
  }

  return output;
}

function neighbourValues(mask: Mask, x: number, y: number): boolean[] {
  return [
    mask[y - 1]?.[x] ?? false,
    mask[y - 1]?.[x + 1] ?? false,
    mask[y]?.[x + 1] ?? false,
    mask[y + 1]?.[x + 1] ?? false,
    mask[y + 1]?.[x] ?? false,
    mask[y + 1]?.[x - 1] ?? false,
    mask[y]?.[x - 1] ?? false,
    mask[y - 1]?.[x - 1] ?? false,
  ];
}

function transitionCount(neighbours: boolean[]): number {
  let transitions = 0;
  for (let index = 0; index < neighbours.length; index += 1) {
    if (!neighbours[index] && neighbours[(index + 1) % neighbours.length]) transitions += 1;
  }
  return transitions;
}

function thinRouteMask(input: Mask): Mask {
  const mask = input.map((row) => [...row]);
  let changed = true;
  let iterations = 0;

  while (changed && iterations < 64) {
    changed = false;
    iterations += 1;
    for (const phase of [0, 1] as const) {
      const remove: Array<[number, number]> = [];
      for (let y = 0; y < mask.length; y += 1) {
        for (let x = 0; x < mask[y].length; x += 1) {
          if (!mask[y][x]) continue;
          const neighbours = neighbourValues(mask, x, y);
          const count = neighbours.filter(Boolean).length;
          if (count < 2 || count > 6 || transitionCount(neighbours) !== 1) continue;
          const [north, , east, , south, , west] = neighbours;
          const firstProduct = phase === 0 ? north && east && south : north && east && west;
          const secondProduct = phase === 0 ? east && south && west : north && south && west;
          if (!firstProduct && !secondProduct) remove.push([x, y]);
        }
      }
      if (remove.length) changed = true;
      for (const [x, y] of remove) mask[y][x] = false;
    }
  }

  return mask;
}

function routeComponents(mask: Mask): Array<Array<[number, number]>> {
  const unseen = new Set<string>();
  for (let y = 0; y < mask.length; y += 1) {
    for (let x = 0; x < mask[y].length; x += 1) if (mask[y][x]) unseen.add(`${x},${y}`);
  }

  const components: Array<Array<[number, number]>> = [];
  while (unseen.size) {
    const start = unseen.values().next().value as string;
    unseen.delete(start);
    const [startX, startY] = start.split(",").map(Number);
    const queue: Array<[number, number]> = [[startX, startY]];
    const component: Array<[number, number]> = [];
    while (queue.length) {
      const [x, y] = queue.shift()!;
      component.push([x, y]);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const key = `${x + dx},${y + dy}`;
          if (!unseen.delete(key)) continue;
          queue.push([x + dx, y + dy]);
        }
      }
    }
    components.push(component);
  }
  return components;
}

function preserveComponents(source: Mask, skeleton: Mask): void {
  for (const component of routeComponents(source)) {
    if (component.some(([x, y]) => skeleton[y][x])) continue;
    const centerX = component.reduce((sum, [x]) => sum + x, 0) / component.length;
    const centerY = component.reduce((sum, [, y]) => sum + y, 0) / component.length;
    const [x, y] = [...component].sort(
      (a, b) =>
        Math.abs(a[0] - centerX) + Math.abs(a[1] - centerY) -
        (Math.abs(b[0] - centerX) + Math.abs(b[1] - centerY)),
    )[0];
    skeleton[y][x] = true;
  }
}

function connectPortalToSkeleton(
  source: Mask,
  skeleton: Mask,
  portalX: number,
  portalY: number,
): void {
  const startKey = `${portalX},${portalY}`;
  const queue: Array<[number, number]> = [[portalX, portalY]];
  const parents = new Map<string, string | null>([[startKey, null]]);
  let destination: string | null = skeleton[portalY]?.[portalX] ? startKey : null;

  while (queue.length && !destination) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of CARDINAL_OFFSETS) {
      const nextX = x + dx;
      const nextY = y + dy;
      const key = `${nextX},${nextY}`;
      if (!source[nextY]?.[nextX] || parents.has(key)) continue;
      parents.set(key, `${x},${y}`);
      if (skeleton[nextY][nextX]) {
        destination = key;
        break;
      }
      queue.push([nextX, nextY]);
    }
  }

  let cursor = destination;
  while (cursor) {
    const [x, y] = cursor.split(",").map(Number);
    skeleton[y][x] = true;
    cursor = parents.get(cursor) ?? null;
  }
  skeleton[portalY][portalX] = true;
}

function runCenters(values: boolean[]): number[] {
  const centers: number[] = [];
  let start = -1;
  for (let index = 0; index <= values.length; index += 1) {
    if (values[index] && start === -1) start = index;
    if ((values[index] ?? false) || start === -1) continue;
    centers.push(Math.floor((start + index - 1) / 2));
    start = -1;
  }
  return centers;
}

function preserveBoundaryPortals(source: Mask, skeleton: Mask): void {
  const rows = source.length;
  const columns = source[0]?.length ?? 0;
  if (!rows || !columns) return;

  for (const x of runCenters(source[0])) connectPortalToSkeleton(source, skeleton, x, 0);
  for (const x of runCenters(source[rows - 1])) {
    connectPortalToSkeleton(source, skeleton, x, rows - 1);
  }
  for (const y of runCenters(source.map((row) => row[0]))) {
    connectPortalToSkeleton(source, skeleton, 0, y);
  }
  for (const y of runCenters(source.map((row) => row[columns - 1]))) {
    connectPortalToSkeleton(source, skeleton, columns - 1, y);
  }
}

function orthogonalizeSkeleton(skeleton: Mask, source: Mask): void {
  const additions: Array<[number, number]> = [];
  for (let y = 0; y < skeleton.length; y += 1) {
    for (let x = 0; x < skeleton[y].length; x += 1) {
      if (!skeleton[y][x]) continue;
      for (const [dx, dy] of [
        [1, 1],
        [1, -1],
      ] as const) {
        if (!skeleton[y + dy]?.[x + dx]) continue;
        const horizontal: [number, number] = [x + dx, y];
        const vertical: [number, number] = [x, y + dy];
        if (skeleton[horizontal[1]]?.[horizontal[0]] || skeleton[vertical[1]]?.[vertical[0]]) continue;
        const horizontalWasRoute = source[horizontal[1]]?.[horizontal[0]] ?? false;
        const verticalWasRoute = source[vertical[1]]?.[vertical[0]] ?? false;
        additions.push(
          horizontalWasRoute !== verticalWasRoute
            ? horizontalWasRoute
              ? horizontal
              : vertical
            : (x + y) % 2 === 0
              ? horizontal
              : vertical,
        );
      }
    }
  }
  for (const [x, y] of additions) if (inBounds(skeleton, x, y)) skeleton[y][x] = true;
}

function nearestRouteKind(samples: TerrainSample[][], x: number, y: number): TerrainKind {
  for (let radius = 0; radius <= 4; radius += 1) {
    let foundPath = false;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) !== radius) continue;
        const terrain = samples[y + dy]?.[x + dx]?.terrain;
        if (terrain === "road") return "road";
        if (terrain === "path") foundPath = true;
      }
    }
    if (foundPath) return "path";
  }
  return "path";
}

function bestNonRouteTerrain(sample: TerrainSample): TerrainKind {
  const candidates: TerrainKind[] = ["water", "building", "mountain", "natural", "sand", "grass"];
  return candidates.sort((a, b) => (sample.coverage[b] ?? 0) - (sample.coverage[a] ?? 0))[0] ?? "grass";
}

function normalizeRoutes(samples: TerrainSample[][]): TerrainSample[][] {
  const rows = samples.length;
  const columns = samples[0]?.length ?? 0;
  const source = emptyMask(rows, columns);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) source[y][x] = ROUTE_TERRAINS.has(samples[y][x].terrain);
  }
  if (!source.some((row) => row.some(Boolean))) return cloneSamples(samples);

  const skeleton = thinRouteMask(source);
  preserveComponents(source, skeleton);
  preserveBoundaryPortals(source, skeleton);
  orthogonalizeSkeleton(skeleton, source);

  const routeKinds: Array<Array<TerrainKind | null>> = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => null),
  );
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      if (skeleton[y][x]) routeKinds[y][x] = nearestRouteKind(samples, x, y);
    }
  }

  // Keep the centerline one tile wide. A previous straight-segment widening
  // pass produced 4–6 tile masses where stair-stepped diagonal streets met a
  // block edge. Emerald routes read better as a crisp cardinal centerline, and
  // this hard guarantee is more important than preserving Google road scale.
  const widened = skeleton;

  const output = cloneSamples(samples);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      if (widened[y][x]) {
        const terrain = routeKinds[y][x] ?? nearestRouteKind(samples, x, y);
        output[y][x] = replacement(output[y][x], terrain);
      } else if (ROUTE_TERRAINS.has(output[y][x].terrain)) {
        output[y][x] = replacement(output[y][x], bestNonRouteTerrain(output[y][x]));
      }
    }
  }
  return output;
}

export function normalizeTerrainLayout(samples: TerrainSample[][]): TerrainSample[][] {
  if (!samples.length || !samples[0]?.length) return [];
  const columns = samples[0].length;
  if (samples.some((row) => row.length !== columns)) {
    throw new RangeError("Terrain samples must form a rectangular grid");
  }
  return normalizeRoutes(squareSemanticEdges(samples));
}
