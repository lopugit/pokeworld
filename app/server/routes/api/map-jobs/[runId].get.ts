import { defineEventHandler, getQuery, getRouterParam } from "nitro/h3";
import { getRun } from "workflow/api";
import { coordinatesForInput, offsetsFromQuery, parseMapJobInput } from "../../../services/map/input";
import { getStoredBlocks } from "../../../services/map/block-store";
import { generationControlStatus } from "../../../services/map/generation-policy";
import {
  findCurrentStoredBlocks,
  hasEveryRequestedBlock,
} from "../../../services/map/stored-blocks";
import type { MapGenerationResult } from "../../../services/map/types";
import { errorResponse, jsonResponse } from "../../../utils/http";

// Workflow run bookkeeping can report "running" long after every requested
// block has landed in durable storage. When the poll carries the original request
// parameters, answer from the durable store instead of stalling the client.
async function storedBlocksProgress(query: Record<string, unknown>) {
  if (query.regenerate === "true") return null;
  if (query.blockX === undefined || query.blockY === undefined || query.offsets === undefined) {
    return null;
  }
  let requested: Array<{ x: number; y: number }>;
  try {
    const input = parseMapJobInput({
      blockX: query.blockX,
      blockY: query.blockY,
      offsets: offsetsFromQuery(query.offsets),
      regenerate: false,
    });
    requested = coordinatesForInput(input);
  } catch {
    // Malformed hint parameters must never break run polling.
    return null;
  }
  const blocks = await findCurrentStoredBlocks(requested);
  return { blocks, requested };
}

export default defineEventHandler(async (event) => {
  const runId = getRouterParam(event, "runId");
  if (!runId) return errorResponse(new Error("A workflow run ID is required"));

  try {
    const run = getRun(runId);
    if (!(await run.exists)) {
      return errorResponse(new Error("Map-generation workflow not found"), 404);
    }

    const status = await run.status;
    if (status !== "completed") {
      const stored = await storedBlocksProgress(getQuery(event));
      if (stored) {
        const completed = hasEveryRequestedBlock(stored.blocks, stored.requested);
        return jsonResponse({
          blocks: stored.blocks,
          requested: stored.requested,
          runId,
          status: completed ? "completed" : status,
          source: stored.blocks.length > 0 ? "stored-blocks-progress" : undefined,
        });
      }
      return jsonResponse({ blocks: [], runId, status });
    }

    const result = (await run.returnValue) as MapGenerationResult;
    const blocks = result.inlineBlocks ?? (await getStoredBlocks(result.requested)) ?? [];
    return jsonResponse({ blocks, requested: result.requested, runId, status });
  } catch (error) {
    return errorResponse(error, generationControlStatus(error, 500));
  }
});
