import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MapJobInput } from "../server/services/map/types";

const execution = vi.hoisted(() => ({
  active: 0,
  centerKey: "",
  finished: [] as string[],
  maxActive: 0,
  neighbourStartedAfterCenter: [] as boolean[],
  sleepCalls: [] as Date[],
  started: [] as string[],
  waitOnceFor: "",
  waited: new Set<string>(),
}));

vi.mock("workflow", () => ({
  sleep: async (until: Date) => {
    execution.sleepCalls.push(until);
  },
}));

vi.mock("../workflows/map-generation/steps", () => ({
  prepareMapBlockGenerationStep: async (input: { x: number; y: number }) => {
    const key = `${input.x},${input.y}`;
    if (key === execution.waitOnceFor && !execution.waited.has(key)) {
      execution.waited.add(key);
      return { permitId: `permit:${key}`, retryAt: 12_345, status: "wait" };
    }
    return { permitId: `permit:${key}`, status: "ready" };
  },
  // One generation step per batch: every block in the call shares a single
  // converged legacy state, so "active" now counts blocks within the batch.
  generateMapBlocksStep: async (input: { blocks: Array<{ x: number; y: number }> }) => {
    for (const block of input.blocks) {
      const key = `${block.x},${block.y}`;
      execution.started.push(key);
      if (key !== execution.centerKey) {
        execution.neighbourStartedAfterCenter.push(execution.finished.includes(execution.centerKey));
      }
    }
    execution.active += input.blocks.length;
    execution.maxActive = Math.max(execution.maxActive, execution.active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    execution.active -= input.blocks.length;
    for (const block of input.blocks) execution.finished.push(`${block.x},${block.y}`);
    return input.blocks.map((block) => ({ requested: { x: block.x, y: block.y } }));
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
  execution.sleepCalls = [];
  execution.started = [];
  execution.waitOnceFor = "";
  execution.waited = new Set();
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

  it("durably sleeps until the rolling permit retry time", async () => {
    execution.waitOnceFor = execution.centerKey;
    await generateMapWorkflow({
      blockX: 10,
      blockY: 20,
      offsets: [[0, 0]],
      regenerate: false,
    });

    expect(execution.sleepCalls).toEqual([new Date(12_345)]);
    expect(execution.started).toEqual([execution.centerKey]);
  });
});
