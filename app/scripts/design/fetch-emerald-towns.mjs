#!/usr/bin/env node
// Renders every Hoenn town/city from pret/pokeemerald's real game data:
// indexed tile sheets + JASC palettes + metatile definitions + map layouts.
// Downloads the needed pret files once into app/map-assets/pret/ (committed,
// so re-runs are offline and deterministic), then writes full town renders to
// app/public/design/sheets/towns/<slug>.png at 16px per metatile.
//
// GBA facts encoded here (Emerald values): 8x8 tiles, 4bpp; primary tileset
// owns tiles 0..511, palettes 0..5 and metatiles 0..511; the secondary
// tileset owns the rest. Each metatile is 16 bytes: two layers x four
// quadrants of u16 (tile | hflip<<10 | vflip<<11 | palette<<12). Map cells
// are u16 with the metatile id in the low 10 bits. Palette colour 0 is
// transparent on both layers.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { PNG } from "pngjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "../..");
const pretDir = resolve(appDir, "map-assets/pret");
const townsDir = resolve(appDir, "public/design/sheets/towns");
const RAW = "https://raw.githubusercontent.com/pret/pokeemerald/master";

const TOWNS = [
  ["LAYOUT_LITTLEROOT_TOWN", "littleroot-town"],
  ["LAYOUT_OLDALE_TOWN", "oldale-town"],
  ["LAYOUT_DEWFORD_TOWN", "dewford-town"],
  ["LAYOUT_LAVARIDGE_TOWN", "lavaridge-town"],
  ["LAYOUT_FALLARBOR_TOWN", "fallarbor-town"],
  ["LAYOUT_VERDANTURF_TOWN", "verdanturf-town"],
  ["LAYOUT_PACIFIDLOG_TOWN", "pacifidlog-town"],
  ["LAYOUT_PETALBURG_CITY", "petalburg-city"],
  ["LAYOUT_SLATEPORT_CITY", "slateport-city"],
  ["LAYOUT_MAUVILLE_CITY", "mauville-city"],
  ["LAYOUT_RUSTBORO_CITY", "rustboro-city"],
  ["LAYOUT_FORTREE_CITY", "fortree-city"],
  ["LAYOUT_LILYCOVE_CITY", "lilycove-city"],
  ["LAYOUT_MOSSDEEP_CITY", "mossdeep-city"],
  ["LAYOUT_SOOTOPOLIS_CITY", "sootopolis-city"],
  ["LAYOUT_EVER_GRANDE_CITY", "ever-grande-city"],
];

mkdirSync(pretDir, { recursive: true });
mkdirSync(townsDir, { recursive: true });

async function fetchPret(relPath, binary = true) {
  const local = resolve(pretDir, relPath);
  if (existsSync(local)) {
    return binary ? readFileSync(local) : readFileSync(local, "utf8");
  }
  const response = await fetch(`${RAW}/${relPath}`);
  if (!response.ok) throw new Error(`${relPath}: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  mkdirSync(dirname(local), { recursive: true });
  writeFileSync(local, buffer);
  return binary ? buffer : buffer.toString("utf8");
}

// Minimal indexed-PNG reader that PRESERVES palette indices (pngjs would bake
// the placeholder greyscale palette into RGBA, losing the 4-bit indices).
function readIndexedPng(buffer) {
  let offset = 8; // signature
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      const colourType = data[9];
      const interlace = data[12];
      if (colourType !== 3 || interlace !== 0 || ![1, 2, 4, 8].includes(bitDepth)) {
        throw new Error(`unsupported indexed PNG (colour ${colourType}, depth ${bitDepth}, interlace ${interlace})`);
      }
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") break;
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const rowBytes = Math.ceil((width * bitDepth) / 8);
  const indices = new Uint8Array(width * height);
  let previous = Buffer.alloc(rowBytes);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (rowBytes + 1)];
    const line = Buffer.from(raw.subarray(y * (rowBytes + 1) + 1, (y + 1) * (rowBytes + 1)));
    for (let x = 0; x < rowBytes; x += 1) {
      const a = x > 0 ? line[x - 1] : 0; // filter unit is 1 byte for depth <= 8
      const b = previous[x];
      const c = x > 0 ? previous[x - 1] : 0;
      if (filter === 1) line[x] = (line[x] + a) & 0xff;
      else if (filter === 2) line[x] = (line[x] + b) & 0xff;
      else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
    }
    for (let x = 0; x < width; x += 1) {
      if (bitDepth === 8) indices[y * width + x] = line[x];
      else if (bitDepth === 4) indices[y * width + x] = (line[x >> 1] >> (x % 2 === 0 ? 4 : 0)) & 0xf;
      else if (bitDepth === 2) indices[y * width + x] = (line[x >> 2] >> (6 - (x % 4) * 2)) & 0x3;
      else indices[y * width + x] = (line[x >> 3] >> (7 - (x % 8))) & 0x1;
    }
    previous = line;
  }
  return { width, height, indices };
}

function parseJascPalette(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines[0] !== "JASC-PAL") throw new Error("not a JASC-PAL file");
  const count = Number(lines[2]);
  return Array.from({ length: count }, (_, index) => {
    const [r, g, b] = lines[3 + index].trim().split(/\s+/).map(Number);
    return [r, g, b];
  });
}

const tilesetSlug = (label) =>
  label
    .replace(/^gTileset_/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();

const tilesetCache = new Map();
async function loadTileset(label, primary) {
  const key = `${label}`;
  if (tilesetCache.has(key)) return tilesetCache.get(key);
  const slug = tilesetSlug(label);
  const base = `data/tilesets/${primary ? "primary" : "secondary"}/${slug}`;
  const tiles = readIndexedPng(await fetchPret(`${base}/tiles.png`));
  const metatiles = await fetchPret(`${base}/metatiles.bin`);
  const palettes = [];
  for (let index = 0; index < 16; index += 1) {
    const name = `${base}/palettes/${String(index).padStart(2, "0")}.pal`;
    palettes.push(parseJascPalette(await fetchPret(name, false)));
  }
  const tileset = { tiles, metatiles, palettes };
  tilesetCache.set(key, tileset);
  return tileset;
}

const NUM_PRIMARY_TILES = 512;
const NUM_PRIMARY_METATILES = 512;
const NUM_PRIMARY_PALETTES = 6;

function drawMetatile(out, outX, outY, metatileId, primary, secondary) {
  const source = metatileId < NUM_PRIMARY_METATILES ? primary : secondary;
  const localId = metatileId < NUM_PRIMARY_METATILES ? metatileId : metatileId - NUM_PRIMARY_METATILES;
  if (!source || localId * 16 + 16 > source.metatiles.length) return;
  for (let part = 0; part < 8; part += 1) {
    const value = source.metatiles.readUInt16LE(localId * 16 + part * 2);
    const tileId = value & 0x3ff;
    const hflip = (value >> 10) & 1;
    const vflip = (value >> 11) & 1;
    const paletteId = (value >> 12) & 0xf;
    const quadrant = part % 4;
    const quadX = (quadrant % 2) * 8;
    const quadY = Math.floor(quadrant / 2) * 8;
    const tileSource = tileId < NUM_PRIMARY_TILES ? primary : secondary;
    const localTile = tileId < NUM_PRIMARY_TILES ? tileId : tileId - NUM_PRIMARY_TILES;
    if (!tileSource) continue;
    const sheet = tileSource.tiles;
    const tilesPerRow = sheet.width / 8;
    const tileX = (localTile % tilesPerRow) * 8;
    const tileY = Math.floor(localTile / tilesPerRow) * 8;
    if (tileY + 8 > sheet.height) continue;
    const palette =
      paletteId < NUM_PRIMARY_PALETTES ? primary.palettes[paletteId] : secondary.palettes[paletteId];
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const sourceX = tileX + (hflip ? 7 - x : x);
        const sourceY = tileY + (vflip ? 7 - y : y);
        const colour = sheet.indices[sourceY * sheet.width + sourceX];
        if (colour === 0) continue; // transparent on both layers
        const [r, g, b] = palette[colour];
        const outOffset = ((outY + quadY + y) * out.width + outX + quadX + x) * 4;
        out.data[outOffset] = r;
        out.data[outOffset + 1] = g;
        out.data[outOffset + 2] = b;
        out.data[outOffset + 3] = 255;
      }
    }
  }
}

const layoutsJson = JSON.parse(await fetchPret("data/layouts/layouts.json", false));
const layoutById = new Map(layoutsJson.layouts.map((layout) => [layout.id, layout]));

for (const [layoutId, slug] of TOWNS) {
  const layout = layoutById.get(layoutId);
  if (!layout) {
    console.warn(`skip ${layoutId}: not in layouts.json`);
    continue;
  }
  const primary = await loadTileset(layout.primary_tileset, true);
  const secondary = await loadTileset(layout.secondary_tileset, false);
  const mapBin = await fetchPret(layout.blockdata_filepath.replace(/^\/?/, ""));
  const width = Number(layout.width);
  const height = Number(layout.height);
  const out = new PNG({ width: width * 16, height: height * 16 });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = mapBin.readUInt16LE((y * width + x) * 2);
      drawMetatile(out, x * 16, y * 16, value & 0x3ff, primary, secondary);
    }
  }
  writeFileSync(resolve(townsDir, `${slug}.png`), PNG.sync.write(out));
  console.log(`${slug}: ${width}x${height} metatiles (${layout.primary_tileset} + ${layout.secondary_tileset})`);
}
console.log("towns rendered to public/design/sheets/towns/");

// ---------------------------------------------------------------------------
// Whole-building harvest: crop complete structures from the town renders into
// 16px tile families under public/tiles/ (struct-<id>-1..N, row-major). All
// coordinates are in metatile cells, snapped to the game's own building
// bounds, and were verified visually against gridded renders.
// ---------------------------------------------------------------------------
const BUILDINGS = [
  ["struct-house-littleroot", "littleroot-town", 2, 4, 5, 5],
  ["struct-lab-birch", "littleroot-town", 3, 12, 7, 5],
  ["struct-gym-petalburg", "petalburg-city", 12, 4, 6, 5],
  ["struct-house-berry", "petalburg-city", 19, 21, 4, 4],
  ["struct-gym-mauville", "mauville-city", 5, 10, 7, 5],
  ["struct-shop-mauville", "mauville-city", 18, 11, 3, 4],
  ["struct-house-mossdeep", "mossdeep-city", 17, 13, 4, 4],
  ["struct-gym-mossdeep", "mossdeep-city", 66, 22, 4, 4],
  ["struct-spacecenter", "mossdeep-city", 60, 8, 9, 8],
  ["struct-house-wood", "oldale-town", 4, 4, 4, 4],
  ["struct-hut-pacifidlog", "pacifidlog-town", 0, 9, 5, 7],
  // A free-standing 2x2 canopy tree (the old big-tree-1..10 slices are the
  // sheet's forest-overlap demo and can never compose into a whole tree).
  ["tree-grand", "littleroot-town", 18, 2, 2, 2],
];

const tilesDir = resolve(appDir, "public/tiles");
for (const [id, town, cellX, cellY, cellsWide, cellsTall] of BUILDINGS) {
  const source = PNG.sync.read(readFileSync(resolve(townsDir, `${town}.png`)));
  let index = 1;
  for (let row = 0; row < cellsTall; row += 1) {
    for (let column = 0; column < cellsWide; column += 1) {
      const tile = new PNG({ width: 16, height: 16 });
      for (let y = 0; y < 16; y += 1) {
        const from = (((cellY + row) * 16 + y) * source.width + (cellX + column) * 16) * 4;
        source.data.copy(tile.data, y * 16 * 4, from, from + 16 * 4);
      }
      writeFileSync(resolve(tilesDir, `${id}-${index}.png`), PNG.sync.write(tile));
      index += 1;
    }
  }
}
console.log(`harvested ${BUILDINGS.length} whole crops into public/tiles/`);

// ---------------------------------------------------------------------------
// NPC overworld sprites: pret ships object-event pics as indexed PNGs with
// their REAL palettes embedded, so decoding is direct (colour 0 transparent).
// The first frame (standing, facing camera) of each becomes a character asset
// under public/sprites/npcs/.
// ---------------------------------------------------------------------------
const NPCS = [
  "boy_1", "boy_2", "boy_3", "girl_1", "girl_2", "girl_3", "little_boy",
  "little_girl", "man_1", "man_2", "man_3", "man_4", "man_5", "woman_1",
  "woman_2", "woman_3", "woman_4", "woman_5", "old_man_1", "old_man_2",
  "old_woman_1", "old_woman_2", "fat_man", "ninja_boy", "twin", "tuber_m",
  "tuber_f", "camper", "picnicker", "hiker", "fisherman", "scientist_1",
  "rich_boy", "pokefan_m", "pokefan_f", "gentleman", "maniac", "reporter_m",
  "reporter_f", "beauty", "lass", "youngster", "bug_catcher", "psychic_m",
  "black_belt", "teacher", "sailor", "nurse", "item_ball", "cook",
  "expert_m", "expert_f", "gameboy_kid", "school_kid_m", "school_kid_f",
];

function readPngPalette(buffer) {
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (type === "PLTE") {
      const colours = [];
      for (let index = 0; index < length / 3; index += 1) {
        colours.push([
          buffer[offset + 8 + index * 3],
          buffer[offset + 8 + index * 3 + 1],
          buffer[offset + 8 + index * 3 + 2],
        ]);
      }
      return colours;
    }
    offset += 12 + length;
  }
  throw new Error("PNG has no PLTE");
}

const npcDir = resolve(appDir, "public/sprites/npcs");
mkdirSync(npcDir, { recursive: true });
let npcCount = 0;
for (const name of NPCS) {
  let buffer;
  try {
    buffer = await fetchPret(`graphics/object_events/pics/people/${name}.png`);
  } catch {
    console.warn(`npc ${name}: not found upstream, skipped`);
    continue;
  }
  const image = readIndexedPng(buffer);
  const palette = readPngPalette(buffer);
  // People pics store 16x32 frames side by side; the first frame is the
  // south-facing standing pose.
  const frameWidth = Math.min(image.width, 16);
  const frameHeight = Math.min(image.height, 32);
  const out = new PNG({ width: frameWidth, height: frameHeight });
  for (let y = 0; y < frameHeight; y += 1) {
    for (let x = 0; x < frameWidth; x += 1) {
      const colour = image.indices[y * image.width + x];
      if (colour === 0) continue;
      const [r, g, b] = palette[colour] ?? [255, 0, 255];
      out.data.set([r, g, b, 255], (y * frameWidth + x) * 4);
    }
  }
  writeFileSync(resolve(npcDir, `${name}.png`), PNG.sync.write(out));
  npcCount += 1;
}
console.log(`decoded ${npcCount} NPC sprites into public/sprites/npcs/`);
