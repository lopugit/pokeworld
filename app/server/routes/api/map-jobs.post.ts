import { defineEventHandler } from "nitro/h3";
import { start } from "workflow/api";
import { generateMapWorkflow } from "../../../workflows/map-generation";
import { parseMapJobInput } from "../../services/map/input";
import { errorResponse, jsonResponse } from "../../utils/http";

export default defineEventHandler(async (event) => {
  try {
    const body = await event.req.json();
    const input = parseMapJobInput(body);
    const run = await start(generateMapWorkflow, [input]);
    return jsonResponse(
      {
        runId: run.runId,
        status: "queued",
      },
      { status: 202 },
    );
  } catch (error) {
    return errorResponse(error);
  }
});
