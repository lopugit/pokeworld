import { describe, expect, it } from "vitest";
import {
  activeMon,
  advanceMessage,
  applyBattleOutcome,
  catchAttempt,
  createWildBattle,
  movesFor,
  submitAction,
  wildMonFromEncounter,
  type BattleState,
} from "../src/lib/battle";
import type { EncounterResult } from "../src/lib/encounters";
import { defaultTrainer } from "../src/lib/trainer-state";

const seq = (...values: number[]) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
};

const encounter = (overrides: Partial<EncounterResult> = {}): EncounterResult => ({
  speciesId: 263, // Zigzagoon
  level: 5,
  gender: "male",
  shiny: false,
  ruleId: "263:default",
  ...overrides,
});

const startBattle = (enc: EncounterResult = encounter()): BattleState => {
  let state = createWildBattle(defaultTrainer().party, enc);
  while (state.messages.length) state = advanceMessage(state);
  return state;
};

describe("movepools", () => {
  it("derives level-appropriate STAB movesets, capped at four", () => {
    const low = movesFor(["FIRE"], 5);
    expect(low.some((move) => move.name === "EMBER")).toBe(true);
    expect(low.every((move) => move.power <= 40)).toBe(true);
    const high = movesFor(["FIRE", "FLYING"], 50);
    expect(high).toHaveLength(4);
    expect(high.some((move) => move.type === "FIRE")).toBe(true);
    expect(high.some((move) => move.type === "FLYING")).toBe(true);
  });
});

describe("battle flow", () => {
  it("opens with the wild appearance and lead send-out", () => {
    const state = createWildBattle(defaultTrainer().party, encounter());
    expect(state.messages[0]).toContain("Wild ZIGZAGOON appeared!");
    expect(state.messages[1]).toContain("Go! TREECKO!");
    expect(state.phase).toBe("message");
    const ready = advanceMessage(advanceMessage(state));
    expect(ready.phase).toBe("command");
  });

  it("resolves a full damage turn with Gen III math and both sides acting", () => {
    let state = startBattle();
    // Treecko L12 spe > Zigzagoon L5 → player first; neutral rolls all hit.
    state = submitAction(state, { kind: "move", index: 0 }, seq(0.5));
    expect(state.messages.some((message) => message.includes("TREECKO used"))).toBe(true);
    expect(state.wild.hp).toBeLessThan(state.wild.maxHp);
    // Wild also attacked back unless it fainted.
    if (state.wild.hp > 0) {
      expect(activeMon(state).hp).toBeLessThan(activeMon(state).maxHp);
    }
    // PP consumed.
    expect(activeMon(state).moves[0].pp).toBe(activeMon(state).moves[0].maxPp - 1);
  });

  it("awards experience and can level up after a knockout", () => {
    let state = startBattle();
    // Cripple the wild so any hit faints it.
    state = { ...state, wild: { ...state.wild, hp: 1 } };
    state = submitAction(state, { kind: "move", index: 0 }, seq(0.5, 0.5, 0.99, 0.5));
    expect(state.outcome).toBe("victory");
    expect(state.messages.some((message) => message.includes("gained"))).toBe(true);
    const active = activeMon(state);
    expect(active.exp).toBeGreaterThan(0);
  });

  it("switching costs the turn (wild gets a free attack)", () => {
    let state = startBattle();
    state = submitAction(state, { kind: "switch", index: 1 }, seq(0.99, 0.5, 0.99, 0.5));
    expect(state.activeIndex).toBe(1);
    expect(state.messages.some((message) => message.includes("Go! RALTS!"))).toBe(true);
  });

  it("run-away uses the Gen III escape odds", () => {
    let state = startBattle();
    // Treecko (fast) vs Zigzagoon: speed advantage always escapes.
    state = submitAction(state, { kind: "run" }, seq(0.99));
    expect(state.outcome).toBe("fled");
    expect(state.messages).toContain("Got away safely!");
  });

  it("in-battle potions heal and consume a turn", () => {
    let state = startBattle();
    const hurtActive = { ...activeMon(state), hp: 5 };
    state = { ...state, party: state.party.map((mon, index) => (index === 0 ? hurtActive : mon)) };
    state = submitAction(state, { kind: "item", itemId: "potion" }, seq(0.99, 0.5, 0.99, 0.5));
    expect(activeMon(state).hp).toBeGreaterThan(5);
    expect(state.itemsUsed.potion).toBe(1);
  });

  it("useless items do not consume the turn or the item", () => {
    let state = startBattle();
    state = submitAction(state, { kind: "item", itemId: "potion" }, seq(0.5));
    expect(state.itemsUsed.potion).toBeUndefined();
    expect(state.messages[0]).toContain("full HP");
  });
});

describe("catching", () => {
  it("guaranteed catch when the Gen III formula saturates", () => {
    // Zigzagoon (rate 255) at 1 HP asleep with an ultra ball: a >= 255.
    const wild = wildMonFromEncounter(encounter());
    const weakened = { ...wild, hp: 1, status: "asleep" as const };
    const result = catchAttempt(weakened, "ultra-ball", seq(0.99));
    expect(result.caught).toBe(true);
  });

  it("legendaries at full HP are hard to catch", () => {
    const groudon = wildMonFromEncounter(encounter({ speciesId: 383, level: 50 }));
    // rng always rolls the top of the shake range → every check fails.
    const result = catchAttempt(groudon, "poke-ball", seq(0.999999));
    expect(result.caught).toBe(false);
  });

  it("a successful throw ends the battle and records ball usage", () => {
    let state = startBattle();
    state = { ...state, wild: { ...state.wild, hp: 1, status: "asleep" } };
    state = submitAction(state, { kind: "ball", ballId: "ultra-ball" }, seq(0, 0, 0, 0));
    expect(state.outcome).toBe("caught");
    expect(state.itemsUsed["ultra-ball"]).toBe(1);
    expect(state.messages.some((message) => message.includes("was caught"))).toBe(true);
  });

  it("a failed throw still consumes the ball and the wild attacks", () => {
    let state = startBattle(encounter({ speciesId: 383, level: 50 }));
    state = submitAction(state, { kind: "ball", ballId: "poke-ball" }, seq(0.999999, 0.5, 0.99, 0.5));
    expect(state.outcome).toBeNull();
    expect(state.itemsUsed["poke-ball"]).toBe(1);
  });

  it("records every throw's computed shake count for the UI animation", () => {
    // Failed throw on a full-HP legendary: zero shakes pass.
    let state = startBattle(encounter({ speciesId: 383, level: 50 }));
    state = submitAction(state, { kind: "ball", ballId: "poke-ball" }, seq(0.999999, 0.5, 0.99, 0.5));
    expect(state.lastThrow).toMatchObject({ ballId: "poke-ball", caught: false, shakes: 0 });

    // Successful throw always animates the full three wobbles before the click.
    let catchState = startBattle();
    catchState = { ...catchState, wild: { ...catchState.wild, hp: 1, status: "asleep" } };
    catchState = submitAction(catchState, { kind: "ball", ballId: "ultra-ball" }, seq(0, 0, 0, 0));
    expect(catchState.lastThrow).toMatchObject({ ballId: "ultra-ball", caught: true, shakes: 3 });
  });
});

describe("battle outcome application", () => {
  it("catches flow into the party, the dex, and consume balls", () => {
    const trainer = defaultTrainer();
    let state = startBattle(encounter({ speciesId: 25, level: 5 })); // Pikachu
    state = { ...state, wild: { ...state.wild, hp: 1, status: "asleep" } };
    state = submitAction(state, { kind: "ball", ballId: "poke-ball" }, seq(0, 0, 0, 0));
    expect(state.outcome).toBe("caught");

    const applied = applyBattleOutcome(trainer, state);
    expect(applied.trainer.party.some((member) => member.speciesId === 25)).toBe(true);
    expect(applied.trainer.pokedex.caught).toContain(25);
    expect(applied.trainer.pokedex.seen).toContain(25);
    const balls = applied.trainer.bag.pokeballs.find((item) => item.id === "poke-ball");
    expect(balls?.quantity).toBe(5);
    expect(applied.messages.some((message) => message.includes("POKéDEX"))).toBe(true);
  });

  it("overflows catches into the PC when the party is full", () => {
    const trainer = defaultTrainer();
    // Fill party to six.
    while (trainer.party.length < 6) {
      trainer.party.push({ ...trainer.party[0], id: `filler-${trainer.party.length}` });
    }
    let state = createWildBattle(trainer.party, encounter({ speciesId: 25, level: 5 }));
    while (state.messages.length) state = advanceMessage(state);
    state = { ...state, wild: { ...state.wild, hp: 1, status: "asleep" } };
    state = submitAction(state, { kind: "ball", ballId: "ultra-ball" }, seq(0, 0, 0, 0));
    const applied = applyBattleOutcome(trainer, state);
    expect(applied.trainer.party).toHaveLength(6);
    expect(applied.trainer.pc.some((member) => member.speciesId === 25)).toBe(true);
    expect(applied.messages.some((message) => message.includes("BOX 1"))).toBe(true);
  });

  it("registers seen (not caught) for escaped encounters and syncs battle damage", () => {
    const trainer = defaultTrainer();
    let state = startBattle(encounter({ speciesId: 300, level: 5 })); // Skitty
    // Manually mark some chip damage on the lead then flee.
    state = {
      ...state,
      party: state.party.map((mon, index) => (index === 0 ? { ...mon, hp: mon.hp - 4 } : mon)),
    };
    state = submitAction(state, { kind: "run" }, seq(0.99));
    const applied = applyBattleOutcome(trainer, state);
    expect(applied.trainer.pokedex.seen).toContain(300);
    expect(applied.trainer.pokedex.caught).not.toContain(300);
    expect(applied.trainer.party[0].hp).toBe(trainer.party[0].hp - 4);
  });

  it("defeat revives the team with a white-out message", () => {
    const trainer = defaultTrainer();
    let state = startBattle();
    state = {
      ...state,
      party: state.party.map((mon) => ({ ...mon, hp: 0 })),
      outcome: "defeat" as const,
    };
    const applied = applyBattleOutcome(trainer, state);
    expect(applied.trainer.party.every((member) => member.hp === member.maxHp)).toBe(true);
    expect(applied.messages.some((message) => message.includes("whited out"))).toBe(true);
  });
});
