import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "../..");
const sourcePath = resolve(
  appDir,
  "map-assets/tilesets/Game Boy Advance - Pokemon Emerald - Exterior Tileset.png",
);
const outputDir = resolve(appDir, "public/tiles");
const source = PNG.sync.read(readFileSync(sourcePath));

mkdirSync(outputDir, { recursive: true });

function crop(left, top, width = 16, height = 16) {
  const output = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    const sourceStart = ((top + y) * source.width + left) * 4;
    const outputStart = y * width * 4;
    source.data.copy(output.data, outputStart, sourceStart, sourceStart + width * 4);
  }
  return PNG.sync.write(output);
}

function writeGrid(prefix, left, top, columns, rows) {
  let index = 1;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      writeFileSync(
        resolve(outputDir, `${prefix}-${index}.png`),
        crop(left + column * 16, top + row * 16),
      );
      index += 1;
    }
  }
}

function cropRegion(left, top, columns, rows) {
  const width = columns * 16;
  const height = rows * 16;
  const region = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    const sourceStart = ((top + y) * source.width + left) * 4;
    source.data.copy(region.data, y * width * 4, sourceStart, sourceStart + width * 4);
  }
  return region;
}

// 16x16 cell helpers for repairing and recomposing building sprites.
function cellOf(region, columns, tileNumber) {
  const cell = Buffer.alloc(16 * 16 * 4);
  const column = (tileNumber - 1) % columns;
  const row = Math.floor((tileNumber - 1) / columns);
  for (let y = 0; y < 16; y += 1) {
    const start = ((row * 16 + y) * region.width + column * 16) * 4;
    region.data.copy(cell, y * 16 * 4, start, start + 16 * 4);
  }
  return cell;
}

// left half from `left`'s right side, right half from `right`'s left side —
// joins two edge tiles' interior wall pixels into one seamless middle tile.
function joinHalves(left, right) {
  const output = Buffer.alloc(left.length);
  for (let y = 0; y < 16; y += 1) {
    left.copy(output, y * 16 * 4, (y * 16 + 8) * 4, (y * 16 + 16) * 4);
    right.copy(output, (y * 16 + 8) * 4, y * 16 * 4, (y * 16 + 8) * 4);
  }
  return output;
}

// Write a family from an explicit cell grid (each entry a 16x16 RGBA buffer).
function writeCellGrid(prefix, grid) {
  let index = 1;
  for (const row of grid) {
    for (const cell of row) {
      const tile = new PNG({ width: 16, height: 16 });
      cell.copy(tile.data);
      writeFileSync(resolve(outputDir, `${prefix}-${index}.png`), PNG.sync.write(tile));
      index += 1;
    }
  }
}

function writeWaterVariants() {
  const base = PNG.sync.read(readFileSync(resolve(outputDir, "pond-5.png")));
  const highlight = [168, 224, 248, 255];
  const shadow = [72, 112, 168, 255];
  const patterns = [
    { light: [[2, 4], [3, 4], [4, 4], [3, 5]], dark: [[4, 5], [5, 5]] },
    { light: [[10, 2], [11, 2], [9, 3], [10, 3]], dark: [[11, 3], [12, 3]] },
    { light: [[4, 11], [5, 11], [6, 11], [9, 6], [10, 6]], dark: [[5, 12], [6, 12], [10, 7]] },
    { light: [[12, 10], [13, 10], [11, 11], [12, 11], [3, 2]], dark: [[13, 11], [4, 3]] },
  ];

  const paint = (png, [x, y], colour) => {
    const offset = (y * png.width + x) * 4;
    png.data.set(colour, offset);
  };

  patterns.forEach((pattern, index) => {
    const output = PNG.sync.read(PNG.sync.write(base));
    pattern.light.forEach((point) => paint(output, point, highlight));
    pattern.dark.forEach((point) => paint(output, point, shadow));
    writeFileSync(resolve(outputDir, `pond-center-${index + 1}.png`), PNG.sync.write(output));
  });
}

// A compact Littleroot-era house aligned to a 3x4 tile footprint.
writeGrid("house-red", 0, 16, 3, 4);

// Size-graded building variants: one structure per google-maps building, with
// the sprite family chosen from the detected footprint's tile area.

// The mid tier uses the struct-pokecenter/struct-pokemart 4x4 harvests that
// ship as committed PNGs (the sheet's compact 3-wide mart/centre rips were
// rejected: missing roof cells and inset ground floors read half-rendered).
// One repair on top of the committed mart: the sheet bakes a scenery bush
// into its bottom-left wall corner. The Center shares the same white-wall
// template, so its complete bottom-left corner cell replaces the mart's,
// squaring the ground floor. Idempotent (plain file copy).
writeFileSync(
  resolve(outputDir, "struct-pokemart-13.png"),
  readFileSync(resolve(outputDir, "struct-pokecenter-13.png")),
);

// Larger homes composed from the red house's own modular cells, the way
// Emerald tiles its bigger buildings: the roof ridge/lattice middles repeat
// horizontally, the dark-lattice storey stacks for taller roofs, and a plain
// wall middle is joined from the two wall corners' interior halves. Grass
// stays baked only on the outermost caps, so every seam is opaque wall/roof.
const houseRegion = cropRegion(0, 16, 3, 4);
const H = (tileNumber) => cellOf(houseRegion, 3, tileNumber);
const wallMiddle = joinHalves(H(10), H(12));
writeCellGrid("house-wide", [
  [H(1), H(2), H(2), H(3)],
  [H(4), H(5), H(5), H(6)],
  [H(7), H(8), H(8), H(9)],
  [H(10), H(11), wallMiddle, H(12)],
]);
writeCellGrid("house-grand", [
  [H(1), H(2), H(2), H(2), H(3)],
  [H(4), H(5), H(5), H(5), H(6)],
  [H(7), H(8), H(8), H(8), H(9)],
  [H(10), H(11), wallMiddle, wallMiddle, H(12)],
]);
writeCellGrid("house-manor", [
  [H(1), H(2), H(2), H(2), H(2), H(3)],
  [H(4), H(5), H(5), H(5), H(5), H(6)],
  [H(4), H(5), H(5), H(5), H(5), H(6)],
  [H(7), H(8), H(8), H(8), H(8), H(9)],
  [H(10), H(11), wallMiddle, wallMiddle, wallMiddle, H(12)],
]);

// A natural rock formation aligned to a 3x3 tile footprint.
writeGrid("mountain", 768, 64, 3, 3);

// A one-tile boulder for sparse natural-detail placement.
writeFileSync(resolve(outputDir, "rock-1.png"), crop(880, 32));

writeWaterVariants();

console.log("Extracted 12 house tiles, 9 mountain tiles, 1 rock tile, and 4 water-ripple tiles.");
