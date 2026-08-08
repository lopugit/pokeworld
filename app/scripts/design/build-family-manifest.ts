// Offline search that pins the generated family set. Candidates come from
// buildGeneratedFamily(familySeed); a candidate is ACCEPTED only when
//   1. its probe designs (seeds 0, 1, 12345) pass the legality validator,
//   2. its seed-0 layout is distinct from every already-accepted family
//      (hand-built included) on the content-cell identity metric, and
//   3. its own seeds vary (seed-0 vs seed-1/2 raw identity below cap).
// Accepted familySeeds are written to families-generated.manifest.json — the
// committed manifest is what makes generated family ids stable forever.
//
// Run: pnpm exec jiti scripts/design/build-family-manifest.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildGeneratedFamily } from "../../src/lib/design/families-generated";
import type { DesignFamily } from "../../src/lib/design/families";
import { HAND_FAMILIES } from "../../src/lib/design/families";
import { validateDesign } from "../../src/lib/design/legality";
import { bakeGround, newGrid, newGround } from "../../src/lib/design/paint";
import { createRng } from "../../src/lib/design/rng";
import { DESIGN_GRID, type DesignTile } from "../../src/lib/design/types";

const TARGET = 466;
const MAX_CANDIDATES = 20000;
const DISTINCTNESS_CAP = 0.5; // max content-cell identity vs any accepted family
const ENTROPY_CAP = 0.85; // max raw identity between a family's own seeds

function generate(family: DesignFamily, seed: number): DesignTile[][] {
  const rng = createRng(family.id, seed);
  const ctx = { rng, ground: newGround(), grid: newGrid(), entities: [] as never[] };
  family.paintGround(ctx);
  bakeGround(ctx.grid, ctx.ground, family.waterFallback ?? "grass");
  family.decorate(ctx);
  return ctx.grid;
}

const cellKey = (tile: DesignTile) => `${tile.img ?? ""}|${tile.img2 ?? ""}|${tile.feature ?? ""}`;

/** Raw identity: share of the 256 cells that are byte-identical. */
function rawIdentity(a: DesignTile[][], b: DesignTile[][]): number {
  let same = 0;
  for (let row = 0; row < DESIGN_GRID; row += 1) {
    for (let col = 0; col < DESIGN_GRID; col += 1) {
      if (cellKey(a[row][col]) === cellKey(b[row][col])) same += 1;
    }
  }
  return same / (DESIGN_GRID * DESIGN_GRID);
}

/** Content identity: agreement over cells where either design has content
 * beyond its plain base ground — base-ground dominance (all-grass /
 * all-rocky) must not let two different layouts read as "the same". */
function contentIdentity(a: DesignTile[][], b: DesignTile[][]): number {
  let overlap = 0;
  let contentCells = 0;
  for (let row = 0; row < DESIGN_GRID; row += 1) {
    for (let col = 0; col < DESIGN_GRID; col += 1) {
      const ta = a[row][col];
      const tb = b[row][col];
      const contentA = ta.img2 !== undefined || (ta.img !== "grass" && ta.img !== "rocky-1");
      const contentB = tb.img2 !== undefined || (tb.img !== "grass" && tb.img !== "rocky-1");
      if (!contentA && !contentB) continue;
      contentCells += 1;
      if (cellKey(ta) === cellKey(tb)) overlap += 1;
    }
  }
  return contentCells === 0 ? 1 : overlap / contentCells;
}

console.log("probing 34 hand-built families…");
const accepted: Array<{ familySeed: number | null; probe: DesignTile[][] }> = HAND_FAMILIES.map(
  (family) => ({ familySeed: null, probe: generate(family, 0) }),
);

const familySeeds: number[] = [];
const rejections = { legality: 0, distinctness: 0, entropy: 0 };

for (let familySeed = 1; familySeed <= MAX_CANDIDATES && familySeeds.length < TARGET; familySeed += 1) {
  const family = buildGeneratedFamily(familySeed);

  const probe0 = generate(family, 0);
  let legal = validateDesign(probe0).length === 0;
  if (legal) {
    for (const seed of [1, 12345]) {
      if (validateDesign(generate(family, seed)).length > 0) {
        legal = false;
        break;
      }
    }
  }
  if (!legal) {
    rejections.legality += 1;
    continue;
  }

  const probe1 = generate(family, 1);
  const probe2 = generate(family, 2);
  if (rawIdentity(probe0, probe1) > ENTROPY_CAP || rawIdentity(probe0, probe2) > ENTROPY_CAP) {
    rejections.entropy += 1;
    continue;
  }

  let distinct = true;
  for (const entry of accepted) {
    if (contentIdentity(probe0, entry.probe) > DISTINCTNESS_CAP) {
      distinct = false;
      break;
    }
  }
  if (!distinct) {
    rejections.distinctness += 1;
    continue;
  }

  accepted.push({ familySeed, probe: probe0 });
  familySeeds.push(familySeed);
  if (familySeeds.length % 50 === 0) {
    console.log(`accepted ${familySeeds.length}/${TARGET} (at candidate ${familySeed})`);
  }
}

console.log(`accepted ${familySeeds.length}, rejections:`, rejections);
if (familySeeds.length < TARGET) {
  console.error(`FAILED to reach ${TARGET} families — loosen thresholds or extend the grammar.`);
  process.exit(1);
}

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const outFile = path.join(appDir, "src", "lib", "design", "families-generated.manifest.json");
fs.writeFileSync(outFile, `${JSON.stringify({ familySeeds }, null, 2)}\n`);
console.log(`wrote ${outFile}`);
