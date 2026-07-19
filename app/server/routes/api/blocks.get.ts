import { defineEventHandler, getQuery } from "nitro/h3";
import { start } from "workflow/api";
import { generateMapWorkflow } from "../../../workflows/map-generation";
import { coordinatesForInput, offsetsFromQuery, parseMapJobInput } from "../../services/map/input";
import { findCompletedStoredBlocks } from "../../services/map/stored-blocks";
import { errorResponse, jsonResponse } from "../../utils/http";

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const input = parseMapJobInput({
      blockX: query.blockX,
      blockY: query.blockY,
      offsets: offsetsFromQuery(query.offsets),
      regenerate: query.regenerate,
    });
    const requested = coordinatesForInput(input);

    if (!input.regenerate) {
      const cached = await findCompletedStoredBlocks(requested);
      if (cached) {
        return jsonResponse({ blocks: cached, status: "completed" });
      }
    }

    const run = await start(generateMapWorkflow, [input]);
    return jsonResponse({ blocks: [], runId: run.runId, status: "queued" }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
});
