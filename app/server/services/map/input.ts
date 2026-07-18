import type { MapJobInput, MapOffset } from "./types";

const MAX_OFFSETS = 25;
const MAX_OFFSET_DISTANCE = 8;

function finiteInteger(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`${field} must be a finite integer`);
  }
  return parsed;
}

function parseOffset(value: unknown): MapOffset {
  const candidate = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(candidate) || candidate.length !== 2) {
    throw new Error("Each offset must be a two-item [x, y] array");
  }
  const x = finiteInteger(candidate[0], "offset x");
  const y = finiteInteger(candidate[1], "offset y");
  if (Math.abs(x) > MAX_OFFSET_DISTANCE || Math.abs(y) > MAX_OFFSET_DISTANCE) {
    throw new Error(`Offsets must stay within ${MAX_OFFSET_DISTANCE} blocks of the player`);
  }
  return [x, y];
}

export function parseMapJobInput(value: unknown): MapJobInput {
  if (!value || typeof value !== "object") {
    throw new Error("A JSON map-generation request is required");
  }
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.offsets) || raw.offsets.length === 0) {
    throw new Error("At least one map offset is required");
  }
  if (raw.offsets.length > MAX_OFFSETS) {
    throw new Error(`A map job can contain at most ${MAX_OFFSETS} offsets`);
  }

  const unique = new Map<string, MapOffset>();
  for (const rawOffset of raw.offsets) {
    const offset = parseOffset(rawOffset);
    unique.set(`${offset[0]},${offset[1]}`, offset);
  }

  return {
    blockX: finiteInteger(raw.blockX, "blockX"),
    blockY: finiteInteger(raw.blockY, "blockY"),
    offsets: [...unique.values()],
    regenerate: raw.regenerate === true || raw.regenerate === "true",
  };
}

export function coordinatesForInput(input: MapJobInput) {
  return input.offsets.map(([x, y]) => ({
    x: input.blockX + x,
    y: input.blockY + y,
  }));
}
