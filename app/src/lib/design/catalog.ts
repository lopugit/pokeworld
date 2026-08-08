// The 500-design example catalog: deterministic, seeded, regenerable.
// Summaries (name/tags/blurb) power search & filters; full tile grids are
// generated on demand and memoized. Remixing = same family, fresh seed.

import { POKEMON } from "./entities";
import type { DesignFamily, SceneContext } from "./families";
import { DESIGN_FAMILIES, FAMILY_BY_ID } from "./registry";
import { bakeGround, newGrid, newGround } from "./paint";
import { createRng } from "./rng";
import type { DesignSummary, GeneratedDesign } from "./types";

export const CATALOG_SIZE = 500;

const ROMAN = ["", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];

function fillBlurb(template: string, rng: { range(min: number, max: number): number; pick<T>(v: readonly T[]): T }): string {
  return template
    .replaceAll("{n}", String(rng.range(2, 9)))
    .replaceAll("{pokemon}", rng.pick(POKEMON).label);
}

function nameFor(family: DesignFamily, seed: number): { name: string; description: string } {
  // Naming uses its own rng stream so tweaks to name banks never reshuffle
  // the generated layouts (and vice versa).
  const rng = createRng(`${family.id}:name`, seed);
  const name = `${rng.pick(family.names.adjectives)} ${rng.pick(family.names.nouns)}`;
  const description = fillBlurb(rng.pick(family.blurbs), rng);
  return { name, description };
}

const STRUCTURE_TAGS: Array<[string, string]> = [
  ["struct-pokecenter", "pokecenter"],
  ["struct-pokemart", "pokemart"],
  ["struct-contest-hall", "contest-hall"],
  ["struct-tower-white", "tower"],
  ["struct-lodge-log", "lodge"],
];

function deriveTags(design: Pick<GeneratedDesign, "tiles" | "entities">): string[] {
  const tags = new Set<string>();
  for (const row of design.tiles) {
    for (const tile of row) {
      if (tile.img?.startsWith("pond")) tags.add("water");
      if (tile.img?.startsWith("sand")) tags.add("sand");
      if (tile.img?.startsWith("road")) tags.add("roads");
      if (tile.img?.startsWith("path")) tags.add("paths");
      for (const [prefix, tag] of STRUCTURE_TAGS) {
        if (tile.img2?.startsWith(prefix)) tags.add(tag);
      }
      switch (tile.feature) {
        case "house": tags.add("houses"); break;
        case "cave-entrance": tags.add("cave"); break;
        case "rock": case "barricade": case "ruin-pillar": tags.add("boulders"); break;
        case "sign": tags.add("signs"); break;
        case "hidden-item": tags.add("hidden-items"); break;
        case "long-grass": tags.add("long-grass"); break;
        case "forest-wall": tags.add("forest-wall"); break;
        case "hedge": tags.add("hedges"); break;
        case "mountain": tags.add("mountains"); break;
        default: break;
      }
    }
  }
  for (const entity of design.entities) {
    tags.add(entity.kind === "npc" ? "npcs" : "wild-pokemon");
    if (entity.kind === "pokemon") tags.add(entity.label.toLowerCase());
  }
  return [...tags].sort();
}

export function generateDesign(familyId: string, seed: number): GeneratedDesign | null {
  const family = FAMILY_BY_ID.get(familyId);
  if (!family) return null;
  const rng = createRng(family.id, seed);
  const ctx: SceneContext = { rng, ground: newGround(), grid: newGrid(), entities: [] };
  family.paintGround(ctx);
  bakeGround(ctx.grid, ctx.ground, family.waterFallback ?? "grass");
  family.decorate(ctx);
  const { name, description } = nameFor(family, seed);
  const derived = deriveTags({ tiles: ctx.grid, entities: ctx.entities });
  return {
    id: `${family.id}-${seed}`,
    family: family.id,
    familyLabel: family.label,
    seed,
    name,
    biome: family.biome,
    tags: [...new Set([...family.tags, ...derived, family.biome])].sort(),
    description,
    tiles: ctx.grid,
    entities: ctx.entities,
  };
}

const designCache = new Map<string, GeneratedDesign>();

export function getDesign(familyId: string, seed: number): GeneratedDesign | null {
  const key = `${familyId}-${seed}`;
  const cached = designCache.get(key);
  if (cached) return cached;
  const design = generateDesign(familyId, seed);
  if (design) designCache.set(key, design);
  return design;
}

let catalogCache: DesignSummary[] | null = null;

/** The 500 curated examples, round-robin across families so scrolling stays varied. */
export function designCatalog(): DesignSummary[] {
  if (catalogCache) return catalogCache;
  const perFamily = Math.floor(CATALOG_SIZE / DESIGN_FAMILIES.length);
  const remainder = CATALOG_SIZE - perFamily * DESIGN_FAMILIES.length;
  const usedNames = new Map<string, number>();
  const summaries: DesignSummary[] = [];
  const maxVariants = perFamily + 1;
  for (let variant = 0; variant < maxVariants; variant += 1) {
    DESIGN_FAMILIES.forEach((family, familyIndex) => {
      const count = perFamily + (familyIndex < remainder ? 1 : 0);
      if (variant >= count) return;
      const design = generateDesign(family.id, variant);
      if (!design) return;
      const seen = usedNames.get(design.name) ?? 0;
      usedNames.set(design.name, seen + 1);
      const name = seen === 0 ? design.name : `${design.name} ${ROMAN[Math.min(seen, ROMAN.length - 1)]}`;
      const { tiles: _tiles, entities: _entities, ...summary } = design;
      summaries.push({ ...summary, name });
    });
  }
  catalogCache = summaries;
  return summaries;
}

export interface CatalogFilters {
  query?: string;
  biome?: string;
  tag?: string;
}

export function searchCatalog(filters: CatalogFilters): DesignSummary[] {
  const query = filters.query?.trim().toLowerCase() ?? "";
  return designCatalog().filter((design) => {
    if (filters.biome && design.biome !== filters.biome) return false;
    if (filters.tag && !design.tags.includes(filters.tag)) return false;
    if (!query) return true;
    const haystack = `${design.name} ${design.familyLabel} ${design.description} ${design.tags.join(" ")}`.toLowerCase();
    return query.split(/\s+/).every((term) => haystack.includes(term));
  });
}

/** All filterable tags with usage counts (for filter chips). */
export function catalogTags(): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const design of designCatalog()) {
    for (const tag of design.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** A fresh seed for remixing — outside the curated 0..14 range. */
export function remixSeed(): number {
  return 1000 + Math.floor(Math.random() * 1_000_000_000);
}
