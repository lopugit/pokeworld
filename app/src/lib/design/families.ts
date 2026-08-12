// The theme grammar behind the /design browser: 34 hand-tuned families of
// Emerald-style dioramas. Every family paints a 16×16 scene with the live
// map's tile vocabulary, then decorates it with structures, secrets, NPCs and
// wild Pokémon. All randomness flows through the seeded RNG, so a
// {family, seed} pair regenerates the identical design anywhere — remixing is
// just a new seed.
//
// Scenes follow the tile legality rules documented in paint.ts: grass-backed
// props stay on grass, the rocky-biome vocabulary (domes, cave doors, ledges,
// boulders, scree, rocky signs) lives only in full-bleed rocky scenes, and
// water obeys the live generator's shoreline smoothing.

import {
  FOREST_SPIRITS,
  LEGENDARIES,
  NPC_ANGLERS,
  NPC_MYSTERIOUS,
  NPC_RUNNERS,
  NPC_VILLAGERS,
  POKEMON,
  npcEntity,
  pokemonEntity,
} from "./entities";
import type { Ground, GroundMap } from "./paint";
import {
  findClearSpot,
  hedgeLine,
  isClear,
  longGrassPatch,
  paintBlob,
  paintPath,
  paintRect,
  placeDecor,
  placeBoulderLine,
  placeDome,
  placeHiddenItem,
  placeHouse,
  placeRockySign,
  placeSign,
  placeTree,
  scatter,
  scatterTrees,
  SMALL_SHRUB,
  treeBorder,
} from "./paint";
import type { Rng } from "./rng";
import { DESIGN_GRID, type BiomeId, type DesignEntity, type DesignTile } from "./types";

export interface SceneContext {
  rng: Rng;
  ground: GroundMap;
  grid: DesignTile[][];
  entities: DesignEntity[];
  /** Seed-chosen dihedral frame, set by paintGround for decorate to reuse
   * (world generation carries it across the two phases). */
  frame?: unknown;
}

export interface DesignFamily {
  id: string;
  label: string;
  biome: BiomeId;
  tags: string[];
  /** Ground that replaces illegal water during shoreline smoothing. */
  waterFallback?: Ground;
  names: { adjectives: string[]; nouns: string[] };
  blurbs: string[];
  paintGround(ctx: SceneContext): void;
  decorate(ctx: SceneContext): void;
}

const FLOWERS = ["flower-1", "flower-2", "flower-3"] as const;

// A single-colour flower bed reads more Emerald than confetti (see the live
// generator's decoration rules), so scenes pick one flower and stick to it.
const flowerOf = (rng: Rng) => [rng.pick(FLOWERS)] as const;

const fillGround = (ctx: SceneContext, kind: Ground) => {
  for (let row = 0; row < DESIGN_GRID; row += 1) {
    for (let col = 0; col < DESIGN_GRID; col += 1) ctx.ground[row][col] = kind;
  }
};

// Trees are 2×3 formations now (see paint.placeTree); density maps to a
// number of placement attempts plus a sprinkle of single-cell small trees.
const scatterSceneTrees = (ctx: SceneContext, density: number) =>
  scatterTrees(ctx.grid, ctx.ground, ctx.rng, Math.max(1, Math.round(density * 30)), density * 0.6);

// Rocky-biome texture: walkable scree bumps plus solid boulders.
// (rock-1 is banned art — its body is pink-cobble-native and can never blend
// with the beige speckle ground; boulder-mossy-1 is the legal boulder.)
const scree = (ctx: SceneContext, density: number) =>
  scatter(ctx.grid, ctx.ground, ctx.rng, ["rocky-bumps-1"], density, {
    on: ["rocky"],
    feature: "scree",
  });

const boulders = (ctx: SceneContext, density: number) =>
  scatter(ctx.grid, ctx.ground, ctx.rng, ["boulder-mossy-1"], density, {
    on: ["rocky"],
    solid: true,
    feature: "rock",
  });

// Entities may not stack on the same tile — retry a few spots if occupied.
const freeEntitySpot = (ctx: SceneContext, margin: number) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const spot = findClearSpot(ctx.grid, ctx.ground, ctx.rng, { margin });
    if (!spot) return null;
    if (!ctx.entities.some((entity) => entity.col === spot.col && entity.row === spot.row)) {
      return spot;
    }
  }
  return null;
};

const addNpc = (ctx: SceneContext, pool = NPC_VILLAGERS, margin = 2) => {
  const spot = freeEntitySpot(ctx, margin);
  if (spot) ctx.entities.push(npcEntity(ctx.rng, pool, spot.col, spot.row));
};

const addPokemon = (ctx: SceneContext, pool = POKEMON, margin = 2) => {
  const spot = freeEntitySpot(ctx, margin);
  if (spot) ctx.entities.push(pokemonEntity(ctx.rng, spot.col, spot.row, pool));
};

const signSomewhere = (ctx: SceneContext) => {
  const spot = findClearSpot(ctx.grid, ctx.ground, ctx.rng, { allowGround: ["grass"], margin: 2 });
  if (spot) placeSign(ctx.grid, ctx.ground, spot.col, spot.row);
};

const rockySignSomewhere = (ctx: SceneContext) => {
  const spot = findClearSpot(ctx.grid, ctx.ground, ctx.rng, { allowGround: ["rocky"], margin: 2 });
  if (spot) placeRockySign(ctx.grid, ctx.ground, spot.col, spot.row);
};

const hiddenSomewhere = (ctx: SceneContext) => {
  // Also avoid tiles where an entity already stands — a secret buried under a
  // rendered NPC/Pokémon would be invisible AND unreachable-looking.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const spot = findClearSpot(ctx.grid, ctx.ground, ctx.rng, {
      allowGround: ["grass", "rocky"],
      margin: 1,
    });
    if (!spot) return;
    if (ctx.entities.some((entity) => entity.col === spot.col && entity.row === spot.row)) continue;
    placeHiddenItem(ctx.grid, ctx.ground, spot.col, spot.row);
    return;
  }
};

const domeSomewhere = (ctx: SceneContext, spots: ReadonlyArray<readonly [number, number]>) => {
  for (const [col, row] of spots) {
    if (placeDome(ctx.grid, ctx.ground, col, row)) return true;
  }
  return false;
};

export const HAND_FAMILIES: DesignFamily[] = [
  // --- villages ------------------------------------------------------------
  {
    id: "hoenn-village",
    label: "Hoenn village",
    biome: "village",
    tags: ["village", "houses", "paths", "cozy"],
    names: {
      adjectives: ["Littleroot", "Dewberry", "Marigold", "Slateleaf", "Cinder", "Willow", "Petal", "Bramblewick", "Honeydew", "Clover"],
      nouns: ["Hollow", "Corner", "Commons", "Crossing", "Rest", "Hamlet", "Yard", "Green", "Lane", "Steps"],
    },
    blurbs: [
      "A sleepy village where every doormat hides a spare key and every hedge is trimmed twice a week.",
      "{n} generations have lived here without once locking a door.",
      "The kind of village where the loudest sound is a {pokemon} sneezing.",
    ],
    paintGround(ctx) {
      const plazaCol = ctx.rng.range(5, 9);
      const plazaRow = ctx.rng.range(6, 9);
      paintPath(ctx.ground, "path", plazaCol, 1, plazaCol, 14, 2, ctx.rng);
      paintPath(ctx.ground, "path", 1, plazaRow, 14, plazaRow, 2, ctx.rng);
    },
    decorate(ctx) {
      const houses = ctx.rng.range(2, 3);
      const spots = ctx.rng.shuffle([
        [1, 1], [10, 1], [1, 9], [11, 9], [11, 5], [1, 5],
      ] as const);
      let placed = 0;
      for (const [col, row] of spots) {
        if (placed >= houses) break;
        if (placeHouse(ctx.grid, ctx.ground, col, row)) placed += 1;
      }
      hedgeLine(ctx.grid, ctx.ground, 0, 15, 15, 15, { gapAt: ctx.rng.range(4, 11) });
      scatter(ctx.grid, ctx.ground, ctx.rng, flowerOf(ctx.rng), 0.08);
      signSomewhere(ctx);
      addNpc(ctx);
      if (ctx.rng.chance(0.7)) addNpc(ctx);
      if (ctx.rng.chance(0.4)) addPokemon(ctx, [POKEMON[5]]); // a village Zigzagoon
    },
  },
  {
    id: "lakeside-hamlet",
    label: "Lakeside hamlet",
    biome: "waterside",
    tags: ["village", "lake", "fishing", "houses"],
    names: {
      adjectives: ["Dewford", "Millpond", "Reedsong", "Stillwater", "Lilyshore", "Mistbank", "Perch", "Driftwood"],
      nouns: ["Landing", "Shore", "Wharf", "Hamlet", "Jetty", "Banks", "Cove", "Point"],
    },
    blurbs: [
      "Half the town fishes before breakfast; the other half fishes instead of it.",
      "The lake has returned {n} lost bikes, none of them to their owners.",
      "On quiet mornings a {pokemon} skims the water for fun.",
    ],
    paintGround(ctx) {
      paintBlob(ctx.ground, "water", ctx.rng.range(10, 13), ctx.rng.range(10, 13), ctx.rng.range(4, 6), ctx.rng);
      // Start the lakeside path below the house rows so cottages always fit.
      paintPath(ctx.ground, "path", 2, 5, 6, ctx.rng.range(9, 12), 2, ctx.rng);
    },
    decorate(ctx) {
      placeHouse(ctx.grid, ctx.ground, 1, 1);
      if (ctx.rng.chance(0.6)) placeHouse(ctx.grid, ctx.ground, 6, 1);
      scatter(ctx.grid, ctx.ground, ctx.rng, flowerOf(ctx.rng), 0.06);
      scatter(ctx.grid, ctx.ground, ctx.rng, ["shrub-1"], 0.05, { solid: true, feature: "hedge" });
      signSomewhere(ctx);
      addNpc(ctx, NPC_ANGLERS);
      if (ctx.rng.chance(0.6)) addPokemon(ctx, [POKEMON[2], POKEMON[4]]);
    },
  },
  {
    id: "orchard-farmstead",
    label: "Orchard farmstead",
    biome: "meadow",
    tags: ["farm", "orchard", "berries", "rows"],
    names: {
      adjectives: ["Oran", "Pecha", "Sitrus", "Leppa", "Aspear", "Rawst", "Lum", "Kelpsy"],
      nouns: ["Orchard", "Farmstead", "Rows", "Acres", "Patch", "Fields", "Grange", "Plot"],
    },
    blurbs: [
      "Berry rows planted straighter than any route in Hoenn.",
      "The farmer swears a {pokemon} prunes the far rows at night.",
      "Harvest festival happens whenever the {n}th row ripens.",
    ],
    paintGround(ctx) {
      paintPath(ctx.ground, "path", 7, 1, 7, 14, 1, ctx.rng);
    },
    decorate(ctx) {
      placeHouse(ctx.grid, ctx.ground, ctx.rng.chance(0.5) ? 1 : 11, 1);
      const rowStep = ctx.rng.pick([2, 3]);
      for (let row = 8; row <= 14; row += rowStep) {
        for (let col = 1; col <= 14; col += 2) {
          if (isClear(ctx.grid, ctx.ground, col, row) && ctx.ground[row][col] === "grass") {
            placeDecor(ctx.grid, col, row, "shrub-1", { solid: true, feature: "berry-bush" });
          }
        }
      }
      scatter(ctx.grid, ctx.ground, ctx.rng, flowerOf(ctx.rng), 0.07);
      signSomewhere(ctx);
      addNpc(ctx);
      if (ctx.rng.chance(0.5)) addPokemon(ctx, [POKEMON[5], POKEMON[1]]);
    },
  },
  {
    id: "flower-festival",
    label: "Flower festival",
    biome: "village",
    tags: ["festival", "flowers", "plaza", "crowd"],
    names: {
      adjectives: ["Petalburg", "Blossom", "Garland", "Maypole", "Confetti", "Bloom", "Fanfare", "Carnival"],
      nouns: ["Festival", "Plaza", "Parade", "Fairgrounds", "Pavilion", "Jubilee", "Square", "Gala"],
    },
    blurbs: [
      "Once a year the whole town turns into one enormous bouquet.",
      "{n} flower carts arrived this morning. None have left.",
      "The petal-dance contest was won by a wild {pokemon}. Twice.",
    ],
    paintGround(ctx) {
      paintRect(ctx.ground, "road", 4, 4, 8, 8);
      paintPath(ctx.ground, "road", 7, 0, 7, 15, 2, ctx.rng);
    },
    decorate(ctx) {
      const flower = flowerOf(ctx.rng);
      scatter(ctx.grid, ctx.ground, ctx.rng, flower, 0.42);
      hedgeLine(ctx.grid, ctx.ground, 0, 0, 15, 0, { gapAt: 7 });
      signSomewhere(ctx);
      addNpc(ctx, NPC_VILLAGERS);
      addNpc(ctx, NPC_RUNNERS);
      addNpc(ctx, NPC_VILLAGERS);
      if (ctx.rng.chance(0.7)) addPokemon(ctx);
    },
  },
  {
    id: "ranch-paddock",
    label: "Pokémon ranch",
    biome: "meadow",
    tags: ["ranch", "paddock", "grazing", "fences"],
    names: {
      adjectives: ["Zigzag", "Skitty", "Meadowlark", "Longhorn", "Sunnyside", "Taillow", "Ponyta", "Freerange"],
      nouns: ["Ranch", "Paddock", "Pastures", "Meadows", "Stables", "Run", "Grazing", "Homestead"],
    },
    blurbs: [
      "The hedges keep nothing in — the residents just like it here.",
      "{n} Pokémon graze these paddocks; all answer to the dinner bell.",
      "A {pokemon} holds the record for most hedge escapes: zero attempts.",
    ],
    paintGround(ctx) {
      paintPath(ctx.ground, "dirt", 1, 8, 14, 8, 1, ctx.rng);
    },
    decorate(ctx) {
      placeHouse(ctx.grid, ctx.ground, 1, 1);
      hedgeLine(ctx.grid, ctx.ground, 0, 6, 15, 6, { gapAt: ctx.rng.range(3, 12) });
      hedgeLine(ctx.grid, ctx.ground, 0, 12, 15, 12, { gapAt: ctx.rng.range(3, 12) });
      longGrassPatch(ctx.grid, ctx.ground, ctx.rng, ctx.rng.range(4, 11), 10, 3);
      addPokemon(ctx);
      addPokemon(ctx);
      if (ctx.rng.chance(0.6)) addPokemon(ctx);
      addNpc(ctx);
    },
  },
  {
    id: "daycare-garden",
    label: "Day-care garden",
    biome: "village",
    tags: ["daycare", "garden", "pokemon", "cozy"],
    names: {
      adjectives: ["Cradlewood", "Naptime", "Lullaby", "Sprout", "Toddle", "Bumble", "Cuddle", "Hatchling"],
      nouns: ["Day-care", "Nursery", "Playground", "Garden", "Creche", "Corner", "Cottage", "Yard"],
    },
    blurbs: [
      "The old couple here can raise anything except their own tomatoes.",
      "Nap hour is enforced by a very serious {pokemon}.",
      "Every egg hatched here gets a flower planted. There are {n}00 flowers.",
    ],
    paintGround(ctx) {
      paintPath(ctx.ground, "path", 8, 15, 8, 6, 2, ctx.rng);
    },
    decorate(ctx) {
      placeHouse(ctx.grid, ctx.ground, 6, 1);
      const flower = flowerOf(ctx.rng);
      for (let col = 2; col <= 13; col += 1) {
        if (isClear(ctx.grid, ctx.ground, col, 11) && ctx.ground[11][col] === "grass") placeDecor(ctx.grid, col, 11, flower[0]);
        if (isClear(ctx.grid, ctx.ground, col, 13) && ctx.ground[13][col] === "grass") placeDecor(ctx.grid, col, 13, flower[0]);
      }
      hedgeLine(ctx.grid, ctx.ground, 1, 5, 1, 14);
      hedgeLine(ctx.grid, ctx.ground, 14, 5, 14, 14);
      addPokemon(ctx, [POKEMON[0], POKEMON[1], POKEMON[2], POKEMON[3]]);
      addPokemon(ctx, [POKEMON[0], POKEMON[1], POKEMON[2], POKEMON[3]]);
      addNpc(ctx);
    },
  },
  {
    id: "market-crossroads",
    label: "Market crossroads",
    biome: "village",
    tags: ["market", "roads", "signs", "busy"],
    names: {
      adjectives: ["Mauville", "Barter", "Peddler", "Tollgate", "Wayfarer", "Merchant", "Signpost", "Traveler"],
      nouns: ["Crossroads", "Market", "Junction", "Exchange", "Waystation", "Bazaar", "Corners", "Fork"],
    },
    blurbs: [
      "Four roads, three arguments about directions, two stalls, one legend.",
      "Everything is for sale except the signposts. People keep asking.",
      "A commuting {pokemon} passes through at exactly noon.",
    ],
    paintGround(ctx) {
      paintPath(ctx.ground, "road", 7, 0, 7, 15, 2, ctx.rng);
      paintPath(ctx.ground, "road", 0, 7, 15, 7, 2, ctx.rng);
    },
    decorate(ctx) {
      if (ctx.rng.chance(0.7)) placeHouse(ctx.grid, ctx.ground, 1, 1);
      if (ctx.rng.chance(0.7)) placeHouse(ctx.grid, ctx.ground, 11, 10);
      placeSign(ctx.grid, ctx.ground, 5, 5);
      placeSign(ctx.grid, ctx.ground, 10, 10);
      scatter(ctx.grid, ctx.ground, ctx.rng, flowerOf(ctx.rng), 0.05);
      addNpc(ctx);
      addNpc(ctx, NPC_RUNNERS);
      hiddenSomewhere(ctx);
    },
  },
  {
    id: "quiet-retreat",
    label: "Quiet retreat",
    biome: "village",
    tags: ["cottage", "garden", "peaceful", "pond"],
    names: {
      adjectives: ["Verdanturf", "Hushwind", "Slowday", "Kettle", "Teacup", "Snooze", "Windchime", "Hammock"],
      nouns: ["Retreat", "Cottage", "Hideaway", "Nook", "Reststop", "Porch", "Garden", "Haven"],
    },
    blurbs: [
      "One cottage, one pond, one very committed afternoon-nap schedule.",
      "The wind chimes have rung {n} times this year. It was windy once.",
      "Visitors are welcome if they whisper. A {pokemon} enforces this.",
    ],
    paintGround(ctx) {
      paintBlob(ctx.ground, "water", ctx.rng.range(11, 13), ctx.rng.range(3, 5), 3, ctx.rng);
      paintPath(ctx.ground, "path", 3, 15, 3, 8, 1, ctx.rng);
    },
    decorate(ctx) {
      placeHouse(ctx.grid, ctx.ground, 2, 3);
      scatter(ctx.grid, ctx.ground, ctx.rng, flowerOf(ctx.rng), 0.1);
      hedgeLine(ctx.grid, ctx.ground, 0, 10, 8, 10, { gapAt: 3 });
      addNpc(ctx);
      if (ctx.rng.chance(0.5)) addPokemon(ctx, [POKEMON[3]]);
    },
  },

  // --- meadows & gardens ---------------------------------------------------
  {
    id: "peaceful-garden",
    label: "Peaceful garden",
    biome: "meadow",
    tags: ["garden", "flowers", "paths", "serene"],
    names: {
      adjectives: ["Serene", "Tranquil", "Morninglight", "Dappled", "Whispering", "Gentle", "Sunbeam", "Dewdrop"],
      nouns: ["Garden", "Terrace", "Walk", "Arbor", "Grove", "Beds", "Promenade", "Sanctuary"],
    },
    blurbs: [
      "Somebody rakes the gravel here into perfect lines every dawn. Nobody knows who.",
      "The flowers arrange themselves by colour when nobody is looking.",
      "A meditating {pokemon} has not moved from the centre stone in {n} weeks.",
    ],
    paintGround(ctx) {
      paintPath(ctx.ground, "path", 2, 2, 13, 13, 1, ctx.rng);
      paintPath(ctx.ground, "path", 13, 2, 2, 13, 1, ctx.rng);
      if (ctx.rng.chance(0.5)) paintBlob(ctx.ground, "water", 8, 8, 2, ctx.rng);
    },
    decorate(ctx) {
      const flower = flowerOf(ctx.rng);
      scatter(ctx.grid, ctx.ground, ctx.rng, flower, 0.22);
      hedgeLine(ctx.grid, ctx.ground, 0, 0, 15, 0);
      hedgeLine(ctx.grid, ctx.ground, 0, 15, 15, 15, { gapAt: ctx.rng.range(6, 9) });
      addNpc(ctx);
      if (ctx.rng.chance(0.6)) addPokemon(ctx, [POKEMON[3], POKEMON[1]]);
    },
  },
  {
    id: "hedge-maze",
    label: "Hedge maze",
    biome: "meadow",
    tags: ["maze", "hedges", "puzzle", "hidden-item"],
    names: {
      adjectives: ["Puzzling", "Winding", "Bewildering", "Topiary", "Twisting", "Roundabout", "Looping", "Perplexing"],
      nouns: ["Maze", "Labyrinth", "Hedgerows", "Tangle", "Puzzle", "Knot", "Coil", "Riddle"],
    },
    blurbs: [
      "The gardener lost the blueprint years ago and now just follows the hedges.",
      "{n} trainers entered last week. {n} eventually left. Probably the same ones.",
      "Rumour says the centre hides a prize guarded by a smug {pokemon}.",
    ],
    paintGround(ctx) {
      paintPath(ctx.ground, "path", 8, 15, 8, 13, 1, ctx.rng);
    },
    decorate(ctx) {
      // Concentric hedge rings with rng-carved gaps — a walkable spiral.
      for (let ring = 1; ring <= 6; ring += 2) {
        const min = ring;
        const max = DESIGN_GRID - 1 - ring;
        const gapSide = ctx.rng.int(4);
        const gapAt = ctx.rng.range(min + 1, max - 1);
        for (let col = min; col <= max; col += 1) {
          if (!(gapSide === 0 && col === gapAt)) hedgeLine(ctx.grid, ctx.ground, col, min, col, min);
          if (!(gapSide === 1 && col === gapAt)) hedgeLine(ctx.grid, ctx.ground, col, max, col, max);
        }
        for (let row = min; row <= max; row += 1) {
          if (!(gapSide === 2 && row === gapAt)) hedgeLine(ctx.grid, ctx.ground, min, row, min, row);
          if (!(gapSide === 3 && row === gapAt)) hedgeLine(ctx.grid, ctx.ground, max, row, max, row);
        }
      }
      placeHiddenItem(ctx.grid, ctx.ground, 8, 8);
      if (ctx.rng.chance(0.5)) addPokemon(ctx, [POKEMON[5]], 7);
    },
  },
  {
    id: "secret-meadow",
    label: "Secret meadow",
    biome: "forest",
    tags: ["secret", "meadow", "hidden-item", "forest-wall"],
    names: {
      adjectives: ["Hidden", "Secret", "Forgotten", "Unmapped", "Veiled", "Lost", "Quiet", "Sheltered"],
      nouns: ["Meadow", "Clearing", "Glade", "Pocket", "Haven", "Hollow", "Field", "Refuge"],
    },
    blurbs: [
      "Not on any map. The trees prefer it that way.",
      "Only one gap in the treeline — and it moves every spring.",
      "A {pokemon} led a lost hiker here once. The hiker never told anyone the way.",
    ],
    paintGround() {
      // pure grass; the walls make the scene
    },
    decorate(ctx) {
      treeBorder(ctx.grid, ctx.ground, ctx.rng, { thickness: ctx.rng.pick([2, 3]), gapChance: 0.04 });
      const flower = flowerOf(ctx.rng);
      scatter(ctx.grid, ctx.ground, ctx.rng, flower, 0.18);
      longGrassPatch(ctx.grid, ctx.ground, ctx.rng, ctx.rng.range(5, 10), ctx.rng.range(5, 10), 3);
      hiddenSomewhere(ctx);
      hiddenSomewhere(ctx);
      if (ctx.rng.chance(0.7)) addPokemon(ctx);
    },
  },
  {
    id: "berry-grove",
    label: "Berry grove",
    biome: "meadow",
    tags: ["berries", "grove", "forage", "shrubs"],
    names: {
      adjectives: ["Ripe", "Juicy", "Overgrown", "Wild", "Sweetleaf", "Tangleberry", "Brambly", "Laden"],
      nouns: ["Grove", "Thicket", "Berrypatch", "Brambles", "Harvest", "Copse", "Hollow", "Stand"],
    },
    blurbs: [
      "Free berries, if you can out-negotiate the resident Zigzagoon.",
      "The bushes here fruit in {n} colours, two of them unidentified.",
      "Foragers' rule: one for the basket, one for the {pokemon}.",
    ],
    paintGround(ctx) {
      paintPath(ctx.ground, "dirt", 0, ctx.rng.range(6, 9), 15, ctx.rng.range(6, 9), 1, ctx.rng);
    },
    decorate(ctx) {
      scatter(ctx.grid, ctx.ground, ctx.rng, ["shrub-1"], 0.2, { solid: true, feature: "berry-bush" });
      scatter(ctx.grid, ctx.ground, ctx.rng, flowerOf(ctx.rng), 0.08);
      signSomewhere(ctx);
      hiddenSomewhere(ctx);
      addPokemon(ctx, [POKEMON[5]]);
      if (ctx.rng.chance(0.5)) addNpc(ctx);
    },
  },
  {
    id: "safari-thicket",
    label: "Safari thicket",
    biome: "meadow",
    tags: ["safari", "long-grass", "wild", "encounters"],
    names: {
      adjectives: ["Rustling", "Teeming", "Untamed", "Prowling", "Grassy", "Roaming", "Wandering", "Trembling"],
      nouns: ["Thicket", "Safari", "Grasslands", "Wilds", "Range", "Expanse", "Veldt", "Reserve"],
    },
    blurbs: [
      "The grass is tall, the Pokémon are taller. Bring Poké Balls.",
      "Rangers count {n} rustles per minute here on a calm day.",
      "A {pokemon} runs an unofficial toll booth at the trailhead.",
    ],
    paintGround(ctx) {
      paintPath(ctx.ground, "path", 0, 12, 15, 12, 1, ctx.rng);
    },
    decorate(ctx) {
      longGrassPatch(ctx.grid, ctx.ground, ctx.rng, 4, 4, 4);
      longGrassPatch(ctx.grid, ctx.ground, ctx.rng, 11, 6, 4);
      longGrassPatch(ctx.grid, ctx.ground, ctx.rng, 6, 9, 3);
      scatterSceneTrees(ctx, 0.04);
      signSomewhere(ctx);
      addPokemon(ctx);
      addPokemon(ctx);
      if (ctx.rng.chance(0.5)) addNpc(ctx);
    },
  },
  {
    id: "picnic-clearing",
    label: "Picnic clearing",
    biome: "meadow",
    tags: ["picnic", "clearing", "rest", "friendly"],
    names: {
      adjectives: ["Checkered", "Sunny", "Breezy", "Lazy", "Buttercup", "Weekend", "Basket", "Blanket"],
      nouns: ["Clearing", "Picnic", "Knoll", "Lawn", "Spot", "Rise", "Field", "Overlook"],
    },
    blurbs: [
      "Best sandwich spot in three routes, according to a poll of one Hiker.",
      "The ants here are polite and form an orderly queue.",
      "{n} crumbs dropped; a patrolling {pokemon} recovered them all.",
    ],
    paintGround(ctx) {
      paintPath(ctx.ground, "path", 1, 14, ctx.rng.range(6, 9), ctx.rng.range(6, 9), 1, ctx.rng);
    },
    decorate(ctx) {
      scatter(ctx.grid, ctx.ground, ctx.rng, ["shrub-1"], 0.05, { solid: true, feature: "hedge" });
      scatter(ctx.grid, ctx.ground, ctx.rng, flowerOf(ctx.rng), 0.12);
      scatterSceneTrees(ctx, 0.06);
      addNpc(ctx);
      addNpc(ctx);
      if (ctx.rng.chance(0.6)) addPokemon(ctx, [POKEMON[1], POKEMON[5]]);
    },
  },
  {
    id: "butterfly-fields",
    label: "Butterfly fields",
    biome: "meadow",
    tags: ["flowers", "wild", "long-grass", "gentle"],
    names: {
      adjectives: ["Fluttering", "Pollen", "Nectar", "Drifting", "Shimmerwing", "Beautifly", "Dustmote", "Petalstorm"],
      nouns: ["Fields", "Meadow", "Drift", "Flats", "Prairie", "Blooms", "Sway", "Acres"],
    },
    blurbs: [
      "In late spring the pollen here is visible from the next route over.",
      "Every flower faces the morning sun, except one contrarian.",
      "A {pokemon} naps in the tall grass and hums when it dreams.",
    ],
    paintGround() {},
    decorate(ctx) {
      const flower = flowerOf(ctx.rng);
      scatter(ctx.grid, ctx.ground, ctx.rng, flower, 0.3);
      longGrassPatch(ctx.grid, ctx.ground, ctx.rng, ctx.rng.range(3, 12), ctx.rng.range(3, 12), 4);
      scatterSceneTrees(ctx, 0.03);
      addPokemon(ctx, [POKEMON[3], POKEMON[1], POKEMON[4]]);
      if (ctx.rng.chance(0.4)) addNpc(ctx);
      hiddenSomewhere(ctx);
    },
  },

  // --- forest --------------------------------------------------------------
  {
    id: "deep-forest-shrine",
    label: "Deep-forest shrine",
    biome: "forest",
    tags: ["shrine", "ancient", "forest-wall", "mystic"],
    names: {
      adjectives: ["Mossgrown", "Ancient", "Elder", "Silent", "Rooted", "Hallowed", "Old-growth", "Sacred"],
      nouns: ["Shrine", "Altar", "Sanctum", "Ring", "Circle", "Rest", "Heart", "Seat"],
    },
    blurbs: [
      "The ring was planted before the forest arrived. The forest grew around it respectfully.",
      "Offerings left overnight are gone by morning. Tooth marks suggest gratitude.",
      "A {pokemon} tends this place, or possibly haunts it. Reviews vary.",
    ],
    paintGround(ctx) {
      paintPath(ctx.ground, "dirt", 8, 15, 8, 8, 1, ctx.rng);
    },
    decorate(ctx) {
      treeBorder(ctx.grid, ctx.ground, ctx.rng, { thickness: 3, gapChance: 0.05 });
      // sacred ring of clipped hedges around the shrine heart
      const ring = [[6, 6], [8, 5], [10, 6], [11, 8], [10, 10], [6, 10], [5, 8]] as const;
      for (const [col, row] of ring) {
        if (isClear(ctx.grid, ctx.ground, col, row) && ctx.ground[row][col] === "grass") {
          placeDecor(ctx.grid, col, row, "shrub-1", { solid: true, feature: "shrine-hedge" });
        }
      }
      placeHiddenItem(ctx.grid, ctx.ground, 8, 8);
      if (ctx.rng.chance(0.8)) addPokemon(ctx, FOREST_SPIRITS, 5);
      if (ctx.rng.chance(0.4)) addNpc(ctx, NPC_MYSTERIOUS, 4);
    },
  },
  {
    id: "haunted-grove",
    label: "Haunted grove",
    biome: "forest",
    tags: ["spooky", "maze", "secret", "forest-wall"],
    names: {
      adjectives: ["Gnarled", "Whispering", "Midnight", "Crooked", "Shivering", "Moonlit", "Creaking", "Pale"],
      nouns: ["Grove", "Hollow", "Wood", "Boughs", "Shadows", "Thicket", "Dark", "Tangle"],
    },
    blurbs: [
      "The trees creak in a language nobody wants translated.",
      "Lanterns brought in here burn {n} shades bluer.",
      "Something follows visitors to the edge, then politely stops.",
    ],
    paintGround(ctx) {
      // one-wide wandering trail; bridge diagonal steps so the path autotile
      // always sees a cardinal neighbour (no floating path squares)
      let col = ctx.rng.range(2, 13);
      for (let row = 15; row >= 1; row -= 1) {
        ctx.ground[row][col] = "dirt";
        const next = Math.max(1, Math.min(14, col + ctx.rng.range(-1, 1)));
        if (next !== col) ctx.ground[row][next] = "dirt";
        col = next;
      }
    },
    decorate(ctx) {
      // Dense haunted wood: staggered complete trees + small-tree undergrowth.
      scatterTrees(ctx.grid, ctx.ground, ctx.rng, 26, 0.1);
      hiddenSomewhere(ctx);
      hiddenSomewhere(ctx);
      if (ctx.rng.chance(0.6)) addNpc(ctx, NPC_MYSTERIOUS);
      if (ctx.rng.chance(0.5)) addPokemon(ctx, [POKEMON[3]]);
    },
  },
  {
    id: "woodcutter-camp",
    label: "Woodcutter camp",
    biome: "forest",
    tags: ["camp", "cabin", "work", "clearing"],
    names: {
      adjectives: ["Sawdust", "Timberline", "Axehandle", "Knothole", "Splitlog", "Barkbound", "Pinesap", "Grainswirl"],
      nouns: ["Camp", "Cabin", "Clearing", "Worksite", "Lot", "Yard", "Stack", "Mill"],
    },
    blurbs: [
      "Every stump here has been apologised to personally.",
      "The woodpile is {n} logs high and structurally ambitious.",
      "A {pokemon} supervises all axe work from a safe branch.",
    ],
    paintGround(ctx) {
      paintBlob(ctx.ground, "dirt", ctx.rng.range(7, 8), ctx.rng.range(9, 10), 3, ctx.rng);
      paintPath(ctx.ground, "dirt", 8, 15, 8, 10, 1, ctx.rng);
    },
    decorate(ctx) {
      treeBorder(ctx.grid, ctx.ground, ctx.rng, { thickness: 2, gapChance: 0.12 });
      // The border's tree course fills rows 0–2, so cabins anchor below it.
      for (const [col, row] of [[3, 3], [9, 3], [6, 3]] as const) {
        if (placeHouse(ctx.grid, ctx.ground, col, row)) break;
      }
      scatter(ctx.grid, ctx.ground, ctx.rng, ["shrub-1"], 0.06, { solid: true, feature: "hedge" });
      addNpc(ctx);
      if (ctx.rng.chance(0.5)) addPokemon(ctx, [POKEMON[0], POKEMON[5]]);
    },
  },
  {
    id: "forest-crossing",
    label: "Forest crossing",
    biome: "forest",
    tags: ["route", "paths", "signs", "travel"],
    names: {
      adjectives: ["Shaded", "Fern", "Canopy", "Understory", "Sundappled", "Deeproot", "Larchlight", "Owlwatch"],
      nouns: ["Crossing", "Pass", "Byway", "Trailfork", "Underpass", "Route", "Cutthrough", "Bend"],
    },
    blurbs: [
      "Two trails cross here and neither yields right of way.",
      "The sign has directions to {n} places, one of which exists.",
      "Regular commuters include a briefcase-carrying {pokemon}.",
    ],
    paintGround(ctx) {
      paintPath(ctx.ground, "path", 0, ctx.rng.range(6, 9), 15, ctx.rng.range(6, 9), 2, ctx.rng);
      paintPath(ctx.ground, "path", ctx.rng.range(6, 9), 0, ctx.rng.range(6, 9), 15, 1, ctx.rng);
    },
    decorate(ctx) {
      treeBorder(ctx.grid, ctx.ground, ctx.rng, { thickness: 2, gapChance: 0.3 });
      scatterSceneTrees(ctx, 0.12);
      signSomewhere(ctx);
      addNpc(ctx, NPC_RUNNERS);
      hiddenSomewhere(ctx);
    },
  },

  // --- mountain (full-bleed rocky biome) -----------------------------------
  {
    id: "legendary-cave",
    label: "Legendary cave",
    biome: "mountain",
    tags: ["legendary", "cave", "shrine", "epic"],
    names: {
      adjectives: ["Origin", "Thunderous", "Emerald", "Skyborn", "Tempest", "Primal", "Everlast", "Regal"],
      nouns: ["Cavern", "Maw", "Sanctum", "Vault", "Antechamber", "Depths", "Gate", "Throne"],
    },
    blurbs: [
      "The air pressure changes when you say certain names out loud.",
      "Seismographs three towns away point at this cave and sulk.",
      "Legends say a {pokemon} guards the mouth. Legends undersell it.",
    ],
    paintGround(ctx) {
      fillGround(ctx, "rocky");
    },
    decorate(ctx) {
      domeSomewhere(ctx, [[ctx.rng.pick([5, 6, 7]), 1]]);
      if (ctx.rng.chance(0.7)) domeSomewhere(ctx, [[1, 2], [2, 1]]);
      if (ctx.rng.chance(0.7)) domeSomewhere(ctx, [[12, 2], [11, 1]]);
      placeBoulderLine(ctx.grid, ctx.ground, ctx.rng, 9, ctx.rng.range(3, 5), ctx.rng.range(10, 12));
      boulders(ctx, 0.07);
      scree(ctx, 0.1);
      rockySignSomewhere(ctx);
      hiddenSomewhere(ctx);
      addPokemon(ctx, LEGENDARIES, 4);
      if (ctx.rng.chance(0.4)) addNpc(ctx, NPC_MYSTERIOUS, 4);
    },
  },
  {
    id: "team-hideout",
    label: "Villain hideout",
    biome: "mountain",
    tags: ["villains", "hideout", "secret", "cave"],
    names: {
      adjectives: ["Smokestack", "Crooked", "Undercover", "Blacklist", "Lowlight", "Grifter", "Backdoor", "Offgrid"],
      nouns: ["Hideout", "Den", "Front", "Safehouse", "Stash", "Outpost", "Racket", "Lair"],
    },
    blurbs: [
      "Officially this is a mushroom farm. The mushrooms wear uniforms.",
      "Grunts rotate lookout duty every {n} hours and complain every minute.",
      "The password changes daily. It is always the boss's {pokemon}'s name.",
    ],
    paintGround(ctx) {
      fillGround(ctx, "rocky");
    },
    decorate(ctx) {
      domeSomewhere(ctx, [[ctx.rng.pick([6, 7]), 1]]);
      // boulder barricade funnels visitors through one gap
      const barrier = ctx.rng.range(7, 9);
      const gap = ctx.rng.range(4, 11);
      for (let col = 1; col <= 14; col += 1) {
        if (Math.abs(col - gap) <= 0) continue;
        if (ctx.rng.chance(0.6) && isClear(ctx.grid, ctx.ground, col, barrier)) {
          placeDecor(ctx.grid, col, barrier, "boulder-mossy-1", {
            solid: true,
            feature: "barricade",
          });
        }
      }
      scree(ctx, 0.08);
      placeRockySign(ctx.grid, ctx.ground, ctx.rng.range(3, 12), barrier + 2);
      hiddenSomewhere(ctx);
      hiddenSomewhere(ctx);
      addNpc(ctx, NPC_MYSTERIOUS, 3);
      addNpc(ctx, NPC_MYSTERIOUS, 3);
      if (ctx.rng.chance(0.5)) addPokemon(ctx, [POKEMON[5]]);
    },
  },
  {
    id: "mountain-pass",
    label: "Mountain pass",
    biome: "mountain",
    tags: ["terraces", "climb", "route", "rocky"],
    names: {
      adjectives: ["Jagged", "Windswept", "Switchback", "Highstep", "Craggy", "Bouldered", "Scree", "Cliffside"],
      nouns: ["Pass", "Ascent", "Climb", "Steps", "Ridge", "Traverse", "Gap", "Saddle"],
    },
    blurbs: [
      "Three boulder terraces up, one scramble down, repeat until scenic.",
      "The wind here files formal complaints about hikers' hats.",
      "A {pokemon} has claimed the best viewpoint and takes bribes in berries.",
    ],
    paintGround(ctx) {
      fillGround(ctx, "rocky");
    },
    decorate(ctx) {
      placeBoulderLine(ctx.grid, ctx.ground, ctx.rng, 4, 1, ctx.rng.range(9, 14));
      placeBoulderLine(ctx.grid, ctx.ground, ctx.rng, 8, ctx.rng.range(2, 6), 14);
      placeBoulderLine(ctx.grid, ctx.ground, ctx.rng, 12, 1, ctx.rng.range(9, 14));
      boulders(ctx, 0.06);
      scree(ctx, 0.12);
      rockySignSomewhere(ctx);
      addNpc(ctx);
      hiddenSomewhere(ctx);
    },
  },
  {
    id: "hot-springs",
    label: "Hot springs",
    biome: "mountain",
    tags: ["springs", "steam", "rest", "water"],
    names: {
      adjectives: ["Steaming", "Lavaridge", "Simmering", "Cozy", "Bubbling", "Mistveil", "Warmstone", "Soothing"],
      nouns: ["Springs", "Baths", "Pools", "Soak", "Basin", "Vents", "Waters", "Retreat"],
    },
    blurbs: [
      "The water is exactly as warm as a nap feels.",
      "Towels provided by an entrepreneurial {pokemon}, {n} berries each.",
      "Doctors recommend one soak per badge earned.",
    ],
    paintGround(ctx) {
      paintBlob(ctx.ground, "water", 5, 6, 2, ctx.rng);
      paintBlob(ctx.ground, "water", 10, 9, 2, ctx.rng);
      if (ctx.rng.chance(0.5)) paintBlob(ctx.ground, "water", 7, 12, 2, ctx.rng);
      paintPath(ctx.ground, "path", 1, 2, 13, 2, 1, ctx.rng);
    },
    decorate(ctx) {
      scatter(ctx.grid, ctx.ground, ctx.rng, ["shrub-1"], 0.08, { solid: true, feature: "hedge" });
      scatter(ctx.grid, ctx.ground, ctx.rng, flowerOf(ctx.rng), 0.08);
      addNpc(ctx);
      addNpc(ctx);
      if (ctx.rng.chance(0.7)) addPokemon(ctx, [POKEMON[2], POKEMON[1]]);
    },
  },
  {
    id: "miners-quarry",
    label: "Miner's quarry",
    biome: "mountain",
    tags: ["mining", "rocks", "cave", "industrial"],
    names: {
      adjectives: ["Rubble", "Pickaxe", "Deepvein", "Orebound", "Granite", "Dusty", "Chiseled", "Hardhat"],
      nouns: ["Quarry", "Digs", "Pit", "Claim", "Excavation", "Shaft", "Workings", "Cut"],
    },
    blurbs: [
      "Every rock here has been tapped twice and apologised to once.",
      "The foreman insists there's treasure {n} feet down. There is gravel.",
      "A {pokemon} keeps stealing the shiniest ore. Morale is complicated.",
    ],
    paintGround(ctx) {
      fillGround(ctx, "rocky");
    },
    decorate(ctx) {
      domeSomewhere(ctx, [[ctx.rng.range(9, 12), 2], [2, 2]]);
      boulders(ctx, 0.12);
      scree(ctx, 0.16);
      rockySignSomewhere(ctx);
      addNpc(ctx);
      hiddenSomewhere(ctx);
      hiddenSomewhere(ctx);
    },
  },
  {
    id: "summit-lookout",
    label: "Summit lookout",
    biome: "mountain",
    tags: ["summit", "view", "terraces", "sign"],
    names: {
      adjectives: ["Skyline", "Cloudbrush", "Highmark", "Vantage", "Aerie", "Topmost", "Farview", "Overlook"],
      nouns: ["Lookout", "Summit", "Peak", "Crown", "Perch", "Point", "Height", "Watch"],
    },
    blurbs: [
      "On a clear day you can see {n} routes and one embarrassed Wingull.",
      "The summit log book is mostly drawings of clouds.",
      "A stationed {pokemon} rates every sunrise. Today: 9/10.",
    ],
    paintGround(ctx) {
      fillGround(ctx, "rocky");
    },
    decorate(ctx) {
      domeSomewhere(ctx, [[ctx.rng.pick([1, 2]), 10], [12, 10]]);
      placeBoulderLine(ctx.grid, ctx.ground, ctx.rng, 6, 1, 6, { gapAt: -1 });
      placeBoulderLine(ctx.grid, ctx.ground, ctx.rng, 6, 10, 14, { gapAt: -1 });
      placeBoulderLine(ctx.grid, ctx.ground, ctx.rng, 11, 2, 13);
      placeRockySign(ctx.grid, ctx.ground, ctx.rng.pick([7, 9]), 2);
      boulders(ctx, 0.05);
      scree(ctx, 0.08);
      addNpc(ctx);
      if (ctx.rng.chance(0.6)) addPokemon(ctx, [POKEMON[4]]);
    },
  },

  // --- water ---------------------------------------------------------------
  {
    id: "fishing-hole",
    label: "Fishing hole",
    biome: "waterside",
    tags: ["fishing", "pond", "anglers", "calm"],
    names: {
      adjectives: ["Old Rod", "Good Rod", "Lunker", "Ripplecalm", "Baitbox", "Eightpound", "Longcast", "Duskbite"],
      nouns: ["Fishing hole", "Pond", "Tarn", "Waters", "Pool", "Bend", "Shallows", "Catch"],
    },
    blurbs: [
      "The fish are biting. Mostly each other, but still.",
      "Local record: a Magikarp of {n} pounds, witnessed by no one.",
      "Every angler here has a story about the one that got away. It was the same {pokemon}.",
    ],
    paintGround(ctx) {
      paintBlob(ctx.ground, "water", 8, 8, ctx.rng.range(4, 6), ctx.rng);
      paintPath(ctx.ground, "path", 1, 14, 4, 10, 1, ctx.rng);
    },
    decorate(ctx) {
      scatterSceneTrees(ctx, 0.05);
      scatter(ctx.grid, ctx.ground, ctx.rng, ["shrub-1"], 0.04, { solid: true, feature: "hedge" });
      signSomewhere(ctx);
      addNpc(ctx, NPC_ANGLERS);
      addNpc(ctx, NPC_ANGLERS);
      if (ctx.rng.chance(0.7)) addPokemon(ctx, [POKEMON[2], POKEMON[4]]);
    },
  },
  {
    id: "river-crossing",
    label: "River crossing",
    biome: "waterside",
    tags: ["river", "bridge", "route", "travel"],
    names: {
      adjectives: ["Fordable", "Splitbank", "Twinshore", "Slowcurrent", "Pebblebed", "Reedy", "Crossway", "Spanning"],
      nouns: ["Crossing", "Ford", "Bridge", "Narrows", "Straits", "Span", "Channel", "Passage"],
    },
    blurbs: [
      "The bridge planks creak in E minor. Locals hum along.",
      "The river is {n} tiles wide and infinitely opinionated.",
      "A ferry {pokemon} undercuts the bridge toll by one berry.",
    ],
    paintGround(ctx) {
      const riverCol = ctx.rng.range(6, 9);
      paintRect(ctx.ground, "water", riverCol, 0, 3, DESIGN_GRID);
      const bridgeRow = ctx.rng.range(6, 9);
      paintRect(ctx.ground, "road", 0, bridgeRow, DESIGN_GRID, 2);
    },
    decorate(ctx) {
      scatterSceneTrees(ctx, 0.07);
      scatter(ctx.grid, ctx.ground, ctx.rng, flowerOf(ctx.rng), 0.06);
      signSomewhere(ctx);
      addNpc(ctx, NPC_RUNNERS);
      if (ctx.rng.chance(0.6)) addPokemon(ctx, [POKEMON[2], POKEMON[4]]);
    },
  },
  {
    id: "tiny-island",
    label: "Tiny island",
    biome: "waterside",
    tags: ["island", "isolated", "secret", "water"],
    waterFallback: "sand",
    names: {
      adjectives: ["Lonely", "One-Tree", "Castaway", "Pocket", "Faraway", "Bottlecap", "Sandollar", "Forgotten"],
      nouns: ["Island", "Isle", "Atoll", "Speck", "Outcrop", "Key", "Sandbar", "Islet"],
    },
    blurbs: [
      "Population: one tree, one secret, occasional Wingull.",
      "Maps disagree about this island's existence. The island doesn't care.",
      "A message in a bottle washed up here asking for {n} more bottles.",
    ],
    paintGround(ctx) {
      fillGround(ctx, "water");
      paintBlob(ctx.ground, "sand", 8, 8, ctx.rng.range(3, 4), ctx.rng);
      paintBlob(ctx.ground, "grass", 8, 7, 2.5, ctx.rng);
    },
    decorate(ctx) {
      const treeSpot = findClearSpot(ctx.grid, ctx.ground, ctx.rng, { allowGround: ["grass"], margin: 4 });
      if (treeSpot) {
        const planted =
          placeTree(ctx.grid, ctx.ground, treeSpot.col, treeSpot.row) ||
          placeTree(ctx.grid, ctx.ground, treeSpot.col - 1, treeSpot.row) ||
          placeTree(ctx.grid, ctx.ground, treeSpot.col, treeSpot.row - 1) ||
          placeTree(ctx.grid, ctx.ground, treeSpot.col - 1, treeSpot.row - 1);
        if (!planted) placeDecor(ctx.grid, treeSpot.col, treeSpot.row, SMALL_SHRUB, { solid: true, feature: "shrub" });
      }
      scatter(ctx.grid, ctx.ground, ctx.rng, flowerOf(ctx.rng), 0.1);
      hiddenSomewhere(ctx);
      if (ctx.rng.chance(0.8)) addPokemon(ctx, [POKEMON[4], POKEMON[2]], 5);
    },
  },
  {
    id: "springwater-gardens",
    label: "Springwater gardens",
    biome: "waterside",
    tags: ["garden", "pools", "flowers", "serene"],
    names: {
      adjectives: ["Clearspring", "Freshet", "Troutbeck", "Glasswater", "Silverbrook", "Coldwell", "Purling", "Brookside"],
      nouns: ["Gardens", "Springs", "Pools", "Waterbeds", "Fountains", "Channels", "Terraces", "Weir"],
    },
    blurbs: [
      "The spring water is so clear that fish appear to be flying.",
      "Gardeners measure success in ripples per minute.",
      "A {pokemon} inspects the lily pads daily and approves most of them.",
    ],
    paintGround(ctx) {
      paintBlob(ctx.ground, "water", 4, 4, 2, ctx.rng);
      paintBlob(ctx.ground, "water", 11, 5, 2, ctx.rng);
      paintBlob(ctx.ground, "water", 7, 11, 3, ctx.rng);
      paintPath(ctx.ground, "path", 1, 8, 14, 8, 1, ctx.rng);
    },
    decorate(ctx) {
      scatter(ctx.grid, ctx.ground, ctx.rng, flowerOf(ctx.rng), 0.16);
      hedgeLine(ctx.grid, ctx.ground, 0, 0, 15, 0, { gapAt: ctx.rng.range(5, 10) });
      addNpc(ctx);
      if (ctx.rng.chance(0.6)) addPokemon(ctx, [POKEMON[2], POKEMON[3]]);
    },
  },
  {
    id: "wailord-watch",
    label: "Wailord watch",
    biome: "waterside",
    tags: ["coast", "watching", "sand", "wild"],
    waterFallback: "sand",
    names: {
      adjectives: ["Spyglass", "Horizon", "Bluewater", "Openreach", "Longwave", "Saltspray", "Tidechart", "Whalesong"],
      nouns: ["Watch", "Point", "Bluff", "Overlook", "Shore", "Vigil", "Lookout", "Head"],
    },
    blurbs: [
      "Wailord sightings: {n} confirmed, 200 hopeful.",
      "The waves practise their timing here. Sets of seven.",
      "A resident {pokemon} announces every splash, including its own.",
    ],
    paintGround(ctx) {
      for (let row = 0; row < 7; row += 1) {
        for (let col = 0; col < DESIGN_GRID; col += 1) ctx.ground[row][col] = "water";
      }
      paintRect(ctx.ground, "sand", 0, 7, DESIGN_GRID, 3);
    },
    decorate(ctx) {
      scatterSceneTrees(ctx, 0.05);
      scatter(ctx.grid, ctx.ground, ctx.rng, flowerOf(ctx.rng), 0.05);
      signSomewhere(ctx);
      addNpc(ctx);
      addPokemon(ctx, [POKEMON[4]]);
      if (ctx.rng.chance(0.5)) addNpc(ctx, NPC_ANGLERS);
    },
  },

  // --- desert & badlands ---------------------------------------------------
  {
    id: "desert-ruin",
    label: "Desert ruin",
    biome: "desert",
    tags: ["ruins", "ancient", "badlands", "mystery"],
    names: {
      adjectives: ["Sunblasted", "Half-buried", "Crumbled", "Regi", "Glyphic", "Weathered", "Toppled", "Silent"],
      nouns: ["Ruin", "Temple", "Colonnade", "Foundation", "Monument", "Rubble", "Chambers", "Walls"],
    },
    blurbs: [
      "Archaeologists dated the ruins to 'very old' and went for lunch.",
      "The braille on the far wall spells out a {n}-step dance.",
      "A napping {pokemon} is the only thing holding one pillar up.",
    ],
    paintGround(ctx) {
      fillGround(ctx, "rocky");
    },
    decorate(ctx) {
      // toppled colonnade rows
      for (const row of [4, 7, 10]) {
        for (let col = 3; col <= 12; col += ctx.rng.pick([2, 3])) {
          if (ctx.rng.chance(0.7) && isClear(ctx.grid, ctx.ground, col, row)) {
            placeDecor(ctx.grid, col, row, "boulder-mossy-1", {
              solid: true,
              feature: "ruin-pillar",
            });
          }
        }
      }
      domeSomewhere(ctx, [[ctx.rng.range(6, 9), 1]]);
      scree(ctx, 0.08);
      placeRockySign(ctx.grid, ctx.ground, ctx.rng.range(3, 12), 13);
      hiddenSomewhere(ctx);
      hiddenSomewhere(ctx);
      if (ctx.rng.chance(0.6)) addPokemon(ctx, [POKEMON[3], POKEMON[5]]);
      if (ctx.rng.chance(0.5)) addNpc(ctx, NPC_MYSTERIOUS);
    },
  },
  {
    id: "oasis",
    label: "Desert oasis",
    biome: "desert",
    tags: ["oasis", "water", "palms", "rest"],
    names: {
      adjectives: ["Mirage", "Lastwater", "Datewood", "Shimmering", "Caravan", "Duneside", "Palmshade", "Sweetwell"],
      nouns: ["Oasis", "Well", "Waterhole", "Refuge", "Springs", "Shade", "Stopover", "Pools"],
    },
    blurbs: [
      "Real water, confirmed daily by suspicious travellers.",
      "The palm shade rotates; regulars rotate with it.",
      "A {pokemon} rents out the best shade spot for {n} berries an hour.",
    ],
    paintGround(ctx) {
      fillGround(ctx, "sand");
      paintBlob(ctx.ground, "grass", 8, 8, 4, ctx.rng);
      paintBlob(ctx.ground, "water", 8, 8, 2, ctx.rng);
    },
    decorate(ctx) {
      scatter(ctx.grid, ctx.ground, ctx.rng, [SMALL_SHRUB], 0.22, { solid: true, feature: "shrub" });
      scatter(ctx.grid, ctx.ground, ctx.rng, flowerOf(ctx.rng), 0.08);
      addNpc(ctx);
      if (ctx.rng.chance(0.7)) addPokemon(ctx);
      hiddenSomewhere(ctx);
    },
  },
  {
    id: "mirage-dunes",
    label: "Mirage dunes",
    biome: "desert",
    tags: ["dunes", "mirage", "secret", "sand"],
    names: {
      adjectives: ["Shifting", "Whispering", "Endless", "Glimmering", "Wandering", "Sunstruck", "Vanishing", "Restless"],
      nouns: ["Dunes", "Sands", "Expanse", "Mirage", "Wastes", "Drifts", "Sea", "Horizon"],
    },
    blurbs: [
      "The dunes rearrange nightly. The hidden cache does not.",
      "Compass needles here point at whatever they find interesting.",
      "Travellers report {n} mirages daily; one of them waves back.",
    ],
    paintGround(ctx) {
      fillGround(ctx, "sand");
      // mirage pockets of impossible green
      paintBlob(ctx.ground, "grass", ctx.rng.range(3, 5), ctx.rng.range(3, 5), 2, ctx.rng);
      paintBlob(ctx.ground, "grass", ctx.rng.range(10, 12), ctx.rng.range(9, 12), 2, ctx.rng);
    },
    decorate(ctx) {
      scatter(ctx.grid, ctx.ground, ctx.rng, flowerOf(ctx.rng), 0.2);
      hiddenSomewhere(ctx);
      hiddenSomewhere(ctx);
      hiddenSomewhere(ctx);
      if (ctx.rng.chance(0.5)) addPokemon(ctx, [POKEMON[3]]);
    },
  },
  {
    id: "scorched-trail",
    label: "Scorched trail",
    biome: "desert",
    tags: ["trail", "harsh", "dunes", "endurance"],
    names: {
      adjectives: ["Blistering", "Sunbaked", "Cracked", "Shadeless", "Longmile", "Dustchoked", "Simmering", "Parched"],
      nouns: ["Trail", "Track", "Slog", "March", "Stretch", "Crossing", "Route", "Miles"],
    },
    blurbs: [
      "The sign at the start just says 'bring water' in four languages.",
      "Shade occurs twice daily and is heavily attended.",
      "A {pokemon} sells route tips at the halfway marker. All tips: 'water'.",
    ],
    paintGround(ctx) {
      fillGround(ctx, "sand");
      // a hardy green verge marks the safe trail through the dunes
      paintPath(ctx.ground, "grass", 0, ctx.rng.range(3, 6), 15, ctx.rng.range(9, 12), 2, ctx.rng);
      paintBlob(ctx.ground, "grass", ctx.rng.range(11, 13), ctx.rng.range(11, 13), 2, ctx.rng);
    },
    decorate(ctx) {
      signSomewhere(ctx);
      scatter(ctx.grid, ctx.ground, ctx.rng, flowerOf(ctx.rng), 0.06);
      addNpc(ctx, NPC_RUNNERS);
      hiddenSomewhere(ctx);
      if (ctx.rng.chance(0.5)) addPokemon(ctx, [POKEMON[1], POKEMON[5]]);
    },
  },
];

// The combined registry (hand-built + generated) lives in registry.ts.
