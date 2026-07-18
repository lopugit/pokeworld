import { defineEventHandler, getRouterParam } from "nitro/h3";
import { getRun } from "workflow/api";
import { getStoredBlocks } from "../../../services/map/mongo";
import type { MapGenerationResult } from "../../../services/map/types";
import { errorResponse, jsonResponse } from "../../../utils/http";

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
      return jsonResponse({ runId, status });
    }

    const result = (await run.returnValue) as MapGenerationResult;
    const blocks = result.inlineBlocks ?? (await getStoredBlocks(result.requested)) ?? [];
    return jsonResponse({ blocks, requested: result.requested, runId, status });
  } catch (error) {
    return errorResponse(error, 500);
  }
});
