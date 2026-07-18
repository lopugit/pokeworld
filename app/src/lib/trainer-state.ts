import type { FieldItem } from "./game-rules";

export type PocketName = "items" | "pokeballs" | "keyItems";
export type TrainerItemKind = "heal" | "status" | "utility";

export interface PartyMember {
  id: string;
  species: string;
  nickname?: string;
  level: number;
  hp: number;
  maxHp: number;
  types: string[];
  status: "healthy" | "poisoned";
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

export interface TrainerState {
  version: 3;
  name: string;
  party: PartyMember[];
  bag: Record<PocketName, BagItem[]>;
  badges: Badge[];
  collectedItems: Record<string, string>;
  pc: PartyMember[];
  pcItems: BagItem[];
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

const speciesTypes: Record<string, string[]> = {
  TREECKO: ["GRASS"],
  TORCHIC: ["FIRE"],
  MUDKIP: ["WATER"],
  ZIGZAGOON: ["NORMAL"],
  WINGULL: ["WATER", "FLYING"],
  RALTS: ["PSYCHIC"],
};

const partyMember = (
  id: string,
  species: string,
  level: number,
  hp: number,
): PartyMember => ({
  id,
  species,
  level,
  hp,
  maxHp: hp,
  types: speciesTypes[species] ?? ["NORMAL"],
  status: "healthy",
  sprite: speciesSprites[species] ?? "emerald-zigzagoon",
});

const bagItem = (
  id: string,
  name: string,
  quantity: number,
  description: string,
  kind: TrainerItemKind,
): BagItem => ({ id, name, quantity, description, kind });

export function defaultTrainer(): TrainerState {
  return {
    version: 3,
    name: "LOPU",
    party: [
      partyMember("treecko", "TREECKO", 12, 38),
      partyMember("ralts", "RALTS", 9, 29),
      partyMember("zigzagoon", "ZIGZAGOON", 8, 31),
    ],
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
    pc: [
      partyMember("mudkip", "MUDKIP", 10, 35),
      partyMember("torchic", "TORCHIC", 10, 34),
      partyMember("wingull", "WINGULL", 7, 27),
    ],
    pcItems: [],
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const itemKindFor = (id: string): TrainerItemKind => {
  if (id.includes("potion") || id.includes("revive")) return "heal";
  if (id === "antidote") return "status";
  return "utility";
};

const normalizeMember = (value: unknown): PartyMember | null => {
  if (!isRecord(value)) return null;
  const rawSpecies = typeof value.species === "string" ? value.species : value.name;
  if (typeof rawSpecies !== "string" || typeof value.id !== "string") return null;
  const species = rawSpecies.toUpperCase();
  const maxHp = typeof value.maxHp === "number" && value.maxHp > 0 ? value.maxHp : Number(value.hp);
  if (!Number.isFinite(maxHp) || maxHp <= 0) return null;
  const hp = typeof value.hp === "number" ? Math.max(0, Math.min(value.hp, maxHp)) : maxHp;
  return {
    id: value.id,
    species,
    nickname: typeof value.nickname === "string" ? value.nickname : undefined,
    level: typeof value.level === "number" && value.level > 0 ? value.level : 1,
    hp,
    maxHp,
    types: Array.isArray(value.types)
      ? value.types.filter((type): type is string => typeof type === "string")
      : speciesTypes[species] ?? ["NORMAL"],
    status: value.status === "poisoned" ? "poisoned" : "healthy",
    sprite:
      typeof value.sprite === "string"
        ? value.sprite
        : speciesSprites[species] ?? "emerald-zigzagoon",
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

export function normalizeTrainer(value: unknown): TrainerState {
  const fallback = defaultTrainer();
  if (!isRecord(value)) return fallback;

  const party = normalizeMembers(value.party, 6);
  const pc = normalizeMembers(value.pc);
  const common = {
    version: 3 as const,
    name: typeof value.name === "string" && value.name ? value.name : fallback.name,
    party: party.length ? party : fallback.party,
    badges: normalizeBadges(value.badges, fallback.badges),
    collectedItems: normalizeCollectedItems(value.collectedItems),
    pcItems: normalizeItems(value.pcItems),
  };

  if (value.version === 2) {
    const flatItems = normalizeItems(value.items);
    return {
      ...common,
      bag: {
        items: flatItems.filter((item) => item.id !== "poke-ball" && item.id !== "pokeball"),
        pokeballs: flatItems.filter((item) => item.id === "poke-ball" || item.id === "pokeball"),
        keyItems: [],
      },
      pc: pc.length ? pc : fallback.pc,
    };
  }

  const rawBag = isRecord(value.bag) ? value.bag : {};
  const hasBag = value.version === 1 || value.version === 3;
  return {
    ...common,
    bag: hasBag
      ? {
          items: normalizeItems(rawBag.items),
          pokeballs: normalizeItems(rawBag.pokeballs),
          keyItems: normalizeItems(rawBag.keyItems),
        }
      : fallback.bag,
    pc: value.version === 3 ? pc : pc.length ? pc : fallback.pc,
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
  if (item.kind === "utility") return transition(state, false, `${item.name} is ready for field use.`);
  if (item.kind === "heal" && target.hp >= target.maxHp) {
    return transition(state, false, `${target.species} already has full HP.`);
  }
  if (item.kind === "status" && target.status === "healthy") {
    return transition(state, false, `${target.species} has no status condition.`);
  }

  const healAmount = item.id === "super-potion" ? 50 : item.id.includes("revive") ? target.maxHp : 20;
  const party = state.party.map((candidate) => {
    if (candidate.id !== memberId) return candidate;
    return item.kind === "heal"
      ? { ...candidate, hp: Math.min(candidate.maxHp, candidate.hp + healAmount) }
      : { ...candidate, status: "healthy" as const };
  });
  const bag = {
    ...state.bag,
    [pocketName]: state.bag[pocketName].map((candidate) =>
      candidate.id === itemId ? { ...candidate, quantity: candidate.quantity - 1 } : candidate,
    ),
  };
  return transition({ ...state, party, bag }, true, `${item.name} used on ${target.species}.`);
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
