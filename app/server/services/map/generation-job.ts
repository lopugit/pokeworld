import { assertRegenerationAllowed } from "./generation-policy";
import {
  releaseGenerationReservationSlot,
  reserveGenerationQuota,
} from "./generation-quota";
import { coordinatesForInput } from "./input";
import { findCurrentStoredBlocks } from "./stored-blocks";
import type {
  MapBlock,
  MapGenerationWorkflowInput,
  MapJobInput,
  MapOffset,
} from "./types";

export interface PreparedMapGenerationJob {
  blocks: MapBlock[];
  requested: Array<{ x: number; y: number }>;
  workflowInput?: MapGenerationWorkflowInput;
}

const coordinateKey = ({ x, y }: { x: number; y: number }) => `${x},${y}`;

export function generationPermitId(
  reservationId: string,
  x: number,
  y: number,
): string {
  return `${reservationId}:${x},${y}`;
}

export function generationOffsetsMissingFromBlocks(
  input: MapJobInput,
  blocks: Array<{ x: number; y: number }>,
): MapOffset[] {
  if (input.regenerate) return [...input.offsets];
  const available = new Set(blocks.map(coordinateKey));
  return input.offsets.filter(
    ([offsetX, offsetY]) =>
      !available.has(`${input.blockX + offsetX},${input.blockY + offsetY}`),
  );
}

export async function prepareMapGenerationJob(
  input: MapJobInput,
): Promise<PreparedMapGenerationJob> {
  assertRegenerationAllowed(input.regenerate);
  const requested = coordinatesForInput(input);
  const blocks = input.regenerate ? [] : await findCurrentStoredBlocks(requested);
  const generationOffsets = generationOffsetsMissingFromBlocks(input, blocks);
  if (generationOffsets.length === 0) return { blocks, requested };

  const quotaReservation = await reserveGenerationQuota(generationOffsets.length);
  return {
    blocks,
    requested,
    workflowInput: {
      ...input,
      generationOffsets,
      ...(quotaReservation ? { quotaReservation } : {}),
    },
  };
}

export async function releasePreparedMapGenerationJob(
  workflowInput: MapGenerationWorkflowInput,
): Promise<void> {
  const reservation = workflowInput.quotaReservation;
  if (!reservation) return releaseGenerationReservationSlot(undefined, "unreserved-job");
  const offsets = workflowInput.generationOffsets ?? workflowInput.offsets;
  await Promise.all(
    offsets.map(([offsetX, offsetY]) => {
      const x = workflowInput.blockX + offsetX;
      const y = workflowInput.blockY + offsetY;
      return releaseGenerationReservationSlot(
        reservation,
        generationPermitId(reservation.reservationId, x, y),
      );
    }),
  );
}
