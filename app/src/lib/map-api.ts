import type { MapBlock, MapJobInput } from "../../server/services/map/types";

interface BlocksResponse {
  blocks?: MapBlock[];
  runId?: string;
  status: string;
}

const MAP_JOB_POLL_DELAY_MS = 750;
const MAP_JOB_POLL_MAX_DELAY_MS = 5_000;
const MAP_JOB_POLL_BACKOFF_EVERY = 20;
// Neighbour generation can legitimately take several minutes. Stored-block
// progress keeps the UI moving; a gradual backoff keeps the roughly ten-minute
// ceiling without hammering MongoDB hundreds of times during a slow run.
const MAP_JOB_POLL_LIMIT = 180;

const mapJobPollDelay = (baseDelayMs: number, poll: number) => {
  const maximum = Math.max(baseDelayMs, MAP_JOB_POLL_MAX_DELAY_MS);
  const multiplier = 1 + Math.floor(poll / MAP_JOB_POLL_BACKOFF_EVERY);
  return Math.min(maximum, baseDelayMs * multiplier);
};

const mapBlockRevision = (block: MapBlock) => {
  let latestTileUpdate = 0;
  for (const tile of block.tiles ?? []) {
    if (typeof tile.updated === "number") latestTileUpdate = Math.max(latestTileUpdate, tile.updated);
  }
  return [
    block.updated ?? "",
    block.mapGeneratedAt ?? "",
    latestTileUpdate,
    block.uuid ?? "",
    block.tiles?.length ?? 0,
  ].join(":");
};

const abortableDelay = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });

async function responseJson(response: Response): Promise<BlocksResponse> {
  const value = (await response.json()) as BlocksResponse & { error?: string };
  if (!response.ok && response.status !== 202) {
    throw new Error(value.error || `Map API returned ${response.status}`);
  }
  return value;
}

// The poll URL carries the original request so the server can answer from
// stored blocks even while workflow run bookkeeping lags behind the data.
export function mapJobPollPath(runId: string, input: MapJobInput): string {
  if (input.regenerate) return `/api/map-jobs/${encodeURIComponent(runId)}`;
  const query = new URLSearchParams({
    blockX: String(input.blockX),
    blockY: String(input.blockY),
    offsets: JSON.stringify(input.offsets),
  });
  return `/api/map-jobs/${encodeURIComponent(runId)}?${query}`;
}

export async function getMapBlocks(
  input: MapJobInput,
  signal: AbortSignal,
  options: {
    onBlocks?: (blocks: MapBlock[]) => void;
    pollDelayMs?: number;
    pollLimit?: number;
  } = {},
): Promise<MapBlock[]> {
  const pollDelayMs = options.pollDelayMs ?? MAP_JOB_POLL_DELAY_MS;
  const pollLimit = options.pollLimit ?? MAP_JOB_POLL_LIMIT;
  const received = new Map<string, MapBlock>();
  const deliveredRevisions = new Map<string, string>();
  const receive = (blocks: MapBlock[] | undefined) => {
    const changed: MapBlock[] = [];
    for (const block of blocks ?? []) {
      const key = `${block.x},${block.y}`;
      received.set(key, block);
      const revision = mapBlockRevision(block);
      if (deliveredRevisions.get(key) !== revision) {
        deliveredRevisions.set(key, revision);
        changed.push(block);
      }
    }
    if (changed.length > 0) options.onBlocks?.(changed);
  };
  const query = new URLSearchParams({
    blockX: String(input.blockX),
    blockY: String(input.blockY),
    offsets: JSON.stringify(input.offsets),
    regenerate: String(input.regenerate),
  });
  const initial = await responseJson(await fetch(`/api/blocks?${query}`, { signal }));
  receive(initial.blocks);
  if (initial.status === "completed") return [...received.values()];
  if (!initial.runId) throw new Error("Map API queued a job without a workflow run ID");

  const pollPath = mapJobPollPath(initial.runId, input);
  for (let poll = 0; poll < pollLimit; poll += 1) {
    await abortableDelay(mapJobPollDelay(pollDelayMs, poll), signal);
    const current = await responseJson(await fetch(pollPath, { signal }));
    receive(current.blocks);
    if (current.status === "completed") return [...received.values()];
    if (current.status === "failed" || current.status === "cancelled") {
      throw new Error(`Map workflow ${current.status}`);
    }
  }
  throw new Error("Map generation timed out; it will retry as you explore");
}

export async function getBlockForCoordinates(latitude: number, longitude: number, signal: AbortSignal) {
  const query = new URLSearchParams({ lat: String(latitude), lng: String(longitude) });
  const response = await fetch(`/api/block-lat-lng?${query}`, { signal });
  const value = (await response.json()) as { block?: { x: number; y: number }; error?: string };
  if (!response.ok || !value.block) throw new Error(value.error || "Could not resolve a map block");
  return value.block;
}
