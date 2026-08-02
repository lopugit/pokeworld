// Wild-battle engine: a pure, RNG-injectable state machine implementing
// Gen III mechanics — damage formula, type chart + STAB, crits, the Gen III
// capture/shake formula, run-away odds, status conditions, PP, switching,
// in-battle item use, and experience with growth-curve level-ups.
//
// The UI feeds player commands into `submitAction` and drains
// `state.messages` one dialog line at a time. `applyBattleOutcome` folds the
// finished battle back into the persisted trainer.

import {
  calcStats,
  expForLevel,
  expGainForDefeat,
  getSpecies,
  levelForExp,
  typeEffectiveness,
  type PokemonGender,
  type Rng,
  type StatBlock,
} from "./pokedex";
import type { EncounterResult } from "./encounters";
import {
  addCaughtPokemon,
  registerSeen,
  removeBagItem,
  spriteForSpecies,
  type PartyMember,
  type StatusCondition,
  type TrainerState,
} from "./trainer-state";

// --- Moves ------------------------------------------------------------------

export interface BattleMove {
  id: string;
  name: string;
  type: string;
  power: number;
  /** null = never misses */
  accuracy: number | null;
  pp: number;
  maxPp: number;
  /** Chance (0-1) to inflict `inflicts` on the target. */
  effectChance?: number;
  inflicts?: Exclude<StatusCondition, "healthy">;
}

interface MoveSpec {
  name: string;
  power: number;
  accuracy: number | null;
  minLevel: number;
  pp: number;
  effectChance?: number;
  inflicts?: Exclude<StatusCondition, "healthy">;
}

const MOVE_LIBRARY: Record<string, MoveSpec[]> = {
  NORMAL: [
    { name: "TACKLE", power: 35, accuracy: 95, minLevel: 1, pp: 35 },
    { name: "HEADBUTT", power: 70, accuracy: 100, minLevel: 12, pp: 15 },
    { name: "BODY SLAM", power: 85, accuracy: 100, minLevel: 24, pp: 15, effectChance: 0.3, inflicts: "paralyzed" },
    { name: "DOUBLE-EDGE", power: 120, accuracy: 100, minLevel: 38, pp: 15 },
  ],
  FIRE: [
    { name: "EMBER", power: 40, accuracy: 100, minLevel: 1, pp: 25, effectChance: 0.1, inflicts: "burned" },
    { name: "FLAME WHEEL", power: 60, accuracy: 100, minLevel: 14, pp: 25, effectChance: 0.1, inflicts: "burned" },
    { name: "FLAMETHROWER", power: 95, accuracy: 100, minLevel: 28, pp: 15, effectChance: 0.1, inflicts: "burned" },
    { name: "FIRE BLAST", power: 120, accuracy: 85, minLevel: 42, pp: 5, effectChance: 0.1, inflicts: "burned" },
  ],
  WATER: [
    { name: "WATER GUN", power: 40, accuracy: 100, minLevel: 1, pp: 25 },
    { name: "BUBBLEBEAM", power: 65, accuracy: 100, minLevel: 14, pp: 20 },
    { name: "SURF", power: 95, accuracy: 100, minLevel: 28, pp: 15 },
    { name: "HYDRO PUMP", power: 120, accuracy: 80, minLevel: 42, pp: 5 },
  ],
  GRASS: [
    { name: "ABSORB", power: 20, accuracy: 100, minLevel: 1, pp: 25 },
    { name: "MEGA DRAIN", power: 40, accuracy: 100, minLevel: 10, pp: 15 },
    { name: "RAZOR LEAF", power: 55, accuracy: 95, minLevel: 18, pp: 25 },
    { name: "PETAL DANCE", power: 70, accuracy: 100, minLevel: 30, pp: 20 },
    { name: "SOLARBEAM", power: 120, accuracy: 100, minLevel: 44, pp: 10 },
  ],
  ELECTRIC: [
    { name: "THUNDERSHOCK", power: 40, accuracy: 100, minLevel: 1, pp: 30, effectChance: 0.1, inflicts: "paralyzed" },
    { name: "SPARK", power: 65, accuracy: 100, minLevel: 16, pp: 20, effectChance: 0.3, inflicts: "paralyzed" },
    { name: "THUNDERBOLT", power: 95, accuracy: 100, minLevel: 30, pp: 15, effectChance: 0.1, inflicts: "paralyzed" },
    { name: "THUNDER", power: 120, accuracy: 70, minLevel: 44, pp: 10, effectChance: 0.3, inflicts: "paralyzed" },
  ],
  ICE: [
    { name: "POWDER SNOW", power: 40, accuracy: 100, minLevel: 1, pp: 25, effectChance: 0.1, inflicts: "frozen" },
    { name: "AURORA BEAM", power: 65, accuracy: 100, minLevel: 16, pp: 20 },
    { name: "ICE BEAM", power: 95, accuracy: 100, minLevel: 30, pp: 10, effectChance: 0.1, inflicts: "frozen" },
    { name: "BLIZZARD", power: 120, accuracy: 70, minLevel: 44, pp: 5, effectChance: 0.1, inflicts: "frozen" },
  ],
  FIGHTING: [
    { name: "KARATE CHOP", power: 50, accuracy: 100, minLevel: 1, pp: 25 },
    { name: "BRICK BREAK", power: 75, accuracy: 100, minLevel: 20, pp: 15 },
    { name: "CROSS CHOP", power: 100, accuracy: 80, minLevel: 38, pp: 5 },
  ],
  POISON: [
    { name: "POISON STING", power: 15, accuracy: 100, minLevel: 1, pp: 35, effectChance: 0.3, inflicts: "poisoned" },
    { name: "ACID", power: 40, accuracy: 100, minLevel: 8, pp: 30 },
    { name: "SLUDGE", power: 65, accuracy: 100, minLevel: 20, pp: 20, effectChance: 0.3, inflicts: "poisoned" },
    { name: "SLUDGE BOMB", power: 90, accuracy: 100, minLevel: 36, pp: 10, effectChance: 0.3, inflicts: "poisoned" },
  ],
  GROUND: [
    { name: "MUD-SLAP", power: 20, accuracy: 100, minLevel: 1, pp: 10 },
    { name: "MUD SHOT", power: 55, accuracy: 95, minLevel: 15, pp: 15 },
    { name: "DIG", power: 60, accuracy: 100, minLevel: 24, pp: 10 },
    { name: "EARTHQUAKE", power: 100, accuracy: 100, minLevel: 40, pp: 10 },
  ],
  FLYING: [
    { name: "PECK", power: 35, accuracy: 100, minLevel: 1, pp: 35 },
    { name: "WING ATTACK", power: 60, accuracy: 100, minLevel: 16, pp: 35 },
    { name: "AERIAL ACE", power: 60, accuracy: null, minLevel: 22, pp: 20 },
    { name: "DRILL PECK", power: 80, accuracy: 100, minLevel: 34, pp: 20 },
  ],
  PSYCHIC: [
    { name: "CONFUSION", power: 50, accuracy: 100, minLevel: 1, pp: 25 },
    { name: "PSYBEAM", power: 65, accuracy: 100, minLevel: 18, pp: 20 },
    { name: "PSYCHIC", power: 90, accuracy: 100, minLevel: 34, pp: 10 },
  ],
  BUG: [
    { name: "LEECH LIFE", power: 20, accuracy: 100, minLevel: 1, pp: 15 },
    { name: "SILVER WIND", power: 60, accuracy: 100, minLevel: 22, pp: 5 },
    { name: "MEGAHORN", power: 120, accuracy: 85, minLevel: 42, pp: 10 },
  ],
  ROCK: [
    { name: "ROCK THROW", power: 50, accuracy: 90, minLevel: 1, pp: 15 },
    { name: "ANCIENTPOWER", power: 60, accuracy: 100, minLevel: 16, pp: 5 },
    { name: "ROCK SLIDE", power: 75, accuracy: 90, minLevel: 26, pp: 10 },
  ],
  GHOST: [
    { name: "LICK", power: 20, accuracy: 100, minLevel: 1, pp: 30, effectChance: 0.3, inflicts: "paralyzed" },
    { name: "SHADOW PUNCH", power: 60, accuracy: null, minLevel: 18, pp: 20 },
    { name: "SHADOW BALL", power: 80, accuracy: 100, minLevel: 32, pp: 15 },
  ],
  DRAGON: [
    { name: "DRAGONBREATH", power: 60, accuracy: 100, minLevel: 1, pp: 20, effectChance: 0.3, inflicts: "paralyzed" },
    { name: "DRAGON CLAW", power: 80, accuracy: 100, minLevel: 30, pp: 15 },
    { name: "OUTRAGE", power: 90, accuracy: 100, minLevel: 45, pp: 15 },
  ],
  DARK: [
    { name: "BITE", power: 60, accuracy: 100, minLevel: 1, pp: 25 },
    { name: "FAINT ATTACK", power: 60, accuracy: null, minLevel: 18, pp: 20 },
    { name: "CRUNCH", power: 80, accuracy: 100, minLevel: 32, pp: 15 },
  ],
  STEEL: [
    { name: "METAL CLAW", power: 50, accuracy: 95, minLevel: 1, pp: 35 },
    { name: "IRON TAIL", power: 100, accuracy: 75, minLevel: 30, pp: 15 },
    { name: "METEOR MASH", power: 100, accuracy: 85, minLevel: 40, pp: 10 },
  ],
};

// Gen III: damage category is decided by the move's TYPE, not the move.
const SPECIAL_TYPES = new Set(["FIRE", "WATER", "GRASS", "ELECTRIC", "PSYCHIC", "ICE", "DRAGON", "DARK"]);

export const isSpecialType = (type: string): boolean => SPECIAL_TYPES.has(type.toUpperCase());

const moveId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const toBattleMove = (spec: MoveSpec, type: string): BattleMove => ({
  id: moveId(spec.name),
  name: spec.name,
  type,
  power: spec.power,
  accuracy: spec.accuracy,
  pp: spec.pp,
  maxPp: spec.pp,
  effectChance: spec.effectChance,
  inflicts: spec.inflicts,
});

/** Deterministic level-appropriate moveset: best STAB tiers + NORMAL filler. */
export function movesFor(types: string[], level: number): BattleMove[] {
  const stab: BattleMove[] = [];
  for (const type of types) {
    const pool = MOVE_LIBRARY[type.toUpperCase()];
    if (!pool) continue;
    const available = pool.filter((spec) => spec.minLevel <= level);
    for (const spec of available.slice(-2)) stab.push(toBattleMove(spec, type.toUpperCase()));
  }
  const normals = (MOVE_LIBRARY.NORMAL ?? [])
    .filter((spec) => spec.minLevel <= level)
    .map((spec) => toBattleMove(spec, "NORMAL"));
  const moves: BattleMove[] = [];
  const seen = new Set<string>();
  for (const move of [...stab, ...normals.slice(-2).reverse()]) {
    if (seen.has(move.id) || moves.length >= 4) continue;
    seen.add(move.id);
    moves.push(move);
  }
  if (!moves.length) moves.push(toBattleMove(MOVE_LIBRARY.NORMAL[0], "NORMAL"));
  return moves;
}

export const STRUGGLE: BattleMove = {
  id: "struggle",
  name: "STRUGGLE",
  type: "NORMAL",
  power: 50,
  accuracy: 100,
  pp: Number.POSITIVE_INFINITY,
  maxPp: Number.POSITIVE_INFINITY,
};

// --- Combatants ---------------------------------------------------------------

export interface BattleMon {
  /** Trainer party member id, or "wild". */
  memberId: string;
  speciesId: number;
  name: string;
  level: number;
  exp: number;
  types: string[];
  stats: StatBlock;
  hp: number;
  maxHp: number;
  status: StatusCondition;
  sleepTurns: number;
  moves: BattleMove[];
  gender?: PokemonGender;
  shiny?: boolean;
}

const FALLBACK_STATS: StatBlock = { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 };

export function battleMonFromMember(member: PartyMember): BattleMon {
  const species = getSpecies(member.speciesId);
  const stats = member.stats ?? (species ? calcStats(species.baseStats, member.level) : FALLBACK_STATS);
  return {
    memberId: member.id,
    speciesId: member.speciesId,
    name: member.nickname ?? member.species,
    level: member.level,
    exp: member.exp,
    types: member.types,
    stats: { ...stats, hp: member.maxHp },
    hp: member.hp,
    maxHp: member.maxHp,
    status: member.status,
    sleepTurns: 0,
    moves: movesFor(member.types, member.level),
    gender: member.gender,
    shiny: member.shiny,
  };
}

export function wildMonFromEncounter(encounter: EncounterResult): BattleMon {
  const species = getSpecies(encounter.speciesId);
  const stats = species ? calcStats(species.baseStats, encounter.level) : FALLBACK_STATS;
  return {
    memberId: "wild",
    speciesId: encounter.speciesId,
    name: species?.displayName ?? `#${encounter.speciesId}`,
    level: encounter.level,
    exp: 0,
    types: species?.types ?? ["NORMAL"],
    stats,
    hp: stats.hp,
    maxHp: stats.hp,
    status: "healthy",
    sleepTurns: 0,
    moves: movesFor(species?.types ?? ["NORMAL"], encounter.level),
    gender: encounter.gender,
    shiny: encounter.shiny,
  };
}

// --- Battle state -------------------------------------------------------------

export type BattlePhase = "message" | "command" | "over";
export type BattleOutcome = "victory" | "defeat" | "caught" | "fled" | null;

export interface BattleState {
  wild: BattleMon;
  party: BattleMon[];
  activeIndex: number;
  phase: BattlePhase;
  messages: string[];
  outcome: BattleOutcome;
  runAttempts: number;
  itemsUsed: Record<string, number>;
  caught?: { ball: string; shakes: number };
  turn: number;
}

export type BattleAction =
  | { kind: "move"; index: number }
  | { kind: "switch"; index: number }
  | { kind: "item"; itemId: string; targetIndex?: number }
  | { kind: "ball"; ballId: string }
  | { kind: "run" };

export function createWildBattle(party: PartyMember[], encounter: EncounterResult): BattleState {
  const mons = party.map(battleMonFromMember);
  const activeIndex = Math.max(0, mons.findIndex((mon) => mon.hp > 0));
  const wild = wildMonFromEncounter(encounter);
  return {
    wild,
    party: mons,
    activeIndex,
    phase: "message",
    messages: [
      `Wild ${wild.name}${wild.shiny ? " ✨" : ""} appeared!`,
      `Go! ${mons[activeIndex]?.name ?? "..."}!`,
    ],
    outcome: null,
    runAttempts: 0,
    itemsUsed: {},
    turn: 0,
  };
}

export const activeMon = (state: BattleState): BattleMon => state.party[state.activeIndex];

/** UI calls this after showing each message; flips to command/over when drained. */
export function advanceMessage(state: BattleState): BattleState {
  const messages = state.messages.slice(1);
  if (messages.length > 0) return { ...state, messages };
  return { ...state, messages, phase: state.outcome ? "over" : "command" };
}

// --- Turn resolution ------------------------------------------------------------

const STATUS_LABEL: Record<Exclude<StatusCondition, "healthy">, string> = {
  poisoned: "poisoned",
  paralyzed: "paralyzed",
  asleep: "fast asleep",
  burned: "burned",
  frozen: "frozen solid",
};

const effectiveSpeed = (mon: BattleMon): number =>
  mon.status === "paralyzed" ? Math.floor(mon.stats.spe / 4) : mon.stats.spe;

const effectiveAttack = (mon: BattleMon, special: boolean): number => {
  const base = special ? mon.stats.spa : mon.stats.atk;
  return !special && mon.status === "burned" ? Math.floor(base / 2) : base;
};

interface StrikeResult {
  target: BattleMon;
  attacker: BattleMon;
  messages: string[];
}

function strike(attacker: BattleMon, target: BattleMon, move: BattleMove, rng: Rng): StrikeResult {
  const messages: string[] = [];
  const attackerName = attacker.memberId === "wild" ? `Wild ${attacker.name}` : attacker.name;
  const targetName = target.memberId === "wild" ? `Wild ${target.name}` : target.name;

  // Pre-move status gates.
  let mutableAttacker = attacker;
  if (attacker.status === "asleep") {
    if (attacker.sleepTurns <= 0) {
      mutableAttacker = { ...attacker, status: "healthy" };
      messages.push(`${attackerName} woke up!`);
    } else {
      return {
        attacker: { ...attacker, sleepTurns: attacker.sleepTurns - 1 },
        target,
        messages: [`${attackerName} is fast asleep.`],
      };
    }
  }
  if (mutableAttacker.status === "frozen") {
    if (rng() < 0.2) {
      mutableAttacker = { ...mutableAttacker, status: "healthy" };
      messages.push(`${attackerName} thawed out!`);
    } else {
      return { attacker: mutableAttacker, target, messages: [...messages, `${attackerName} is frozen solid!`] };
    }
  }
  if (mutableAttacker.status === "paralyzed" && rng() < 0.25) {
    return { attacker: mutableAttacker, target, messages: [...messages, `${attackerName} is paralyzed! It can't move!`] };
  }

  messages.push(`${attackerName} used ${move.name}!`);
  if (move.accuracy !== null && rng() * 100 >= move.accuracy) {
    return { attacker: mutableAttacker, target, messages: [...messages, `${attackerName}'s attack missed!`] };
  }

  const special = isSpecialType(move.type);
  const effectiveness = typeEffectiveness(move.type, target.types);
  if (effectiveness === 0) {
    return {
      attacker: mutableAttacker,
      target,
      messages: [...messages, `It doesn't affect ${targetName}...`],
    };
  }
  const stab = mutableAttacker.types.some((type) => type.toUpperCase() === move.type) ? 1.5 : 1;
  const crit = rng() < 1 / 16 ? 2 : 1;
  const attack = effectiveAttack(mutableAttacker, special);
  const defense = special ? target.stats.spd : target.stats.def;
  const base =
    Math.floor(
      (Math.floor((2 * mutableAttacker.level) / 5 + 2) * move.power * attack) / Math.max(1, defense) / 50,
    ) + 2;
  const randomFactor = 0.85 + rng() * 0.15;
  const damage = Math.max(1, Math.floor(base * stab * effectiveness * crit * randomFactor));
  let nextTarget = { ...target, hp: Math.max(0, target.hp - damage) };
  if (crit > 1) messages.push("A critical hit!");
  if (effectiveness > 1) messages.push("It's super effective!");
  if (effectiveness < 1) messages.push("It's not very effective...");

  if (
    move.inflicts &&
    nextTarget.hp > 0 &&
    nextTarget.status === "healthy" &&
    rng() < (move.effectChance ?? 0) &&
    !(move.inflicts === "burned" && nextTarget.types.includes("FIRE")) &&
    !(move.inflicts === "poisoned" && (nextTarget.types.includes("POISON") || nextTarget.types.includes("STEEL"))) &&
    !(move.inflicts === "frozen" && nextTarget.types.includes("ICE")) &&
    !(move.inflicts === "paralyzed" && nextTarget.types.includes("ELECTRIC"))
  ) {
    nextTarget = {
      ...nextTarget,
      status: move.inflicts,
      sleepTurns: move.inflicts === "asleep" ? 1 + Math.floor(rng() * 3) : 0,
    };
    messages.push(`${targetName} was ${STATUS_LABEL[move.inflicts]}!`);
  }
  return { attacker: mutableAttacker, target: nextTarget, messages };
}

function endOfTurnStatus(mon: BattleMon, label: string): { mon: BattleMon; messages: string[] } {
  if (mon.hp <= 0) return { mon, messages: [] };
  if (mon.status === "poisoned" || mon.status === "burned") {
    const chip = Math.max(1, Math.floor(mon.maxHp / 8));
    return {
      mon: { ...mon, hp: Math.max(0, mon.hp - chip) },
      messages: [`${label} is hurt by ${mon.status === "poisoned" ? "poison" : "its burn"}!`],
    };
  }
  return { mon, messages: [] };
}

const wildPickMove = (wild: BattleMon, rng: Rng): BattleMove => {
  const usable = wild.moves.filter((move) => move.pp > 0);
  if (!usable.length) return STRUGGLE;
  return usable[Math.floor(rng() * usable.length)];
};

const decrementPp = (mon: BattleMon, moveId: string): BattleMon => ({
  ...mon,
  moves: mon.moves.map((move) =>
    move.id === moveId && Number.isFinite(move.pp) ? { ...move, pp: Math.max(0, move.pp - 1) } : move,
  ),
});

/** Grants exp for the defeated wild mon to the active member, with level-ups. */
function grantBattleExp(state: BattleState, messages: string[]): BattleState {
  const species = getSpecies(state.wild.speciesId);
  const active = activeMon(state);
  const activeSpecies = getSpecies(active.speciesId);
  if (!species || !activeSpecies || active.hp <= 0) return state;
  const gained = expGainForDefeat(species, state.wild.level);
  messages.push(`${active.name} gained ${gained} EXP. Points!`);
  let exp = active.exp + gained;
  let level = active.level;
  const targetLevel = Math.max(level, levelForExp(activeSpecies.growthRate, exp));
  let stats = active.stats;
  let hp = active.hp;
  let maxHp = active.maxHp;
  if (targetLevel > level) {
    stats = calcStats(activeSpecies.baseStats, targetLevel);
    const gainedHp = Math.max(0, stats.hp - maxHp);
    maxHp = stats.hp;
    hp = Math.min(maxHp, hp + gainedHp);
    messages.push(`${active.name} grew to LV. ${targetLevel}!`);
    level = targetLevel;
  }
  const updated: BattleMon = {
    ...active,
    exp,
    level,
    stats,
    hp,
    maxHp,
    moves: level > active.level ? movesFor(active.types, level) : active.moves,
  };
  return {
    ...state,
    party: state.party.map((mon, index) => (index === state.activeIndex ? updated : mon)),
  };
}

// Gen III capture formula.
const BALL_BONUS: Record<string, number> = {
  "poke-ball": 1,
  "great-ball": 1.5,
  "ultra-ball": 2,
};

const STATUS_CATCH_BONUS: Record<StatusCondition, number> = {
  healthy: 1,
  poisoned: 1.5,
  paralyzed: 1.5,
  burned: 1.5,
  asleep: 2,
  frozen: 2,
};

export function catchAttempt(
  wild: BattleMon,
  ballId: string,
  rng: Rng,
): { caught: boolean; shakes: number } {
  const species = getSpecies(wild.speciesId);
  const rate = species?.catchRate ?? 45;
  const ballBonus = BALL_BONUS[ballId] ?? 1;
  const a = Math.min(
    255,
    Math.floor(
      ((3 * wild.maxHp - 2 * wild.hp) * rate * ballBonus) / (3 * wild.maxHp),
    ) * STATUS_CATCH_BONUS[wild.status],
  );
  if (a >= 255) return { caught: true, shakes: 3 };
  if (a <= 0) return { caught: false, shakes: 0 };
  const b = Math.floor(1048560 / Math.floor(Math.sqrt(Math.sqrt(16711680 / a))));
  let shakes = 0;
  for (let check = 0; check < 4; check += 1) {
    if (Math.floor(rng() * 65536) < b) shakes += 1;
    else break;
  }
  return { caught: shakes === 4, shakes: Math.min(shakes, 3) };
}

function wildTurn(state: BattleState, messages: string[], rng: Rng): BattleState {
  let { wild } = state;
  let active = activeMon(state);
  if (wild.hp <= 0 || active.hp <= 0) return state;
  const move = wildPickMove(wild, rng);
  wild = decrementPp(wild, move.id);
  const result = strike(wild, active, move, rng);
  messages.push(...result.messages);
  wild = result.attacker;
  active = result.target;
  return {
    ...state,
    wild,
    party: state.party.map((mon, index) => (index === state.activeIndex ? active : mon)),
  };
}

function concludeIfFainted(state: BattleState, messages: string[]): BattleState {
  let next = state;
  const active = activeMon(next);
  if (next.wild.hp <= 0 && !next.outcome) {
    messages.push(`Wild ${next.wild.name} fainted!`);
    next = grantBattleExp(next, messages);
    next = { ...next, outcome: "victory" };
    return next;
  }
  if (active.hp <= 0) {
    messages.push(`${active.name} fainted!`);
    const nextIndex = next.party.findIndex((mon) => mon.hp > 0);
    if (nextIndex < 0) {
      messages.push("You have no more POKéMON that can fight!", "You blacked out!");
      next = { ...next, outcome: "defeat" };
    } else {
      messages.push(`Go! ${next.party[nextIndex].name}!`);
      next = { ...next, activeIndex: nextIndex };
    }
  }
  return next;
}

function applyEndOfTurn(state: BattleState, messages: string[]): BattleState {
  if (state.outcome) return state;
  const active = activeMon(state);
  const activeResult = endOfTurnStatus(active, active.name);
  const wildResult = endOfTurnStatus(state.wild, `Wild ${state.wild.name}`);
  messages.push(...activeResult.messages, ...wildResult.messages);
  let next: BattleState = {
    ...state,
    wild: wildResult.mon,
    party: state.party.map((mon, index) => (index === state.activeIndex ? activeResult.mon : mon)),
  };
  return concludeIfFainted(next, messages);
}

export function submitAction(state: BattleState, action: BattleAction, rng: Rng): BattleState {
  if (state.phase !== "command" || state.outcome) return state;
  const messages: string[] = [];
  let next: BattleState = { ...state, turn: state.turn + 1 };

  switch (action.kind) {
    case "move": {
      let active = activeMon(next);
      const usable = active.moves.some((move) => move.pp > 0);
      const move = usable ? active.moves[action.index] : STRUGGLE;
      if (!move || (Number.isFinite(move.pp) && move.pp <= 0)) {
        return { ...next, phase: "message", messages: ["There's no PP left for this move!"], turn: state.turn };
      }
      if (!usable) messages.push(`${active.name} has no moves left!`);
      const playerFirst =
        effectiveSpeed(active) > effectiveSpeed(next.wild) ||
        (effectiveSpeed(active) === effectiveSpeed(next.wild) && rng() < 0.5);

      const playerStrike = (current: BattleState): BattleState => {
        let mon = activeMon(current);
        mon = decrementPp(mon, move.id);
        const result = strike(mon, current.wild, move, rng);
        messages.push(...result.messages);
        return {
          ...current,
          wild: result.target,
          party: current.party.map((entry, index) =>
            index === current.activeIndex ? result.attacker : entry,
          ),
        };
      };

      if (playerFirst) {
        next = playerStrike(next);
        next = concludeIfFainted(next, messages);
        if (!next.outcome) next = wildTurn(next, messages, rng);
        next = concludeIfFainted(next, messages);
      } else {
        next = wildTurn(next, messages, rng);
        next = concludeIfFainted(next, messages);
        if (!next.outcome && activeMon(next).hp > 0) next = playerStrike(next);
        next = concludeIfFainted(next, messages);
      }
      next = applyEndOfTurn(next, messages);
      break;
    }
    case "switch": {
      const target = next.party[action.index];
      if (!target || target.hp <= 0 || action.index === next.activeIndex) {
        return { ...next, phase: "message", messages: ["It can't battle!"], turn: state.turn };
      }
      messages.push(`${activeMon(next).name}, come back!`, `Go! ${target.name}!`);
      next = { ...next, activeIndex: action.index };
      next = wildTurn(next, messages, rng);
      next = concludeIfFainted(next, messages);
      next = applyEndOfTurn(next, messages);
      break;
    }
    case "item": {
      const targetIndex = action.targetIndex ?? next.activeIndex;
      const target = next.party[targetIndex];
      if (!target) return { ...next, phase: "message", messages: ["Choose a POKéMON first."], turn: state.turn };
      const applied = applyBattleItem(target, action.itemId);
      if (!applied.changed) {
        return { ...next, phase: "message", messages: [applied.message], turn: state.turn };
      }
      messages.push(applied.message);
      next = {
        ...next,
        party: next.party.map((mon, index) => (index === targetIndex ? applied.mon : mon)),
        itemsUsed: { ...next.itemsUsed, [action.itemId]: (next.itemsUsed[action.itemId] ?? 0) + 1 },
      };
      next = wildTurn(next, messages, rng);
      next = concludeIfFainted(next, messages);
      next = applyEndOfTurn(next, messages);
      break;
    }
    case "ball": {
      messages.push(`You threw a ${action.ballId.replace(/-/g, " ").toUpperCase()}!`);
      next = {
        ...next,
        itemsUsed: { ...next.itemsUsed, [action.ballId]: (next.itemsUsed[action.ballId] ?? 0) + 1 },
      };
      const result = catchAttempt(next.wild, action.ballId, rng);
      if (result.caught) {
        messages.push("Gotcha!", `${next.wild.name} was caught!`);
        next = { ...next, outcome: "caught", caught: { ball: action.ballId, shakes: 3 } };
      } else {
        const flavor = [
          "Oh no! The POKéMON broke free!",
          "Aww! It appeared to be caught!",
          "Aargh! Almost had it!",
          "Shoot! It was so close, too!",
        ][result.shakes];
        messages.push(flavor);
        next = { ...next, caught: undefined };
        next = wildTurn(next, messages, rng);
        next = concludeIfFainted(next, messages);
        next = applyEndOfTurn(next, messages);
      }
      break;
    }
    case "run": {
      const attempts = next.runAttempts + 1;
      const playerSpeed = effectiveSpeed(activeMon(next));
      const wildSpeed = Math.max(1, effectiveSpeed(next.wild));
      const odds = (Math.floor((playerSpeed * 128) / wildSpeed) + 30 * attempts) % 256;
      next = { ...next, runAttempts: attempts };
      if (playerSpeed >= wildSpeed || Math.floor(rng() * 256) < odds) {
        messages.push("Got away safely!");
        next = { ...next, outcome: "fled" };
      } else {
        messages.push("Can't escape!");
        next = wildTurn(next, messages, rng);
        next = concludeIfFainted(next, messages);
        next = applyEndOfTurn(next, messages);
      }
      break;
    }
  }

  return { ...next, phase: "message", messages: messages.length ? messages : ["..."] };
}

// In-battle bag items on party mons.
function applyBattleItem(
  mon: BattleMon,
  itemId: string,
): { mon: BattleMon; changed: boolean; message: string } {
  if (itemId === "potion" || itemId === "super-potion") {
    if (mon.hp <= 0) return { mon, changed: false, message: `${mon.name} has fainted. Use a REVIVE.` };
    if (mon.hp >= mon.maxHp) return { mon, changed: false, message: `${mon.name} already has full HP.` };
    const heal = itemId === "super-potion" ? 50 : 20;
    return {
      mon: { ...mon, hp: Math.min(mon.maxHp, mon.hp + heal) },
      changed: true,
      message: `${mon.name} recovered HP!`,
    };
  }
  if (itemId === "antidote") {
    if (mon.status !== "poisoned") return { mon, changed: false, message: `${mon.name} isn't poisoned.` };
    return { mon: { ...mon, status: "healthy" }, changed: true, message: `${mon.name} was cured of its poison!` };
  }
  if (itemId === "full-heal") {
    if (mon.status === "healthy") return { mon, changed: false, message: `${mon.name} is healthy.` };
    return { mon: { ...mon, status: "healthy" }, changed: true, message: `${mon.name} became healthy!` };
  }
  if (itemId === "revive" || itemId === "max-revive") {
    if (mon.hp > 0) return { mon, changed: false, message: `${mon.name} hasn't fainted.` };
    const hp = itemId === "max-revive" ? mon.maxHp : Math.ceil(mon.maxHp / 2);
    return { mon: { ...mon, hp, status: "healthy" }, changed: true, message: `${mon.name} was revived!` };
  }
  return { mon, changed: false, message: "It won't have any effect." };
}

// --- Folding the battle back into the trainer --------------------------------

let caughtSequence = 0;

export function applyBattleOutcome(trainer: TrainerState, state: BattleState): {
  trainer: TrainerState;
  messages: string[];
} {
  const messages: string[] = [];
  let next = registerSeen(trainer, state.wild.speciesId);

  // Sync battle copies back onto the party (hp, status, exp/levels).
  const byId = new Map(state.party.map((mon) => [mon.memberId, mon]));
  next = {
    ...next,
    party: next.party.map((member) => {
      const mon = byId.get(member.id);
      if (!mon) return member;
      return {
        ...member,
        hp: mon.hp,
        maxHp: mon.maxHp,
        status: mon.status,
        exp: Math.max(member.exp, mon.exp),
        level: Math.max(member.level, mon.level),
        stats: mon.stats,
      };
    }),
  };

  // Consume items/balls used during the battle.
  for (const [itemId, quantity] of Object.entries(state.itemsUsed)) {
    next = removeBagItem(next, itemId, quantity);
  }

  if (state.outcome === "caught") {
    caughtSequence += 1;
    const species = getSpecies(state.wild.speciesId);
    const member: PartyMember = {
      id: `caught-${Date.now().toString(36)}-${caughtSequence}`,
      speciesId: state.wild.speciesId,
      species: state.wild.name,
      level: state.wild.level,
      exp: species ? expForLevel(species.growthRate, state.wild.level) : 0,
      hp: Math.max(1, state.wild.hp),
      maxHp: state.wild.maxHp,
      stats: state.wild.stats,
      types: state.wild.types,
      status: state.wild.status,
      gender: state.wild.gender,
      shiny: state.wild.shiny,
      sprite: spriteForSpecies(state.wild.speciesId, state.wild.shiny),
    };
    const added = addCaughtPokemon(next, member);
    next = added.state;
    messages.push(
      `${state.wild.name}'s data was added to the POKéDEX!`,
      added.sentTo === "party"
        ? `${state.wild.name} joined your party!`
        : `${state.wild.name} was sent to BOX 1.`,
    );
  }

  if (state.outcome === "defeat") {
    // Blacked out: Emerald revives the party at home; here, on the spot.
    next = {
      ...next,
      party: next.party.map((member) => ({
        ...member,
        hp: member.maxHp,
        status: "healthy" as const,
      })),
    };
    messages.push(`${next.name} whited out and rushed the team to safety.`);
  }

  return { trainer: next, messages };
}
