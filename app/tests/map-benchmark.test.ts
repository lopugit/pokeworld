import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface MapBenchmarkResult {
  pixels: number;
  tiles: number;
  rounds: number;
  outputEquivalent: boolean;
  legacyMedianMs: number;
  optimizedMedianMs: number;
  speedup: number;
}

describe("map-generation benchmark", () => {
  it("runs the production colour-extraction benchmark with equivalent output", () => {
    const appDir = fileURLToPath(new URL("..", import.meta.url));
    const output = execFileSync(process.execPath, ["scripts/benchmark-map-pipeline.mjs"], {
      cwd: appDir,
      encoding: "utf8",
      timeout: 30_000,
    });
    const result = JSON.parse(output.trim()) as MapBenchmarkResult;

    expect(result).toMatchObject({
      pixels: 512 * 512,
      tiles: 16 * 16,
      rounds: 7,
      outputEquivalent: true,
    });
    expect(Number.isFinite(result.legacyMedianMs)).toBe(true);
    expect(Number.isFinite(result.optimizedMedianMs)).toBe(true);
    expect(Number.isFinite(result.speedup)).toBe(true);
  });
});
