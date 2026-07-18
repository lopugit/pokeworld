#!/usr/bin/env node

const args = process.argv.slice(2);
const regenerate = args.includes("--regenerate");
const radiusFlag = args.indexOf("--radius");
const radius = radiusFlag >= 0 ? Number(args[radiusFlag + 1]) : 0;
const positional = args.filter((value, index) => {
  if (value === "--" || value === "--regenerate" || value === "--radius") return false;
  if (radiusFlag >= 0 && index === radiusFlag + 1) return false;
  return true;
});
const blockX = Number(positional[0]);
const blockY = Number(positional[1]);

if (!Number.isInteger(blockX) || !Number.isInteger(blockY)) {
  process.stderr.write(
    "Usage: pnpm map:generate -- <blockX> <blockY> [--radius 0..2] [--regenerate]\n",
  );
  process.exit(1);
}
if (!Number.isInteger(radius) || radius < 0 || radius > 2) {
  process.stderr.write("--radius must be an integer from 0 to 2 (at most 25 blocks)\n");
  process.exit(1);
}

const offsets = [];
for (let x = -radius; x <= radius; x += 1) {
  for (let y = -radius; y <= radius; y += 1) offsets.push([x, y]);
}

const baseUrl = (process.env.POKEWORLD_BASE_URL || "http://127.0.0.1:3847").replace(/\/$/, "");
const queuedResponse = await fetch(`${baseUrl}/api/map-jobs`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ blockX, blockY, offsets, regenerate }),
});
const queued = await queuedResponse.json();
if (!queuedResponse.ok || !queued.runId) {
  throw new Error(queued.error || `Map API returned ${queuedResponse.status}`);
}

process.stdout.write(`[map] queued ${queued.runId} for ${offsets.length} block(s)\n`);
let previousStatus = queued.status;
for (;;) {
  await new Promise((resolve) => setTimeout(resolve, 750));
  const response = await fetch(`${baseUrl}/api/map-jobs/${encodeURIComponent(queued.runId)}`);
  const current = await response.json();
  if (!response.ok) throw new Error(current.error || `Map API returned ${response.status}`);
  if (current.status !== previousStatus) {
    previousStatus = current.status;
    process.stdout.write(`[map] ${current.status}\n`);
  }
  if (current.status === "completed") {
    const tileCount = (current.blocks || []).reduce(
      (total, block) => total + (block.tiles?.length || 0),
      0,
    );
    process.stdout.write(
      `[map] complete: ${current.blocks?.length || 0} block(s), ${tileCount} tile(s)\n`,
    );
    break;
  }
  if (current.status === "failed" || current.status === "cancelled") {
    throw new Error(`Workflow ${current.status}`);
  }
}
