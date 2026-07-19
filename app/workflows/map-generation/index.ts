import type {
  MapGenerationResult,
  MapGenerationStepResult,
  MapJobInput,
  MapOffset,
} from "../../server/services/map/types";
import { generateMapBlockStep } from "./steps";

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

export async function generateMapWorkflow(input: MapJobInput): Promise<MapGenerationResult> {
  "use workflow";

  // Resolve the player block first, then keep later durable invocations bounded.
  // The legacy generator locks an expanded neighbourhood around every target,
  // so starting a whole 5x5 preload window at once creates avoidable contention.
  const results: MapGenerationStepResult[] = [];
  for (const batch of mapGenerationBatches(input.offsets)) {
    const completed = await Promise.all(
      batch.map(([offsetX, offsetY]) =>
        generateMapBlockStep({
          x: input.blockX + offsetX,
          y: input.blockY + offsetY,
          regenerate: input.regenerate,
        }),
      ),
    );
    results.push(...completed);
  }
  const requested = results.map((result) => result.requested);
  const inlineBlocks = results.flatMap((result) =>
    result.inlineBlock ? [result.inlineBlock] : [],
  );

  return {
    requested,
    ...(inlineBlocks.length > 0 ? { inlineBlocks } : {}),
  };
}
