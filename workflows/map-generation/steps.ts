import { generateMapBlock } from "../../server/services/map/generate";
import type { MapGenerationStepResult } from "../../server/services/map/types";

export async function generateMapBlockStep(input: {
  x: number;
  y: number;
  regenerate: boolean;
}): Promise<MapGenerationStepResult> {
  "use step";
  return generateMapBlock(input);
}
