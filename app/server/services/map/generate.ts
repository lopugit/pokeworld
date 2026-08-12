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
  send: { blocks?: MapBlock[]; persisted?: boolean } | string;
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

// Generates a whole batch through ONE legacy generation state. Every block in
// the batch (plus each of their stored edge neighbours) stitches against the
// same world view and is saved by the handler itself, so structure sites
// converge across the seams inside the batch instead of being planned against
// per-block truncated masks.
export async function generateMapBlocks(input: {
  blocks: Array<{ x: number; y: number; permitId?: string }>;
  regenerate: boolean;
}): Promise<MapGenerationStepResult[]> {
  if (input.blocks.length === 0) return [];
  assertRegenerationAllowed(input.regenerate);
  for (const block of input.blocks) assertPublicGenerationPermit(block.permitId);

  const anchor = input.blocks[0];
  const response = await blocksHandler({
    query: {
      blockX: anchor.x,
      blockY: anchor.y,
      offsets: input.blocks.map((block) => [block.x - anchor.x, block.y - anchor.y]),
      regenerate: input.regenerate,
    },
  });

  if (response.status !== 200 || typeof response.send === "string") {
    throw new Error(typeof response.send === "string" ? response.send : "Map generation failed");
  }

  const send = response.send;
  const results: MapGenerationStepResult[] = [];
  for (const requested of input.blocks) {
    const target = send.blocks?.find((block) => block.x === requested.x && block.y === requested.y);
    if (!target) {
      throw new Error(`Map generation did not return block ${requested.x},${requested.y}`);
    }
    // The legacy handler persists through the durable block store (Mongo or
    // Thingtime) itself — including re-stitched edge neighbours it healed.
    // Without a durable store the block travels inline with the workflow.
    const persisted = send.persisted === true ? true : await putStoredBlocks([target]);
    results.push({
      requested: { x: requested.x, y: requested.y },
      ...(persisted ? {} : { inlineBlock: target }),
    });
  }
  return results;
}

export async function generateMapBlock(input: {
  x: number;
  y: number;
  regenerate: boolean;
  permitId?: string;
}): Promise<MapGenerationStepResult> {
  const [result] = await generateMapBlocks({
    blocks: [{ x: input.x, y: input.y, permitId: input.permitId }],
    regenerate: input.regenerate,
  });
  return result;
}
