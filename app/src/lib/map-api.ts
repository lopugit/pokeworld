import type { MapBlock, MapJobInput } from "../../server/services/map/types";

interface BlocksResponse {
  blocks: MapBlock[];
  runId?: string;
  status: string;
}

const abortableDelay = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
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

export async function getMapBlocks(input: MapJobInput, signal: AbortSignal): Promise<MapBlock[]> {
  const query = new URLSearchParams({
    blockX: String(input.blockX),
    blockY: String(input.blockY),
    offsets: JSON.stringify(input.offsets),
    regenerate: String(input.regenerate),
  });
  const initial = await responseJson(await fetch(`/api/blocks?${query}`, { signal }));
  if (initial.status === "completed") return initial.blocks;
  if (!initial.runId) throw new Error("Map API queued a job without a workflow run ID");

  for (;;) {
    await abortableDelay(750, signal);
    const current = await responseJson(await fetch(`/api/map-jobs/${encodeURIComponent(initial.runId)}`, { signal }));
    if (current.status === "completed") return current.blocks;
    if (current.status === "failed" || current.status === "cancelled") {
      throw new Error(`Map workflow ${current.status}`);
    }
  }
}

export async function getBlockForCoordinates(latitude: number, longitude: number, signal: AbortSignal) {
  const query = new URLSearchParams({ lat: String(latitude), lng: String(longitude) });
  const response = await fetch(`/api/block-lat-lng?${query}`, { signal });
  const value = (await response.json()) as { block?: { x: number; y: number }; error?: string };
  if (!response.ok || !value.block) throw new Error(value.error || "Could not resolve a map block");
  return value.block;
}
