import { defineEventHandler } from "nitro/h3";
import { start } from "workflow/api";
import { generateMapWorkflow } from "../../../workflows/map-generation";
import {
  prepareMapGenerationJob,
  releasePreparedMapGenerationJob,
} from "../../services/map/generation-job";
import { generationControlStatus } from "../../services/map/generation-policy";
import { parseMapJobInput } from "../../services/map/input";
import { errorResponse, jsonResponse } from "../../utils/http";

export default defineEventHandler(async (event) => {
  try {
    const body = await event.req.json();
    const input = parseMapJobInput(body);
    const prepared = await prepareMapGenerationJob(input);
    if (!prepared.workflowInput) {
      return jsonResponse({
        blocks: prepared.blocks,
        requested: prepared.requested,
        status: "completed",
      });
    }

    let run;
    try {
      run = await start(generateMapWorkflow, [prepared.workflowInput]);
    } catch (error) {
      await releasePreparedMapGenerationJob(prepared.workflowInput);
      throw error;
    }
    return jsonResponse(
      {
        blocks: prepared.blocks,
        requested: prepared.requested,
        runId: run.runId,
        status: "queued",
      },
      { status: 202 },
    );
  } catch (error) {
    return errorResponse(error, generationControlStatus(error));
  }
});
