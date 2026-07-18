export type TrainerItemKind = "heal" | "status" | "utility";

export interface PartyMember {
  id: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  status: "healthy" | "poisoned";
  sprite: string;
}

export interface TrainerItem {
  id: string;
  name: string;
  quantity: number;
  kind: TrainerItemKind;
  description: string;
}

export interface TrainerBadge {
  id: string;
  label: string;
  earned: boolean;
}

export interface TrainerState {
  version: 2;
  party: PartyMember[];
  items: TrainerItem[];
  badges: TrainerBadge[];
  pc: PartyMember[];
}

export interface TrainerTransition {
  state: TrainerState;
  changed: boolean;
  message: string;
}

const member = (
  id: string,
  name: string,
  level: number,
  hp: number,
  sprite: string,
): PartyMember => ({
  id,
  name,
  level,
  hp,
  maxHp: hp,
  status: "healthy",
  sprite,
});

export function createDefaultTrainerState(): TrainerState {
  return {
    version: 2,
    party: [
      member("treecko", "Treecko", 12, 38, "emerald-treecko"),
      member("ralts", "Ralts", 9, 29, "emerald-ralts"),
      member("zigzagoon", "Zigzagoon", 8, 31, "emerald-zigzagoon"),
    ],
    items: [
      { id: "potion", name: "Potion", quantity: 3, kind: "heal", description: "Restores 20 HP." },
      { id: "antidote", name: "Antidote", quantity: 2, kind: "status", description: "Clears poison." },
      { id: "pokeball", name: "Poké Ball", quantity: 6, kind: "utility", description: "A ball for catching wild Pokémon." },
      { id: "escape-rope", name: "Escape Rope", quantity: 1, kind: "utility", description: "Ready for the next cave route." },
    ],
    badges: ["Stone", "Knuckle", "Dynamo", "Heat", "Balance", "Feather", "Mind", "Rain"].map((label, index) => ({
      id: `badge-${index + 1}`,
      label,
      earned: false,
    })),
    pc: [
      member("mudkip", "Mudkip", 10, 35, "emerald-mudkip"),
      member("torchic", "Torchic", 10, 34, "emerald-torchic"),
      member("wingull", "Wingull", 7, 27, "emerald-wingull"),
    ],
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function normalizeTrainerState(value: unknown): TrainerState {
  const fallback = createDefaultTrainerState();
  if (!isRecord(value) || value.version !== 2) return fallback;
  const party = Array.isArray(value.party) ? value.party.filter(isPartyMember).slice(0, 6) : fallback.party;
  const pc = Array.isArray(value.pc) ? value.pc.filter(isPartyMember) : fallback.pc;
  const items = Array.isArray(value.items) ? value.items.filter(isTrainerItem) : fallback.items;
  const badges = Array.isArray(value.badges) ? value.badges.filter(isTrainerBadge).slice(0, 8) : fallback.badges;
  return {
    version: 2,
    party: party.length ? party : fallback.party,
    pc,
    items: items.length ? items : fallback.items,
    badges: badges.length === 8 ? badges : fallback.badges,
  };
}

function isPartyMember(value: unknown): value is PartyMember {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.level === "number" &&
    typeof value.hp === "number" &&
    typeof value.maxHp === "number" &&
    value.maxHp > 0 &&
    (value.status === "healthy" || value.status === "poisoned") &&
    typeof value.sprite === "string"
  );
}

function isTrainerItem(value: unknown): value is TrainerItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.quantity === "number" &&
    value.quantity >= 0 &&
    (value.kind === "heal" || value.kind === "status" || value.kind === "utility") &&
    typeof value.description === "string"
  );
}

function isTrainerBadge(value: unknown): value is TrainerBadge {
  return isRecord(value) && typeof value.id === "string" && typeof value.label === "string" && typeof value.earned === "boolean";
}

export function useTrainerItem(state: TrainerState, itemId: string, memberId: string): TrainerTransition {
  const item = state.items.find((candidate) => candidate.id === itemId);
  const target = state.party.find((candidate) => candidate.id === memberId);
  if (!item || item.quantity <= 0) return { state, changed: false, message: "There are none left." };
  if (!target) return { state, changed: false, message: "Choose a party member first." };
  if (item.kind === "utility") return { state, changed: false, message: `${item.name} is ready for field use.` };
  if (item.kind === "heal" && target.hp >= target.maxHp) {
    return { state, changed: false, message: `${target.name} already has full HP.` };
  }
  if (item.kind === "status" && target.status === "healthy") {
    return { state, changed: false, message: `${target.name} has no status condition.` };
  }

  const party = state.party.map((candidate) => {
    if (candidate.id !== memberId) return candidate;
    return item.kind === "heal"
      ? { ...candidate, hp: Math.min(candidate.maxHp, candidate.hp + 20) }
      : { ...candidate, status: "healthy" as const };
  });
  const items = state.items.map((candidate) =>
    candidate.id === itemId ? { ...candidate, quantity: candidate.quantity - 1 } : candidate,
  );
  return { state: { ...state, party, items }, changed: true, message: `${item.name} used on ${target.name}.` };
}

export function setLeadPartyMember(state: TrainerState, memberId: string): TrainerTransition {
  const index = state.party.findIndex((candidate) => candidate.id === memberId);
  if (index < 0) return { state, changed: false, message: "That party member is unavailable." };
  if (index === 0) return { state, changed: false, message: `${state.party[0].name} is already leading.` };
  const party = [...state.party];
  const [lead] = party.splice(index, 1);
  party.unshift(lead);
  return { state: { ...state, party }, changed: true, message: `${lead.name} will lead the party.` };
}

export function toggleBadge(state: TrainerState, badgeId: string): TrainerTransition {
  const badge = state.badges.find((candidate) => candidate.id === badgeId);
  if (!badge) return { state, changed: false, message: "That badge slot is unavailable." };
  const badges = state.badges.map((candidate) =>
    candidate.id === badgeId ? { ...candidate, earned: !candidate.earned } : candidate,
  );
  return {
    state: { ...state, badges },
    changed: true,
    message: `${badge.label} marked ${badge.earned ? "not earned" : "earned"}.`,
  };
}

export function depositPartyMember(state: TrainerState, memberId: string): TrainerTransition {
  if (state.party.length <= 1) return { state, changed: false, message: "At least one partner must stay in the party." };
  const memberToMove = state.party.find((candidate) => candidate.id === memberId);
  if (!memberToMove) return { state, changed: false, message: "That party member is unavailable." };
  return {
    state: {
      ...state,
      party: state.party.filter((candidate) => candidate.id !== memberId),
      pc: [...state.pc, memberToMove],
    },
    changed: true,
    message: `${memberToMove.name} was deposited in Box 1.`,
  };
}

export function withdrawPartyMember(state: TrainerState, memberId: string): TrainerTransition {
  if (state.party.length >= 6) return { state, changed: false, message: "The party is full." };
  const memberToMove = state.pc.find((candidate) => candidate.id === memberId);
  if (!memberToMove) return { state, changed: false, message: "That stored member is unavailable." };
  return {
    state: {
      ...state,
      party: [...state.party, memberToMove],
      pc: state.pc.filter((candidate) => candidate.id !== memberId),
    },
    changed: true,
    message: `${memberToMove.name} joined the party.`,
  };
}
