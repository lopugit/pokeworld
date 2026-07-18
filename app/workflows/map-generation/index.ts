import type { MapGenerationResult, MapJobInput } from "../../server/services/map/types";
import { generateMapBlockStep } from "./steps";

export async function generateMapWorkflow(input: MapJobInput): Promise<MapGenerationResult> {
  "use workflow";

  // Each block is its own durable function invocation. Promise.all lets the
  // Workflow runtime schedule independent blocks concurrently while retaining
  // per-block retries and restart-safe progress.
  const results = await Promise.all(
    input.offsets.map(([offsetX, offsetY]) =>
      generateMapBlockStep({
        x: input.blockX + offsetX,
        y: input.blockY + offsetY,
        regenerate: input.regenerate,
      }),
    ),
  );
  const requested = results.map((result) => result.requested);
  const inlineBlocks = results.flatMap((result) =>
    result.inlineBlock ? [result.inlineBlock] : [],
  );

  return {
    requested,
    ...(inlineBlocks.length > 0 ? { inlineBlocks } : {}),
  };
}
