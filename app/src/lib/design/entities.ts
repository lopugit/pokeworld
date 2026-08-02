// Entity vocabulary for design dioramas: NPC crops from the Emerald character
// sheet (served at /design/sheets/emerald-character-male.png; rects come from
// the asset-manifest frame detection) and the shipped Emerald Pokémon sprites.

import type { Rng } from "./rng";
import type { DesignEntity } from "./types";

export const CHARACTER_SHEET = "/design/sheets/emerald-character-male.png";

export interface NpcVariant {
  label: string;
  rect: readonly [number, number, number, number];
}

// Standing/walking villagers and trainers (walk band of the sheet).
export const NPC_VILLAGERS: NpcVariant[] = [
  { label: "Villager", rect: [63, 6, 15, 19] },
  { label: "Villager", rect: [134, 6, 14, 19] },
  { label: "Wanderer", rect: [193, 6, 14, 20] },
  { label: "Trainer", rect: [271, 5, 14, 20] },
  { label: "Trainer", rect: [320, 5, 14, 20] },
  { label: "Trainer", rect: [537, 2, 14, 21] },
  { label: "Hiker", rect: [561, 2, 15, 20] },
];

// Larger caped/posed figures — perfect for hideout guards and mystics.
export const NPC_MYSTERIOUS: NpcVariant[] = [
  { label: "Suspicious figure", rect: [417, 2, 16, 22] },
  { label: "Shadowy grunt", rect: [446, 0, 21, 22] },
  { label: "Shadowy boss", rect: [478, 0, 21, 22] },
];

// Runners (run band) for lively plazas and routes.
export const NPC_RUNNERS: NpcVariant[] = [
  { label: "Jogger", rect: [166, 32, 14, 21] },
  { label: "Racer", rect: [271, 32, 14, 21] },
  { label: "Sprinter", rect: [517, 29, 14, 23] },
];

// Anglers mid-cast (fishing band).
export const NPC_ANGLERS: NpcVariant[] = [
  { label: "Angler", rect: [175, 70, 15, 26] },
  { label: "Fisherman", rect: [268, 63, 14, 28] },
  { label: "Old rod master", rect: [423, 63, 22, 26] },
];

export interface PokemonVariant {
  label: string;
  species: string;
  src: string;
}

export const POKEMON: PokemonVariant[] = [
  { label: "Treecko", species: "treecko", src: "/sprites/pokemon/emerald-treecko.png" },
  { label: "Torchic", species: "torchic", src: "/sprites/pokemon/emerald-torchic.png" },
  { label: "Mudkip", species: "mudkip", src: "/sprites/pokemon/emerald-mudkip.png" },
  { label: "Ralts", species: "ralts", src: "/sprites/pokemon/emerald-ralts.png" },
  { label: "Wingull", species: "wingull", src: "/sprites/pokemon/emerald-wingull.png" },
  { label: "Zigzagoon", species: "zigzagoon", src: "/sprites/pokemon/emerald-zigzagoon.png" },
];

export function npcEntity(rng: Rng, pool: NpcVariant[], col: number, row: number): DesignEntity {
  const variant = rng.pick(pool);
  return { kind: "npc", col, row, rect: variant.rect, label: variant.label };
}

export function pokemonEntity(
  rng: Rng,
  col: number,
  row: number,
  pool: PokemonVariant[] = POKEMON,
): DesignEntity {
  const variant = rng.pick(pool);
  return { kind: "pokemon", col, row, src: variant.src, label: variant.label };
}
