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

// The sheet pads irregular building silhouettes with filler that must become
// transparent so the map's base grass shows through. Two cases, kept narrow
// because the sheet's dark navy [64,72,104] doubles as the art's outline
// colour and must never be stripped from building edges:
//  - keyColour: a colour unique to filler inside the region (the Mart's empty
//    top-right cell uses [24,40,80], which appears nowhere in its art).
//  - keyTopBackground: shallow flood from the top border only, for background
//    peeking over a rounded parapet; maxDepth stays above the first art line.
function keyColour(region, [r, g, b]) {
  for (let index = 0; index < region.data.length; index += 4) {
    if (region.data[index] === r && region.data[index + 1] === g && region.data[index + 2] === b) {
      region.data[index + 3] = 0;
    }
  }
  return region;
}

function keyTopBackground(region, [r, g, b], maxDepth) {
  const { width, data } = region;
  const matches = (x, y) => {
    const index = (y * width + x) * 4;
    return data[index] === r && data[index + 1] === g && data[index + 2] === b;
  };
  const seen = new Uint8Array(width * maxDepth);
  const queue = [];
  for (let x = 0; x < width; x += 1) {
    if (matches(x, 0)) {
      seen[x] = 1;
      queue.push([x, 0]);
    }
  }
  while (queue.length) {
    const [x, y] = queue.pop();
    data[(y * width + x) * 4 + 3] = 0;
    for (const [nextX, nextY] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= maxDepth) continue;
      if (seen[nextY * width + nextX] || !matches(nextX, nextY)) continue;
      seen[nextY * width + nextX] = 1;
      queue.push([nextX, nextY]);
    }
  }
  return region;
}

function writeRegionGrid(prefix, region, columns, rows) {
  let index = 1;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const tile = new PNG({ width: 16, height: 16 });
      for (let y = 0; y < 16; y += 1) {
        const start = ((row * 16 + y) * region.width + column * 16) * 4;
        region.data.copy(tile.data, y * 16 * 4, start, start + 16 * 4);
      }
      writeFileSync(resolve(outputDir, `${prefix}-${index}.png`), PNG.sync.write(tile));
      index += 1;
    }
  }
}

// Larger buildings are composed from another building's modular bays: Emerald
// facades tile horizontally per 16px column and vertically per 16px storey, so
// repeating interior bays yields wider and taller blocks with clean seams.
function composeBuilding(prefix, sourceRegion, sourceColumns, columnPlan, rowPlan) {
  const composed = new PNG({ width: columnPlan.length * 16, height: rowPlan.length * 16 });
  rowPlan.forEach((sourceRow, row) => {
    columnPlan.forEach((sourceColumn, column) => {
      for (let y = 0; y < 16; y += 1) {
        const from = ((sourceRow * 16 + y) * sourceColumns * 16 + sourceColumn * 16) * 4;
        const to = ((row * 16 + y) * composed.width + column * 16) * 4;
        sourceRegion.data.copy(composed.data, to, from, from + 16 * 4);
      }
    });
  });
  writeRegionGrid(prefix, composed, columnPlan.length, rowPlan.length);
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
// Blue-roofed Poké Mart storefront, 3x4 (its top-right sheet cell is filler).
writeRegionGrid("mart-blue", keyColour(cropRegion(0, 80, 3, 4), [24, 40, 80]), 3, 4);
// Red-domed Pokémon Centre, 3x4 (grass-backed corners, nothing to key).
writeRegionGrid("center-red", cropRegion(0, 144, 3, 4), 3, 4);
// Flat-roofed brick block, 4x3; background peeks over the parapet's rounded
// top corners and between its posts, and the first interior art line sits at
// y=3, so the top flood must stop above it.
writeRegionGrid("brick-flat", keyTopBackground(cropRegion(1152, 0, 4, 3), [64, 72, 104], 3), 4, 3);
// Stone museum hall with a flat skylight roof, 3x5 (grass-backed, no filler).
const museumRegion = cropRegion(640, 272, 3, 5);
writeRegionGrid("museum-stone", museumRegion, 3, 5);
// Wider and taller stone halls composed from the museum's modular bays:
// column bays = [left pilaster, windowed bay, right pilaster], and the
// arch-window storey (row 2) repeats vertically for the grandest hall.
composeBuilding("gallery-stone", museumRegion, 3, [0, 1, 1, 2], [0, 1, 2, 3, 4]);
composeBuilding("grand-stone", museumRegion, 3, [0, 1, 1, 1, 2], [0, 1, 2, 2, 3, 4]);

// A natural rock formation aligned to a 3x3 tile footprint.
writeGrid("mountain", 768, 64, 3, 3);

// A one-tile boulder for sparse natural-detail placement.
writeFileSync(resolve(outputDir, "rock-1.png"), crop(880, 32));

writeWaterVariants();

console.log("Extracted 12 house tiles, 9 mountain tiles, 1 rock tile, and 4 water-ripple tiles.");
