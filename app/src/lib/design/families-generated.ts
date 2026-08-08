// The generated half of the family registry: hundreds of fixed layout types
// built from a two-level grammar instead of hand-written scene functions.
//
// Level 1 — the FAMILY seed (fixed forever in the committed manifest) rolls
// the skeleton: terrain plan and its constants, theme pack, structure slots,
// decoration profile, name pools. This is what makes a family a recognisable
// "kind of map".
//
// Level 2 — the USER seed varies a design within that skeleton: a dihedral
// frame (mirror/rotate) for the whole ground plan, jitters on every planned
// coordinate, which structure slots fill, densities, flower species, entity
// casting. Two seeds of one family share a skeleton but not a tile grid.
//
// Families constructed here obey the same legality rules as the hand-built
// set (legality.ts) — the manifest search only accepts candidates whose
// probe designs validate clean and stay layout-distinct from every family
// accepted before them.

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
  type NpcVariant,
  type PokemonVariant,
} from "./entities";
import manifest from "./families-generated.manifest.json";
import type { DesignFamily, SceneContext } from "./families";
import {
  findClearSpot,
  hedgeLine,
  isClear,
  longGrassPatch,
  newGround,
  paintBlob,
  paintPath,
  paintRect,
  placeBoulderLine,
  placeDecor,
  placeDome,
  placeHiddenItem,
  placeRockySign,
  placeSign,
  placeStructure,
  scatter,
  STRUCTURES,
  treeBorder,
  treePick,
  type Ground,
  type GroundMap,
} from "./paint";
import { createRng, type Rng } from "./rng";
import { DESIGN_GRID, type BiomeId } from "./types";

// --- dihedral frames ---------------------------------------------------------

type Frame = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7; // id, r90, r180, r270, flipH, flipV, transpose, anti

const LAST = DESIGN_GRID - 1;

function mapPoint(frame: Frame, col: number, row: number): [number, number] {
  switch (frame) {
    case 0: return [col, row];
    case 1: return [LAST - row, col];
    case 2: return [LAST - col, LAST - row];
    case 3: return [row, LAST - col];
    case 4: return [LAST - col, row];
    case 5: return [col, LAST - row];
    case 6: return [row, col];
    case 7: return [LAST - row, LAST - col];
    default: return [col, row];
  }
}

function applyFrame(canonical: GroundMap, frame: Frame, target: GroundMap): void {
  for (let row = 0; row < DESIGN_GRID; row += 1) {
    for (let col = 0; col < DESIGN_GRID; col += 1) {
      const [tc, tr] = mapPoint(frame, col, row);
      target[tr][tc] = canonical[row][col];
    }
  }
}

/** Anchor a wxh upright footprint whose plan-space anchor point maps through
 * the frame: clamp so the footprint stays in bounds. */
function mapAnchor(frame: Frame, col: number, row: number, width: number, height: number): [number, number] {
  const [c, r] = mapPoint(frame, col, row);
  return [
    Math.max(0, Math.min(DESIGN_GRID - width, c - Math.floor(width / 2))),
    Math.max(0, Math.min(DESIGN_GRID - height, r - Math.floor(height / 2))),
  ];
}

// --- theme packs ---------------------------------------------------------------

interface ThemePack {
  id: string;
  biome: BiomeId;
  tags: string[];
  adjectives: string[];
  nouns: string[];
  blurbs: string[];
  npcPools: NpcVariant[][];
  pokemonPools: PokemonVariant[][];
}

const STARTERS = [POKEMON[0], POKEMON[1], POKEMON[2]];
const FIELD_POKEMON = [POKEMON[3], POKEMON[4], POKEMON[5]];

const THEMES: Record<string, ThemePack> = {
  village: {
    id: "village",
    biome: "village",
    tags: ["village", "houses", "cozy"],
    adjectives: ["Littleroot", "Slateport", "Dewberry", "Willowbrook", "Cinderbell", "Marigold", "Fernway", "Bramblewick", "Honeystone", "Cloverfield", "Petalridge", "Mossgate", "Sunhollow", "Wickerlane", "Thistledown", "Larkspur"],
    nouns: ["Hollow", "Commons", "Crossing", "Hamlet", "Green", "Lane", "Steps", "Yard", "Rest", "Square", "Corner", "Row"],
    blurbs: [
      "A village so calm the mail arrives by strolling.",
      "{n} households, one shared ladder, zero arguments about it.",
      "The welcome sign was repainted {n} times this decade — enthusiasm, not vandalism.",
      "The kind of place where a {pokemon} knows everyone's dinnertime.",
    ],
    npcPools: [NPC_VILLAGERS, NPC_VILLAGERS, NPC_RUNNERS],
    pokemonPools: [FIELD_POKEMON, STARTERS],
  },
  fishing: {
    id: "fishing",
    biome: "waterside",
    tags: ["fishing", "water", "calm"],
    adjectives: ["Old Rod", "Stillwater", "Reedsong", "Driftwood", "Perchside", "Lilyshore", "Mistbank", "Baitbox", "Longcast", "Ripplecalm", "Duskbite", "Pebblebed"],
    nouns: ["Landing", "Wharf", "Jetty", "Shallows", "Banks", "Cove", "Pool", "Bend", "Tarn", "Pier"],
    blurbs: [
      "The fish bite best at dawn; the anglers bite back with sandwiches.",
      "Local record: {n} Magikarp in one afternoon, all released with apologies.",
      "A {pokemon} judges every cast from the far bank.",
      "The water is honest here. The fishing stories are not.",
    ],
    npcPools: [NPC_ANGLERS, NPC_ANGLERS, NPC_VILLAGERS],
    pokemonPools: [[POKEMON[2], POKEMON[4]]],
  },
  garden: {
    id: "garden",
    biome: "meadow",
    tags: ["garden", "flowers", "serene"],
    adjectives: ["Serene", "Dappled", "Morninglight", "Whispering", "Dewdrop", "Sunbeam", "Trellised", "Peaceable", "Amberlight", "Quietleaf", "Softstep", "Gentle"],
    nouns: ["Garden", "Terrace", "Arbor", "Walk", "Beds", "Promenade", "Sanctuary", "Grove", "Court", "Parterre"],
    blurbs: [
      "The gravel is raked into perfect lines by somebody nobody has met.",
      "Flowers here arrange themselves by colour out of professional pride.",
      "A meditating {pokemon} has not moved from the centre stone in {n} weeks.",
      "Admission is free; leaving without smelling the roses is impossible.",
    ],
    npcPools: [NPC_VILLAGERS],
    pokemonPools: [[POKEMON[3]], STARTERS],
  },
  farm: {
    id: "farm",
    biome: "meadow",
    tags: ["farm", "berries", "rows"],
    adjectives: ["Oran", "Pecha", "Sitrus", "Leppa", "Rawst", "Lum", "Aspear", "Kelpsy", "Hondew", "Grepa", "Tamato", "Cornn"],
    nouns: ["Orchard", "Acres", "Rows", "Patch", "Fields", "Grange", "Plot", "Farmstead", "Beds", "Harvest"],
    blurbs: [
      "Berry rows planted straighter than any route in Hoenn.",
      "The scarecrow is decorative; the real guard is a {pokemon} with opinions.",
      "Harvest festival happens whenever the {n}th row ripens.",
      "Soil so good the weeds apologise before sprouting.",
    ],
    npcPools: [NPC_VILLAGERS],
    pokemonPools: [[POKEMON[5], POKEMON[1]]],
  },
  ranch: {
    id: "ranch",
    biome: "meadow",
    tags: ["ranch", "grazing", "fences"],
    adjectives: ["Zigzag", "Longhorn", "Sunnyside", "Freerange", "Meadowlark", "Taillow", "Saddleback", "Broadfield", "Galloping", "Drover's", "Windmill", "Openair"],
    nouns: ["Ranch", "Paddock", "Pastures", "Run", "Stables", "Grazing", "Homestead", "Meadows", "Yards", "Range"],
    blurbs: [
      "The hedges keep nothing in — the residents just like it here.",
      "{n} Pokémon graze these paddocks; all answer to the dinner bell.",
      "A {pokemon} holds the record for most escapes never attempted.",
      "Fence maintenance is constant. Fence necessity is debated.",
    ],
    npcPools: [NPC_VILLAGERS, NPC_RUNNERS],
    pokemonPools: [POKEMON, FIELD_POKEMON],
  },
  meadow: {
    id: "meadow",
    biome: "meadow",
    tags: ["wild", "long-grass", "gentle"],
    adjectives: ["Fluttering", "Nectar", "Drifting", "Shimmerwing", "Petalstorm", "Rustling", "Teeming", "Roaming", "Trembling", "Windswept", "Honeyed", "Bumbling"],
    nouns: ["Fields", "Meadow", "Prairie", "Blooms", "Flats", "Expanse", "Sway", "Acres", "Wilds", "Range"],
    blurbs: [
      "In late spring the pollen here is visible from the next route over.",
      "Rangers count {n} rustles per minute on a calm day.",
      "A {pokemon} naps in the tall grass and hums when it dreams.",
      "Bring Poké Balls. The grass is tall and so are the odds.",
    ],
    npcPools: [NPC_RUNNERS, NPC_VILLAGERS],
    pokemonPools: [POKEMON, FIELD_POKEMON, STARTERS],
  },
  forest: {
    id: "forest",
    biome: "forest",
    tags: ["forest", "forest-wall", "shaded"],
    adjectives: ["Mossgrown", "Elder", "Sundappled", "Deeproot", "Fernshade", "Canopy", "Owlwatch", "Larchlight", "Understory", "Rooted", "Silent", "Old-growth"],
    nouns: ["Grove", "Glade", "Clearing", "Hollow", "Wood", "Thicket", "Refuge", "Ring", "Heart", "Boughs"],
    blurbs: [
      "The trees grew around this spot respectfully, as if asked.",
      "Only one gap in the treeline — and it moves every spring.",
      "Offerings left overnight vanish by morning. Tooth marks suggest gratitude.",
      "A {pokemon} tends this place, or possibly haunts it. Reviews vary.",
    ],
    npcPools: [NPC_MYSTERIOUS, NPC_VILLAGERS],
    pokemonPools: [FOREST_SPIRITS, FIELD_POKEMON],
  },
  spooky: {
    id: "spooky",
    biome: "forest",
    tags: ["spooky", "secret", "forest-wall"],
    adjectives: ["Gnarled", "Midnight", "Crooked", "Shivering", "Moonlit", "Creaking", "Pale", "Whispering", "Hollowed", "Lanternless", "Cobwebbed", "Wailing"],
    nouns: ["Hollow", "Shadows", "Tangle", "Dark", "Boughs", "Grove", "Mire", "Warren", "Reach", "Gloom"],
    blurbs: [
      "The trees creak in a language nobody wants translated.",
      "Lanterns brought in here burn {n} shades bluer.",
      "Something follows visitors to the edge, then politely stops.",
      "A {pokemon} is said to keep the paths honest after dark.",
    ],
    npcPools: [NPC_MYSTERIOUS],
    pokemonPools: [[POKEMON[3]], FOREST_SPIRITS],
  },
  lakeside: {
    id: "lakeside",
    biome: "waterside",
    tags: ["lake", "water", "shore"],
    adjectives: ["Glasswater", "Silverbrook", "Clearspring", "Coldwell", "Brookside", "Freshet", "Purling", "Troutbeck", "Skimming", "Mirrorcalm", "Reedfringe", "Duskwater"],
    nouns: ["Springs", "Pools", "Waters", "Shore", "Weir", "Channels", "Terraces", "Lagoon", "Basin", "Narrows"],
    blurbs: [
      "The spring water is so clear that fish appear to be flying.",
      "Gardeners measure success in ripples per minute.",
      "A {pokemon} inspects the lily pads daily and approves most of them.",
      "The lake has returned {n} lost bikes, none to their owners.",
    ],
    npcPools: [NPC_ANGLERS, NPC_VILLAGERS],
    pokemonPools: [[POKEMON[2], POKEMON[3], POKEMON[4]]],
  },
  coast: {
    id: "coast",
    biome: "waterside",
    tags: ["coast", "sand", "waves"],
    adjectives: ["Saltspray", "Longwave", "Tidechart", "Spyglass", "Bluewater", "Whalesong", "Horizon", "Gullcry", "Openreach", "Seafoam", "Driftline", "Shellgrit"],
    nouns: ["Shore", "Bluff", "Point", "Vigil", "Head", "Strand", "Reach", "Watch", "Overlook", "Sands"],
    blurbs: [
      "The waves practise their timing here. Sets of seven.",
      "Wailord sightings: {n} confirmed, 200 hopeful.",
      "A resident {pokemon} announces every splash, including its own.",
      "Sand in the boots is the entry fee. Nobody minds.",
    ],
    npcPools: [NPC_ANGLERS, NPC_RUNNERS],
    pokemonPools: [[POKEMON[4]], [POKEMON[2], POKEMON[4]]],
  },
  island: {
    id: "island",
    biome: "waterside",
    tags: ["island", "isolated", "secret"],
    adjectives: ["Lonely", "Castaway", "Bottlecap", "Faraway", "One-Tree", "Sandollar", "Forgotten", "Pocket", "Wavelocked", "Lastlight", "Compassless", "Ninefoam"],
    nouns: ["Isle", "Atoll", "Islet", "Key", "Sandbar", "Speck", "Outcrop", "Refuge", "Perch", "Haven"],
    blurbs: [
      "Population: one tree, one secret, occasional Wingull.",
      "Maps disagree about this island's existence. The island doesn't care.",
      "A message in a bottle washed up asking for {n} more bottles.",
      "A {pokemon} swims a lap around it daily, for the principle.",
    ],
    npcPools: [],
    pokemonPools: [[POKEMON[4], POKEMON[2]]],
  },
  desert: {
    id: "desert",
    biome: "desert",
    tags: ["dunes", "sand", "harsh"],
    adjectives: ["Shifting", "Sunstruck", "Endless", "Glimmering", "Vanishing", "Restless", "Blistering", "Cracked", "Longmile", "Parched", "Whistling", "Mirage-lit"],
    nouns: ["Dunes", "Sands", "Wastes", "Drifts", "Expanse", "Trail", "Slog", "Crossing", "Miles", "Horizon"],
    blurbs: [
      "The dunes rearrange nightly. The hidden cache does not.",
      "Compass needles here point at whatever they find interesting.",
      "Shade occurs twice daily and is heavily attended.",
      "A {pokemon} sells route tips at the halfway marker. All tips: 'water'.",
    ],
    npcPools: [NPC_RUNNERS, NPC_MYSTERIOUS],
    pokemonPools: [[POKEMON[3], POKEMON[5]]],
  },
  cave: {
    id: "cave",
    biome: "mountain",
    tags: ["cave", "rocky", "deep"],
    adjectives: ["Origin", "Emerald", "Tempest", "Primal", "Everlast", "Skyborn", "Thunderous", "Regal", "Hollowed", "Echoing", "Stalwart", "Deepstone"],
    nouns: ["Cavern", "Maw", "Sanctum", "Vault", "Depths", "Gate", "Antechamber", "Throne", "Descent", "Chambers"],
    blurbs: [
      "The air pressure changes when you say certain names out loud.",
      "Seismographs three towns away point at this cave and sulk.",
      "Legends say a {pokemon} guards the mouth. Legends undersell it.",
      "Echoes here answer {n} seconds late, and sometimes early.",
    ],
    npcPools: [NPC_MYSTERIOUS],
    pokemonPools: [LEGENDARIES, [POKEMON[5]]],
  },
  quarry: {
    id: "quarry",
    biome: "mountain",
    tags: ["mining", "rocky", "industrial"],
    adjectives: ["Rubble", "Pickaxe", "Deepvein", "Orebound", "Granite", "Chiseled", "Hardhat", "Dusty", "Two-Shift", "Corestone", "Splitrock", "Gravelly"],
    nouns: ["Quarry", "Digs", "Pit", "Claim", "Shaft", "Workings", "Cut", "Excavation", "Terraces", "Benches"],
    blurbs: [
      "Every rock here has been tapped twice and apologised to once.",
      "The foreman insists there's treasure {n} feet down. There is gravel.",
      "A {pokemon} keeps stealing the shiniest ore. Morale is complicated.",
      "Lunch whistle echoes for a full minute. Nobody moves faster for it.",
    ],
    npcPools: [NPC_VILLAGERS, NPC_MYSTERIOUS],
    pokemonPools: [[POKEMON[5]]],
  },
  hideout: {
    id: "hideout",
    biome: "mountain",
    tags: ["villains", "secret", "rocky"],
    adjectives: ["Smokestack", "Blacklist", "Lowlight", "Backdoor", "Offgrid", "Grifter", "Crooked", "Undercover", "Password-Only", "Moonless", "Twoface", "Silent-Partner"],
    nouns: ["Hideout", "Den", "Front", "Safehouse", "Stash", "Outpost", "Lair", "Racket", "Dropoff", "Cache"],
    blurbs: [
      "Officially this is a mushroom farm. The mushrooms wear uniforms.",
      "Grunts rotate lookout duty every {n} hours and complain every minute.",
      "The password changes daily. It is always the boss's {pokemon}'s name.",
      "The barricade has one gap. It is guarded by reputation.",
    ],
    npcPools: [NPC_MYSTERIOUS, NPC_MYSTERIOUS],
    pokemonPools: [[POKEMON[5]]],
  },
  summit: {
    id: "summit",
    biome: "mountain",
    tags: ["summit", "view", "rocky"],
    adjectives: ["Skyline", "Cloudbrush", "Vantage", "Aerie", "Topmost", "Farview", "Highmark", "Overlook", "Thinair", "First-Light", "Weatherworn", "Crowning"],
    nouns: ["Lookout", "Summit", "Peak", "Crown", "Perch", "Watch", "Height", "Point", "Shoulder", "Cairns"],
    blurbs: [
      "On a clear day you can see {n} routes and one embarrassed Wingull.",
      "The summit log book is mostly drawings of clouds.",
      "A stationed {pokemon} rates every sunrise. Today: 9/10.",
      "The wind files formal complaints about hikers' hats.",
    ],
    npcPools: [NPC_RUNNERS, NPC_VILLAGERS],
    pokemonPools: [[POKEMON[4]]],
  },
  ruin: {
    id: "ruin",
    biome: "mountain",
    tags: ["ruins", "ancient", "rocky"],
    adjectives: ["Sunblasted", "Half-buried", "Glyphic", "Weathered", "Toppled", "Regi", "Crumbled", "Kingless", "Unlettered", "Moss-sealed", "Fallen", "Patient"],
    nouns: ["Ruin", "Colonnade", "Monument", "Foundation", "Walls", "Chambers", "Rubble", "Court", "Plinths", "Remnants"],
    blurbs: [
      "Archaeologists dated the ruins to 'very old' and went for lunch.",
      "The braille on the far wall spells out a {n}-step dance.",
      "A napping {pokemon} is the only thing holding one pillar up.",
      "Whatever fell here fell tidily. Suspiciously tidily.",
    ],
    npcPools: [NPC_MYSTERIOUS],
    pokemonPools: [[POKEMON[3], POKEMON[5]], LEGENDARIES],
  },
};

// --- terrain planners ---------------------------------------------------------

interface Plan {
  terrain: string;
  themeId: string;
  waterFallback?: Ground;
  /** Paint the canonical (pre-frame) ground. Seed rng drives jitters. */
  paint(ground: GroundMap, rng: Rng): void;
  /** Decorate after baking; landmark coords go through the frame. */
  decorate(ctx: SceneContext, frame: Frame, rng: Rng): void;
}

interface PlannerDef {
  terrain: string;
  weight: number;
  themes: string[];
  build(famRng: Rng, themeId: string): Omit<Plan, "themeId" | "terrain">;
}

// Shared decoration helpers -----------------------------------------------------

const flowerOf = (rng: Rng) => rng.pick(["flower-1", "flower-2", "flower-3"] as const);

function addEntities(ctx: SceneContext, theme: ThemePack, rng: Rng, npcRange: [number, number], pokeRange: [number, number]) {
  const spotFor = () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const spot = findClearSpot(ctx.grid, ctx.ground, rng, { margin: 2 });
      if (!spot) return null;
      if (!ctx.entities.some((entity) => entity.col === spot.col && entity.row === spot.row)) return spot;
    }
    return null;
  };
  const npcs = theme.npcPools.length ? rng.range(npcRange[0], npcRange[1]) : 0;
  for (let index = 0; index < npcs; index += 1) {
    const spot = spotFor();
    if (spot) ctx.entities.push(npcEntity(rng, rng.pick(theme.npcPools), spot.col, spot.row));
  }
  const pokes = theme.pokemonPools.length ? rng.range(pokeRange[0], pokeRange[1]) : 0;
  for (let index = 0; index < pokes; index += 1) {
    const spot = spotFor();
    if (spot) ctx.entities.push(pokemonEntity(rng, spot.col, spot.row, rng.pick(theme.pokemonPools)));
  }
}

function hiddenSomewhere(ctx: SceneContext, rng: Rng) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const spot = findClearSpot(ctx.grid, ctx.ground, rng, { allowGround: ["grass", "rocky"], margin: 1 });
    if (!spot) return;
    if (ctx.entities.some((entity) => entity.col === spot.col && entity.row === spot.row)) continue;
    placeHiddenItem(ctx.grid, ctx.ground, spot.col, spot.row);
    return;
  }
}

/** Try to place count buildings from a shuffled slot list (plan-space
 * anchors), drawing each building's kind from the family's palette. */
function placeBuildings(
  ctx: SceneContext,
  frame: Frame,
  rng: Rng,
  slots: ReadonlyArray<readonly [number, number]>,
  count: number,
  kinds: readonly string[] = ["house-red"],
): number {
  let placed = 0;
  for (const [col, row] of rng.shuffle(slots)) {
    if (placed >= count) break;
    const kind = STRUCTURES[rng.pick(kinds)] ?? STRUCTURES["house-red"];
    const [c, r] = mapAnchor(frame, col, row, kind.width, kind.height);
    if (placeStructure(ctx.grid, ctx.ground, c, r, kind.id)) placed += 1;
  }
  return placed;
}

/** Family-fixed building palette: which building types this layout uses.
 * Weighted toward the classic red house; civic buildings appear in a
 * minority of families so each one stays a landmark. */
function pickBuildingSet(famRng: Rng, themeId: string): string[] {
  const civic = ["pokecenter", "pokemart", "contest-hall", "tower-white"];
  if (themeId === "village") {
    const set = ["house-red"];
    if (famRng.chance(0.55)) set.push(famRng.pick(civic));
    if (famRng.chance(0.25)) set.push(famRng.pick(civic));
    return set;
  }
  if (themeId === "fishing") return famRng.chance(0.4) ? ["house-red", "tower-white"] : ["house-red"];
  if (themeId === "farm" || themeId === "ranch") return famRng.chance(0.45) ? ["house-red", "lodge-log"] : ["house-red"];
  if (themeId === "forest" || themeId === "spooky") return ["lodge-log", "house-red"];
  if (themeId === "garden") return famRng.chance(0.3) ? ["house-red", "contest-hall"] : ["house-red"];
  return ["house-red"];
}

function placeDomes(ctx: SceneContext, frame: Frame, rng: Rng, slots: ReadonlyArray<readonly [number, number]>, count: number): number {
  let placed = 0;
  for (const [col, row] of rng.shuffle(slots)) {
    if (placed >= count) break;
    const [c, r] = mapAnchor(frame, col, row, 3, 3);
    if (placeDome(ctx.grid, ctx.ground, c, r)) placed += 1;
  }
  return placed;
}

// House slot grids in plan space (anchor points, roughly centred on the spot).
const HOUSE_SLOTS: ReadonlyArray<readonly [number, number]> = [
  [2, 2], [7, 2], [12, 2], [2, 7], [12, 7], [2, 12], [7, 12], [12, 12],
];
const DOME_SLOTS: ReadonlyArray<readonly [number, number]> = [
  [2, 2], [7, 2], [12, 2], [2, 8], [12, 8], [7, 12],
];

// Planner catalogue --------------------------------------------------------------

const PLANNERS: PlannerDef[] = [
  {
    terrain: "crossroads",
    weight: 10,
    themes: ["village", "garden", "farm"],
    build(famRng, themeId) {
      const kind: Ground = famRng.chance(0.45) ? "road" : "path";
      const crossCol = famRng.range(4, 11);
      const crossRow = famRng.range(4, 11);
      const widthA = famRng.pick([1, 2, 2]);
      const widthB = famRng.pick([1, 2]);
      const plaza = famRng.chance(0.4);
      const houseCount: [number, number] = [famRng.range(1, 2), famRng.range(2, 3)];
      const flowers = 0.03 + famRng.next() * 0.09;
      const hedge = famRng.chance(0.5);
      const buildings = pickBuildingSet(famRng, themeId);
      return {
        paint(ground, rng) {
          const jc = Math.max(2, Math.min(13, crossCol + rng.range(-1, 1)));
          const jr = Math.max(2, Math.min(13, crossRow + rng.range(-1, 1)));
          paintPath(ground, kind, jc, 0, jc, 15, widthA, rng);
          paintPath(ground, kind, 0, jr, 15, jr, widthB, rng);
          if (plaza) paintRect(ground, kind, Math.max(0, jc - 2), Math.max(0, jr - 2), 5, 5);
        },
        decorate(ctx, frame, rng) {
          const theme = THEMES[themeId] ?? THEMES.village;
          placeBuildings(ctx, frame, rng, HOUSE_SLOTS, rng.range(houseCount[0], houseCount[1]), buildings);
          scatter(ctx.grid, ctx.ground, rng, [flowerOf(rng)], flowers + rng.next() * 0.04);
          if (hedge && rng.chance(0.8)) {
            const [x1, y1] = mapPoint(frame, 0, 15);
            const [x2, y2] = mapPoint(frame, 15, 15);
            hedgeLine(ctx.grid, ctx.ground, x1, y1, x2, y2, { gapAt: rng.range(3, 12) });
          }
          const signSpot = findClearSpot(ctx.grid, ctx.ground, rng, { allowGround: ["grass"], margin: 2 });
          if (signSpot) placeSign(ctx.grid, ctx.ground, signSpot.col, signSpot.row);
          if (rng.chance(0.5)) hiddenSomewhere(ctx, rng);
          addEntities(ctx, theme, rng, [1, 3], [0, 1]);
        },
      };
    },
  },
  {
    terrain: "ring",
    weight: 6,
    themes: ["village", "garden"],
    build(famRng, themeId) {
      const kind: Ground = famRng.chance(0.35) ? "road" : "path";
      const inset = famRng.range(2, 4);
      const stem = famRng.pick([0, 1, 2, 3]);
      const houseInside = famRng.chance(0.6);
      const flowers = 0.05 + famRng.next() * 0.12;
      const buildings = pickBuildingSet(famRng, themeId);
      return {
        paint(ground, rng) {
          const jitter = rng.range(-1, 0);
          const lo = Math.max(1, inset + jitter);
          const hi = 15 - lo;
          paintPath(ground, kind, lo, lo, hi, lo, 1, rng);
          paintPath(ground, kind, lo, hi, hi, hi, 1, rng);
          paintPath(ground, kind, lo, lo, lo, hi, 1, rng);
          paintPath(ground, kind, hi, lo, hi, hi, 1, rng);
          const mid = rng.range(6, 9);
          if (stem === 0) paintPath(ground, kind, mid, 0, mid, lo, 1, rng);
          if (stem === 1) paintPath(ground, kind, mid, hi, mid, 15, 1, rng);
          if (stem === 2) paintPath(ground, kind, 0, mid, lo, mid, 1, rng);
          if (stem === 3) paintPath(ground, kind, hi, mid, 15, mid, 1, rng);
        },
        decorate(ctx, frame, rng) {
          const theme = THEMES[themeId] ?? THEMES.garden;
          const slots = houseInside ? ([[7, 6], [7, 9]] as const) : HOUSE_SLOTS;
          placeBuildings(ctx, frame, rng, slots, rng.range(1, 2), buildings);
          scatter(ctx.grid, ctx.ground, rng, [flowerOf(rng)], flowers);
          if (rng.chance(0.6)) {
            longGrassPatch(ctx.grid, ctx.ground, rng, rng.range(3, 12), rng.range(3, 12), rng.range(2, 3));
          }
          hiddenSomewhere(ctx, rng);
          addEntities(ctx, theme, rng, [1, 2], [0, 2]);
        },
      };
    },
  },
  {
    terrain: "meadow",
    weight: 9,
    themes: ["meadow", "ranch", "garden", "farm"],
    build(famRng, themeId) {
      const trail = famRng.chance(0.6);
      const trailKind: Ground = famRng.chance(0.5) ? "dirt" : "path";
      const trailRow = famRng.range(4, 11);
      const grassPatches = famRng.range(1, 3);
      const flowers = 0.06 + famRng.next() * 0.2;
      const trees = famRng.next() * 0.08;
      const shrubs = famRng.next() * 0.1;
      const hedges = famRng.chance(0.45);
      const hedgeRows: ReadonlyArray<number> = famRng.chance(0.5) ? [5, 10] : [6, 12];
      const berryRows = famRng.chance(0.3);
      const buildings = pickBuildingSet(famRng, themeId);
      return {
        paint(ground, rng) {
          if (trail) {
            const wobble = rng.range(-2, 2);
            paintPath(ground, trailKind, 0, trailRow + wobble, 15, Math.max(1, Math.min(14, trailRow - wobble)), 1, rng);
          }
        },
        decorate(ctx, frame, rng) {
          const theme = THEMES[themeId] ?? THEMES.meadow;
          if (theme.id === "ranch" || theme.id === "farm") {
            placeBuildings(ctx, frame, rng, HOUSE_SLOTS, rng.range(0, 1), buildings);
          }
          if (hedges) {
            for (const row of hedgeRows) {
              const [x1, y1] = mapPoint(frame, 0, row);
              const [x2, y2] = mapPoint(frame, 15, row);
              hedgeLine(ctx.grid, ctx.ground, x1, y1, x2, y2, { gapAt: rng.range(3, 12) });
            }
          }
          if (berryRows) {
            for (let row = 8; row <= 13; row += rng.pick([2, 3])) {
              for (let col = 1; col <= 14; col += 2) {
                const [c, r] = mapPoint(frame, col, row);
                if (isClear(ctx.grid, ctx.ground, c, r) && ctx.ground[r][c] === "grass") {
                  placeDecor(ctx.grid, c, r, "shrub-1", { solid: true, feature: "berry-bush" });
                }
              }
            }
          } else if (shrubs > 0.02) {
            scatter(ctx.grid, ctx.ground, rng, ["shrub-1"], shrubs, { solid: true, feature: "hedge" });
          }
          for (let index = 0; index < grassPatches; index += 1) {
            longGrassPatch(ctx.grid, ctx.ground, rng, rng.range(2, 13), rng.range(2, 13), rng.range(2, 4));
          }
          scatter(ctx.grid, ctx.ground, rng, [flowerOf(rng)], flowers * (0.7 + rng.next() * 0.6));
          if (trees > 0.015) {
            scatter(ctx.grid, ctx.ground, rng, [treePick(rng), treePick(rng)], trees, { solid: true, feature: "tree" });
          }
          if (rng.chance(0.5)) hiddenSomewhere(ctx, rng);
          addEntities(ctx, theme, rng, [0, 2], [1, 2]);
        },
      };
    },
  },
  {
    terrain: "lake",
    weight: 8,
    themes: ["fishing", "lakeside", "village", "ranch"],
    build(famRng, themeId) {
      const lakes = famRng.range(1, 2);
      const centres = [
        [famRng.range(3, 12), famRng.range(3, 12)],
        [famRng.range(3, 12), famRng.range(3, 12)],
      ] as const;
      const radii = [famRng.range(2, 5), famRng.range(2, 3)] as const;
      const shorePath = famRng.chance(0.7);
      const pathKind: Ground = famRng.chance(0.6) ? "path" : "dirt";
      const flowers = 0.03 + famRng.next() * 0.08;
      const buildings = pickBuildingSet(famRng, themeId);
      return {
        paint(ground, rng) {
          for (let index = 0; index < lakes; index += 1) {
            paintBlob(
              ground,
              "water",
              Math.max(2, Math.min(13, centres[index][0] + rng.range(-1, 1))),
              Math.max(2, Math.min(13, centres[index][1] + rng.range(-1, 1))),
              radii[index],
              rng,
            );
          }
          if (shorePath) {
            paintPath(ground, pathKind, rng.range(0, 3), 15, rng.range(2, 6), rng.range(8, 12), 1, rng);
          }
        },
        decorate(ctx, frame, rng) {
          const theme = THEMES[themeId] ?? THEMES.lakeside;
          if (theme.id === "village" || rng.chance(0.4)) {
            placeBuildings(ctx, frame, rng, HOUSE_SLOTS, rng.range(1, 2), buildings);
          }
          scatter(ctx.grid, ctx.ground, rng, [flowerOf(rng)], flowers);
          scatter(ctx.grid, ctx.ground, rng, ["shrub-1"], rng.next() * 0.06, { solid: true, feature: "hedge" });
          if (rng.chance(0.4)) {
            scatter(ctx.grid, ctx.ground, rng, [treePick(rng)], 0.03 + rng.next() * 0.04, { solid: true, feature: "tree" });
          }
          const signSpot = findClearSpot(ctx.grid, ctx.ground, rng, { allowGround: ["grass"], margin: 2 });
          if (signSpot && rng.chance(0.7)) placeSign(ctx.grid, ctx.ground, signSpot.col, signSpot.row);
          addEntities(ctx, theme, rng, [1, 2], [0, 2]);
        },
      };
    },
  },
  {
    terrain: "river",
    weight: 7,
    themes: ["lakeside", "village", "forest", "fishing"],
    build(famRng, themeId) {
      const riverPos = famRng.range(5, 10);
      const riverWidth = famRng.pick([2, 3]);
      const bridgePos = famRng.range(5, 10);
      const bridgeKind: Ground = famRng.chance(0.6) ? "road" : "path";
      const doubleBridge = famRng.chance(0.25);
      const flowers = 0.03 + famRng.next() * 0.07;
      const trees = famRng.next() * 0.09;
      const buildings = pickBuildingSet(famRng, themeId);
      return {
        paint(ground, rng) {
          const pos = Math.max(2, Math.min(12, riverPos + rng.range(-1, 1)));
          paintRect(ground, "water", pos, 0, riverWidth, DESIGN_GRID);
          const bridge = Math.max(1, Math.min(13, bridgePos + rng.range(-1, 1)));
          paintRect(ground, bridgeKind, 0, bridge, DESIGN_GRID, rng.pick([1, 2]));
          if (doubleBridge) {
            const second = bridge > 8 ? rng.range(2, 5) : rng.range(10, 13);
            paintRect(ground, bridgeKind, 0, second, DESIGN_GRID, 1);
          }
        },
        decorate(ctx, frame, rng) {
          const theme = THEMES[themeId] ?? THEMES.lakeside;
          if (theme.id === "village") placeBuildings(ctx, frame, rng, HOUSE_SLOTS, rng.range(1, 2), buildings);
          if (trees > 0.02) scatter(ctx.grid, ctx.ground, rng, [treePick(rng), treePick(rng)], trees, { solid: true, feature: "tree" });
          scatter(ctx.grid, ctx.ground, rng, [flowerOf(rng)], flowers);
          const signSpot = findClearSpot(ctx.grid, ctx.ground, rng, { allowGround: ["grass"], margin: 2 });
          if (signSpot && rng.chance(0.6)) placeSign(ctx.grid, ctx.ground, signSpot.col, signSpot.row);
          if (rng.chance(0.5)) hiddenSomewhere(ctx, rng);
          addEntities(ctx, theme, rng, [1, 2], [0, 1]);
        },
      };
    },
  },
  {
    terrain: "coast",
    weight: 6,
    themes: ["coast", "fishing"],
    build(famRng, themeId) {
      const seaRows = famRng.range(4, 7);
      const beachRows = famRng.range(2, 3);
      const grassPath = famRng.chance(0.5);
      const flowers = 0.02 + famRng.next() * 0.05;
      const coastBuildings = famRng.chance(0.4) ? ["tower-white", "house-red"] : ["house-red"];
      return {
        waterFallback: "sand" as Ground,
        paint(ground, rng) {
          const sea = Math.max(3, Math.min(8, seaRows + rng.range(-1, 1)));
          for (let row = 0; row < sea; row += 1) {
            for (let col = 0; col < DESIGN_GRID; col += 1) ground[row][col] = "water";
          }
          paintRect(ground, "sand", 0, sea, DESIGN_GRID, beachRows);
          if (grassPath) {
            paintPath(ground, "path", rng.range(2, 13), sea + beachRows + 1, rng.range(2, 13), 15, 1, rng);
          }
        },
        decorate(ctx, frame, rng) {
          const theme = THEMES[themeId] ?? THEMES.coast;
          scatter(ctx.grid, ctx.ground, rng, [treePick(rng)], 0.02 + rng.next() * 0.04, { solid: true, feature: "tree" });
          scatter(ctx.grid, ctx.ground, rng, [flowerOf(rng)], flowers);
          const signSpot = findClearSpot(ctx.grid, ctx.ground, rng, { allowGround: ["grass"], margin: 2 });
          if (signSpot && rng.chance(0.6)) placeSign(ctx.grid, ctx.ground, signSpot.col, signSpot.row);
          if (rng.chance(0.4)) {
            placeBuildings(ctx, frame, rng, [[3, 12], [8, 12], [12, 12]] as const, 1, coastBuildings);
          }
          addEntities(ctx, theme, rng, [1, 2], [1, 2]);
        },
      };
    },
  },
  {
    terrain: "island",
    weight: 4,
    themes: ["island"],
    build(famRng, themeId) {
      const sandRadius = famRng.range(3, 5);
      const grassRadius = famRng.pick([2, 2.5, 3]) as number;
      const offCentre = famRng.range(-2, 2);
      const twin = famRng.chance(0.25);
      return {
        waterFallback: "sand" as Ground,
        paint(ground, rng) {
          for (let row = 0; row < DESIGN_GRID; row += 1) {
            for (let col = 0; col < DESIGN_GRID; col += 1) ground[row][col] = "water";
          }
          const cx = 8 + offCentre + rng.range(-1, 1);
          const cy = 8 + rng.range(-1, 1);
          paintBlob(ground, "sand", cx, cy, sandRadius, rng);
          paintBlob(ground, "grass", cx, cy - 1, grassRadius, rng);
          if (twin) {
            paintBlob(ground, "sand", Math.max(2, Math.min(13, cx + rng.pick([-5, 5]))), Math.max(2, Math.min(13, cy + rng.pick([-4, 4]))), 2, rng);
          }
        },
        decorate(ctx, frame, rng) {
          const theme = THEMES.island;
          const treeSpot = findClearSpot(ctx.grid, ctx.ground, rng, { allowGround: ["grass"], margin: 3 });
          if (treeSpot) placeDecor(ctx.grid, treeSpot.col, treeSpot.row, treePick(rng), { solid: true, feature: "tree" });
          scatter(ctx.grid, ctx.ground, rng, [flowerOf(rng)], 0.06 + rng.next() * 0.08);
          hiddenSomewhere(ctx, rng);
          if (rng.chance(0.8)) addEntities(ctx, theme, rng, [0, 0], [1, 1]);
        },
      };
    },
  },
  {
    terrain: "dunes",
    weight: 5,
    themes: ["desert"],
    build(famRng, themeId) {
      const pockets = famRng.range(1, 3);
      const verge = famRng.chance(0.5);
      const flowers = famRng.next() * 0.05;
      return {
        paint(ground, rng) {
          for (let row = 0; row < DESIGN_GRID; row += 1) {
            for (let col = 0; col < DESIGN_GRID; col += 1) ground[row][col] = "sand";
          }
          for (let index = 0; index < pockets; index += 1) {
            paintBlob(ground, "grass", rng.range(3, 12), rng.range(3, 12), rng.range(1, 2) + 1, rng);
          }
          if (verge) {
            paintPath(ground, "grass", 0, rng.range(3, 12), 15, rng.range(3, 12), 2, rng);
          }
        },
        decorate(ctx, frame, rng) {
          const theme = THEMES.desert;
          scatter(ctx.grid, ctx.ground, rng, [flowerOf(rng)], 0.1 + flowers);
          if (rng.chance(0.4)) {
            const spot = findClearSpot(ctx.grid, ctx.ground, rng, { allowGround: ["grass"], margin: 2 });
            if (spot) placeDecor(ctx.grid, spot.col, spot.row, "tree-1", { solid: true, feature: "palm" });
          }
          hiddenSomewhere(ctx, rng);
          if (rng.chance(0.6)) hiddenSomewhere(ctx, rng);
          const signSpot = findClearSpot(ctx.grid, ctx.ground, rng, { allowGround: ["grass"], margin: 2 });
          if (signSpot && rng.chance(0.5)) placeSign(ctx.grid, ctx.ground, signSpot.col, signSpot.row);
          addEntities(ctx, theme, rng, [0, 1], [0, 1]);
        },
      };
    },
  },
  {
    terrain: "oasis",
    weight: 3,
    themes: ["desert"],
    build(famRng, themeId) {
      const grassRadius = famRng.range(3, 5);
      const waterRadius = famRng.pick([1.6, 2, 2.4]) as number;
      const palms = 0.12 + famRng.next() * 0.18;
      return {
        paint(ground, rng) {
          for (let row = 0; row < DESIGN_GRID; row += 1) {
            for (let col = 0; col < DESIGN_GRID; col += 1) ground[row][col] = "sand";
          }
          const cx = 8 + rng.range(-2, 2);
          const cy = 8 + rng.range(-2, 2);
          paintBlob(ground, "grass", cx, cy, grassRadius, rng);
          paintBlob(ground, "water", cx, cy, waterRadius, rng);
        },
        decorate(ctx, frame, rng) {
          const theme = THEMES.desert;
          scatter(ctx.grid, ctx.ground, rng, ["tree-1"], palms, { solid: true, feature: "palm" });
          scatter(ctx.grid, ctx.ground, rng, [flowerOf(rng)], 0.04 + rng.next() * 0.06);
          hiddenSomewhere(ctx, rng);
          addEntities(ctx, theme, rng, [0, 1], [0, 1]);
        },
      };
    },
  },
  {
    terrain: "clearing",
    weight: 8,
    themes: ["forest", "spooky", "village"],
    build(famRng, themeId) {
      const thickness = famRng.pick([2, 2, 3]);
      const gapChance = 0.03 + famRng.next() * 0.12;
      const innerTrees = famRng.next() * 0.3;
      const trailKind: Ground = famRng.chance(0.6) ? "dirt" : "path";
      const trail = famRng.pick(["stem", "cross", "wander", "none"]);
      const shrine = famRng.chance(0.3);
      const flowers = famRng.next() * 0.12;
      const buildings = pickBuildingSet(famRng, themeId);
      return {
        paint(ground, rng) {
          if (trail === "stem") {
            paintPath(ground, trailKind, 8 + rng.range(-2, 2), 15, 8 + rng.range(-2, 2), rng.range(6, 9), 1, rng);
          } else if (trail === "cross") {
            paintPath(ground, trailKind, 0, rng.range(6, 9), 15, rng.range(6, 9), 1, rng);
            paintPath(ground, trailKind, rng.range(6, 9), 0, rng.range(6, 9), 15, 1, rng);
          } else if (trail === "wander") {
            let col = rng.range(2, 13);
            for (let row = 15; row >= 1; row -= 1) {
              ground[row][col] = trailKind;
              const next = Math.max(1, Math.min(14, col + rng.range(-1, 1)));
              if (next !== col) ground[row][next] = trailKind;
              col = next;
            }
          }
        },
        decorate(ctx, frame, rng) {
          const theme = THEMES[themeId] ?? THEMES.forest;
          treeBorder(ctx.grid, ctx.ground, rng, { thickness, gapChance });
          if (innerTrees > 0.05) {
            scatter(ctx.grid, ctx.ground, rng, [treePick(rng), treePick(rng), treePick(rng)], innerTrees, {
              solid: true,
              feature: theme.id === "spooky" ? "forest-wall" : "tree",
            });
          }
          if (shrine) {
            const ring = [[6, 6], [8, 5], [10, 6], [11, 8], [10, 10], [6, 10], [5, 8]] as const;
            for (const [col, row] of ring) {
              const [c, r] = mapPoint(frame, col, row);
              if (isClear(ctx.grid, ctx.ground, c, r) && ctx.ground[r][c] === "grass") {
                placeDecor(ctx.grid, c, r, "shrub-1", { solid: true, feature: "shrine-hedge" });
              }
            }
            const [hc, hr] = mapPoint(frame, 8, 8);
            placeHiddenItem(ctx.grid, ctx.ground, hc, hr);
          }
          if (theme.id === "village") placeBuildings(ctx, frame, rng, [[7, 4], [4, 7], [10, 7]] as const, 1, buildings);
          scatter(ctx.grid, ctx.ground, rng, [flowerOf(rng)], flowers);
          if (rng.chance(0.5)) {
            longGrassPatch(ctx.grid, ctx.ground, rng, rng.range(4, 11), rng.range(4, 11), rng.range(2, 3));
          }
          hiddenSomewhere(ctx, rng);
          addEntities(ctx, theme, rng, [0, 1], [0, 2]);
        },
      };
    },
  },
  {
    terrain: "rocky",
    weight: 11,
    themes: ["cave", "quarry", "hideout", "summit", "ruin"],
    build(famRng, themeId) {
      const domes = famRng.range(0, 2);
      const guaranteedDome = famRng.chance(0.7);
      const ridges = famRng.range(0, 3);
      const ridgeRows: ReadonlyArray<number> = [famRng.range(3, 5), famRng.range(7, 9), famRng.range(11, 13)];
      const boulderDensity = 0.03 + famRng.next() * 0.1;
      const screeDensity = 0.05 + famRng.next() * 0.12;
      const colonnade = famRng.chance(0.3);
      const barricade = famRng.chance(0.3);
      return {
        paint(ground) {
          for (let row = 0; row < DESIGN_GRID; row += 1) {
            for (let col = 0; col < DESIGN_GRID; col += 1) ground[row][col] = "rocky";
          }
        },
        decorate(ctx, frame, rng) {
          const theme = THEMES[themeId] ?? THEMES.cave;
          const domeCount = guaranteedDome ? Math.max(1, domes) : domes;
          placeDomes(ctx, frame, rng, DOME_SLOTS, domeCount);
          for (let index = 0; index < ridges; index += 1) {
            const row = Math.max(1, Math.min(14, ridgeRows[index] + rng.range(-1, 1)));
            const [, r] = mapPoint(frame, 7, row);
            placeBoulderLine(ctx.grid, ctx.ground, rng, r, rng.range(0, 4), rng.range(11, 15));
          }
          if (colonnade) {
            for (const row of [4, 7, 10]) {
              for (let col = 3; col <= 12; col += rng.pick([2, 3])) {
                const [c, r] = mapPoint(frame, col, row);
                if (rng.chance(0.7) && isClear(ctx.grid, ctx.ground, c, r)) {
                  placeDecor(ctx.grid, c, r, "boulder-mossy-1", { solid: true, feature: "ruin-pillar" });
                }
              }
            }
          }
          if (barricade) {
            const row = rng.range(6, 10);
            const gap = rng.range(3, 12);
            placeBoulderLine(ctx.grid, ctx.ground, rng, row, 1, 14, { gapAt: gap, density: 0.7 });
          }
          scatter(ctx.grid, ctx.ground, rng, ["boulder-mossy-1"], boulderDensity, { on: ["rocky"], solid: true, feature: "rock" });
          scatter(ctx.grid, ctx.ground, rng, ["rocky-bumps-1"], screeDensity, { on: ["rocky"], feature: "scree" });
          const signSpot = findClearSpot(ctx.grid, ctx.ground, rng, { allowGround: ["rocky"], margin: 2 });
          if (signSpot) placeRockySign(ctx.grid, ctx.ground, signSpot.col, signSpot.row);
          hiddenSomewhere(ctx, rng);
          if (rng.chance(0.6)) hiddenSomewhere(ctx, rng);
          addEntities(ctx, theme, rng, [0, 2], [0, 1]);
        },
      };
    },
  },
  {
    terrain: "terraces",
    weight: 5,
    themes: ["farm", "garden", "ranch"],
    build(famRng, themeId) {
      const kind: Ground = famRng.chance(0.6) ? "path" : "dirt";
      const step = famRng.pick([3, 4, 5]);
      const offset = famRng.range(1, 3);
      const flowers = 0.04 + famRng.next() * 0.1;
      const berries = famRng.chance(0.5);
      const buildings = pickBuildingSet(famRng, themeId);
      return {
        paint(ground, rng) {
          for (let row = offset + rng.range(0, 1); row < DESIGN_GRID; row += step) {
            paintPath(ground, kind, 0, row, 15, row, 1, rng);
          }
        },
        decorate(ctx, frame, rng) {
          const theme = THEMES[themeId] ?? THEMES.farm;
          placeBuildings(ctx, frame, rng, HOUSE_SLOTS, rng.range(0, 1), buildings);
          if (berries) {
            scatter(ctx.grid, ctx.ground, rng, ["shrub-1"], 0.12 + rng.next() * 0.1, { solid: true, feature: "berry-bush" });
          }
          scatter(ctx.grid, ctx.ground, rng, [flowerOf(rng)], flowers);
          if (rng.chance(0.4)) {
            longGrassPatch(ctx.grid, ctx.ground, rng, rng.range(3, 12), rng.range(3, 12), 2);
          }
          const signSpot = findClearSpot(ctx.grid, ctx.ground, rng, { allowGround: ["grass"], margin: 2 });
          if (signSpot && rng.chance(0.6)) placeSign(ctx.grid, ctx.ground, signSpot.col, signSpot.row);
          addEntities(ctx, theme, rng, [1, 2], [0, 1]);
        },
      };
    },
  },
];

const TOTAL_WEIGHT = PLANNERS.reduce((sum, planner) => sum + planner.weight, 0);

// --- family construction --------------------------------------------------------

const TERRAIN_LABEL: Record<string, string[]> = {
  crossroads: ["crossroads", "junction", "waystop"],
  ring: ["loop", "ringway", "circuit"],
  meadow: ["meadow", "fields", "flats"],
  lake: ["lakeside", "pondside", "waterside"],
  river: ["riverside", "ford", "crossing"],
  coast: ["coast", "shore", "seafront"],
  island: ["island", "isle", "atoll"],
  dunes: ["dunes", "sands", "wastes"],
  oasis: ["oasis", "waterhole", "refuge"],
  clearing: ["clearing", "glade", "hollow"],
  rocky: ["heights", "rockfield", "crags"],
  terraces: ["terraces", "rows", "steps"],
};

export function buildGeneratedFamily(familySeed: number): DesignFamily {
  const famRng = createRng("gen-family", familySeed);

  // Weighted terrain pick.
  let roll = famRng.next() * TOTAL_WEIGHT;
  let planner = PLANNERS[0];
  for (const candidate of PLANNERS) {
    roll -= candidate.weight;
    if (roll < 0) {
      planner = candidate;
      break;
    }
  }
  const themeId = famRng.pick(planner.themes);
  const theme = THEMES[themeId];
  const plan = planner.build(famRng, themeId) as Plan;
  plan.terrain = planner.terrain;
  plan.themeId = themeId;

  // Family-fixed naming subset: a slice of the theme pools so sibling
  // families with the same theme still name differently.
  const adjectives = famRng.shuffle(theme.adjectives).slice(0, 8);
  const nouns = famRng.shuffle(theme.nouns).slice(0, 6);
  const terrainWord = famRng.pick(TERRAIN_LABEL[planner.terrain] ?? [planner.terrain]);
  const label = `${theme.id.charAt(0).toUpperCase()}${theme.id.slice(1)} ${terrainWord}`;

  // Frames: which dihedral variants seeds may use (identity always allowed).
  const frames: Frame[] = famRng.chance(0.85)
    ? ([0, 1, 2, 3, 4, 5, 6, 7] as Frame[])
    : ([0, 2, 4, 5] as Frame[]);

  return {
    id: `gen-${familySeed}`,
    label,
    biome: theme.biome,
    tags: [...theme.tags, planner.terrain],
    waterFallback: plan.waterFallback,
    names: { adjectives, nouns },
    blurbs: theme.blurbs,
    paintGround(ctx) {
      const frame = frames[ctx.rng.int(frames.length)];
      ctx.frame = frame;
      const canonical = newGround();
      plan.paint(canonical, ctx.rng);
      applyFrame(canonical, frame, ctx.ground);
    },
    decorate(ctx) {
      const frame = (ctx.frame as Frame | undefined) ?? 0;
      plan.decorate(ctx, frame, ctx.rng);
    },
  };
}

/** The committed manifest pins the accepted family seeds (and therefore ids)
 * forever; scripts/design/build-family-manifest.ts regenerates it. */
export const GENERATED_FAMILIES: DesignFamily[] = (manifest.familySeeds as number[]).map((seed) =>
  buildGeneratedFamily(seed),
);
