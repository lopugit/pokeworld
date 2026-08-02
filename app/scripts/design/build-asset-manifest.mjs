#!/usr/bin/env node
// Builds public/design/asset-manifest.json — the searchable database behind the
// /design asset browser. Indexes every shipped single-file asset, slices the
// Emerald spritesheets into browsable 16×16 cells (deduped, colour-classified),
// and extracts character animation frames by alpha-island detection.
//
// Deterministic: same inputs → byte-identical manifest (no timestamps).
// Regenerate with: node scripts/design/build-asset-manifest.mjs

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const publicDir = path.join(appDir, "public");
const designDir = path.join(publicDir, "design");
const sheetsDir = path.join(designDir, "sheets");

fs.mkdirSync(sheetsDir, { recursive: true });

const readPng = (file) => PNG.sync.read(fs.readFileSync(file));

// ---------------------------------------------------------------------------
// 1. Singles — every shipped standalone asset file.
// ---------------------------------------------------------------------------

// Tile-name prefixes → category + human name. Order matters (longest first).
const TILE_FAMILIES = [
  ["pond-center-", "water", "Open water"],
  ["pond-", "water", "Pond shoreline"],
  ["grass-dirt-", "ground", "Grass-dirt blend"],
  ["grass-", "vegetation", "Long grass"],
  ["grass", "vegetation", "Grass"],
  ["big-tree-", "vegetation", "Big tree"],
  ["tree-", "vegetation", "Tree"],
  ["shrub-", "vegetation", "Shrub"],
  ["flower-", "vegetation", "Flower bed"],
  ["house-red-", "building", "Red-roof house"],
  ["mountain-", "terrain", "Mountain face"],
  ["cave-door-", "terrain", "Cave doorway"],
  ["cave-", "terrain", "Cave mouth"],
  ["ledge-left-", "terrain", "Ledge (left cap)"],
  ["ledge-middle-", "terrain", "Ledge (middle)"],
  ["ledge-right-", "terrain", "Ledge (right cap)"],
  ["rock-", "terrain", "Boulder"],
  ["path-", "ground", "Dirt path"],
  ["road-", "ground", "Road"],
  ["sand-", "ground", "Sand"],
  ["route-sign-", "prop", "Route sign"],
  ["field-item-", "prop", "Field item"],
  ["rocky-bumps-", "terrain", "Rocky scree"],
  ["rocky-", "ground", "Rocky ground"],
  ["boulder-mossy-", "terrain", "Mossy boulder"],
  ["sign-rocky-", "prop", "Rocky-ground sign"],
];

const AUTOTILE_POSITIONS = {
  1: "top-left corner", 2: "top edge", 3: "top-right corner",
  4: "left edge", 5: "centre", 6: "right edge",
  7: "bottom-left corner", 8: "bottom edge", 9: "bottom-right corner",
  20: "inner corner NW", 21: "inner corner NE", 22: "inner corner SW",
  23: "inner corner SE", 24: "west channel", 25: "east channel",
};

function tileFamily(stem) {
  for (const [prefix, category, label] of TILE_FAMILIES) {
    if (stem === prefix || stem.startsWith(prefix)) {
      const suffix = stem.slice(prefix.length);
      const n = Number(suffix);
      let name = suffix ? `${label} ${suffix}` : label;
      const autotiled = ["pond-", "path-", "road-", "sand-"].includes(prefix);
      if (autotiled && Number.isFinite(n) && AUTOTILE_POSITIONS[n]) {
        name = `${label} — ${AUTOTILE_POSITIONS[n]}`;
      }
      const tags = [category, prefix.replace(/-$/, "")];
      if (autotiled) tags.push("autotile");
      return { category, name, tags };
    }
  }
  return { category: "misc", name: stem, tags: ["misc"] };
}

const SKIP_TILES = new Set(["78oelhvvnpf51.jpeg", "download.png", "images.jpeg", "roomInteriors.png"]);

const singles = [];

const tilesDir = path.join(publicDir, "tiles");
for (const file of fs.readdirSync(tilesDir).sort()) {
  if (SKIP_TILES.has(file) || !file.endsWith(".png")) continue;
  const stem = file.replace(/\.png$/, "");
  const { width, height } = readPng(path.join(tilesDir, file));
  const { category, name, tags } = tileFamily(stem);
  singles.push({
    id: `tile:${stem}`,
    name,
    src: `/tiles/${file}`,
    w: width,
    h: height,
    category,
    tags: [...tags, "map-tile", "in-game"],
    usage: "Live map tile — referenced by the world generator via img/img2.",
  });
}

const spritesDir = path.join(publicDir, "sprites");
for (const file of fs.readdirSync(spritesDir).sort()) {
  if (!file.endsWith(".png")) continue;
  const stem = file.replace(/\.png$/, "");
  const { width, height } = readPng(path.join(spritesDir, file));
  singles.push({
    id: `sprite:${stem}`,
    name: stem === "char-walk-1" ? "Player character (walk frame)" : stem,
    src: `/sprites/${file}`,
    w: width,
    h: height,
    category: "character",
    tags: ["character", "sprite", "in-game"],
    usage: "Player sprite rendered on the live map.",
  });
}

const pokemonDir = path.join(spritesDir, "pokemon");
for (const file of fs.readdirSync(pokemonDir).sort()) {
  if (!file.endsWith(".png")) continue;
  const stem = file.replace(/\.png$/, "");
  const species = stem.replace(/^emerald-/, "");
  const { width, height } = readPng(path.join(pokemonDir, file));
  singles.push({
    id: `pokemon:${stem}`,
    name: `${species[0].toUpperCase()}${species.slice(1)} (Emerald sprite)`,
    src: `/sprites/pokemon/${file}`,
    w: width,
    h: height,
    category: "pokemon",
    tags: ["pokemon", species, "party", "pc-box", "in-game"],
    usage: "Party / PC box sprite used by the trainer UI.",
  });
}

// ---------------------------------------------------------------------------
// 2. Sheets — copy source spritesheets into public/design/sheets.
// ---------------------------------------------------------------------------

const EXTERIOR_SRC = path.join(appDir, "map-assets", "tilesets", "Game Boy Advance - Pokemon Emerald - Exterior Tileset.png");
const CHARACTER_SRC = path.join(appDir, "map-assets", "tilesets", "emerald-character-male.png");

fs.copyFileSync(EXTERIOR_SRC, path.join(sheetsDir, "emerald-exterior.png"));
fs.copyFileSync(CHARACTER_SRC, path.join(sheetsDir, "emerald-character-male.png"));

const sheetSize = (file) => {
  const { width, height } = readPng(file);
  return { w: width, h: height };
};

const sheets = [
  {
    id: "ex",
    name: "Pokémon Emerald — exterior tileset",
    src: "/design/sheets/emerald-exterior.png",
    cell: 16,
    ...sheetSize(EXTERIOR_SRC),
  },
  {
    id: "in",
    name: "Pokémon Emerald — room interiors",
    src: "/tiles/roomInteriors.png",
    cell: 16,
    ...sheetSize(path.join(tilesDir, "roomInteriors.png")),
  },
  {
    id: "char",
    name: "Pokémon Emerald — character sheet (male)",
    src: "/design/sheets/emerald-character-male.png",
    cell: 0,
    ...sheetSize(CHARACTER_SRC),
  },
];

// ---------------------------------------------------------------------------
// 3. Slice grid sheets into 16×16 cells: skip blanks, dedupe, classify.
// ---------------------------------------------------------------------------

function classifyCell(png, cellX, cellY, cell) {
  const counts = { blue: 0, green: 0, warm: 0, gray: 0, dark: 0, light: 0, other: 0 };
  let opaque = 0;
  let uniform = true;
  let first = -1;
  for (let y = 0; y < cell; y += 1) {
    for (let x = 0; x < cell; x += 1) {
      const idx = ((cellY * cell + y) * png.width + cellX * cell + x) * 4;
      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];
      const a = png.data[idx + 3];
      const packed = a < 64 ? -1 : (r << 16) | (g << 8) | b;
      if (first === -1) first = packed;
      else if (packed !== first) uniform = false;
      if (a < 64) continue;
      opaque += 1;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 22) {
        if (max < 64) counts.dark += 1;
        else if (max > 200) counts.light += 1;
        else counts.gray += 1;
      } else if (b > r && b >= g) counts.blue += 1;
      else if (g >= r && g > b) counts.green += 1;
      else if (r >= g && g >= b) counts.warm += 1;
      else counts.other += 1;
    }
  }
  if (opaque === 0 || uniform) return null; // blank
  const share = (key) => counts[key] / opaque;
  if (share("blue") > 0.42) return "water";
  if (share("green") > 0.45) return "vegetation";
  if (share("gray") + share("dark") > 0.55) return "rock";
  if (share("warm") > 0.5) return "ground";
  return "structure";
}

function cellHash(png, cellX, cellY, cell) {
  const hash = createHash("sha1");
  for (let y = 0; y < cell; y += 1) {
    const start = ((cellY * cell + y) * png.width + cellX * cell) * 4;
    hash.update(png.data.subarray(start, start + cell * 4));
  }
  return hash.digest("base64").slice(0, 12);
}

const CELL_CATEGORIES = ["water", "vegetation", "ground", "rock", "structure"];

function sliceSheet(file, sheetId, exclusions = []) {
  const png = readPng(file);
  const cell = 16;
  const cols = Math.floor(png.width / cell);
  const rows = Math.floor(png.height / cell);
  const seen = new Set();
  const cells = [];
  let blank = 0;
  let dupes = 0;
  let meta = 0;
  for (let cy = 0; cy < rows; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      const px = cx * cell;
      const py = cy * cell;
      if (exclusions.some((z) => px < z.x + z.w && px + cell > z.x && py < z.y + z.h && py + cell > z.y)) {
        meta += 1;
        continue;
      }
      const category = classifyCell(png, cx, cy, cell);
      if (category === null) {
        blank += 1;
        continue;
      }
      if (category === "meta") {
        meta += 1;
        continue;
      }
      const hash = cellHash(png, cx, cy, cell);
      if (seen.has(hash)) {
        dupes += 1;
        continue;
      }
      seen.add(hash);
      cells.push([cx, cy, CELL_CATEGORIES.indexOf(category)]);
    }
  }
  console.log(
    `${sheetId}: ${cols}×${rows} grid → ${cells.length} unique cells ` +
      `(${blank} blank, ${dupes} duplicate, ${meta} text/meta skipped)`,
  );
  return { cols, rows, cells };
}

// Bottom-left ripper credits and the right-hand "these look like they're
// repeating" annotation are text, not tiles.
const exSlice = sliceSheet(EXTERIOR_SRC, "ex", [
  { x: 0, y: 1028, w: 256, h: 76 },
  { x: 880, y: 1016, w: 280, h: 40 },
]);
const inSlice = sliceSheet(path.join(tilesDir, "roomInteriors.png"), "in");

sheets[0].cols = exSlice.cols;
sheets[0].rows = exSlice.rows;
sheets[1].cols = inSlice.cols;
sheets[1].rows = inSlice.rows;

// ---------------------------------------------------------------------------
// 4. Character sheet — alpha-island frame detection.
// ---------------------------------------------------------------------------

function detectIslands(png) {
  const { width, height, data } = png;
  const visited = new Uint8Array(width * height);
  const opaqueAt = (x, y) => data[(y * width + x) * 4 + 3] >= 32;
  const islands = [];
  for (let startY = 0; startY < height; startY += 1) {
    for (let startX = 0; startX < width; startX += 1) {
      const startIdx = startY * width + startX;
      if (visited[startIdx] || !opaqueAt(startX, startY)) continue;
      let minX = startX;
      let maxX = startX;
      let minY = startY;
      let maxY = startY;
      let area = 0;
      const stack = [startIdx];
      visited[startIdx] = 1;
      while (stack.length > 0) {
        const idx = stack.pop();
        const x = idx % width;
        const y = (idx - x) / width;
        area += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const nIdx = ny * width + nx;
            if (visited[nIdx] || !opaqueAt(nx, ny)) continue;
            visited[nIdx] = 1;
            stack.push(nIdx);
          }
        }
      }
      islands.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area });
    }
  }
  return islands.filter((i) => i.area >= 12 && i.w >= 4 && i.h >= 4);
}

// Islands within a horizontal band belong to the same animation row. Bands are
// defined by inspection of the sheet layout (y ranges are generous; islands are
// assigned to the first band containing their vertical centre).
const CHARACTER_BANDS = [
  { id: "walk", top: 0, bottom: 22, name: "Overworld walk cycle", fps: 8, tags: ["walk", "overworld", "npc"] },
  { id: "run", top: 22, bottom: 46, name: "Overworld run & pose cycle", fps: 10, tags: ["run", "overworld", "npc"] },
  { id: "bike-props", top: 46, bottom: 70, name: "Bike & field props", fps: 8, tags: ["bike", "props", "overworld"] },
  { id: "fishing", top: 70, bottom: 98, name: "Fishing & field moves", fps: 6, tags: ["fishing", "field", "overworld", "npc"] },
  { id: "pokeball", top: 98, bottom: 118, name: "Poké Ball open/close", fps: 10, tags: ["pokeball", "item"] },
  { id: "hero-large", top: 118, bottom: 182, name: "Hero artwork & bike ride (large)", fps: 8, tags: ["artwork", "bike"] },
];

// Credit text occupies the bottom strip of the sheet — never frames.
const CHARACTER_EXCLUSIONS = [{ x: 0, y: 183, w: 840, h: 71 }];

function characterAnimations(file) {
  const png = readPng(file);
  const islands = detectIslands(png)
    .filter((island) => {
      return !CHARACTER_EXCLUSIONS.some(
        (zone) =>
          island.x < zone.x + zone.w &&
          island.x + island.w > zone.x &&
          island.y < zone.y + zone.h &&
          island.y + island.h > zone.y,
      );
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const bands = CHARACTER_BANDS.map((band) => ({ ...band, frames: [] }));
  const orphans = [];
  for (const island of islands) {
    const centerY = island.y + island.h / 2;
    const band = bands.find((candidate) => centerY >= candidate.top && centerY < candidate.bottom);
    if (band) band.frames.push(island);
    else orphans.push(island);
  }
  if (orphans.length > 0) {
    console.log(`char: ${orphans.length} islands fell outside bands:`, orphans.slice(0, 8));
  }

  const animations = [];
  for (const band of bands) {
    if (band.frames.length === 0) continue;
    band.frames.sort((a, b) => a.x - b.x);
    // Split a band into segments when the horizontal gap between neighbouring
    // frames is large — separate outfits/directions read as separate loops.
    const segments = [[band.frames[0]]];
    for (let i = 1; i < band.frames.length; i += 1) {
      const prev = band.frames[i - 1];
      const frame = band.frames[i];
      const gap = frame.x - (prev.x + prev.w);
      if (gap > 24) segments.push([frame]);
      else segments[segments.length - 1].push(frame);
    }
    segments.forEach((frames, index) => {
      animations.push({
        id: `char:${band.id}-${index + 1}`,
        name: segments.length > 1 ? `${band.name} ${index + 1}` : band.name,
        category: "character",
        src: "/design/sheets/emerald-character-male.png",
        fps: band.fps,
        tags: [...band.tags, "animation", "emerald"],
        frames: frames.map((f) => [f.x, f.y, f.w, f.h]),
      });
    });
  }
  console.log(`char: ${islands.length} frame islands → ${animations.length} animations`);
  return animations;
}

const animations = characterAnimations(CHARACTER_SRC);

// Curated tile-flip animations that exist in the shipped tile set.
animations.push(
  {
    id: "tiles:water-ripple",
    name: "Open water ripple",
    category: "water",
    fps: 3,
    tags: ["water", "ripple", "animation", "in-game"],
    frames: [1, 2, 3, 4].map((n) => `/tiles/pond-center-${n}.png`),
  },
  {
    id: "tiles:flower-sway",
    name: "Flower bed sway",
    category: "vegetation",
    fps: 3,
    tags: ["flower", "animation", "in-game"],
    frames: [1, 2, 3].map((n) => `/tiles/flower-${n}.png`),
  },
);

// ---------------------------------------------------------------------------
// 5. Emit manifest.
// ---------------------------------------------------------------------------

const manifest = {
  version: 1,
  cellCategories: CELL_CATEGORIES,
  singles,
  sheets,
  cells: { ex: exSlice.cells, in: inSlice.cells },
  animations,
};

const outFile = path.join(designDir, "asset-manifest.json");
fs.writeFileSync(outFile, JSON.stringify(manifest));
const sizeKb = Math.round(fs.statSync(outFile).size / 1024);
console.log(
  `asset-manifest.json written (${sizeKb} KB): ${singles.length} singles, ` +
    `${exSlice.cells.length + inSlice.cells.length} sheet cells, ${animations.length} animations`,
);
