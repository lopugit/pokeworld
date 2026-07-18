import { defineEventHandler, getQuery } from "nitro/h3";
import { start } from "workflow/api";
import { generateMapWorkflow } from "../../../workflows/map-generation";
import { coordinatesForInput, parseMapJobInput } from "../../services/map/input";
import { shouldRegenerateFallbackBlock } from "../../services/map/legacy/map-source";
import { getStoredBlocks } from "../../services/map/mongo";
import { errorResponse, jsonResponse } from "../../utils/http";

function queryOffsets(raw: unknown) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return [[0, 0]];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed[0]) ? parsed : [parsed];
}

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const input = parseMapJobInput({
      blockX: query.blockX,
      blockY: query.blockY,
      offsets: queryOffsets(query.offsets),
      regenerate: query.regenerate,
    });
    const requested = coordinatesForInput(input);

    if (!input.regenerate) {
      const cached = await getStoredBlocks(requested);
      const hasStaleFallback = cached?.some((block) =>
        shouldRegenerateFallbackBlock(block),
      );
      if (cached && cached.length === requested.length && !hasStaleFallback) {
        return jsonResponse({ blocks: cached, status: "completed" });
      }
    }

    const run = await start(generateMapWorkflow, [input]);
    return jsonResponse({ blocks: [], runId: run.runId, status: "queued" }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
});
