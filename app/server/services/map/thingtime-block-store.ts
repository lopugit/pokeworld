import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  ThingtimeApiError,
  thingtimeServiceRequest,
  type ThingtimeRequestOptions,
} from "../thingtime/client";
import type { MapBlock } from "./types";
import { MAP_BLOCK_VERSION } from "./version";

export const POKEWORLD_BLOCK_SCHEMA = "PokeworldBlock";
export const POKEWORLD_BLOCK_WORLD = "earth-v1";
export const POKEWORLD_BLOCK_PAYLOAD_ENCODING = "gzip-base64-json-v1";
export const THINGTIME_EXTENDED_LIMIT_BYTES = 512 * 1024;
export const THINGTIME_BLOCK_READ_CONCURRENCY = 9;
export const THINGTIME_BLOCK_WRITE_CONCURRENCY = 4;

interface ThingtimeBlockCrystal {
  blockX: number;
  blockY: number;
  encodedBytes: number;
  jsonBytes: number;
  mapBlockVersion: string;
  mapSource?: string;
  payloadEncoding: typeof POKEWORLD_BLOCK_PAYLOAD_ENCODING;
  payloadSha256: string;
  schema: typeof POKEWORLD_BLOCK_SCHEMA;
  tileCount: number;
  world: typeof POKEWORLD_BLOCK_WORLD;
}

interface ThingtimeBlockThing {
  crystal?: Partial<ThingtimeBlockCrystal>;
  extended?: { payload?: unknown } | null;
  id?: string;
}

interface ThingtimeReadResponse {
  ok: true;
  thing: ThingtimeBlockThing;
}

interface ThingtimeUpsertResponse {
  created: boolean;
  ok: true;
  thing: ThingtimeBlockThing;
}

const coordinateToken = (coordinate: number) =>
  coordinate < 0 ? `n${Math.abs(coordinate)}` : `p${coordinate}`;

export function thingtimeBlockId(x: number, y: number): string {
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
    throw new Error("Thingtime block coordinates must be safe integers");
  }
  return `pwblk-v1-${POKEWORLD_BLOCK_WORLD}-${coordinateToken(x)}-${coordinateToken(y)}`;
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function encodeThingtimeBlock(block: MapBlock) {
  if (!Number.isSafeInteger(block.x) || !Number.isSafeInteger(block.y)) {
    throw new Error("Map blocks require safe integer coordinates");
  }
  const json = Buffer.from(JSON.stringify(block), "utf8");
  const compressed = gzipSync(json, { level: 9 });
  const payload = compressed.toString("base64");
  const extended = { payload };
  const extendedBytes = Buffer.byteLength(JSON.stringify(extended), "utf8");
  if (extendedBytes > THINGTIME_EXTENDED_LIMIT_BYTES) {
    throw new Error(
      `Compressed map block ${block.x},${block.y} exceeds Thingtime's 512KB extended limit`,
    );
  }

  const crystal: ThingtimeBlockCrystal = {
    schema: POKEWORLD_BLOCK_SCHEMA,
    world: POKEWORLD_BLOCK_WORLD,
    blockX: block.x,
    blockY: block.y,
    mapBlockVersion: MAP_BLOCK_VERSION,
    tileCount: block.tiles.length,
    ...(block.mapSource ? { mapSource: block.mapSource } : {}),
    payloadEncoding: POKEWORLD_BLOCK_PAYLOAD_ENCODING,
    payloadSha256: sha256(json),
    jsonBytes: json.byteLength,
    encodedBytes: Buffer.byteLength(payload, "utf8"),
  };

  return {
    id: thingtimeBlockId(block.x, block.y),
    thingtime: ["data"],
    acl: ["tt:user"],
    tags: ["pokeworld", "map-block", POKEWORLD_BLOCK_WORLD],
    crystal,
    extended,
  };
}

export function decodeThingtimeBlock(thing: ThingtimeBlockThing): MapBlock {
  const crystal = thing.crystal;
  const payload = thing.extended?.payload;
  if (
    crystal?.schema !== POKEWORLD_BLOCK_SCHEMA ||
    crystal.world !== POKEWORLD_BLOCK_WORLD ||
    crystal.mapBlockVersion !== MAP_BLOCK_VERSION ||
    crystal.payloadEncoding !== POKEWORLD_BLOCK_PAYLOAD_ENCODING ||
    typeof crystal.blockX !== "number" ||
    typeof crystal.blockY !== "number" ||
    typeof crystal.payloadSha256 !== "string" ||
    typeof payload !== "string"
  ) {
    throw new Error(`Thingtime map block ${thing.id ?? "unknown"} has invalid metadata`);
  }

  let json: Buffer;
  try {
    json = gunzipSync(Buffer.from(payload, "base64"));
  } catch (error) {
    throw new Error(`Thingtime map block ${thing.id ?? "unknown"} could not be decompressed`, {
      cause: error,
    });
  }
  if (sha256(json) !== crystal.payloadSha256) {
    throw new Error(`Thingtime map block ${thing.id ?? "unknown"} failed its checksum`);
  }

  let block: MapBlock;
  try {
    block = JSON.parse(json.toString("utf8")) as MapBlock;
  } catch (error) {
    throw new Error(`Thingtime map block ${thing.id ?? "unknown"} contains invalid JSON`, {
      cause: error,
    });
  }
  if (
    block.x !== crystal.blockX ||
    block.y !== crystal.blockY ||
    !Array.isArray(block.tiles) ||
    block.tiles.length !== crystal.tileCount
  ) {
    throw new Error(`Thingtime map block ${thing.id ?? "unknown"} does not match its metadata`);
  }
  return block;
}

async function getThingtimeStoredBlock(
  coordinate: { x: number; y: number },
  options: ThingtimeRequestOptions,
): Promise<MapBlock | undefined> {
  try {
    const response = await thingtimeServiceRequest<ThingtimeReadResponse>(
      `/api/v1/things?id=${encodeURIComponent(thingtimeBlockId(coordinate.x, coordinate.y))}`,
      undefined,
      options,
    );
    // Version bumps deliberately turn a previous block into a cache miss so
    // the normal generation path can replace it at the same deterministic ID.
    if (
      typeof response.thing.crystal?.mapBlockVersion === "string" &&
      response.thing.crystal.mapBlockVersion !== MAP_BLOCK_VERSION
    ) {
      return undefined;
    }
    return decodeThingtimeBlock(response.thing);
  } catch (error) {
    if (error instanceof ThingtimeApiError && error.statusCode === 404) {
      return undefined;
    }
    throw error;
  }
}

export async function getThingtimeStoredBlocks(
  coordinates: Array<{ x: number; y: number }>,
  options: ThingtimeRequestOptions = {},
): Promise<MapBlock[]> {
  if (coordinates.length === 0) return [];
  const blocks: MapBlock[] = [];
  for (let index = 0; index < coordinates.length; index += THINGTIME_BLOCK_READ_CONCURRENCY) {
    const batch = await Promise.all(
      coordinates
        .slice(index, index + THINGTIME_BLOCK_READ_CONCURRENCY)
        .map((coordinate) => getThingtimeStoredBlock(coordinate, options)),
    );
    blocks.push(...batch.filter((block): block is MapBlock => Boolean(block)));
  }
  return blocks;
}

async function putThingtimeStoredBlock(
  block: MapBlock,
  options: ThingtimeRequestOptions,
): Promise<void> {
  const body = JSON.stringify(encodeThingtimeBlock(block));
  const request = () =>
    thingtimeServiceRequest<ThingtimeUpsertResponse>(
      "/api/v1/things",
      { method: "PUT", body },
      options,
    );
  try {
    await request();
  } catch (error) {
    // Simultaneous first writes can race on Thingtime's unique caller ID. The
    // winner has created the record, so one idempotent PUT retry becomes the
    // normal replace path.
    if (!(error instanceof ThingtimeApiError) || error.statusCode !== 409) throw error;
    await request();
  }
}

export async function putThingtimeStoredBlocks(
  blocks: MapBlock[],
  options: ThingtimeRequestOptions = {},
): Promise<void> {
  for (let index = 0; index < blocks.length; index += THINGTIME_BLOCK_WRITE_CONCURRENCY) {
    await Promise.all(
      blocks
        .slice(index, index + THINGTIME_BLOCK_WRITE_CONCURRENCY)
        .map((block) => putThingtimeStoredBlock(block, options)),
    );
  }
}
