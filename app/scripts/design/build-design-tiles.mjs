#!/usr/bin/env node
// Harvests the rocky-biome tile vocabulary for /design blocks from the
// Emerald exterior tileset. The existing mountain-/cave-/ledge-/rock- tiles
// were cropped from this sheet's rocky-mauve region and carry that ground
// baked into their backgrounds — so design blocks need the MATCHING ground
// and props to compose them legally (no rocky-on-grass seams).
//
// Cells (16×16 grid coordinates on the sheet), all from the same biome:
//   rocky-1         (48,3)  flat speckled rocky ground (the biome's filler)
//   rocky-bumps-1   (53,4)  scree bumps decoration
//   cave-door-1     (48,1)  cave doorway — drops into the mountain-8 slot of
//                           the 3×3 dome, replacing its unpainted navy hole
//   boulder-mossy-1 (49,3)  mossy boulder
//   sign-rocky-1    (54,2)  wooden sign on rocky ground
//
// Deterministic: byte-identical outputs for the same sheet.
// Regenerate with: node scripts/design/build-design-tiles.mjs
// (then re-run build-asset-manifest.mjs so the asset browser indexes them)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sheet = PNG.sync.read(
  fs.readFileSync(
    path.join(appDir, "map-assets", "tilesets", "Game Boy Advance - Pokemon Emerald - Exterior Tileset.png"),
  ),
);

const HARVEST = [
  ["rocky-1", 48, 3],
  ["rocky-bumps-1", 53, 4],
  ["cave-door-1", 48, 1],
  ["boulder-mossy-1", 49, 3],
  ["sign-rocky-1", 54, 2],
];

for (const [name, cellX, cellY] of HARVEST) {
  const tile = new PNG({ width: 16, height: 16 });
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const source = ((cellY * 16 + y) * sheet.width + cellX * 16 + x) * 4;
      const target = (y * 16 + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        tile.data[target + channel] = sheet.data[source + channel];
      }
    }
  }
  const file = path.join(appDir, "public", "tiles", `${name}.png`);
  fs.writeFileSync(file, PNG.sync.write(tile));
  console.log(`${name}.png ← sheet cell (${cellX}, ${cellY})`);
}
