#!/usr/bin/env node
/**
 * Composes the PROF. OAK intro assets from the vendored pokeemerald data in
 * map-assets/pret/graphics (starter_choose + birch_speech) into ready-to-use
 * PNGs under public/sprites/intro/.
 *
 * GBA background layers are 8x8 tiles referenced by a tilemap of u16 entries
 * (bits 0-9 tile index, 10 hflip, 11 vflip, 12-15 palette). Tilemaps are 32
 * tiles wide; the visible screen is the first 30 columns x 20 rows (240x160).
 *
 * Outputs:
 *  - lecture-bg.png    240x160  birch_speech bands + spotlight platform
 *  - starter-bg.png    240x160  starter_choose grass + Birch's bag
 *  - pokeball.png, pokeball-tilt-a.png, pokeball-tilt-b.png, hand.png  32x32
 *  - starter-circle.png 64x64   white reveal circle
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const pretDir = path.join(appRoot, "map-assets", "pret", "graphics");
const outDir = path.join(appRoot, "public", "sprites", "intro");

const TILE = 8;
const SCREEN_TILES_W = 30;
const SCREEN_TILES_H = 20;

/** Raw PLTE/tRNS chunks — pngjs pre-expands to RGBA, but the GBA data needs
 * the palette indices back (index 0 is transparent for sprites/overlays). */
function parsePngChunks(buffer) {
  let offset = 8;
  const chunks = {};
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    chunks[type] = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return chunks;
}

function loadIndexedPng(file) {
  const buffer = fs.readFileSync(file);
  const png = PNG.sync.read(buffer);
  const chunks = parsePngChunks(buffer);
  if (!chunks.PLTE) throw new Error(`${file} has no PLTE palette chunk`);
  const palette = [];
  for (let i = 0; i < chunks.PLTE.length; i += 3) {
    palette.push([chunks.PLTE[i], chunks.PLTE[i + 1], chunks.PLTE[i + 2]]);
  }
  const colorToIndex = new Map();
  const duplicates = [];
  palette.forEach((rgb, index) => {
    const key = rgb.join(",");
    if (colorToIndex.has(key)) duplicates.push({ index, key });
    else colorToIndex.set(key, index);
  });
  if (duplicates.length) {
    console.warn(`WARN ${path.basename(file)}: duplicate palette colors`, duplicates);
  }
  const indices = new Uint8Array(png.width * png.height);
  for (let i = 0; i < indices.length; i++) {
    const r = png.data[i * 4];
    const g = png.data[i * 4 + 1];
    const b = png.data[i * 4 + 2];
    const index = colorToIndex.get(`${r},${g},${b}`);
    if (index === undefined) throw new Error(`${file}: pixel color ${r},${g},${b} not in PLTE`);
    indices[i] = index;
  }
  return { width: png.width, height: png.height, indices, palette };
}

/** JASC-PAL text file -> [[r,g,b], ...] */
function loadJascPalette(file) {
  const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  if (lines[0] !== "JASC-PAL") throw new Error(`${file} is not a JASC-PAL file`);
  const count = Number(lines[2]);
  return lines.slice(3, 3 + count).map((line) => line.trim().split(/\s+/).map(Number));
}

const tileSampler = (sheet) => {
  const tilesPerRow = sheet.width / TILE;
  return (tileIndex, x, y) => {
    const tx = (tileIndex % tilesPerRow) * TILE + x;
    const ty = Math.floor(tileIndex / tilesPerRow) * TILE + y;
    return sheet.indices[ty * sheet.width + tx];
  };
};

function makeCanvas(width, height) {
  const png = new PNG({ width, height });
  png.data.fill(0);
  return png;
}

function putPixel(canvas, x, y, [r, g, b], alpha = 255) {
  const i = (y * canvas.width + x) * 4;
  canvas.data[i] = r;
  canvas.data[i + 1] = g;
  canvas.data[i + 2] = b;
  canvas.data[i + 3] = alpha;
}

/**
 * Blits a 32-tile-wide tilemap onto the canvas.
 * palettes: array of 16-color palettes selected by each entry's palette bits.
 * transparentZero: skip color-0 pixels (layering) instead of painting them.
 */
function drawTilemap(canvas, tilemapFile, sheet, palettes, { transparentZero = false } = {}) {
  const tilemap = fs.readFileSync(tilemapFile);
  const sample = tileSampler(sheet);
  const usedPalettes = new Set();
  for (let row = 0; row < SCREEN_TILES_H; row++) {
    for (let col = 0; col < SCREEN_TILES_W; col++) {
      const entry = tilemap.readUInt16LE((row * 32 + col) * 2);
      const tileIndex = entry & 0x3ff;
      const hFlip = (entry >> 10) & 1;
      const vFlip = (entry >> 11) & 1;
      const palIndex = (entry >> 12) & 0xf;
      usedPalettes.add(palIndex);
      const palette = palettes[palIndex] ?? palettes[0];
      for (let py = 0; py < TILE; py++) {
        for (let px = 0; px < TILE; px++) {
          const index = sample(tileIndex, hFlip ? TILE - 1 - px : px, vFlip ? TILE - 1 - py : py);
          if (index === 0 && transparentZero) continue;
          putPixel(canvas, col * TILE + px, row * TILE + py, palette[index]);
        }
      }
    }
  }
  return usedPalettes;
}

/** Cuts one 32x32 (or 64x64) OBJ frame out of a sprite sheet by tile index —
 * GBA 1D mapping: frame tiles are consecutive, laid out row-major per frame. */
function extractSpriteFrame(sheet, firstTile, sizePx) {
  const sample = tileSampler(sheet);
  const tilesWide = sizePx / TILE;
  const canvas = makeCanvas(sizePx, sizePx);
  for (let t = 0; t < tilesWide * tilesWide; t++) {
    const tileIndex = firstTile + t;
    const baseX = (t % tilesWide) * TILE;
    const baseY = Math.floor(t / tilesWide) * TILE;
    for (let py = 0; py < TILE; py++) {
      for (let px = 0; px < TILE; px++) {
        const index = sample(tileIndex, px, py);
        if (index === 0) continue; // color 0 = transparent for OBJs
        putPixel(canvas, baseX + px, baseY + py, sheet.palette[index]);
      }
    }
  }
  return canvas;
}

function writePng(canvas, name) {
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, name);
  fs.writeFileSync(file, PNG.sync.write(canvas));
  console.log(`wrote ${path.relative(appRoot, file)} (${canvas.width}x${canvas.height})`);
}

function contentBBox(canvas) {
  let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (canvas.data[(y * canvas.width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

// ---- lecture scene: bands + spotlight platform (birch_speech) --------------
{
  const sheet = loadIndexedPng(path.join(pretDir, "birch_speech", "shadow.png"));
  const bgPals = ["bg0.pal", "bg1.pal", "bg2.pal"].map((name) =>
    loadJascPalette(path.join(pretDir, "birch_speech", name)),
  );
  // bg0.pal already holds the bright resting state of the animated band
  // gradient (the bg2.pal window slides between it and a darker phase), so the
  // raw palettes compose the canonical steady frame.
  const canvas = makeCanvas(SCREEN_TILES_W * TILE, SCREEN_TILES_H * TILE);
  // Backdrop = palette color 0 (screen black) under every color-0 pixel.
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++) putPixel(canvas, x, y, bgPals[0][0]);
  const used = drawTilemap(canvas, path.join(pretDir, "birch_speech", "map.bin"), sheet, bgPals);
  console.log("lecture-bg palettes used:", [...used].join(","), "| backdrop:", bgPals[0][0]);
  // Report where the spotlight platform sits so sprites can stand on it.
  let platform = { minX: canvas.width, minY: canvas.height, maxX: -1, maxY: -1 };
  for (let y = 40; y < 150; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const [r, g, b] = [canvas.data[i], canvas.data[i + 1], canvas.data[i + 2]];
      const isBackdrop = r === bgPals[0][0][0] && g === bgPals[0][0][1] && b === bgPals[0][0][2];
      if (!isBackdrop) {
        if (x < platform.minX) platform.minX = x;
        if (y < platform.minY) platform.minY = y;
        if (x > platform.maxX) platform.maxX = x;
        if (y > platform.maxY) platform.maxY = y;
      }
    }
  }
  console.log("platform bbox (rows 40-149):", JSON.stringify(platform));
  writePng(canvas, "lecture-bg.png");
}

// ---- bag scene: grass + Birch's bag (starter_choose) -----------------------
{
  const sheet = loadIndexedPng(path.join(pretDir, "starter_choose", "tiles.png"));
  const palettes = [sheet.palette];
  const canvas = makeCanvas(SCREEN_TILES_W * TILE, SCREEN_TILES_H * TILE);
  const usedGrass = drawTilemap(canvas, path.join(pretDir, "starter_choose", "birch_grass.bin"), sheet, palettes);
  const usedBag = drawTilemap(canvas, path.join(pretDir, "starter_choose", "birch_bag.bin"), sheet, palettes, {
    transparentZero: true,
  });
  console.log(
    "starter-bg palettes used:", [...usedGrass].join(","), "/", [...usedBag].join(","),
    "| backdrop (label-band color):", sheet.palette[0],
  );
  writePng(canvas, "starter-bg.png");
}

// ---- sprites: pokeball frames + hand cursor + reveal circle ----------------
{
  const sheet = loadIndexedPng(path.join(pretDir, "starter_choose", "pokeball_selection.png"));
  console.log(`pokeball_selection.png is ${sheet.width}x${sheet.height}`);
  // Anim frames (starter_choose.c): 0 = still, 16 = tilt A, 32 = tilt B, 48 = hand.
  const frames = [
    ["pokeball.png", 0],
    ["pokeball-tilt-a.png", 16],
    ["pokeball-tilt-b.png", 32],
    ["hand.png", 48],
  ];
  for (const [name, firstTile] of frames) {
    const canvas = extractSpriteFrame(sheet, firstTile, 32);
    writePng(canvas, name);
    console.log(`  ${name} content bbox:`, JSON.stringify(contentBBox(canvas)));
  }
}

{
  const sheet = loadIndexedPng(path.join(pretDir, "starter_choose", "starter_circle.png"));
  console.log(`starter_circle.png is ${sheet.width}x${sheet.height}`);
  const canvas = extractSpriteFrame(sheet, 0, 64);
  writePng(canvas, "starter-circle.png");
  console.log("  starter-circle content bbox:", JSON.stringify(contentBBox(canvas)));
}

// ---- report the existing sprites the scenes position on the stage ----------
for (const name of ["intro/oak.png", "pokemon/frlg/1.png", "pokemon/frlg/4.png", "pokemon/frlg/7.png"]) {
  const resolved = path.join(appRoot, "public", "sprites", name);
  if (!fs.existsSync(resolved)) continue;
  const png = PNG.sync.read(fs.readFileSync(resolved));
  const canvas = { width: png.width, height: png.height, data: png.data };
  console.log(`${name} ${png.width}x${png.height} content bbox:`, JSON.stringify(contentBBox(canvas)));
}
