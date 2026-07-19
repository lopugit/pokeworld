import { generateMapBlock } from "../../server/services/map/generate";
import { generationPermitId } from "../../server/services/map/generation-job";
import {
  acquireGenerationPermit,
  releaseGenerationReservationSlot,
} from "../../server/services/map/generation-quota";
import { assertRegenerationAllowed } from "../../server/services/map/generation-policy";
import { findCompletedStoredBlocks } from "../../server/services/map/stored-blocks";
import type {
  MapGenerationQuotaReservation,
  MapGenerationStepResult,
} from "../../server/services/map/types";

export type MapGenerationGateResult =
  | { status: "cached" }
  | { permitId: string; status: "ready" }
  | { permitId: string; retryAt: number; status: "wait" };

export async function prepareMapBlockGenerationStep(input: {
  x: number;
  y: number;
  regenerate: boolean;
  quotaReservation?: MapGenerationQuotaReservation;
}): Promise<MapGenerationGateResult> {
  "use step";
  assertRegenerationAllowed(input.regenerate);

  const reservationId = input.quotaReservation?.reservationId;
  const permitId = reservationId
    ? generationPermitId(reservationId, input.x, input.y)
    : `local:${input.x},${input.y}`;

  if (!input.regenerate) {
    const cached = await findCompletedStoredBlocks([{ x: input.x, y: input.y }]);
    if (cached) {
      await releaseGenerationReservationSlot(input.quotaReservation, permitId);
      return { status: "cached" };
    }
  }

  const permit = await acquireGenerationPermit(input.quotaReservation, permitId);
  return permit.granted
    ? { permitId, status: "ready" }
    : {
        permitId,
        retryAt: permit.retryAt,
        status: "wait",
      };
}

export async function generateMapBlockStep(input: {
  x: number;
  y: number;
  regenerate: boolean;
  permitId?: string;
}): Promise<MapGenerationStepResult> {
  "use step";
  return generateMapBlock(input);
}
