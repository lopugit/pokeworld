#!/usr/bin/env node
// Downloads the canonical Pokémon Emerald player walking sheets from the
// pret/pokeemerald decompilation and slices them into per-direction frames:
//   public/sprites/player/{boy,girl}/{down,up,side}-{0,1,2}.png
// Frame 0 is the standing pose; frames 1-2 are the alternating walk steps.
// "side" faces left; the client mirrors it for rightward movement.

import { PNG } from "pngjs";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(appRoot, "public", "sprites", "player");

const SOURCES = {
  boy: "https://raw.githubusercontent.com/pret/pokeemerald/master/graphics/object_events/pics/people/brendan/walking.png",
  girl: "https://raw.githubusercontent.com/pret/pokeemerald/master/graphics/object_events/pics/people/may/walking.png",
};

const FRAME_WIDTH = 16;
const FRAME_HEIGHT = 32;
// pokeemerald walking.png layout (nine 16x32 frames left to right).
const FRAME_MAP = [
  ["down-0", 0],
  ["up-0", 1],
  ["side-0", 2],
  ["down-1", 3],
  ["down-2", 4],
  ["up-1", 5],
  ["up-2", 6],
  ["side-1", 7],
  ["side-2", 8],
];

async function fetchPng(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return PNG.sync.read(Buffer.from(await response.arrayBuffer()));
}

function sliceFrame(sheet, frameIndex, keyColor) {
  const frame = new PNG({ width: FRAME_WIDTH, height: FRAME_HEIGHT });
  const originX = frameIndex * FRAME_WIDTH;
  for (let y = 0; y < FRAME_HEIGHT; y += 1) {
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      const from = ((sheet.width * y + originX + x) << 2);
      const to = ((FRAME_WIDTH * y + x) << 2);
      const [r, g, b] = [sheet.data[from], sheet.data[from + 1], sheet.data[from + 2]];
      const transparent = r === keyColor[0] && g === keyColor[1] && b === keyColor[2];
      frame.data[to] = r;
      frame.data[to + 1] = g;
      frame.data[to + 2] = b;
      frame.data[to + 3] = transparent ? 0 : 255;
    }
  }
  return frame;
}

for (const [character, url] of Object.entries(SOURCES)) {
  const sheet = await fetchPng(url);
  if (sheet.width !== FRAME_WIDTH * 9 || sheet.height !== FRAME_HEIGHT) {
    throw new Error(`${character}: unexpected sheet size ${sheet.width}x${sheet.height}`);
  }
  // Palette index 0 (the background key) is whatever colour the corner holds.
  const keyColor = [sheet.data[0], sheet.data[1], sheet.data[2]];
  const outDir = path.join(outRoot, character);
  mkdirSync(outDir, { recursive: true });
  for (const [name, index] of FRAME_MAP) {
    writeFileSync(path.join(outDir, `${name}.png`), PNG.sync.write(sliceFrame(sheet, index, keyColor)));
  }
  console.log(`${character}: 9 frames written to ${path.relative(appRoot, outDir)}`);
}
