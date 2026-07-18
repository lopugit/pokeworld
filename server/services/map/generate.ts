import { isMongoConfigured } from "./mongo";
import type { MapBlock, MapGenerationStepResult } from "./types";
import createLegacyBlocksHandlerUntyped from "./legacy/blocks";

const createLegacyBlocksHandler = createLegacyBlocksHandlerUntyped as (
  version: string,
) => (request: { query: Record<string, unknown> }) => Promise<{
  send: { blocks?: MapBlock[] } | string;
  status: number;
}>;

const blocksHandler = createLegacyBlocksHandler("2.0.0001");

export async function generateMapBlock(input: {
  x: number;
  y: number;
  regenerate: boolean;
}): Promise<MapGenerationStepResult> {
  const response = await blocksHandler({
    query: {
      blockX: input.x,
      blockY: input.y,
      offsets: [[0, 0]],
      regenerate: input.regenerate,
    },
  });

  if (response.status !== 200 || typeof response.send === "string") {
    throw new Error(typeof response.send === "string" ? response.send : "Map generation failed");
  }

  const target = response.send.blocks?.find((block) => block.x === input.x && block.y === input.y);
  if (!target) {
    throw new Error(`Map generation did not return block ${input.x},${input.y}`);
  }

  return {
    requested: { x: input.x, y: input.y },
    ...(isMongoConfigured() ? {} : { inlineBlock: target }),
  };
}
