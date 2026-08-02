import type { FieldItem } from "./game-rules";
import {
  calcStats,
  expForLevel,
  getSpecies,
  levelForExp,
  speciesByName,
  type PokemonGender,
  type StatBlock,
} from "./pokedex";

export type PocketName = "items" | "pokeballs" | "keyItems";
export type TrainerItemKind = "heal" | "status" | "utility";
export type TrainerGender = "boy" | "girl";
export type StatusCondition =
  | "healthy"
  | "poisoned"
  | "paralyzed"
  | "asleep"
  | "burned"
  | "frozen";

export interface PartyMember {
  id: string;
  /** National dex number; 0 for legacy members whose species is unknown. */
  speciesId: number;
  species: string;
  nickname?: string;
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  stats?: StatBlock;
  types: string[];
  status: StatusCondition;
  gender?: PokemonGender;
  shiny?: boolean;
  sprite: string;
}

export interface BagItem {
  id: string;
  name: string;
  quantity: number;
  description: string;
  kind: TrainerItemKind;
}

export interface Badge {
  id: string;
  name: string;
  earned: boolean;
}

export interface PokedexProgress {
  seen: number[];
  caught: number[];
}

export interface TrainerState {
  version: 4;
  name: string;
  gender: TrainerGender;
  party: PartyMember[];
  bag: Record<PocketName, BagItem[]>;
  badges: Badge[];
  collectedItems: Record<string, string>;
  pc: PartyMember[];
  pcItems: BagItem[];
  pokedex: PokedexProgress;
}

export interface TrainerTransition {
  state: TrainerState;
  changed: boolean;
  message: string;
}

export const HOENN_BADGES: Array<{ id: string; name: string }> = [
  { id: "stone", name: "STONE BADGE" },
  { id: "knuckle", name: "KNUCKLE BADGE" },
  { id: "dynamo", name: "DYNAMO BADGE" },
  { id: "heat", name: "HEAT BADGE" },
  { id: "balance", name: "BALANCE BADGE" },
  { id: "feather", name: "FEATHER BADGE" },
  { id: "mind", name: "MIND BADGE" },
  { id: "rain", name: "RAIN BADGE" },
];

export const TRAINER_STORAGE_KEY = "pokeworld:trainer:v3";
const LEGACY_TRAINER_STORAGE_KEYS = ["pokeworld:trainer:v1"] as const;
const LEGACY_THINGS_STORAGE_KEY = "things:v2";

const speciesSprites: Record<string, string> = {
  TREECKO: "emerald-treecko",
  TORCHIC: "emerald-torchic",
  MUDKIP: "emerald-mudkip",
  ZIGZAGOON: "emerald-zigzagoon",
  WINGULL: "emerald-wingull",
  RALTS: "emerald-ralts",
};

const emeraldSprites = new Set(Object.values(speciesSprites));
// Generated battle sprites live under /sprites/pokemon/gen3/.
const GEN3_SPRITE_PATTERN = /^gen3\/(?:shiny\/)?\d{1,3}$/;

const isKnownSprite = (sprite: string): boolean =>
  emeraldSprites.has(sprite) || GEN3_SPRITE_PATTERN.test(sprite);

export const spriteForSpecies = (speciesId: number, shiny = false): string =>
  shiny ? `gen3/shiny/${speciesId}` : `gen3/${speciesId}`;

const speciesTypes: Record<string, string[]> = {
  TREECKO: ["GRASS"],
  TORCHIC: ["FIRE"],
  MUDKIP: ["WATER"],
  ZIGZAGOON: ["NORMAL"],
  WINGULL: ["WATER", "FLYING"],
  RALTS: ["PSYCHIC"],
};

const STATUS_VALUES: StatusCondition[] = [
  "healthy",
  "poisoned",
  "paralyzed",
  "asleep",
  "burned",
  "frozen",
];

export function createPartyMember(options: {
  id: string;
  speciesId: number;
  level: number;
  gender?: PokemonGender;
  shiny?: boolean;
  nickname?: string;
}): PartyMember {
  const species = getSpecies(options.speciesId);
  const level = Math.max(1, Math.min(100, options.level));
  const stats = species ? calcStats(species.baseStats, level) : undefined;
  return {
    id: options.id,
    speciesId: options.speciesId,
    species: species?.displayName ?? `#${options.speciesId}`,
    nickname: options.nickname,
    level,
    exp: species ? expForLevel(species.growthRate, level) : 0,
    hp: stats?.hp ?? 20,
    maxHp: stats?.hp ?? 20,
    stats,
    types: species?.types ?? ["NORMAL"],
    status: "healthy",
    gender: options.gender,
    shiny: options.shiny,
    sprite: spriteForSpecies(options.speciesId, options.shiny),
  };
}

const starterMember = (id: string, name: string, speciesId: number, level: number): PartyMember => {
  const member = createPartyMember({ id, speciesId, level });
  // Preserve the classic Emerald party sprites for the original six.
  member.species = name;
  member.sprite = speciesSprites[name] ?? member.sprite;
  return member;
};

const bagItem = (
  id: string,
  name: string,
  quantity: number,
  description: string,
  kind: TrainerItemKind,
): BagItem => ({ id, name, quantity, description, kind });

export function defaultTrainer(): TrainerState {
  const party = [
    starterMember("treecko", "TREECKO", 252, 12),
    starterMember("ralts", "RALTS", 280, 9),
    starterMember("zigzagoon", "ZIGZAGOON", 263, 8),
  ];
  const pc = [
    starterMember("mudkip", "MUDKIP", 258, 10),
    starterMember("torchic", "TORCHIC", 255, 10),
    starterMember("wingull", "WINGULL", 278, 7),
  ];
  const owned = [...party, ...pc].map((member) => member.speciesId).filter(Boolean);
  return {
    version: 4,
    name: "LOPU",
    gender: "boy",
    party,
    bag: {
      items: [
        bagItem("potion", "POTION", 3, "Restores 20 HP of one POKéMON.", "heal"),
        bagItem("antidote", "ANTIDOTE", 2, "Heals a poisoned POKéMON.", "status"),
        bagItem("escape-rope", "ESCAPE ROPE", 1, "Use it to escape instantly from a cave.", "utility"),
      ],
      pokeballs: [
        bagItem("poke-ball", "POKé BALL", 6, "A tool for catching wild POKéMON.", "utility"),
      ],
      keyItems: [],
    },
    badges: HOENN_BADGES.map((badge) => ({ ...badge, earned: false })),
    collectedItems: {},
    pc,
    pcItems: [],
    pokedex: {
      seen: [...new Set(owned)].sort((a, b) => a - b),
      caught: [...new Set(owned)].sort((a, b) => a - b),
    },
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const itemKindFor = (id: string): TrainerItemKind => {
  if (id.includes("potion") || id.includes("revive")) return "heal";
  if (id === "antidote" || id === "full-heal") return "status";
  return "utility";
};

const normalizeMember = (value: unknown): PartyMember | null => {
  if (!isRecord(value)) return null;
  const rawSpecies = typeof value.species === "string" ? value.species : value.name;
  if (typeof rawSpecies !== "string" || typeof value.id !== "string") return null;
  const speciesName = rawSpecies.toUpperCase();
  const storedSprite = typeof value.sprite === "string" ? value.sprite : "";
  const maxHp = typeof value.maxHp === "number" && value.maxHp > 0 ? value.maxHp : Number(value.hp);
  if (!Number.isFinite(maxHp) || maxHp <= 0) return null;
  const hp = typeof value.hp === "number" ? Math.max(0, Math.min(value.hp, maxHp)) : maxHp;
  const level = typeof value.level === "number" && value.level > 0 ? Math.min(100, value.level) : 1;

  // Recover the dex species for legacy members so battles/dex work for them.
  const storedSpeciesId =
    typeof value.speciesId === "number" && Number.isInteger(value.speciesId) && value.speciesId > 0
      ? value.speciesId
      : undefined;
  const dexEntry = storedSpeciesId ? getSpecies(storedSpeciesId) : speciesByName(speciesName);
  const speciesId = dexEntry?.id ?? storedSpeciesId ?? 0;

  const shiny = value.shiny === true;
  const gender =
    value.gender === "male" || value.gender === "female" || value.gender === "genderless"
      ? value.gender
      : undefined;
  const exp =
    typeof value.exp === "number" && value.exp >= 0
      ? value.exp
      : dexEntry
        ? expForLevel(dexEntry.growthRate, level)
        : 0;
  const storedStats = isRecord(value.stats) ? (value.stats as unknown as StatBlock) : undefined;
  const stats =
    storedStats && Object.values(storedStats).every((stat) => typeof stat === "number")
      ? storedStats
      : dexEntry
        ? calcStats(dexEntry.baseStats, level)
        : undefined;

  return {
    id: value.id,
    speciesId,
    species: speciesName,
    nickname: typeof value.nickname === "string" ? value.nickname : undefined,
    level,
    exp,
    hp,
    maxHp,
    stats,
    types: Array.isArray(value.types)
      ? value.types.filter((type): type is string => typeof type === "string")
      : dexEntry?.types ?? speciesTypes[speciesName] ?? ["NORMAL"],
    status: STATUS_VALUES.includes(value.status as StatusCondition)
      ? (value.status as StatusCondition)
      : "healthy",
    gender,
    shiny: shiny || undefined,
    // Older saves could contain player sprites or arbitrary paths. Only retain
    // sprites this build actually ships.
    sprite: isKnownSprite(storedSprite)
      ? storedSprite
      : speciesSprites[speciesName] ??
        (speciesId ? spriteForSpecies(speciesId, shiny) : "emerald-zigzagoon"),
  };
};

const normalizeItem = (value: unknown): BagItem | null => {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  if (typeof value.quantity !== "number" || value.quantity < 0) return null;
  return {
    id: value.id,
    name: value.name,
    quantity: value.quantity,
    description: typeof value.description === "string" ? value.description : "A useful item.",
    kind:
      value.kind === "heal" || value.kind === "status" || value.kind === "utility"
        ? value.kind
        : itemKindFor(value.id),
  };
};

const normalizeItems = (value: unknown): BagItem[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => {
        const normalized = normalizeItem(entry);
        return normalized ? [normalized] : [];
      })
    : [];

const normalizeMembers = (value: unknown, limit?: number): PartyMember[] => {
  const members = Array.isArray(value)
    ? value.flatMap((entry) => {
        const normalized = normalizeMember(entry);
        return normalized ? [normalized] : [];
      })
    : [];
  return typeof limit === "number" ? members.slice(0, limit) : members;
};

const normalizeBadges = (value: unknown, fallback: Badge[]): Badge[] => {
  if (!Array.isArray(value) || value.length !== HOENN_BADGES.length) return fallback;
  return HOENN_BADGES.map((badge, index) => {
    const candidate = value[index];
    return {
      ...badge,
      earned: isRecord(candidate) && candidate.earned === true,
    };
  });
};

const normalizeCollectedItems = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
};

const normalizeDexIds = (value: unknown): number[] =>
  Array.isArray(value)
    ? [...new Set(
        value.filter(
          (id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0,
        ),
      )].sort((a, b) => a - b)
    : [];

const normalizePokedex = (value: unknown, members: PartyMember[]): PokedexProgress => {
  const record = isRecord(value) ? value : {};
  const owned = members.map((member) => member.speciesId).filter(Boolean);
  const seen = new Set([...normalizeDexIds(record.seen), ...owned]);
  const caught = new Set([...normalizeDexIds(record.caught), ...owned]);
  for (const id of caught) seen.add(id);
  return {
    seen: [...seen].sort((a, b) => a - b),
    caught: [...caught].sort((a, b) => a - b),
  };
};

export function normalizeTrainer(value: unknown): TrainerState {
  const fallback = defaultTrainer();
  if (!isRecord(value)) return fallback;

  const party = normalizeMembers(value.party, 6);
  const pc = normalizeMembers(value.pc);
  const resolvedParty = party.length ? party : fallback.party;
  const common = {
    version: 4 as const,
    name: typeof value.name === "string" && value.name ? value.name : fallback.name,
    gender: value.gender === "girl" ? ("girl" as const) : ("boy" as const),
    party: resolvedParty,
    badges: normalizeBadges(value.badges, fallback.badges),
    collectedItems: normalizeCollectedItems(value.collectedItems),
    pcItems: normalizeItems(value.pcItems),
  };

  if (value.version === 2) {
    const flatItems = normalizeItems(value.items);
    const resolvedPc = pc.length ? pc : fallback.pc;
    return {
      ...common,
      bag: {
        items: flatItems.filter((item) => item.id !== "poke-ball" && item.id !== "pokeball"),
        pokeballs: flatItems.filter((item) => item.id === "poke-ball" || item.id === "pokeball"),
        keyItems: [],
      },
      pc: resolvedPc,
      pokedex: normalizePokedex(value.pokedex, [...resolvedParty, ...resolvedPc]),
    };
  }

  const rawBag = isRecord(value.bag) ? value.bag : {};
  const hasBag = value.version === 1 || value.version === 3 || value.version === 4;
  const resolvedPc = value.version === 3 || value.version === 4 ? pc : pc.length ? pc : fallback.pc;
  return {
    ...common,
    bag: hasBag
      ? {
          items: normalizeItems(rawBag.items),
          pokeballs: normalizeItems(rawBag.pokeballs),
          keyItems: normalizeItems(rawBag.keyItems),
        }
      : fallback.bag,
    pc: resolvedPc,
    pokedex: normalizePokedex(value.pokedex, [...resolvedParty, ...resolvedPc]),
  };
}

export function addItemToBag(trainer: TrainerState, item: FieldItem, quantity = 1): TrainerState {
  const pocket = trainer.bag[item.pocket] ?? [];
  const existing = pocket.find((entry) => entry.id === item.id);
  const nextPocket = existing
    ? pocket.map((entry) =>
        entry.id === item.id ? { ...entry, quantity: entry.quantity + quantity } : entry,
      )
    : [
        ...pocket,
        {
          id: item.id,
          name: item.name,
          quantity,
          description: item.description,
          kind: itemKindFor(item.id),
        },
      ];
  return { ...trainer, bag: { ...trainer.bag, [item.pocket]: nextPocket } };
}

export function removeBagItem(trainer: TrainerState, itemId: string, quantity = 1): TrainerState {
  const pockets = (Object.keys(trainer.bag) as PocketName[]).reduce(
    (bag, pocket) => {
      bag[pocket] = trainer.bag[pocket]
        .map((item) =>
          item.id === itemId ? { ...item, quantity: Math.max(0, item.quantity - quantity) } : item,
        )
        .filter((item) => item.quantity > 0);
      return bag;
    },
    {} as Record<PocketName, BagItem[]>,
  );
  return { ...trainer, bag: pockets };
}

export const hasCollected = (trainer: TrainerState, coordKey: string): boolean =>
  Boolean(trainer.collectedItems[coordKey]);

export function collectFieldItem(
  trainer: TrainerState,
  coordKey: string,
  item: FieldItem,
): TrainerState | null {
  if (hasCollected(trainer, coordKey)) return null;
  const withItem = addItemToBag(trainer, item);
  return {
    ...withItem,
    collectedItems: { ...withItem.collectedItems, [coordKey]: item.id },
  };
}

const transition = (
  state: TrainerState,
  changed: boolean,
  message: string,
): TrainerTransition => ({ state, changed, message });

const sortedInsert = (list: number[], id: number): number[] =>
  list.includes(id) ? list : [...list, id].sort((a, b) => a - b);

export function registerSeen(trainer: TrainerState, speciesId: number): TrainerState {
  if (!speciesId || trainer.pokedex.seen.includes(speciesId)) return trainer;
  return {
    ...trainer,
    pokedex: { ...trainer.pokedex, seen: sortedInsert(trainer.pokedex.seen, speciesId) },
  };
}

export function registerCaught(trainer: TrainerState, speciesId: number): TrainerState {
  if (!speciesId) return trainer;
  return {
    ...trainer,
    pokedex: {
      seen: sortedInsert(trainer.pokedex.seen, speciesId),
      caught: sortedInsert(trainer.pokedex.caught, speciesId),
    },
  };
}

/** Adds a caught Pokémon to the party, overflowing into the PC (Box 1). */
export function addCaughtPokemon(
  trainer: TrainerState,
  member: PartyMember,
): { state: TrainerState; sentTo: "party" | "pc" } {
  const registered = registerCaught(trainer, member.speciesId);
  if (registered.party.length < 6) {
    return { state: { ...registered, party: [...registered.party, member] }, sentTo: "party" };
  }
  return { state: { ...registered, pc: [...registered.pc, member] }, sentTo: "pc" };
}

export function setTrainerProfile(
  trainer: TrainerState,
  profile: { name?: string; gender?: TrainerGender },
): TrainerState {
  const name = profile.name?.trim().toUpperCase().slice(0, 7);
  return {
    ...trainer,
    name: name || trainer.name,
    gender: profile.gender ?? trainer.gender,
  };
}

const levelUpMember = (member: PartyMember, levels = 1): PartyMember => {
  const species = getSpecies(member.speciesId);
  const level = Math.min(100, member.level + levels);
  if (!species) return { ...member, level };
  const stats = calcStats(species.baseStats, level);
  const hpGain = stats.hp - member.maxHp;
  return {
    ...member,
    level,
    exp: Math.max(member.exp, expForLevel(species.growthRate, level)),
    stats,
    maxHp: stats.hp,
    hp: Math.min(stats.hp, member.hp + Math.max(0, hpGain)),
  };
};

/** Adds experience, applying any level-ups (Gen III growth curves). */
export function grantExperience(
  member: PartyMember,
  amount: number,
): { member: PartyMember; levelsGained: number } {
  const species = getSpecies(member.speciesId);
  if (!species || amount <= 0 || member.level >= 100) return { member, levelsGained: 0 };
  const exp = member.exp + amount;
  const level = Math.max(member.level, levelForExp(species.growthRate, exp));
  const levelsGained = level - member.level;
  let next = { ...member, exp };
  if (levelsGained > 0) next = { ...levelUpMember(next, levelsGained), exp };
  return { member: next, levelsGained };
}

export function useBagItem(
  state: TrainerState,
  itemId: string,
  memberId: string,
): TrainerTransition {
  const pocketName = (["items", "pokeballs", "keyItems"] as PocketName[]).find((pocket) =>
    state.bag[pocket].some((item) => item.id === itemId),
  );
  const item = pocketName
    ? state.bag[pocketName].find((candidate) => candidate.id === itemId)
    : undefined;
  const target = state.party.find((candidate) => candidate.id === memberId);
  if (!item || item.quantity <= 0 || !pocketName) return transition(state, false, "There are none left.");
  if (!target) return transition(state, false, "Choose a party member first.");

  const consume = (bagState: TrainerState): Record<PocketName, BagItem[]> => ({
    ...bagState.bag,
    [pocketName]: bagState.bag[pocketName]
      .map((candidate) =>
        candidate.id === itemId ? { ...candidate, quantity: candidate.quantity - 1 } : candidate,
      )
      .filter((candidate) => candidate.quantity > 0),
  });

  if (item.id === "rare-candy") {
    if (target.level >= 100) return transition(state, false, `${target.species} is already level 100.`);
    const leveled = levelUpMember(target);
    const party = state.party.map((candidate) => (candidate.id === memberId ? leveled : candidate));
    return transition(
      { ...state, party, bag: consume(state) },
      true,
      `${target.species} grew to level ${leveled.level}!`,
    );
  }
  if (item.kind === "utility") return transition(state, false, `${item.name} is ready for field use.`);
  if (item.kind === "heal" && !item.id.includes("revive") && target.hp <= 0) {
    return transition(state, false, `${target.species} has fainted. Use a REVIVE.`);
  }
  if (item.kind === "heal" && item.id.includes("revive") && target.hp > 0) {
    return transition(state, false, `${target.species} hasn't fainted.`);
  }
  if (item.kind === "heal" && target.hp >= target.maxHp) {
    return transition(state, false, `${target.species} already has full HP.`);
  }
  if (item.kind === "status" && target.status === "healthy") {
    return transition(state, false, `${target.species} has no status condition.`);
  }

  const healAmount = item.id === "super-potion" ? 50 : item.id.includes("revive") ? Math.ceil(target.maxHp / 2) : 20;
  const party = state.party.map((candidate) => {
    if (candidate.id !== memberId) return candidate;
    if (item.kind === "heal") {
      const base = item.id === "max-revive" ? candidate.maxHp : candidate.hp + healAmount;
      return { ...candidate, hp: Math.min(candidate.maxHp, Math.max(healAmount, base)) };
    }
    return { ...candidate, status: "healthy" as const };
  });
  return transition(
    { ...state, party, bag: consume(state) },
    true,
    `${item.name} used on ${target.species}.`,
  );
}

export function setLeadPartyMember(state: TrainerState, memberId: string): TrainerTransition {
  const index = state.party.findIndex((candidate) => candidate.id === memberId);
  if (index < 0) return transition(state, false, "That POKéMON is unavailable.");
  if (index === 0) return transition(state, false, `${state.party[0].species} is already leading.`);
  const party = [...state.party];
  const [lead] = party.splice(index, 1);
  party.unshift(lead);
  return transition({ ...state, party }, true, `${lead.species} will lead the party.`);
}

export function toggleBadge(state: TrainerState, badgeId: string): TrainerTransition {
  const badge = state.badges.find((candidate) => candidate.id === badgeId);
  if (!badge) return transition(state, false, "That badge slot is unavailable.");
  const badges = state.badges.map((candidate) =>
    candidate.id === badgeId ? { ...candidate, earned: !candidate.earned } : candidate,
  );
  return transition(
    { ...state, badges },
    true,
    `${badge.name} marked ${badge.earned ? "not earned" : "earned"}.`,
  );
}

export function depositPartyMember(state: TrainerState, memberId: string): TrainerTransition {
  if (state.party.length <= 1) return transition(state, false, "One POKéMON must stay in your party.");
  const member = state.party.find((candidate) => candidate.id === memberId);
  if (!member) return transition(state, false, "That POKéMON is unavailable.");
  return transition(
    {
      ...state,
      party: state.party.filter((candidate) => candidate.id !== memberId),
      pc: [...state.pc, member],
    },
    true,
    `${member.species} was deposited in Box 1.`,
  );
}

export function withdrawPartyMember(state: TrainerState, memberId: string): TrainerTransition {
  if (state.party.length >= 6) return transition(state, false, "Your party is full.");
  const member = state.pc.find((candidate) => candidate.id === memberId);
  if (!member) return transition(state, false, "That stored POKéMON is unavailable.");
  return transition(
    {
      ...state,
      party: [...state.party, member],
      pc: state.pc.filter((candidate) => candidate.id !== memberId),
    },
    true,
    `${member.species} joined your party.`,
  );
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const defaultStorage = (): StorageLike | null =>
  typeof window !== "undefined" && window.localStorage ? window.localStorage : null;

const readJson = (storage: StorageLike, key: string): unknown => {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export function loadTrainer(storage: StorageLike | null = defaultStorage()): TrainerState {
  if (!storage) return defaultTrainer();
  const candidates: unknown[] = [readJson(storage, TRAINER_STORAGE_KEY)];
  for (const key of LEGACY_TRAINER_STORAGE_KEYS) candidates.push(readJson(storage, key));
  const legacyThings = readJson(storage, LEGACY_THINGS_STORAGE_KEY);
  if (isRecord(legacyThings)) {
    const things = isRecord(legacyThings.things) ? legacyThings.things : legacyThings;
    candidates.push(things.trainer);
  }

  const candidate = candidates.find((value) => isRecord(value));
  const trainer = candidate ? normalizeTrainer(candidate) : defaultTrainer();
  try {
    storage.setItem(TRAINER_STORAGE_KEY, JSON.stringify(trainer));
  } catch {
    // Storage may be full or unavailable; the in-memory state remains authoritative.
  }
  return trainer;
}

export function saveTrainer(
  trainer: TrainerState,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(TRAINER_STORAGE_KEY, JSON.stringify(trainer));
  } catch {
    // Storage may be full or unavailable; the in-memory state remains authoritative.
  }
}
