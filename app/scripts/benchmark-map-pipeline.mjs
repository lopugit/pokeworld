import { performance } from "node:perf_hooks";
import { rgbaToTileColourData } from "../server/services/map/legacy/png.ts";

const WIDTH = 512;
const HEIGHT = 512;
const TILE_SIZE = 32;
const ROUNDS = 7;

function patternedImage() {
  const data = Buffer.allocUnsafe(WIDTH * HEIGHT * 4);
  const palette = [
    [112, 192, 160],
    [216, 200, 128],
    [159, 208, 191],
    [215, 224, 232],
    [104, 160, 120],
    [255, 255, 255],
  ];

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const colour = palette[
        (Math.floor(x / 19) + Math.floor(y / 23) + ((x * 17 + y * 13) % 7)) % palette.length
      ];
      const index = (y * WIDTH + x) * 4;
      data[index] = colour[0];
      data[index + 1] = colour[1];
      data[index + 2] = colour[2];
      data[index + 3] = 255;
    }
  }

  return { width: WIDTH, height: HEIGHT, data };
}

function legacyTileColourData(source) {
  const matrix = new Array(source.height);
  for (let y = 0; y < source.height; y++) {
    const row = new Array(source.width);
    for (let x = 0; x < source.width; x++) {
      const index = (y * source.width + x) * 4;
      row[x] = [
        source.data[index],
        source.data[index + 1],
        source.data[index + 2],
        source.data[index + 3],
      ];
    }
    matrix[y] = row;
  }

  const colourData = {};
  for (let pixelY = 0; pixelY < source.height; pixelY++) {
    for (let pixelX = 0; pixelX < source.width; pixelX++) {
      const pixel = matrix[pixelY][pixelX];
      const tileKey = `${Math.floor(pixelX / TILE_SIZE)},${Math.floor(pixelY / TILE_SIZE)}`;
      const colour = `${pixel[0]},${pixel[1]},${pixel[2]}`;
      colourData[tileKey] ||= {};
      colourData[tileKey][colour] = colourData[tileKey][colour] + 1 || 1;
    }
  }

  for (const counts of Object.values(colourData)) {
    let maxColour = null;
    let maxCount = 0;
    for (const colour of Object.keys(counts)) {
      if (counts[colour] > maxCount) {
        maxColour = colour;
        maxCount = counts[colour];
      }
    }
    counts.max = maxColour;
  }

  return colourData;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const source = patternedImage();
const reference = legacyTileColourData(source);
const optimized = rgbaToTileColourData(source, TILE_SIZE);
if (JSON.stringify(reference) !== JSON.stringify(optimized)) {
  throw new Error("Optimized colour extraction does not match the legacy output");
}

// Warm both paths before measuring JIT-stable iterations.
legacyTileColourData(source);
rgbaToTileColourData(source, TILE_SIZE);

const legacySamples = [];
const optimizedSamples = [];
for (let round = 0; round < ROUNDS; round++) {
  let started = performance.now();
  legacyTileColourData(source);
  legacySamples.push(performance.now() - started);

  started = performance.now();
  rgbaToTileColourData(source, TILE_SIZE);
  optimizedSamples.push(performance.now() - started);
}

const legacyMs = median(legacySamples);
const optimizedMs = median(optimizedSamples);
console.log(JSON.stringify({
  pixels: WIDTH * HEIGHT,
  tiles: (WIDTH / TILE_SIZE) * (HEIGHT / TILE_SIZE),
  rounds: ROUNDS,
  outputEquivalent: true,
  legacyMedianMs: Number(legacyMs.toFixed(2)),
  optimizedMedianMs: Number(optimizedMs.toFixed(2)),
  speedup: Number((legacyMs / optimizedMs).toFixed(2)),
}));
