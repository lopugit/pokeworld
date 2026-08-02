#!/usr/bin/env node
// Builds the Gen I-III (national dex 1-386) Pokédex dataset and battle
// sprites used by the wild-encounter/battle systems:
//   src/data/pokedex.json                      — species data (PokeAPI)
//   public/sprites/pokemon/gen3/{id}.png       — Emerald front sprite
//   public/sprites/pokemon/gen3/shiny/{id}.png — Emerald shiny front
//   public/sprites/pokemon/gen3/back/{id}.png  — Ruby/Sapphire back sprite
//   public/sprites/pokemon/gen3/back-shiny/{id}.png
// Re-runnable: existing sprite files are kept unless --force is passed.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataOut = path.join(appRoot, "src", "data", "pokedex.json");
const spriteRoot = path.join(appRoot, "public", "sprites", "pokemon", "gen3");
const force = process.argv.includes("--force");

const MAX_ID = 386;
const CONCURRENCY = 10;
const SPRITES_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
const API_BASE = "https://pokeapi.co/api/v2";

async function fetchWithRetry(url, as = "json", attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return as === "json" ? await response.json() : Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === attempts) throw new Error(`${url}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  return null;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(items[index], index);
      }
    }),
  );
  return results;
}

const STAT_KEYS = {
  hp: "hp",
  attack: "atk",
  defense: "def",
  "special-attack": "spa",
  "special-defense": "spd",
  speed: "spe",
};

function cleanFlavor(text) {
  return text.replace(/\f/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchSpecies(id) {
  const [pokemon, species] = await Promise.all([
    fetchWithRetry(`${API_BASE}/pokemon/${id}`),
    fetchWithRetry(`${API_BASE}/pokemon-species/${id}`),
  ]);
  if (!pokemon || !species) throw new Error(`Missing PokeAPI data for #${id}`);

  const baseStats = {};
  for (const entry of pokemon.stats) {
    const key = STAT_KEYS[entry.stat.name];
    if (key) baseStats[key] = entry.base_stat;
  }
  const flavorEntry =
    species.flavor_text_entries.find(
      (entry) => entry.language.name === "en" && entry.version.name === "emerald",
    ) ?? species.flavor_text_entries.find((entry) => entry.language.name === "en");
  const genusEntry = species.genera.find((entry) => entry.language.name === "en");

  return {
    id,
    name: pokemon.name,
    displayName: pokemon.name.toUpperCase().replace(/-.*$/, ""),
    types: pokemon.types
      .sort((a, b) => a.slot - b.slot)
      .map((entry) => entry.type.name.toUpperCase()),
    baseStats,
    catchRate: species.capture_rate,
    genderRate: species.gender_rate, // eighths female; -1 genderless
    baseExp: pokemon.base_experience ?? 64,
    growthRate: species.growth_rate?.name ?? "medium",
    isLegendary: Boolean(species.is_legendary || species.is_mythical),
    genus: genusEntry ? genusEntry.genus.toUpperCase().replace(" POKÉMON", "") : "",
    flavor: flavorEntry ? cleanFlavor(flavorEntry.flavor_text) : "",
    heightM: pokemon.height / 10,
    weightKg: pokemon.weight / 10,
  };
}

// Preference-ordered sprite sources per slot; the first URL that exists wins.
const SPRITE_SLOTS = {
  "": (id) => [
    `${SPRITES_BASE}/versions/generation-iii/emerald/${id}.png`,
    `${SPRITES_BASE}/versions/generation-iii/firered-leafgreen/${id}.png`,
    `${SPRITES_BASE}/${id}.png`,
  ],
  shiny: (id) => [
    `${SPRITES_BASE}/versions/generation-iii/emerald/shiny/${id}.png`,
    `${SPRITES_BASE}/versions/generation-iii/firered-leafgreen/shiny/${id}.png`,
    `${SPRITES_BASE}/shiny/${id}.png`,
  ],
  back: (id) => [
    `${SPRITES_BASE}/versions/generation-iii/ruby-sapphire/back/${id}.png`,
    `${SPRITES_BASE}/versions/generation-iii/firered-leafgreen/back/${id}.png`,
    `${SPRITES_BASE}/back/${id}.png`,
  ],
  "back-shiny": (id) => [
    `${SPRITES_BASE}/versions/generation-iii/ruby-sapphire/back/shiny/${id}.png`,
    `${SPRITES_BASE}/versions/generation-iii/firered-leafgreen/back/shiny/${id}.png`,
    `${SPRITES_BASE}/back/shiny/${id}.png`,
  ],
};

async function fetchSprites(id) {
  for (const [slot, urlsFor] of Object.entries(SPRITE_SLOTS)) {
    const dir = slot ? path.join(spriteRoot, slot) : spriteRoot;
    const file = path.join(dir, `${id}.png`);
    if (!force && existsSync(file)) continue;
    let buffer = null;
    for (const url of urlsFor(id)) {
      buffer = await fetchWithRetry(url, "buffer");
      if (buffer) break;
    }
    if (!buffer) throw new Error(`No sprite found for #${id} slot "${slot || "front"}"`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, buffer);
  }
}

const ids = Array.from({ length: MAX_ID }, (_, index) => index + 1);
console.log(`Fetching species data + sprites for ${MAX_ID} Pokémon...`);
let done = 0;
const entries = await mapWithConcurrency(ids, CONCURRENCY, async (id) => {
  const [entry] = await Promise.all([fetchSpecies(id), fetchSprites(id)]);
  done += 1;
  if (done % 50 === 0) console.log(`  ${done}/${MAX_ID}`);
  return entry;
});

entries.sort((a, b) => a.id - b.id);
mkdirSync(path.dirname(dataOut), { recursive: true });
writeFileSync(dataOut, `${JSON.stringify(entries, null, 1)}\n`);
console.log(`Wrote ${entries.length} entries to ${path.relative(appRoot, dataOut)}`);
