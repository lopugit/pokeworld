import { isCurrentMapBlock } from "./generate";
import { shouldRegenerateFallbackBlock } from "./legacy/map-source";
import { getStoredBlocks } from "./block-store";
import type { MapBlock } from "./types";

interface StoredBlockLike {
  x?: unknown;
  y?: unknown;
  mapGeneratedAt?: unknown;
  updated?: unknown;
  tiles?: Array<{ updated?: number; version?: string }>;
  [key: string]: unknown;
}

const blockCoordinateKey = (block: StoredBlockLike) => `${block.x},${block.y}`;

const blockRevision = (block: StoredBlockLike) => {
  const tileUpdate = (block.tiles ?? []).reduce(
    (latest, tile) => Math.max(latest, tile.updated ?? 0),
    0,
  );
  return Math.max(
    typeof block.updated === "number" ? block.updated : 0,
    typeof block.mapGeneratedAt === "number" ? block.mapGeneratedAt : 0,
    tileUpdate,
  );
};

export function currentBlockSubset<T extends StoredBlockLike>(
  cached: T[] | null | undefined,
): T[] {
  const current = new Map<string, T>();
  for (const block of cached ?? []) {
    if (shouldRegenerateFallbackBlock(block) || !isCurrentMapBlock(block)) continue;
    const key = blockCoordinateKey(block);
    const existing = current.get(key);
    if (!existing || blockRevision(block) >= blockRevision(existing)) current.set(key, block);
  }
  return [...current.values()];
}

export function hasEveryRequestedBlock(
  blocks: StoredBlockLike[],
  requested: Array<{ x: number; y: number }>,
): boolean {
  const available = new Set(blocks.map(blockCoordinateKey));
  return requested.every(({ x, y }) => available.has(`${x},${y}`));
}

// A stored block set satisfies a request only when every requested block is
// present, on the current tile version, and not awaiting a Google-backed
// regeneration of fallback imagery.
export function completedBlockSet<T extends StoredBlockLike>(
  cached: T[] | null | undefined,
  requestedCount: number,
): T[] | null {
  if (!cached) return null;
  const current = currentBlockSubset(cached);
  return current.length === requestedCount ? current : null;
}

// Durable block storage is the source of truth for finished map data. Workflow run
// bookkeeping can lag behind the durable writes (a run may report "running"
// minutes after its blocks landed), so API routes answer from stored blocks
// whenever the full requested set is already current.
export async function findCompletedStoredBlocks(
  requested: Array<{ x: number; y: number }>,
): Promise<MapBlock[] | null> {
  const cached = await getStoredBlocks(requested);
  return completedBlockSet(cached as MapBlock[] | undefined, requested.length);
}

// Polling also exposes the current subset so the client can render each block
// as soon as its durable write lands, without waiting for every neighbour.
export async function findCurrentStoredBlocks(
  requested: Array<{ x: number; y: number }>,
): Promise<MapBlock[]> {
  const cached = await getStoredBlocks(requested);
  return currentBlockSubset(cached as MapBlock[] | undefined);
}
