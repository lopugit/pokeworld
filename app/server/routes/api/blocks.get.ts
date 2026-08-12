import { defineEventHandler, getQuery } from "nitro/h3";
import { start } from "workflow/api";
import { generateMapWorkflow } from "../../../workflows/map-generation";
import {
  prepareMapGenerationJob,
  releasePreparedMapGenerationJob,
} from "../../services/map/generation-job";
import { generationControlStatus } from "../../services/map/generation-policy";
import { coordinatesForInput, offsetsFromQuery, parseMapJobInput } from "../../services/map/input";
import { findCurrentStoredBlocks } from "../../services/map/stored-blocks";
import { MAP_BLOCK_VERSION } from "../../services/map/version";
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
    // probe=true is a strictly read-only view of durable storage: it never
    // reserves quota or starts a generation workflow, so audit tooling (e.g.
    // scripts/map/audit-structure-duplicates.mjs) can sweep any deployment
    // without side effects. Missing blocks are simply absent from the answer.
    if (query.probe === "true") {
      const requested = coordinatesForInput(input);
      const blocks = await findCurrentStoredBlocks(requested);
      return jsonResponse({
        blocks,
        requested,
        status: "probe",
        version: MAP_BLOCK_VERSION,
      });
    }
    const prepared = await prepareMapGenerationJob(input);
    if (!prepared.workflowInput) {
      return jsonResponse({
        blocks: prepared.blocks,
        requested: prepared.requested,
        status: "completed",
        version: MAP_BLOCK_VERSION,
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
        version: MAP_BLOCK_VERSION,
      },
      { status: 202 },
    );
  } catch (error) {
    return errorResponse(error, generationControlStatus(error));
  }
});
