import { isCurrentMapBlock } from "./generate";
import { shouldRegenerateFallbackBlock } from "./legacy/map-source";
import { getStoredBlocks } from "./mongo";
import type { MapBlock } from "./types";

interface StoredBlockLike {
  tiles?: Array<{ version?: string }>;
  [key: string]: unknown;
}

// A stored block set satisfies a request only when every requested block is
// present, on the current tile version, and not awaiting a Google-backed
// regeneration of fallback imagery.
export function completedBlockSet<T extends StoredBlockLike>(
  cached: T[] | null | undefined,
  requestedCount: number,
): T[] | null {
  if (!cached || cached.length !== requestedCount) return null;
  const stale = cached.some(
    (block) => shouldRegenerateFallbackBlock(block) || !isCurrentMapBlock(block),
  );
  return stale ? null : cached;
}

// MongoDB is the source of truth for finished map data. Workflow run
// bookkeeping can lag behind the durable writes (a run may report "running"
// minutes after its blocks landed), so API routes answer from stored blocks
// whenever the full requested set is already current.
export async function findCompletedStoredBlocks(
  requested: Array<{ x: number; y: number }>,
): Promise<MapBlock[] | null> {
  const cached = await getStoredBlocks(requested);
  return completedBlockSet(cached as MapBlock[] | undefined, requested.length);
}
