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

// A natural rock formation aligned to a 3x3 tile footprint.
writeGrid("mountain", 768, 64, 3, 3);

// A one-tile boulder for sparse natural-detail placement.
writeFileSync(resolve(outputDir, "rock-1.png"), crop(880, 32));

writeWaterVariants();

console.log("Extracted 12 house tiles, 9 mountain tiles, 1 rock tile, and 4 water-ripple tiles.");
