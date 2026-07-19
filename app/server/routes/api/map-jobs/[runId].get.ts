import { defineEventHandler, getQuery, getRouterParam } from "nitro/h3";
import { getRun } from "workflow/api";
import { coordinatesForInput, offsetsFromQuery, parseMapJobInput } from "../../../services/map/input";
import { getStoredBlocks } from "../../../services/map/mongo";
import { findCompletedStoredBlocks } from "../../../services/map/stored-blocks";
import type { MapGenerationResult } from "../../../services/map/types";
import { errorResponse, jsonResponse } from "../../../utils/http";

// Workflow run bookkeeping can report "running" long after every requested
// block has landed in MongoDB. When the poll carries the original request
// parameters, answer from the durable store instead of stalling the client.
async function storedBlocksFallback(query: Record<string, unknown>) {
  if (query.regenerate === "true") return null;
  if (query.blockX === undefined || query.blockY === undefined || query.offsets === undefined) {
    return null;
  }
  try {
    const input = parseMapJobInput({
      blockX: query.blockX,
      blockY: query.blockY,
      offsets: offsetsFromQuery(query.offsets),
      regenerate: false,
    });
    const requested = coordinatesForInput(input);
    const blocks = await findCompletedStoredBlocks(requested);
    return blocks ? { blocks, requested } : null;
  } catch {
    // Malformed hint parameters must never break run polling.
    return null;
  }
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
      const stored = await storedBlocksFallback(getQuery(event));
      if (stored) {
        return jsonResponse({
          blocks: stored.blocks,
          requested: stored.requested,
          runId,
          status: "completed",
          source: "stored-blocks",
        });
      }
      return jsonResponse({ runId, status });
    }

    const result = (await run.returnValue) as MapGenerationResult;
    const blocks = result.inlineBlocks ?? (await getStoredBlocks(result.requested)) ?? [];
    return jsonResponse({ blocks, requested: result.requested, runId, status });
  } catch (error) {
    return errorResponse(error, 500);
  }
});
