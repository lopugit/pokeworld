import { sleep } from "workflow";
import {
  assertPublicWorkflowReservation,
  assertRegenerationAllowed,
} from "../../server/services/map/generation-policy";
import { coordinatesForInput } from "../../server/services/map/input";
import type {
  MapGenerationResult,
  MapGenerationStepResult,
  MapGenerationWorkflowInput,
  MapOffset,
} from "../../server/services/map/types";
import {
  generateMapBlockStep,
  prepareMapBlockGenerationStep,
} from "./steps";

export const MAP_GENERATION_BATCH_SIZE = 4;

export function mapGenerationBatches(
  offsets: MapOffset[],
  batchSize = MAP_GENERATION_BATCH_SIZE,
): MapOffset[][] {
  const safeBatchSize = Math.min(
    MAP_GENERATION_BATCH_SIZE,
    Math.max(1, Math.floor(batchSize)),
  );
  const center = offsets.find(([x, y]) => x === 0 && y === 0);
  const remaining = offsets.filter(([x, y]) => x !== 0 || y !== 0);
  const batches: MapOffset[][] = center ? [[center]] : [];

  for (let index = 0; index < remaining.length; index += safeBatchSize) {
    batches.push(remaining.slice(index, index + safeBatchSize));
  }
  return batches;
}

export async function generateMapWorkflow(
  input: MapGenerationWorkflowInput,
): Promise<MapGenerationResult> {
  "use workflow";
  assertRegenerationAllowed(input.regenerate);
  assertPublicWorkflowReservation(input.quotaReservation?.reservationId);

  // Resolve the player block first, then keep later durable invocations bounded.
  // The legacy generator locks an expanded neighbourhood around every target,
  // so starting a whole 5x5 preload window at once creates avoidable contention.
  const results: MapGenerationStepResult[] = [];
  const generationOffsets = input.generationOffsets ?? input.offsets;
  for (const batch of mapGenerationBatches(generationOffsets)) {
    const completed = await Promise.all(
      batch.map(async ([offsetX, offsetY]) => {
        const x = input.blockX + offsetX;
        const y = input.blockY + offsetY;
        while (true) {
          const gate = await prepareMapBlockGenerationStep({
            x,
            y,
            regenerate: input.regenerate,
            quotaReservation: input.quotaReservation,
          });
          if (gate.status === "wait") {
            await sleep(new Date(gate.retryAt));
            continue;
          }
          if (gate.status === "cached") return { requested: { x, y } };
          return generateMapBlockStep({
            x,
            y,
            regenerate: input.regenerate,
            permitId: gate.permitId,
          });
        }
      }),
    );
    results.push(...completed);
  }
  const requested = coordinatesForInput(input);
  const inlineBlocks = results.flatMap((result) =>
    result.inlineBlock ? [result.inlineBlock] : [],
  );

  return {
    requested,
    ...(inlineBlocks.length > 0 ? { inlineBlocks } : {}),
  };
}
