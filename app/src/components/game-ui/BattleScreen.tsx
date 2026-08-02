// Emerald-style wild battle screen. Pure presentation + input: the battle
// engine lives in src/lib/battle; this component renders its state and turns
// keyboard/mouse input into BattleActions. A single capture-phase document
// keydown listener consumes the game keys (arrows, A=z/space/enter,
// B=x/escape) while mounted so Game.tsx never sees battle input.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  activeMon,
  type BattleAction,
  type BattleMon,
  type BattleState,
} from "../../lib/battle";
import { expForLevel, getSpecies, spriteUrl } from "../../lib/pokedex";
import type { BagItem, StatusCondition, TrainerState } from "../../lib/trainer-state";
import "../../styles/battle.css";

interface BattleScreenProps {
  battle: BattleState;
  trainer: TrainerState;
  onAction: (action: BattleAction) => void;
  onAdvanceMessage: () => void;
  onFinish: () => void;
}

type BattleMenu = "main" | "fight" | "bag" | "party";
type BagTab = "items" | "balls";

const MAIN_ACTIONS = ["FIGHT", "BAG", "POKéMON", "RUN"] as const;

const USABLE_ITEM_IDS = new Set([
  "potion",
  "super-potion",
  "antidote",
  "full-heal",
  "revive",
  "max-revive",
]);

const STATUS_SHORT: Record<Exclude<StatusCondition, "healthy">, string> = {
  poisoned: "PSN",
  paralyzed: "PAR",
  asleep: "SLP",
  burned: "BRN",
  frozen: "FRZ",
};

const TYPEWRITER_MS = 24;

const ARROW_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const A_KEYS = new Set(["z", "Z", " ", "Enter"]);
const B_KEYS = new Set(["x", "X", "Escape"]);

// Engine break-free flavor lines (battle.ts) — they cue the ball-burst FX.
const BREAK_FREE_MESSAGES = new Set([
  "Oh no! The POKéMON broke free!",
  "Aww! It appeared to be caught!",
  "Aargh! Almost had it!",
  "Shoot! It was so close, too!",
]);

/** Which throw-animation stage the current message narrates. */
type ThrowStage = "throw" | "burst" | "caught" | null;

/** Transient FX cued by the message currently on screen. */
interface MessageFx {
  key: number;
  lunge?: "player" | "enemy";
  hit?: "player" | "enemy";
  shake?: boolean;
  levelup?: boolean;
}

const hpPercent = (mon: BattleMon): number =>
  mon.maxHp > 0 ? Math.max(0, Math.min(100, (mon.hp / mon.maxHp) * 100)) : 0;

const hpLevel = (mon: BattleMon): "high" | "mid" | "low" => {
  const ratio = mon.maxHp > 0 ? mon.hp / mon.maxHp : 0;
  if (ratio > 0.5) return "high";
  if (ratio >= 0.2) return "mid";
  return "low";
};

/** Progress (0-1) toward the next level, or null when it can't be computed. */
function expProgress(mon: BattleMon): number | null {
  const species = getSpecies(mon.speciesId);
  if (!species) return null;
  if (mon.level >= 100) return 0;
  const current = expForLevel(species.growthRate, mon.level);
  const next = expForLevel(species.growthRate, mon.level + 1);
  if (next <= current) return null;
  return Math.max(0, Math.min(1, (mon.exp - current) / (next - current)));
}

function GenderMark({ mon }: { mon: BattleMon }) {
  if (mon.gender !== "male" && mon.gender !== "female") return null;
  return (
    <span className={`pkbt-gender ${mon.gender}`}>{mon.gender === "male" ? "♂" : "♀"}</span>
  );
}

function HpBar({ mon }: { mon: BattleMon }) {
  return (
    <div className="pkbt-hp-row">
      <span className="pkbt-hp-tag">HP</span>
      <div className="pkbt-hp-bar">
        <span
          className={`pkbt-hp-fill ${hpLevel(mon)}`}
          style={{ width: `${hpPercent(mon)}%` }}
        />
      </div>
    </div>
  );
}

function StatusBadge({ mon }: { mon: BattleMon }) {
  if (mon.status === "healthy") return null;
  return (
    <span className={`pkbt-status pkbt-status-${mon.status}`}>{STATUS_SHORT[mon.status]}</span>
  );
}

export function BattleScreen({
  battle,
  trainer,
  onAction,
  onAdvanceMessage,
  onFinish,
}: BattleScreenProps) {
  const [menu, setMenu] = useState<BattleMenu>("main");
  const [mainIndex, setMainIndex] = useState(0);
  const [fightIndex, setFightIndex] = useState(0);
  const [bagTab, setBagTab] = useState<BagTab>("items");
  const [bagIndex, setBagIndex] = useState(0);
  const [partyIndex, setPartyIndex] = useState(0);
  const [chars, setChars] = useState(0);

  const active = activeMon(battle);
  const enemy = battle.wild;
  const message = battle.phase === "message" ? battle.messages[0] ?? "" : "";
  const complete = chars >= message.length;

  // The final message stays on screen for the phase-"over" confirmation.
  const lastMessageRef = useRef("");
  useEffect(() => {
    if (message) lastMessageRef.current = message;
  }, [message]);

  // --- Battle FX ------------------------------------------------------------
  // The engine resolves a whole turn at once, so animations are cued by the
  // message currently narrating them: lunges on "used", flinch on the
  // defender, screen shake on crits/super-effective, level-up glow, and the
  // ball throw/wobble/sparkle/burst sequence for capture attempts.

  const [fx, setFx] = useState<MessageFx>({ key: 0 });
  useEffect(() => {
    if (!message) return;
    const enemyUsed = message.startsWith(`Wild ${enemy.name} used `);
    const playerUsed = !enemyUsed && / used [^!]+!$/.test(message);
    let next: Omit<MessageFx, "key"> | null = null;
    if (enemyUsed) next = { lunge: "enemy", hit: "player" };
    else if (playerUsed) next = { lunge: "player", hit: "enemy" };
    else if (message === "A critical hit!" || message === "It's super effective!") {
      next = { shake: true };
    } else if (/grew to LV\. \d+!$/.test(message)) next = { levelup: true };
    if (next) setFx((current) => ({ ...next, key: current.key + 1 }));
  }, [message, battle.messages.length, enemy.name]);

  const throwFx = battle.lastThrow;
  let throwStage: ThrowStage = null;
  if (throwFx) {
    if (battle.phase !== "command" && message.startsWith("You threw")) throwStage = "throw";
    else if (BREAK_FREE_MESSAGES.has(message)) throwStage = "burst";
    else if (battle.outcome === "caught") throwStage = "caught";
  }

  // Keep the wild fainted on the ground while the KO narration plays out.
  const enemyFainted =
    enemy.hp <= 0 &&
    (battle.phase === "over" ||
      message === `Wild ${enemy.name} fainted!` ||
      / gained \d+ EXP\. Points!$/.test(message) ||
      /grew to LV\. \d+!$/.test(message));
  const playerFainted = active.hp <= 0;

  const enemySpriteClass = [
    "pkbt-sprite",
    "pkbt-sprite-enemy",
    throwStage === "throw" ? "pkbt-absorb" : "",
    throwStage === "caught" ? "pkbt-absorbed" : "",
    throwStage === "burst" ? "pkbt-reappear" : "",
    fx.lunge === "enemy" ? "pkbt-lunge-enemy" : "",
    fx.hit === "enemy" && !throwStage ? "pkbt-hit" : "",
    enemyFainted && !throwStage ? "pkbt-faint" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const playerSpriteClass = [
    "pkbt-sprite",
    "pkbt-sprite-player",
    fx.lunge === "player" ? "pkbt-lunge-player" : "",
    fx.hit === "player" ? "pkbt-hit" : "",
    playerFainted ? "pkbt-faint" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Typewriter (same feel as DialogBox, simplified to one message at a time).
  useEffect(() => {
    setChars(0);
  }, [battle.messages]);

  useEffect(() => {
    if (complete) return;
    const timer = window.setInterval(
      () => setChars((current) => Math.min(current + 1, message.length)),
      TYPEWRITER_MS,
    );
    return () => window.clearInterval(timer);
  }, [complete, battle.messages, message.length]);

  // Leaving the command phase always folds submenus back to the root menu.
  useEffect(() => {
    if (battle.phase !== "command") setMenu("main");
  }, [battle.phase]);

  const bagItems = useMemo(
    () =>
      trainer.bag.items.filter(
        (item) => USABLE_ITEM_IDS.has(item.id) && item.quantity > 0,
      ),
    [trainer.bag.items],
  );
  const bagBalls = useMemo(
    () => trainer.bag.pokeballs.filter((item) => item.quantity > 0),
    [trainer.bag.pokeballs],
  );
  const bagList = bagTab === "items" ? bagItems : bagBalls;

  useEffect(() => {
    setBagIndex((current) => Math.min(current, Math.max(0, bagList.length - 1)));
  }, [bagList.length]);

  const advanceCurrentMessage = () => {
    if (!complete) {
      setChars(message.length);
    } else {
      onAdvanceMessage();
    }
  };

  const anyMoveUsable = active.moves.some((move) => move.pp > 0);

  const chooseMove = (index: number) => {
    if (!anyMoveUsable) {
      onAction({ kind: "move", index: 0 }); // engine resolves Struggle
      return;
    }
    const move = active.moves[index];
    if (!move || move.pp <= 0) return;
    onAction({ kind: "move", index });
  };

  const chooseBagEntry = (entry: BagItem) => {
    if (bagTab === "balls") {
      onAction({ kind: "ball", ballId: entry.id });
      return;
    }
    const isRevive = entry.id === "revive" || entry.id === "max-revive";
    const faintedIndex = battle.party.findIndex((mon) => mon.hp <= 0);
    onAction({
      kind: "item",
      itemId: entry.id,
      targetIndex: isRevive && faintedIndex >= 0 ? faintedIndex : undefined,
    });
  };

  const choosePartyMember = (index: number) => {
    const mon = battle.party[index];
    if (!mon || mon.hp <= 0 || index === battle.activeIndex) return;
    onAction({ kind: "switch", index });
  };

  const openMainAction = (index: number) => {
    setMainIndex(index);
    if (index === 0) {
      setFightIndex(0);
      setMenu("fight");
    } else if (index === 1) {
      setBagTab("items");
      setBagIndex(0);
      setMenu("bag");
    } else if (index === 2) {
      setPartyIndex(battle.activeIndex);
      setMenu("party");
    } else {
      onAction({ kind: "run" });
    }
  };

  // One capture-phase keydown listener for the whole battle. The ref keeps
  // the handler fresh without re-registering on every state change.
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (event: KeyboardEvent) => {
    const { key } = event;
    const isA = A_KEYS.has(key);
    const isB = B_KEYS.has(key);
    const isArrow = ARROW_KEYS.has(key);
    if (!isA && !isB && !isArrow) return;
    event.stopPropagation();
    event.preventDefault();

    if (battle.phase === "message") {
      if (isA || isB) advanceCurrentMessage();
      return;
    }
    if (battle.phase === "over") {
      if (isA || isB) onFinish();
      return;
    }
    if (battle.phase !== "command") return;

    if (menu === "main") {
      if (key === "ArrowLeft" || key === "ArrowRight") setMainIndex((index) => index ^ 1);
      else if (key === "ArrowUp" || key === "ArrowDown") setMainIndex((index) => index ^ 2);
      else if (isA) openMainAction(mainIndex);
      return;
    }
    if (menu === "fight") {
      const count = Math.max(1, active.moves.length);
      const step = (bit: number) =>
        setFightIndex((index) => {
          const next = index ^ bit;
          return next < count ? next : index;
        });
      if (key === "ArrowLeft" || key === "ArrowRight") step(1);
      else if (key === "ArrowUp" || key === "ArrowDown") step(2);
      else if (isA) chooseMove(fightIndex);
      else if (isB) setMenu("main");
      return;
    }
    if (menu === "bag") {
      if (key === "ArrowLeft" || key === "ArrowRight") {
        setBagTab((tab) => (tab === "items" ? "balls" : "items"));
        setBagIndex(0);
      } else if (key === "ArrowUp") {
        setBagIndex((index) => Math.max(0, index - 1));
      } else if (key === "ArrowDown") {
        setBagIndex((index) => Math.min(Math.max(0, bagList.length - 1), index + 1));
      } else if (isA) {
        const entry = bagList[bagIndex];
        if (entry) chooseBagEntry(entry);
      } else if (isB) {
        setMenu("main");
      }
      return;
    }
    if (menu === "party") {
      if (key === "ArrowUp") setPartyIndex((index) => Math.max(0, index - 1));
      else if (key === "ArrowDown") {
        setPartyIndex((index) => Math.min(battle.party.length - 1, index + 1));
      } else if (isA) choosePartyMember(partyIndex);
      else if (isB) setMenu("main");
    }
  };

  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyHandlerRef.current(event);
    document.addEventListener("keydown", listener, { capture: true });
    return () => document.removeEventListener("keydown", listener, { capture: true });
  }, []);

  const playerExp = expProgress(active);
  const selectedMove = active.moves[fightIndex] ?? active.moves[0];

  return (
    <div className="pkbt-screen">
      <div className={`pkbt-field${fx.shake ? " pkbt-field-shake" : ""}`} key={`field-${fx.shake ? fx.key : "still"}`}>
        <div className="pkbt-pad pkbt-pad-enemy" />
        <div className="pkbt-pad pkbt-pad-player" />
        {enemy.speciesId > 0 ? (
          <img
            key={`enemy-${enemy.speciesId}-${enemy.shiny ? "s" : "n"}-${
              fx.lunge === "enemy" || fx.hit === "enemy" ? fx.key : "fx"
            }`}
            className={enemySpriteClass}
            src={spriteUrl(enemy.speciesId, { shiny: enemy.shiny })}
            alt={`Wild ${enemy.name}`}
            onError={(event) => {
              event.currentTarget.style.visibility = "hidden";
            }}
          />
        ) : null}
        {active.speciesId > 0 ? (
          <img
            key={`player-${active.speciesId}-${active.shiny ? "s" : "n"}-${
              fx.lunge === "player" || fx.hit === "player" ? fx.key : "fx"
            }`}
            className={playerSpriteClass}
            src={spriteUrl(active.speciesId, { back: true, shiny: active.shiny })}
            alt={active.name}
            onError={(event) => {
              event.currentTarget.style.visibility = "hidden";
            }}
          />
        ) : null}
        {throwStage && throwFx ? (
          <div
            key={`ball-${throwFx.turn}-${throwStage}`}
            className={`pkbt-ball pkbt-ball-${throwStage}`}
            style={{ "--pkbt-shakes": Math.max(0, throwFx.shakes) } as React.CSSProperties}
            aria-hidden="true"
          >
            <span className="pkbt-ball-body" />
            {throwStage === "caught" ? (
              <>
                <span className="pkbt-spark pkbt-spark-1">✦</span>
                <span className="pkbt-spark pkbt-spark-2">✧</span>
                <span className="pkbt-spark pkbt-spark-3">✦</span>
                <span className="pkbt-spark pkbt-spark-4">✧</span>
              </>
            ) : null}
            {throwStage === "burst" ? <span className="pkbt-ball-flash" /> : null}
          </div>
        ) : null}

        <div className="pkbt-info pkbt-info-enemy">
          <div className="pkbt-info-top">
            <span className="pkbt-name">{enemy.name}</span>
            <GenderMark mon={enemy} />
            {enemy.shiny ? <span className="pkbt-shiny">✨</span> : null}
            <span className="pkbt-level">LV.{enemy.level}</span>
          </div>
          <HpBar mon={enemy} />
          {enemy.status !== "healthy" ? (
            <div className="pkbt-info-bottom">
              <StatusBadge mon={enemy} />
            </div>
          ) : null}
        </div>

        <div
          className={`pkbt-info pkbt-info-player${fx.levelup ? " pkbt-levelup" : ""}`}
          key={`pinfo-${fx.levelup ? fx.key : "still"}`}
        >
          <div className="pkbt-info-top">
            <span className="pkbt-name">{active.name}</span>
            <GenderMark mon={active} />
            {active.shiny ? <span className="pkbt-shiny">✨</span> : null}
            <span className="pkbt-level">LV.{active.level}</span>
          </div>
          <HpBar mon={active} />
          <div className="pkbt-info-bottom">
            <StatusBadge mon={active} />
            <span className="pkbt-hp-digits">
              {active.hp}/{active.maxHp}
            </span>
          </div>
          {playerExp !== null ? (
            <div className="pkbt-exp-row">
              <span className="pkbt-exp-tag">EXP</span>
              <div className="pkbt-exp-bar">
                <span className="pkbt-exp-fill" style={{ width: `${playerExp * 100}%` }} />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="pkbt-bottom">
        {battle.phase === "message" ? (
          <button
            type="button"
            className="pkbt-message"
            onClick={advanceCurrentMessage}
            aria-label="Advance battle message"
          >
            {message.slice(0, chars)}
            {complete && message ? <span className="pkbt-arrow">▼</span> : null}
          </button>
        ) : battle.phase === "over" ? (
          <button
            type="button"
            className="pkbt-message"
            onClick={onFinish}
            aria-label="End battle"
          >
            {lastMessageRef.current}
            <span className="pkbt-arrow">▼</span>
          </button>
        ) : menu === "fight" ? (
          <div className="pkbt-fight">
            <div className="pkbt-moves">
              {active.moves.map((move, index) => {
                const unusable = move.pp <= 0 && anyMoveUsable;
                return (
                  <button
                    key={move.id}
                    type="button"
                    className={`pkbt-move${unusable ? " unusable" : ""}`}
                    onClick={() => {
                      setFightIndex(index);
                      chooseMove(index);
                    }}
                    onMouseEnter={() => setFightIndex(index)}
                  >
                    <span className="pkbt-cursor">{index === fightIndex ? "▶" : ""}</span>
                    <span className="pkbt-row-label">{move.name}</span>
                  </button>
                );
              })}
            </div>
            <div className="pkbt-move-meta">
              <div className="pkbt-move-meta-line">
                <span className="pkbt-move-meta-label">PP</span>
                <span>
                  {selectedMove ? `${selectedMove.pp}/${selectedMove.maxPp}` : "--"}
                </span>
              </div>
              <div className="pkbt-move-meta-line">
                <span className="pkbt-move-meta-label">TYPE</span>
                <span>{selectedMove?.type ?? "--"}</span>
              </div>
              <button type="button" className="pkbt-back" onClick={() => setMenu("main")}>
                BACK
              </button>
            </div>
          </div>
        ) : (
          <div className="pkbt-command">
            <div className="pkbt-prompt">What will {active.name} do?</div>
            <div className="pkbt-actions">
              {MAIN_ACTIONS.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className="pkbt-action"
                  onClick={() => openMainAction(index)}
                  onMouseEnter={() => setMainIndex(index)}
                >
                  <span className="pkbt-cursor">
                    {index === mainIndex && menu === "main" ? "▶" : ""}
                  </span>
                  <span className="pkbt-row-label">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {battle.phase === "command" && menu === "bag" ? (
        <div className="pkbt-sheet">
          <div className="pkbt-sheet-head">
            <button
              type="button"
              className={`pkbt-tab${bagTab === "items" ? " active" : ""}`}
              onClick={() => {
                setBagTab("items");
                setBagIndex(0);
              }}
            >
              ITEMS
            </button>
            <button
              type="button"
              className={`pkbt-tab${bagTab === "balls" ? " active" : ""}`}
              onClick={() => {
                setBagTab("balls");
                setBagIndex(0);
              }}
            >
              POKé BALLS
            </button>
            <button type="button" className="pkbt-back" onClick={() => setMenu("main")}>
              BACK
            </button>
          </div>
          <ul className="pkbt-sheet-list">
            {bagList.length === 0 ? (
              <li className="pkbt-empty">
                {bagTab === "items" ? "NO USABLE ITEMS" : "NO POKé BALLS"}
              </li>
            ) : (
              bagList.map((entry, index) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={`pkbt-row${index === bagIndex ? " selected" : ""}`}
                    onClick={() => {
                      setBagIndex(index);
                      chooseBagEntry(entry);
                    }}
                    onMouseEnter={() => setBagIndex(index)}
                  >
                    <span className="pkbt-cursor">{index === bagIndex ? "▶" : ""}</span>
                    <span className="pkbt-row-label">{entry.name}</span>
                    <span className="pkbt-row-qty">×{entry.quantity}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {battle.phase === "command" && menu === "party" ? (
        <div className="pkbt-sheet">
          <div className="pkbt-sheet-head">
            <span className="pkbt-sheet-title">CHOOSE A POKéMON.</span>
            <button type="button" className="pkbt-back" onClick={() => setMenu("main")}>
              BACK
            </button>
          </div>
          <ul className="pkbt-sheet-list">
            {battle.party.map((mon, index) => {
              const fainted = mon.hp <= 0;
              const disabled = fainted || index === battle.activeIndex;
              return (
                <li key={mon.memberId}>
                  <button
                    type="button"
                    className={`pkbt-row${index === partyIndex ? " selected" : ""}${
                      disabled ? " disabled" : ""
                    }`}
                    onClick={() => {
                      setPartyIndex(index);
                      choosePartyMember(index);
                    }}
                    onMouseEnter={() => setPartyIndex(index)}
                  >
                    <span className="pkbt-cursor">{index === partyIndex ? "▶" : ""}</span>
                    {mon.speciesId > 0 ? (
                      <img
                        className="pkbt-party-sprite"
                        src={spriteUrl(mon.speciesId, { shiny: mon.shiny })}
                        alt=""
                        onError={(event) => {
                          event.currentTarget.style.visibility = "hidden";
                        }}
                      />
                    ) : (
                      <span className="pkbt-party-sprite" />
                    )}
                    <span className="pkbt-row-label">{mon.name}</span>
                    <span className="pkbt-party-lv">LV.{mon.level}</span>
                    <span className="pkbt-party-bar">
                      <span
                        className={`pkbt-hp-fill ${hpLevel(mon)}`}
                        style={{ width: `${hpPercent(mon)}%` }}
                      />
                    </span>
                    <span className={`pkbt-party-hp${fainted ? " fnt" : ""}`}>
                      {fainted ? "FNT" : `${mon.hp}/${mon.maxHp}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
