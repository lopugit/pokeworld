import { isMongoConfigured } from "./mongo";
import type { MapBlock, MapGenerationStepResult } from "./types";
import createLegacyBlocksHandlerUntyped from "./legacy/blocks";

const createLegacyBlocksHandler = createLegacyBlocksHandlerUntyped as (
  version: string,
) => (request: { query: Record<string, unknown> }) => Promise<{
  send: { blocks?: MapBlock[] } | string;
  status: number;
}>;

// Bump when terrain semantics or sprite stitching changes so stored blocks are rebuilt.
export const MAP_BLOCK_VERSION = "2.2.0000";

const blocksHandler = createLegacyBlocksHandler(MAP_BLOCK_VERSION);

export function isCurrentMapBlock(block: {
  tiles?: Array<{ version?: string }>;
}): boolean {
  return (
    block.tiles?.length === 16 * 16 &&
    block.tiles.every((tile) => tile.version === MAP_BLOCK_VERSION)
  );
}

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
