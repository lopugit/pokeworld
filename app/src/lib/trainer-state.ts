import type { FieldItem } from "./game-rules";

export type PocketName = "items" | "pokeballs" | "keyItems";

export interface PartyMember {
  id: string;
  species: string;
  nickname?: string;
  level: number;
  hp: number;
  maxHp: number;
  types: string[];
}

export interface BagItem {
  id: string;
  name: string;
  quantity: number;
  description: string;
}

export interface Badge {
  id: string;
  name: string;
  earned: boolean;
}

export interface TrainerState {
  version: 1;
  name: string;
  party: PartyMember[];
  bag: Record<PocketName, BagItem[]>;
  badges: Badge[];
  collectedItems: Record<string, string>;
  pcItems: BagItem[];
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

export const TRAINER_STORAGE_KEY = "pokeworld:trainer:v1";

export function defaultTrainer(): TrainerState {
  return {
    version: 1,
    name: "LOPU",
    party: [
      {
        id: "starter-mudkip",
        species: "MUDKIP",
        level: 5,
        hp: 19,
        maxHp: 19,
        types: ["WATER"],
      },
    ],
    bag: {
      items: [{ id: "potion", name: "POTION", quantity: 1, description: "Restores 20 HP of one POKéMON." }],
      pokeballs: [{ id: "poke-ball", name: "POKé BALL", quantity: 5, description: "A tool for catching wild POKéMON." }],
      keyItems: [],
    },
    badges: HOENN_BADGES.map((badge) => ({ ...badge, earned: false })),
    collectedItems: {},
    pcItems: [],
  };
}

export function addItemToBag(trainer: TrainerState, item: FieldItem, quantity = 1): TrainerState {
  const pocket = trainer.bag[item.pocket] ?? [];
  const existing = pocket.find((entry) => entry.id === item.id);
  const nextPocket = existing
    ? pocket.map((entry) => (entry.id === item.id ? { ...entry, quantity: entry.quantity + quantity } : entry))
    : [...pocket, { id: item.id, name: item.name, quantity, description: item.description }];
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

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const defaultStorage = (): StorageLike | null =>
  typeof window !== "undefined" && window.localStorage ? window.localStorage : null;

export function loadTrainer(storage: StorageLike | null = defaultStorage()): TrainerState {
  const base = defaultTrainer();
  if (!storage) return base;
  try {
    const raw = storage.getItem(TRAINER_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<TrainerState>;
    if (parsed.version !== 1) return base;
    return {
      ...base,
      ...parsed,
      bag: { ...base.bag, ...(parsed.bag ?? {}) },
      badges: parsed.badges?.length === HOENN_BADGES.length ? parsed.badges : base.badges,
      collectedItems: parsed.collectedItems ?? {},
      pcItems: parsed.pcItems ?? [],
      party: parsed.party?.length ? parsed.party : base.party,
    };
  } catch {
    return base;
  }
}

export function saveTrainer(trainer: TrainerState, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(TRAINER_STORAGE_KEY, JSON.stringify(trainer));
  } catch {
    // Storage may be full or unavailable; the in-memory state remains authoritative.
  }
}
