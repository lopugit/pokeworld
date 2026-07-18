import { describe, expect, it } from "vitest";
import {
  HOENN_BADGES,
  TRAINER_STORAGE_KEY,
  addItemToBag,
  collectFieldItem,
  defaultTrainer,
  hasCollected,
  loadTrainer,
  saveTrainer,
} from "../src/lib/trainer-state";
import { fieldItemFor } from "../src/lib/game-rules";

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    dump: () => data,
  };
};

describe("defaultTrainer", () => {
  it("starts with a starter, stocked bag, and all 8 unearned Hoenn badges", () => {
    const trainer = defaultTrainer();
    expect(trainer.party[0]?.species).toBe("MUDKIP");
    expect(trainer.bag.pokeballs[0]?.quantity).toBe(5);
    expect(trainer.badges).toHaveLength(HOENN_BADGES.length);
    expect(trainer.badges.every((badge) => !badge.earned)).toBe(true);
    expect(trainer.collectedItems).toEqual({});
  });
});

describe("addItemToBag", () => {
  it("stacks quantities for existing items and appends new ones", () => {
    const trainer = defaultTrainer();
    const pokeBall = fieldItemFor(0, 0);
    const stacked = addItemToBag(trainer, { ...pokeBall, id: "poke-ball", name: "POKé BALL", pocket: "pokeballs" });
    expect(stacked.bag.pokeballs.find((entry) => entry.id === "poke-ball")?.quantity).toBe(6);

    const added = addItemToBag(trainer, {
      id: "nugget",
      name: "NUGGET",
      pocket: "items",
      description: "A pure gold nugget.",
    });
    expect(added.bag.items.map((entry) => entry.id)).toContain("nugget");
    // Original is untouched (immutability).
    expect(trainer.bag.pokeballs[0]?.quantity).toBe(5);
  });
});

describe("collectFieldItem", () => {
  it("records the coordinate and refuses double collection", () => {
    const trainer = defaultTrainer();
    const item = { id: "potion", name: "POTION", pocket: "items" as const, description: "Heals 20 HP." };
    const collected = collectFieldItem(trainer, "32,64", item);
    expect(collected).not.toBeNull();
    expect(hasCollected(collected!, "32,64")).toBe(true);
    expect(collected!.bag.items.find((entry) => entry.id === "potion")?.quantity).toBe(2);
    expect(collectFieldItem(collected!, "32,64", item)).toBeNull();
  });
});

describe("persistence round-trip", () => {
  it("saves and restores through a storage backend", () => {
    const storage = memoryStorage();
    const trainer = defaultTrainer();
    const item = { id: "rare-candy", name: "RARE CANDY", pocket: "items" as const, description: "Level up!" };
    const collected = collectFieldItem(trainer, "96,128", item)!;
    saveTrainer(collected, storage);
    expect(storage.dump().has(TRAINER_STORAGE_KEY)).toBe(true);

    const restored = loadTrainer(storage);
    expect(hasCollected(restored, "96,128")).toBe(true);
    expect(restored.bag.items.map((entry) => entry.id)).toContain("rare-candy");
    expect(restored.badges).toHaveLength(HOENN_BADGES.length);
  });

  it("falls back to defaults on corrupt or missing data", () => {
    const storage = memoryStorage();
    expect(loadTrainer(storage).name).toBe("LOPU");
    storage.setItem(TRAINER_STORAGE_KEY, "{not json");
    expect(loadTrainer(storage).party[0]?.species).toBe("MUDKIP");
    storage.setItem(TRAINER_STORAGE_KEY, JSON.stringify({ version: 99 }));
    expect(loadTrainer(storage).version).toBe(1);
    expect(loadTrainer(null).name).toBe("LOPU");
  });
});
