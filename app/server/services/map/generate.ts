import { putStoredBlocks } from "./block-store";
import {
  assertPublicGenerationPermit,
  assertRegenerationAllowed,
} from "./generation-policy";
import type { MapBlock, MapGenerationStepResult } from "./types";
import { MAP_BLOCK_VERSION } from "./version";
import createLegacyBlocksHandlerUntyped from "./legacy/blocks";

const createLegacyBlocksHandler = createLegacyBlocksHandlerUntyped as (
  version: string,
) => (request: { query: Record<string, unknown> }) => Promise<{
  send: { blocks?: MapBlock[] } | string;
  status: number;
}>;

export { MAP_BLOCK_VERSION } from "./version";

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
  permitId?: string;
}): Promise<MapGenerationStepResult> {
  assertRegenerationAllowed(input.regenerate);
  assertPublicGenerationPermit(input.permitId);
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

  const persisted = await putStoredBlocks([target]);

  return {
    requested: { x: input.x, y: input.y },
    ...(persisted ? {} : { inlineBlock: target }),
  };
}
