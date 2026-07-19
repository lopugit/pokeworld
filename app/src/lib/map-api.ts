import type { MapBlock, MapJobInput } from "../../server/services/map/types";

interface BlocksResponse {
  blocks: MapBlock[];
  runId?: string;
  status: string;
}

const MAP_JOB_POLL_DELAY_MS = 750;
// ~90 seconds. A workflow run whose bookkeeping never settles must not freeze
// map loading forever — timing out lets the caller clear its pending marks and
// retry as the player keeps moving.
const MAP_JOB_POLL_LIMIT = 120;

const abortableDelay = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
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
  options: { pollDelayMs?: number; pollLimit?: number } = {},
): Promise<MapBlock[]> {
  const pollDelayMs = options.pollDelayMs ?? MAP_JOB_POLL_DELAY_MS;
  const pollLimit = options.pollLimit ?? MAP_JOB_POLL_LIMIT;
  const query = new URLSearchParams({
    blockX: String(input.blockX),
    blockY: String(input.blockY),
    offsets: JSON.stringify(input.offsets),
    regenerate: String(input.regenerate),
  });
  const initial = await responseJson(await fetch(`/api/blocks?${query}`, { signal }));
  if (initial.status === "completed") return initial.blocks;
  if (!initial.runId) throw new Error("Map API queued a job without a workflow run ID");

  const pollPath = mapJobPollPath(initial.runId, input);
  for (let poll = 0; poll < pollLimit; poll += 1) {
    await abortableDelay(pollDelayMs, signal);
    const current = await responseJson(await fetch(pollPath, { signal }));
    if (current.status === "completed") return current.blocks;
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
