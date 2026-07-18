import { describe, expect, it } from "vitest";
import {
  createDefaultTrainerState,
  depositPartyMember,
  normalizeTrainerState,
  toggleBadge,
  useTrainerItem,
  withdrawPartyMember,
} from "../src/lib/trainer-state";

describe("trainer state", () => {
  it("normalizes missing or malformed persisted data to a playable state", () => {
    expect(normalizeTrainerState(null)).toEqual(createDefaultTrainerState());
    expect(normalizeTrainerState({ version: 1, party: [] })).toEqual(createDefaultTrainerState());
    expect(normalizeTrainerState({ party: [], badges: [] }).party).toHaveLength(3);
    expect(normalizeTrainerState({ party: [], badges: [] }).badges).toHaveLength(8);
  });

  it("uses healing items once and persists the resulting quantity", () => {
    const initial = createDefaultTrainerState();
    initial.party[0] = { ...initial.party[0], hp: 9 };
    const result = useTrainerItem(initial, "potion", "treecko");

    expect(result.changed).toBe(true);
    expect(result.state.party[0].hp).toBe(29);
    expect(result.state.items.find((item) => item.id === "potion")?.quantity).toBe(2);
    expect(useTrainerItem(result.state, "potion", "treecko").state.party[0].hp).toBe(38);
  });

  it("does not consume an item when it has no effect", () => {
    const initial = createDefaultTrainerState();
    const result = useTrainerItem(initial, "potion", "treecko");
    expect(result.changed).toBe(false);
    expect(result.state).toBe(initial);
    expect(result.state.items[0].quantity).toBe(3);
  });

  it("moves members between the party and PC without losing state", () => {
    const initial = createDefaultTrainerState();
    const withdrawn = withdrawPartyMember(initial, "mudkip");
    expect(withdrawn.changed).toBe(true);
    expect(withdrawn.state.party.map((member) => member.id)).toContain("mudkip");
    expect(withdrawn.state.pc.map((member) => member.id)).not.toContain("mudkip");

    const deposited = depositPartyMember(withdrawn.state, "mudkip");
    expect(deposited.changed).toBe(true);
    expect(deposited.state.party.map((member) => member.id)).not.toContain("mudkip");
    expect(deposited.state.pc.map((member) => member.id)).toContain("mudkip");
  });

  it("records badge progress deterministically", () => {
    const initial = createDefaultTrainerState();
    const earned = toggleBadge(initial, "badge-3");
    expect(earned.state.badges[2].earned).toBe(true);
    expect(toggleBadge(earned.state, "badge-3").state.badges[2].earned).toBe(false);
  });
});
