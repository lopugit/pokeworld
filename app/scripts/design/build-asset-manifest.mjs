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
  ["tree-grand-", "vegetation", "Big tree"],
  ["tree-", "vegetation", "Tree", true],
  ["shrub-", "vegetation", "Shrub", true],
  ["flower-", "vegetation", "Flower bed", true],
  ["house-red-", "building", "Red-roof house"],
  ["house-wide-", "building", "Wide red-roof house"],
  ["house-grand-", "building", "Grand red-roof house"],
  ["house-manor-", "building", "Red-roof manor"],
  ["struct-pokecenter-", "building", "Pokémon Center"],
  ["struct-pokemart-", "building", "PokéMart"],
  ["struct-contest-hall-", "building", "Contest hall"],
  ["struct-tower-white-", "building", "White tower"],
  ["struct-lodge-log-", "building", "Log lodge"],
  ["struct-house-littleroot-", "building", "Littleroot house"],
  ["struct-lab-birch-", "building", "Birch's lab"],
  ["struct-gym-petalburg-", "building", "Petalburg gym"],
  ["struct-house-berry-", "building", "Berry-garden house"],
  ["struct-gym-mauville-", "building", "Mauville gym"],
  ["struct-shop-mauville-", "building", "Mauville shop"],
  ["struct-house-mossdeep-", "building", "Mossdeep house"],
  ["struct-gym-mossdeep-", "building", "Mossdeep gym"],
  ["struct-spacecenter-", "building", "Mossdeep space centre"],
  ["struct-house-wood-", "building", "Wooden route house"],
  ["struct-hut-pacifidlog-", "building", "Pacifidlog stilt hut"],
  ["struct-battle-tent-", "building", "Battle Tent"],
  ["struct-house-verdanturf-", "building", "Verdanturf house"],
  ["struct-gym-lavaridge-", "building", "Lavaridge gym"],
  ["struct-house-lavaridge-", "building", "Lavaridge herb house"],
  ["struct-devon-corp-", "building", "Devon Corporation"],
  ["struct-gym-rustboro-", "building", "Rustboro gym"],
  ["struct-treehouse-", "building", "Fortree treehouse"],
  ["struct-house-lilycove-", "building", "Lilycove house"],
  ["struct-dept-store-", "building", "Lilycove department store"],
  ["struct-battle-tent-slateport-", "building", "Slateport Battle Tent"],
  ["struct-museum-slateport-", "building", "Slateport museum"],
  ["struct-center-slateport-", "building", "Slateport Pokémon Center"],
  ["struct-shipyard-slateport-", "building", "Stern's shipyard"],
  ["struct-lighthouse-slateport-", "building", "Slateport lighthouse"],
  ["struct-gym-sootopolis-", "building", "Sootopolis gym"],
  ["struct-house-sootopolis-", "building", "Sootopolis stone house"],
  ["struct-mart-sootopolis-", "building", "Sootopolis mart"],
  ["struct-center-sootopolis-", "building", "Sootopolis Pokémon Center"],
  ["struct-daycare-", "building", "Pokémon Day Care"],
  ["struct-flower-shop-", "building", "Pretty Petal flower shop"],
  ["struct-weather-institute-", "building", "Weather Institute"],
  ["struct-trick-house-", "building", "Trick House"],
  ["struct-seashore-house-", "building", "Seashore House"],
  ["struct-fossil-house-", "building", "Fossil Maniac's house"],
  ["struct-lanette-house-", "building", "Lanette's house"],
  ["struct-gym-fortree-", "building", "Fortree gym"],
  ["mountain-", "terrain", "Mountain face"],
  ["cave-door-", "terrain", "Cave doorway"],
  ["cave-", "terrain", "Cave mouth"],
  ["ledge-left-", "terrain", "Ledge (left cap)"],
  ["ledge-middle-", "terrain", "Ledge (middle)"],
  ["ledge-right-", "terrain", "Ledge (right cap)"],
  ["rock-", "terrain", "Boulder", true],
  ["path-", "ground", "Dirt path"],
  ["road-", "ground", "Road"],
  ["sand-", "ground", "Sand"],
  ["route-sign-", "prop", "Route sign", true],
  ["field-item-", "prop", "Field item", true],
  ["rocky-bumps-", "terrain", "Rocky scree"],
  ["rocky-", "ground", "Rocky ground"],
  ["boulder-mossy-", "terrain", "Mossy boulder", true],
  ["sign-rocky-", "prop", "Rocky-ground sign", true],
  ["museum-stone-", "building", "Stone museum"],
  ["gallery-stone-", "building", "Stone gallery"],
  ["grand-stone-", "building", "Grand stone hall"],
  ["brick-flat-", "building", "Brick block"],
];

const AUTOTILE_POSITIONS = {
  1: "top-left corner", 2: "top edge", 3: "top-right corner",
  4: "left edge", 5: "centre", 6: "right edge",
  7: "bottom-left corner", 8: "bottom edge", 9: "bottom-right corner",
  20: "inner corner NW", 21: "inner corner NE", 22: "inner corner SW",
  23: "inner corner SE", 24: "west channel", 25: "east channel",
};

function tileFamily(stem) {
  for (const [prefix, category, label, whole] of TILE_FAMILIES) {
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
      if (whole) tags.push("whole-object");
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

// The complete Gen III Pokédex sprite set (front / shiny / back / back-shiny),
// named from the shipped Pokédex data.
const pokedex = JSON.parse(
  fs.readFileSync(path.join(appDir, "src", "data", "pokedex.json"), "utf8"),
);
const dexById = new Map(pokedex.map((entry) => [entry.id, entry]));
const titleCase = (value) =>
  value.toLowerCase().replace(/(^|[ -])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
const GEN3_VARIANTS = [
  ["", "front", ""],
  ["shiny/", "shiny", " (shiny)"],
  ["back/", "back", " (back)"],
  ["back-shiny/", "back-shiny", " (back, shiny)"],
];
for (const [dir, variant, suffix] of GEN3_VARIANTS) {
  const variantDir = path.join(pokemonDir, "gen3", dir);
  if (!fs.existsSync(variantDir)) continue;
  const files = fs
    .readdirSync(variantDir)
    .filter((file) => /^\d+\.png$/.test(file))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
  for (const file of files) {
    const id = Number.parseInt(file, 10);
    const entry = dexById.get(id);
    const name = titleCase(entry?.displayName ?? `Pokémon #${id}`);
    const { width, height } = readPng(path.join(variantDir, file));
    singles.push({
      id: `gen3:${variant}:${id}`,
      name: `#${String(id).padStart(3, "0")} ${name}${suffix}`,
      src: `/sprites/pokemon/gen3/${dir}${file}`,
      w: width,
      h: height,
      category: "pokemon",
      tags: [
        "pokemon",
        "gen3",
        variant,
        name.toLowerCase(),
        ...(entry?.types ?? []),
        ...(entry?.isLegendary ? ["legendary"] : []),
        "battle",
        "in-game",
      ],
      usage: "Gen III battle sprite (encounters, battles, Pokédex).",
    });
  }
}

// Directional player walk frames (boy & girl) — indexed as singles here and
// grouped into walk-cycle animations further down.
const PLAYER_DIRECTIONS = ["down", "side", "up"];
const playerFrames = {};
for (const character of ["boy", "girl"]) {
  const characterDir = path.join(spritesDir, "player", character);
  if (!fs.existsSync(characterDir)) continue;
  playerFrames[character] = {};
  for (const direction of PLAYER_DIRECTIONS) {
    playerFrames[character][direction] = [];
    for (let frame = 0; frame <= 2; frame += 1) {
      const file = `${direction}-${frame}.png`;
      const filePath = path.join(characterDir, file);
      if (!fs.existsSync(filePath)) continue;
      const { width, height } = readPng(filePath);
      const src = `/sprites/player/${character}/${file}`;
      playerFrames[character][direction].push(src);
      singles.push({
        id: `player:${character}:${direction}-${frame}`,
        name: `Player (${character}) — ${direction} frame ${frame}`,
        src,
        w: width,
        h: height,
        category: "character",
        tags: ["character", "player", character, direction, "walk", "in-game"],
        usage: "Directional walk frame rendered on the live map.",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 1b. Whole objects — every multi-tile formation stitched into one browsable
// image under public/design/composed/, plus the full pret town renders. These
// carry the "whole-object" tag; the asset browser splits each category into
// whole objects vs individual tiles on it. Keep FORMATION_SHAPES in sync with
// src/lib/design/legality.ts (a vitest asserts parity).
// ---------------------------------------------------------------------------

export const FORMATION_SHAPES = [
  ["house-red", "house-red", 3, 4, "building", "Red-roof house"],
  ["house-wide", "house-wide", 4, 4, "building", "Wide red-roof house"],
  ["house-grand", "house-grand", 5, 4, "building", "Grand red-roof house"],
  ["house-manor", "house-manor", 6, 5, "building", "Red-roof manor"],
  ["pokecenter", "struct-pokecenter", 4, 4, "building", "Pokémon Center"],
  ["pokemart", "struct-pokemart", 4, 4, "building", "PokéMart"],
  ["contest-hall", "struct-contest-hall", 5, 4, "building", "Contest hall"],
  ["tower-white", "struct-tower-white", 2, 4, "building", "White tower"],
  ["lodge-log", "struct-lodge-log", 5, 4, "building", "Log lodge pair"],
  ["house-littleroot", "struct-house-littleroot", 5, 5, "building", "Littleroot house"],
  ["lab-birch", "struct-lab-birch", 7, 5, "building", "Birch's lab"],
  ["gym-petalburg", "struct-gym-petalburg", 6, 5, "building", "Petalburg gym"],
  ["house-berry", "struct-house-berry", 4, 4, "building", "Berry-garden house"],
  ["gym-mauville", "struct-gym-mauville", 7, 5, "building", "Mauville gym"],
  ["shop-mauville", "struct-shop-mauville", 3, 4, "building", "Mauville shop"],
  ["house-mossdeep", "struct-house-mossdeep", 4, 4, "building", "Mossdeep house"],
  ["gym-mossdeep", "struct-gym-mossdeep", 4, 4, "building", "Mossdeep gym"],
  ["spacecenter", "struct-spacecenter", 9, 8, "building", "Mossdeep space centre"],
  ["house-wood", "struct-house-wood", 4, 4, "building", "Wooden route house"],
  ["hut-pacifidlog", "struct-hut-pacifidlog", 5, 7, "building", "Pacifidlog stilt hut"],
  ["battle-tent", "struct-battle-tent", 5, 5, "building", "Battle Tent"],
  ["house-verdanturf", "struct-house-verdanturf", 4, 4, "building", "Verdanturf house"],
  ["gym-lavaridge", "struct-gym-lavaridge", 6, 5, "building", "Lavaridge gym"],
  ["house-lavaridge", "struct-house-lavaridge", 4, 4, "building", "Lavaridge herb house"],
  ["devon-corp", "struct-devon-corp", 8, 8, "building", "Devon Corporation"],
  ["gym-rustboro", "struct-gym-rustboro", 7, 5, "building", "Rustboro gym"],
  ["treehouse", "struct-treehouse", 3, 6, "building", "Fortree treehouse"],
  ["house-lilycove", "struct-house-lilycove", 4, 4, "building", "Lilycove house"],
  ["dept-store", "struct-dept-store", 10, 7, "building", "Lilycove department store"],
  ["battle-tent-slateport", "struct-battle-tent-slateport", 4, 5, "building", "Slateport Battle Tent"],
  ["museum-slateport", "struct-museum-slateport", 6, 5, "building", "Slateport museum"],
  ["center-slateport", "struct-center-slateport", 4, 4, "building", "Slateport Pokémon Center"],
  ["shipyard-slateport", "struct-shipyard-slateport", 7, 6, "building", "Stern's shipyard"],
  ["lighthouse-slateport", "struct-lighthouse-slateport", 3, 4, "building", "Slateport lighthouse"],
  ["gym-sootopolis", "struct-gym-sootopolis", 6, 5, "building", "Sootopolis gym"],
  ["house-sootopolis", "struct-house-sootopolis", 3, 4, "building", "Sootopolis stone house"],
  ["mart-sootopolis", "struct-mart-sootopolis", 4, 4, "building", "Sootopolis mart"],
  ["center-sootopolis", "struct-center-sootopolis", 4, 4, "building", "Sootopolis Pokémon Center"],
  ["daycare", "struct-daycare", 4, 4, "building", "Pokémon Day Care"],
  ["flower-shop", "struct-flower-shop", 5, 5, "building", "Pretty Petal flower shop"],
  ["weather-institute", "struct-weather-institute", 9, 9, "building", "Weather Institute"],
  ["trick-house", "struct-trick-house", 6, 5, "building", "Trick House"],
  ["seashore-house", "struct-seashore-house", 4, 5, "building", "Seashore House"],
  ["fossil-house", "struct-fossil-house", 4, 4, "building", "Fossil Maniac's house"],
  ["lanette-house", "struct-lanette-house", 4, 4, "building", "Lanette's house"],
  ["gym-fortree", "struct-gym-fortree", 6, 5, "building", "Fortree gym"],
  ["big-tree", "tree-grand", 2, 2, "vegetation", "Big tree"],
  ["museum-stone", "museum-stone", 3, 5, "building", "Stone museum"],
  ["gallery-stone", "gallery-stone", 4, 5, "building", "Stone gallery"],
  ["grand-stone", "grand-stone", 5, 6, "building", "Grand stone hall"],
  ["brick-flat", "brick-flat", 4, 3, "building", "Brick block"],
];

const composedDir = path.join(designDir, "composed");
fs.mkdirSync(composedDir, { recursive: true });
for (const [id, prefix, w, h, category, label, slotOrder] of FORMATION_SHAPES) {
  const composed = new PNG({ width: w * 16, height: h * 16 });
  for (let index = 0; index < w * h; index += 1) {
    const tileNumber = slotOrder ? slotOrder[index] : index + 1;
    const tile = readPng(path.join(tilesDir, `${prefix}-${tileNumber}.png`));
    for (let y = 0; y < 16; y += 1) {
      const from = y * 16 * 4;
      const to = ((Math.floor(index / w) * 16 + y) * composed.width + (index % w) * 16) * 4;
      tile.data.copy(composed.data, to, from, from + 16 * 4);
    }
  }
  fs.writeFileSync(path.join(composedDir, `${id}.png`), PNG.sync.write(composed));
  singles.push({
    id: `whole:${id}`,
    name: label,
    src: `/design/composed/${id}.png`,
    w: w * 16,
    h: h * 16,
    category,
    tags: [category, "whole-object", "formation", id],
    usage: `Complete ${w}×${h} formation — composed from the ${prefix}-* tiles.`,
  });
}

const townsSheetDir = path.join(sheetsDir, "towns");
if (fs.existsSync(townsSheetDir)) {
  for (const file of fs.readdirSync(townsSheetDir).filter((name) => name.endsWith(".png")).sort()) {
    const { width, height } = readPng(path.join(townsSheetDir, file));
    const stem = file.replace(/\.png$/, "");
    const label = stem.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    singles.push({
      id: `town:${stem}`,
      name: label,
      src: `/design/sheets/towns/${file}`,
      w: width,
      h: height,
      category: "town",
      tags: ["town", "whole-object", "map", "emerald", stem],
      usage: "Full town render from pret/pokeemerald data (tiles + palettes + metatiles + layout).",
    });
  }
}

// Sprite folders decoded from pret object-event data (embedded palettes).
const SPRITE_SCANS = [
  ["npcs", "npc", "character", ["character", "npc", "overworld"], "NPC overworld sprite decoded from pret/pokeemerald object-event data."],
  ["trainers", "trainer", "character", ["character", "trainer", "portrait", "battle"], "Trainer battle portrait decoded from pret/pokeemerald trainer graphics."],
  ["items", "item", "item", ["item", "icon", "bag"], "Item icon decoded from pret/pokeemerald item graphics."],
  ["overworld-pokemon", "owmon", "pokemon", ["pokemon", "overworld", "mini"], "Overworld Pokémon mini decoded from pret/pokeemerald object-event data."],
  ["objects", "object", "prop", ["prop", "object", "overworld"], "Overworld object decoded from pret/pokeemerald object-event data."],
];
for (const [dir, idPrefix, category, baseTags, usage] of SPRITE_SCANS) {
  const scanDir = path.join(publicDir, "sprites", dir);
  if (!fs.existsSync(scanDir)) continue;
  for (const file of fs.readdirSync(scanDir).filter((name) => name.endsWith(".png")).sort()) {
    const { width, height } = readPng(path.join(scanDir, file));
    const stem = file.replace(/\.png$/, "");
    const label = stem.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    singles.push({
      id: `${idPrefix}:${stem}`,
      name: label,
      src: `/sprites/${dir}/${file}`,
      w: width,
      h: height,
      category,
      tags: [...baseTags, "whole-object", stem],
      usage,
    });
  }
}

// Interior room renders (whole rooms from pret layouts).
const interiorScanDir = path.join(sheetsDir, "interiors");
if (fs.existsSync(interiorScanDir)) {
  for (const file of fs.readdirSync(interiorScanDir).filter((name) => name.endsWith(".png")).sort()) {
    const { width, height } = readPng(path.join(interiorScanDir, file));
    const stem = file.replace(/\.png$/, "");
    const label = stem.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    singles.push({
      id: `room:${stem}`,
      name: label,
      src: `/design/sheets/interiors/${file}`,
      w: width,
      h: height,
      category: "interior",
      tags: ["interior", "room", "whole-object", "map", stem],
      usage: "Full interior room render from pret/pokeemerald data (tiles + palettes + metatiles + layout).",
    });
  }
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
  let first;
  for (let y = 0; y < cell; y += 1) {
    for (let x = 0; x < cell; x += 1) {
      const idx = ((cellY * cell + y) * png.width + cellX * cell + x) * 4;
      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];
      const a = png.data[idx + 3];
      const packed = a < 64 ? -1 : (r << 16) | (g << 8) | b;
      // undefined sentinel (NOT -1): transparency must count against
      // uniformity, or a shape on a transparent background would be dropped
      // as "blank" whenever the transparent pixels come first in scan order.
      if (first === undefined) first = packed;
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
  { id: "bike-props", top: 46, bottom: 70, name: "Bike & field icons", fps: 8, tags: ["bike", "props", "overworld"] },
  { id: "fishing", top: 70, bottom: 98, name: "Fishing & field moves", fps: 6, tags: ["fishing", "field", "overworld", "npc"] },
  { id: "pokeball", top: 98, bottom: 118, name: "Poké Ball open/close", fps: 10, tags: ["pokeball", "item"] },
  { id: "hero-large", top: 118, bottom: 182, name: "Hero artwork & bike ride (large)", fps: 8, tags: ["artwork", "bike"] },
];

// Tall standing artwork (h ≥ 40 px) belongs with the hero art regardless of
// which small band its centre lands in.
const HERO_MIN_HEIGHT = 40;

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
    const band =
      island.h >= HERO_MIN_HEIGHT
        ? bands.find((candidate) => candidate.id === "hero-large")
        : bands.find((candidate) => centerY >= candidate.top && centerY < candidate.bottom);
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

// Tileset animation reels decoded from pret anim dirs (file-per-frame).
const tileAnimDir = path.join(designDir, "anim");
if (fs.existsSync(tileAnimDir)) {
  const groups = new Map();
  for (const file of fs.readdirSync(tileAnimDir).filter((name) => name.endsWith(".png")).sort()) {
    const match = /^(.+)-(\d+)\.png$/.exec(file);
    if (!match) continue;
    if (!groups.has(match[1])) groups.set(match[1], []);
    groups.get(match[1]).push({ index: Number(match[2]), src: `/design/anim/${file}` });
  }
  for (const [stem, frames] of [...groups.entries()].sort()) {
    frames.sort((a, b) => a.index - b.index);
    const [tileset, anim] = stem.split("--");
    const { width, height } = readPng(path.join(tileAnimDir, `${stem}-0.png`));
    const label = anim.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const tilesetLabel = tileset.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    animations.push({
      id: `tileanim:${stem}`,
      name: `${label} (${tilesetLabel} tileset)`,
      category: "animation",
      fps: /water|waterfall/.test(anim) ? 8 : 5,
      tags: ["animation", "tileset", tileset, anim, "emerald"],
      frames: frames.map((frame) => frame.src),
      frameSize: [width, height],
    });
  }
}

// Directional walk cycles from the player sprite sets.
for (const [character, directions] of Object.entries(playerFrames)) {
  for (const [direction, frames] of Object.entries(directions)) {
    if (frames.length < 2) continue;
    animations.push({
      id: `player:${character}:walk-${direction}`,
      name: `Player (${character}) — walk ${direction}`,
      category: "character",
      fps: 8,
      tags: ["character", "player", character, direction, "walk", "animation", "in-game"],
      frames,
      frameSize: [16, 32],
    });
  }
}

// Curated tile-flip animations that exist in the shipped tile set.
animations.push(
  {
    id: "tiles:water-ripple",
    name: "Open water ripple",
    category: "water",
    fps: 3,
    tags: ["water", "ripple", "animation", "in-game"],
    frames: [1, 2, 3, 4].map((n) => `/tiles/pond-center-${n}.png`),
    frameSize: [16, 16],
  },
  {
    id: "tiles:flower-sway",
    name: "Flower bed sway",
    category: "vegetation",
    fps: 3,
    tags: ["flower", "animation", "in-game"],
    frames: [1, 2, 3].map((n) => `/tiles/flower-${n}.png`),
    frameSize: [16, 16],
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
