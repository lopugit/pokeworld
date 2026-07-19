import { describe, expect, it } from "vitest";
import {
  TRAINER_STORAGE_KEY,
  collectFieldItem,
  defaultTrainer,
  depositPartyMember,
  loadTrainer,
  normalizeTrainer,
  saveTrainer,
  setLeadPartyMember,
  toggleBadge,
  useBagItem,
  withdrawPartyMember,
} from "../src/lib/trainer-state";

const fieldItem = {
  id: "rare-candy",
  name: "RARE CANDY",
  pocket: "items" as const,
  description: "Raises a POKéMON's level by one.",
};

describe("trainer state", () => {
  it("starts with an Emerald-sprite party, bag, badges, and Box 1", () => {
    const trainer = defaultTrainer();
    expect(trainer.version).toBe(3);
    expect(trainer.party.map((member) => member.species)).toEqual([
      "TREECKO",
      "RALTS",
      "ZIGZAGOON",
    ]);
    expect(trainer.pc.map((member) => member.species)).toEqual([
      "MUDKIP",
      "TORCHIC",
      "WINGULL",
    ]);
    expect([...trainer.party, ...trainer.pc].every((member) => member.sprite.startsWith("emerald-"))).toBe(true);
    expect(trainer.badges).toHaveLength(8);
    expect(trainer.bag.items.find((item) => item.id === "potion")?.quantity).toBe(3);
  });

  it("migrates the previous compact trainer shape without losing the team", () => {
    const migrated = normalizeTrainer({
      version: 2,
      party: [{ id: "treecko", name: "Treecko", level: 12, hp: 30, maxHp: 38, status: "healthy", sprite: "emerald-treecko" }],
      items: [{ id: "potion", name: "Potion", quantity: 2, kind: "heal", description: "Restores HP." }],
      badges: Array.from({ length: 8 }, (_, index) => ({ id: `badge-${index}`, label: "Badge", earned: index === 0 })),
      pc: [{ id: "mudkip", name: "Mudkip", level: 10, hp: 35, maxHp: 35, status: "healthy", sprite: "emerald-mudkip" }],
    });
    expect(migrated.version).toBe(3);
    expect(migrated.party[0].species).toBe("TREECKO");
    expect(migrated.pc[0].species).toBe("MUDKIP");
    expect(migrated.badges[0].earned).toBe(true);
    expect(migrated.bag.items[0].quantity).toBe(2);
  });

  it("repairs stale saves so trainer panels only render shipped Emerald sprites", () => {
    const repaired = normalizeTrainer({
      ...defaultTrainer(),
      party: [
        {
          id: "old-partner",
          species: "FIELD PARTNER",
          level: 12,
          hp: 38,
          maxHp: 38,
          types: ["NORMAL"],
          status: "healthy",
          sprite: "char-walk-1",
        },
        {
          id: "mudkip",
          species: "MUDKIP",
          level: 10,
          hp: 35,
          maxHp: 35,
          types: ["WATER"],
          status: "healthy",
          sprite: "not-a-shipped-sprite",
        },
      ],
    });

    expect(repaired.party.map((member) => member.sprite)).toEqual([
      "emerald-zigzagoon",
      "emerald-mudkip",
    ]);
  });

  it("heals once and does not consume an item when it has no effect", () => {
    const initial = defaultTrainer();
    initial.party[0] = { ...initial.party[0], hp: 9 };
    const used = useBagItem(initial, "potion", "treecko");
    expect(used.changed).toBe(true);
    expect(used.state.party[0].hp).toBe(29);
    expect(used.state.bag.items.find((item) => item.id === "potion")?.quantity).toBe(2);

    const full = defaultTrainer();
    const unchanged = useBagItem(full, "potion", "treecko");
    expect(unchanged.changed).toBe(false);
    expect(unchanged.state).toBe(full);
  });

  it("changes the party lead and moves Pokémon through Box 1", () => {
    const initial = defaultTrainer();
    const led = setLeadPartyMember(initial, "ralts");
    expect(led.state.party[0].species).toBe("RALTS");

    const withdrawn = withdrawPartyMember(led.state, "mudkip");
    expect(withdrawn.changed).toBe(true);
    expect(withdrawn.state.party.map((member) => member.id)).toContain("mudkip");
    expect(withdrawn.state.pc.map((member) => member.id)).not.toContain("mudkip");

    const deposited = depositPartyMember(withdrawn.state, "mudkip");
    expect(deposited.changed).toBe(true);
    expect(deposited.state.party.map((member) => member.id)).not.toContain("mudkip");
    expect(deposited.state.pc.map((member) => member.id)).toContain("mudkip");
  });

  it("records badge progress deterministically", () => {
    const initial = defaultTrainer();
    const earned = toggleBadge(initial, "stone");
    expect(earned.state.badges[0].earned).toBe(true);
    expect(toggleBadge(earned.state, "stone").state.badges[0].earned).toBe(false);
  });

  it("collects each seeded field item once", () => {
    const initial = defaultTrainer();
    const collected = collectFieldItem(initial, "320,640", fieldItem);
    expect(collected).not.toBeNull();
    expect(collected?.bag.items.find((item) => item.id === "rare-candy")?.quantity).toBe(1);
    expect(collectFieldItem(collected!, "320,640", fieldItem)).toBeNull();
  });

  it("migrates legacy storage and saves the current independent trainer record", () => {
    const values = new Map<string, string>();
    values.set("pokeworld:trainer:v1", JSON.stringify({
      version: 1,
      name: "MAY",
      party: [{ id: "starter-mudkip", species: "MUDKIP", level: 5, hp: 19, maxHp: 19, types: ["WATER"] }],
      bag: { items: [], pokeballs: [], keyItems: [] },
      badges: Array.from({ length: 8 }, () => ({ earned: false })),
      collectedItems: {},
      pcItems: [],
    }));
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const trainer = loadTrainer(storage);
    expect(trainer.name).toBe("MAY");
    expect(trainer.party[0].sprite).toBe("emerald-mudkip");
    expect(JSON.parse(values.get(TRAINER_STORAGE_KEY) ?? "null").version).toBe(3);

    const changed = toggleBadge(trainer, "stone").state;
    saveTrainer(changed, storage);
    expect(loadTrainer(storage).badges[0].earned).toBe(true);
  });
});
