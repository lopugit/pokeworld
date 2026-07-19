import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MapJobInput } from "../server/services/map/types";

const execution = vi.hoisted(() => ({
  active: 0,
  centerKey: "",
  finished: [] as string[],
  maxActive: 0,
  neighbourStartedAfterCenter: [] as boolean[],
  started: [] as string[],
}));

vi.mock("../workflows/map-generation/steps", () => ({
  generateMapBlockStep: async (input: { x: number; y: number }) => {
    const key = `${input.x},${input.y}`;
    execution.started.push(key);
    if (key !== execution.centerKey) {
      execution.neighbourStartedAfterCenter.push(execution.finished.includes(execution.centerKey));
    }
    execution.active += 1;
    execution.maxActive = Math.max(execution.maxActive, execution.active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    execution.active -= 1;
    execution.finished.push(key);
    return { requested: { x: input.x, y: input.y } };
  },
}));

import {
  generateMapWorkflow,
  MAP_GENERATION_BATCH_SIZE,
  mapGenerationBatches,
} from "../workflows/map-generation";

beforeEach(() => {
  execution.active = 0;
  execution.centerKey = "10,20";
  execution.finished = [];
  execution.maxActive = 0;
  execution.neighbourStartedAfterCenter = [];
  execution.started = [];
});

describe("map workflow scheduling", () => {
  it("finishes the centre before starting bounded neighbour batches", async () => {
    const input: MapJobInput = {
      blockX: 10,
      blockY: 20,
      offsets: [
        [1, 0],
        [0, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ],
      regenerate: false,
    };

    const result = await generateMapWorkflow(input);

    expect(execution.started[0]).toBe(execution.centerKey);
    expect(execution.neighbourStartedAfterCenter.every(Boolean)).toBe(true);
    expect(execution.maxActive).toBe(MAP_GENERATION_BATCH_SIZE);
    expect(result.requested).toHaveLength(input.offsets.length);
  });

  it("isolates the centre and preserves the caller's neighbour priority", () => {
    expect(mapGenerationBatches([[1, 0], [0, 0], [-1, 0], [0, 1]], 2)).toEqual([
      [[0, 0]],
      [[1, 0], [-1, 0]],
      [[0, 1]],
    ]);
    expect(
      mapGenerationBatches([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]], 99)
        .every((batch) => batch.length <= MAP_GENERATION_BATCH_SIZE),
    ).toBe(true);
  });
});
