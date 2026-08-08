#!/usr/bin/env node
// Harvests the rocky-biome tile vocabulary for /design blocks from the
// Emerald exterior tileset, then RE-GROUNDS art whose baked background does
// not match the design ground it must legally sit on.
//
// Why re-grounding exists: the 3×3 mountain dome (mountain-1..9) and rock-1
// were drawn on the sheet's pink-cobble mountain ground (flat filler at cell
// (61,0)), but /design rocky scenes use the beige-speckle ground harvested as
// rocky-1 (cell (48,3)). Compositing pink-fringed props onto beige ground is
// exactly the "orange sand next to beige sand" seam bug. The fix is
// deterministic pixel substitution: any pixel whose colour belongs to the
// pink-cobble ground palette (and not to the prop's own rock palette) is
// replaced with rocky-1's pixel at the same coordinates, so fringes continue
// the speckle pattern seamlessly across tile boundaries.
//
// Cells (16×16 grid coordinates on the sheet), all from the same biome:
//   rocky-1         (48,3)  flat speckled rocky ground (the biome's filler)
//   rocky-bumps-1   (53,4)  scree bumps decoration (beige-native)
//   cave-door-1     (48,1)  cave doorway — drops into the mountain-8 slot of
//                           the 3×3 dome, replacing its unpainted navy hole
//   boulder-mossy-1 (49,3)  mossy boulder (beige-native)
//   sign-rocky-1    (54,2)  wooden sign on rocky ground (beige-native)
//   mountain-1..9   (48..50, 4..6)  the 3×3 dome — RE-GROUNDED pink→beige
//   rock-1          (55,2)  small rock — RE-GROUNDED pink→beige
//
// NOTE: ledge-left/middle/right-1 in public/tiles are byte-identical crops of
// mountain-1/2/3 (the dome's top row). They are NOT real ledge art and are
// banned from /design composition by the legality rules — this script leaves
// the files on disk untouched for the live map's benefit but never emits them.
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

function cellPixels(cellX, cellY) {
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
  return tile;
}

function paletteOf(png) {
  const colours = new Set();
  for (let i = 0; i < png.data.length; i += 4) {
    colours.add(`${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`);
  }
  return colours;
}

const ROCKY_GROUND_CELL = [48, 3]; // rocky-1, the design rocky ground
const rockyGround = cellPixels(...ROCKY_GROUND_CELL);

// A pixel is pink-cobble-ish when red clearly leads green (the olive/khaki
// dome rock always has R ≈ G, so this cleanly separates ground from rock).
function isPinkish(data, i) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  return r - b >= 24 && r - g >= 16;
}

/** Replace the pink-cobble ground FRINGE with rocky-1 pixels at the same
 * coordinates. Only pinkish pixels 4-connected to the tile border through
 * other pinkish pixels are substituted — ground fringe always touches the
 * border, while any warm shading enclosed inside the rock body stays put. */
function reground(tile) {
  const mask = new Uint8Array(256);
  const queue = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x > 15 || y > 15) return;
    const p = y * 16 + x;
    if (mask[p]) return;
    if (!isPinkish(tile.data, p * 4)) return;
    mask[p] = 1;
    queue.push([x, y]);
  };
  for (let i = 0; i < 16; i += 1) {
    push(i, 0); push(i, 15); push(0, i); push(15, i);
  }
  while (queue.length) {
    const [x, y] = queue.pop();
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  for (let p = 0; p < 256; p += 1) {
    if (!mask[p]) continue;
    for (let channel = 0; channel < 4; channel += 1) {
      tile.data[p * 4 + channel] = rockyGround.data[p * 4 + channel];
    }
  }
  return tile;
}

const HARVEST = [
  ["rocky-1", 48, 3, false],
  ["rocky-bumps-1", 53, 4, false],
  ["cave-door-1", 48, 1, false],
  ["boulder-mossy-1", 49, 3, false],
  // rock-1's body is drawn in pink-cobble colours (41% of its pixels are in
  // the cobble ground palette), so re-grounding would eat the rock itself.
  // It stays harvested verbatim for the live map, but /design's legality
  // rules exclude it — design scenes use boulder-mossy-1 (beige-native).
  ["sign-rocky-1", 54, 2, false],
  ["rock-1", 55, 2, false],
  ["mountain-1", 48, 4, true],
  ["mountain-2", 49, 4, true],
  ["mountain-3", 50, 4, true],
  ["mountain-4", 48, 5, true],
  ["mountain-5", 49, 5, true],
  ["mountain-6", 50, 5, true],
  ["mountain-7", 48, 6, true],
  ["mountain-8", 49, 6, true],
  ["mountain-9", 50, 6, true],
];

for (const [name, cellX, cellY, needsReground] of HARVEST) {
  const tile = cellPixels(cellX, cellY);
  if (needsReground) reground(tile);
  const file = path.join(appDir, "public", "tiles", `${name}.png`);
  fs.writeFileSync(file, PNG.sync.write(tile));
  console.log(`${name}.png ← sheet cell (${cellX}, ${cellY})${needsReground ? " (re-grounded)" : ""}`);
}
