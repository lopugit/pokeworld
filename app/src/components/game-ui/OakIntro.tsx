import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { getSpecies, type PokedexEntry } from "../../lib/pokedex";
import { KANTO_STARTER_IDS, normalizeNickname } from "../../lib/trainer-state";
import { DialogBox } from "./DialogBox";

export interface StarterChoice {
  speciesId: number;
  nickname?: string;
}

interface OakIntroProps {
  onComplete: (choice: StarterChoice) => void;
}

type Phase = "greeting" | "pick" | "confirm" | "nickname" | "farewell";

const GREETING_PAGES = [
  "Hello there!\nWelcome to the world of POKéMON!",
  "My name is OAK!\nPeople call me the POKéMON PROF!",
  "This world is inhabited by creatures called POKéMON!",
  "For some people, POKéMON are pets. Others use them for fights. Myself... I study POKéMON as a profession.",
  "Your very own POKéMON legend is about to unfold! A world of dreams and adventures with POKéMON awaits!",
  "First things first, though! Every TRAINER needs a partner. Go on, pick your very first POKéMON!",
];

const farewellPages = (species: PokedexEntry, nickname?: string): string[] => {
  const partner = nickname ?? species.displayName;
  const pages = [
    `So! You want the ${species.types[0]} POKéMON, ${species.displayName}? This POKéMON is really energetic!`,
  ];
  if (nickname) pages.push(`And you named it ${nickname}! What a fitting name for a first partner!`);
  pages.push(
    `${partner} and you will write your very own POKéMON legend together!`,
    "Your adventure is about to begin...\nLet's go!",
  );
  return pages;
};

// Face-on FireRed/LeafGreen front sprites for the selection scene (the Emerald
// gen3 fronts read like PC-box icons at this size — see PR discussion).
const starterSprite = (speciesId: number) => `/sprites/pokemon/frlg/${speciesId}.png`;

const BALL_SPRITE = "/sprites/intro/poke-ball.png";
const OAK_SPRITE = "/sprites/intro/oak.png";

/** Left / centre / right resting spots for the three balls (cqw units). */
const BALL_SPOTS: Array<{ left: number; top: number }> = [
  { left: 16, top: 47 },
  { left: 44.5, top: 60 },
  { left: 73, top: 47 },
];

/** Emerald-intro white glove, drawn as crisp pixel rects (1 unit = 1 px). */
function HandCursor({ style }: { style?: CSSProperties }) {
  return (
    <svg
      className="oak-hand"
      style={style}
      viewBox="0 0 18 18"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* cuff */}
      <rect x="5" y="0" width="9" height="3" fill="#303030" />
      <rect x="6" y="1" width="7" height="1" fill="#e84040" />
      {/* mitt with a thumb bump on the left */}
      <rect x="4" y="3" width="12" height="7" fill="#303030" />
      <rect x="2" y="5" width="4" height="4" fill="#303030" />
      <rect x="5" y="3" width="10" height="6" fill="#f8f8f8" />
      <rect x="3" y="6" width="3" height="2" fill="#f8f8f8" />
      <rect x="5" y="8" width="10" height="1" fill="#d0d0d8" />
      {/* pointing finger */}
      <rect x="8" y="10" width="5" height="7" fill="#303030" />
      <rect x="9" y="10" width="3" height="6" fill="#f8f8f8" />
      <rect x="9" y="15" width="3" height="1" fill="#d0d0d8" />
    </svg>
  );
}

/** PROF. OAK's field bag, pixel-drawn to match the Emerald starter scene. */
function BagArt() {
  return (
    <svg className="oak-bag-art" viewBox="0 0 64 44" shapeRendering="crispEdges" aria-hidden="true">
      {/* shoulder strap: one clean loop lying toward the grass on the right */}
      <path
        d="M34 10 C48 -2 62 6 60 20 C59 28 54 34 46 36"
        fill="none"
        stroke="#4a3420"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      <path
        d="M34 10 C48 -2 62 6 60 20 C59 28 54 34 46 36"
        fill="none"
        stroke="#8a6238"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      {/* body */}
      <rect x="4" y="10" width="44" height="30" rx="4" fill="#4a3420" />
      <rect x="6" y="12" width="40" height="26" rx="3" fill="#b8884e" />
      <rect x="6" y="12" width="40" height="8" fill="#c99b60" />
      <rect x="6" y="32" width="40" height="6" fill="#9a6f3c" />
      {/* flap */}
      <rect x="8" y="6" width="30" height="14" rx="3" fill="#4a3420" />
      <rect x="10" y="8" width="26" height="10" rx="2" fill="#d3a86c" />
      <rect x="10" y="14" width="26" height="2" fill="#b8884e" />
      {/* clasp */}
      <rect x="20" y="14" width="8" height="6" fill="#4a3420" />
      <rect x="21" y="15" width="6" height="4" fill="#e8e0d0" />
    </svg>
  );
}

/** Scattered light grass blades on the dark field, like the Emerald scene. */
function GrassTufts() {
  const tufts: Array<[number, number]> = [
    [6, 22], [88, 18], [12, 66], [80, 74], [30, 84], [62, 88], [4, 44],
    [92, 46], [24, 36], [70, 30], [46, 26], [55, 78], [16, 90],
  ];
  const blade = (x: number, y: number, height: number, lean: number) =>
    `${x},${y} ${x + lean},${y - height} ${x + lean + 0.9},${y - height + 0.4} ${x + 1.6},${y}`;
  return (
    <svg className="oak-grass-tufts" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {tufts.map(([x, y], index) => (
        <g key={index} fill={index % 3 ? "#5d9457" : "#6fae64"}>
          <polygon points={blade(x, y, 3, -0.8)} />
          <polygon points={blade(x + 2, y, 4.4, 0.2)} />
          <polygon points={blade(x + 4, y, 3, 1)} />
        </g>
      ))}
    </svg>
  );
}

/**
 * First-run onboarding, staged like the original Emerald intro: the professor
 * lecture on the spotlit circle, then his bag with three POKé BALLs on the
 * grass, a floating hand cursor, a white-circle reveal with YES/NO, and an
 * optional nickname before the adventure starts.
 */
export function OakIntro({ onComplete }: OakIntroProps) {
  const [phase, setPhase] = useState<Phase>("greeting");
  const [advance, setAdvance] = useState(0);
  const [ballIndex, setBallIndex] = useState(1);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [confirmChoice, setConfirmChoice] = useState<"yes" | "no">("yes");
  const [nickname, setNickname] = useState("");

  const starters = useMemo(
    () =>
      KANTO_STARTER_IDS.map((id) => getSpecies(id)).filter(
        (entry): entry is PokedexEntry => entry !== undefined,
      ),
    [],
  );
  const picked = pickedId === null ? undefined : getSpecies(pickedId);
  const finalNickname = normalizeNickname(nickname);

  const openConfirm = (index: number) => {
    setBallIndex(index);
    setPickedId(starters[index]?.id ?? null);
    setConfirmChoice("yes");
    setPhase("confirm");
  };

  const resolveConfirm = (choice: "yes" | "no") => {
    if (choice === "yes") {
      setNickname("");
      setPhase("nickname");
    } else {
      setPickedId(null);
      setPhase("pick");
    }
  };

  // Keyboard support per phase; buttons and the nickname input keep their
  // native key handling (the game's own listener is suspended during the intro).
  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "BUTTON" ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = event.key;
      const isA = key === "z" || key === "Z" || key === " " || key === "Enter";
      const isB = key === "x" || key === "X" || key === "Escape" || key === "Backspace";
      if (phase === "greeting" || phase === "farewell") {
        if (isA || key === "ArrowDown") {
          event.preventDefault();
          setAdvance((current) => current + 1);
        }
        return;
      }
      if (phase === "pick") {
        if (key === "ArrowLeft" || key === "ArrowUp") {
          event.preventDefault();
          setBallIndex((current) => (current + 2) % 3);
        } else if (key === "ArrowRight" || key === "ArrowDown") {
          event.preventDefault();
          setBallIndex((current) => (current + 1) % 3);
        } else if (isA) {
          event.preventDefault();
          openConfirm(ballIndex);
        }
        return;
      }
      if (phase === "confirm") {
        if (key === "ArrowUp" || key === "ArrowDown") {
          event.preventDefault();
          setConfirmChoice((current) => (current === "yes" ? "no" : "yes"));
        } else if (isA) {
          event.preventDefault();
          resolveConfirm(confirmChoice);
        } else if (isB) {
          event.preventDefault();
          resolveConfirm("no");
        }
      }
    };
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, ballIndex, confirmChoice, starters]);

  const finish = () => {
    if (pickedId === null) return;
    onComplete({ speciesId: pickedId, nickname: finalNickname });
  };

  const selectedBall = BALL_SPOTS[ballIndex];
  const inBagScene = phase === "pick" || phase === "confirm";

  return (
    <div className="oak-intro" data-phase={phase}>
      {phase === "greeting" || phase === "farewell" ? (
        <div className="oak-lecture">
          <div className="oak-lecture-band top" />
          <div className="oak-lecture-band bottom" />
          <div className="oak-spotlight" />
          <div className="oak-lecture-cast">
            <img className="oak-lecture-oak" src={OAK_SPRITE} alt="PROF. OAK" />
            {phase === "farewell" && picked ? (
              <img
                className="oak-lecture-partner"
                src={starterSprite(picked.id)}
                alt={picked.displayName}
              />
            ) : null}
          </div>
          <DialogBox
            key={phase}
            pages={
              phase === "greeting"
                ? GREETING_PAGES
                : picked
                  ? farewellPages(picked, finalNickname)
                  : []
            }
            advance={advance}
            onRequestAdvance={() => setAdvance((current) => current + 1)}
            onDone={
              phase === "greeting"
                ? () => {
                    setBallIndex(1);
                    setPhase("pick");
                  }
                : finish
            }
          />
        </div>
      ) : null}

      {inBagScene ? (
        <div className="oak-bag-scene">
          <GrassTufts />
          <BagArt />
          {starters.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              className="oak-ball"
              style={{ left: `${BALL_SPOTS[index].left}cqw`, top: `${BALL_SPOTS[index].top}cqw` }}
              disabled={phase === "confirm"}
              onClick={() => openConfirm(index)}
              onPointerEnter={() => phase === "pick" && setBallIndex(index)}
              onFocus={() => setBallIndex(index)}
              aria-label={`POKé BALL containing ${entry.displayName}`}
            >
              <img src={BALL_SPRITE} alt="" />
            </button>
          ))}
          {phase === "pick" ? (
            <HandCursor
              style={{ left: `${selectedBall.left + 1.5}cqw`, top: `${selectedBall.top - 11}cqw` }}
            />
          ) : null}
          {phase === "pick" ? (
            <div className="oak-question">Choose a POKéMON.</div>
          ) : null}
          {phase === "confirm" && picked ? (
            <>
              <div className="oak-reveal-circle">
                <img
                  className="oak-reveal-sprite"
                  src={starterSprite(picked.id)}
                  alt={picked.displayName}
                />
              </div>
              <div className="oak-genus-banner">
                <span>{picked.genus} POKéMON</span>
                <span>{picked.displayName}</span>
              </div>
              <div className="oak-choice-box" role="menu" aria-label="Do you choose this POKéMON?">
                {(["yes", "no"] as const).map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    role="menuitem"
                    className={`oak-choice ${confirmChoice === choice ? "selected" : ""}`}
                    onClick={() => resolveConfirm(choice)}
                    onPointerEnter={() => setConfirmChoice(choice)}
                  >
                    <span className="oak-choice-cursor">{confirmChoice === choice ? "▶" : ""}</span>
                    {choice === "yes" ? "YES" : "NO"}
                  </button>
                ))}
              </div>
              <div className="oak-question">Do you choose this POKéMON?</div>
            </>
          ) : null}
        </div>
      ) : null}

      {phase === "nickname" && picked ? (
        <form
          className="oak-starter-screen"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            setAdvance(0);
            setPhase("farewell");
          }}
        >
          <img
            className="oak-nickname-sprite"
            src={starterSprite(picked.id)}
            alt={picked.displayName}
          />
          <h2 className="oak-nickname-label">Give {picked.displayName} a nickname?</h2>
          <p className="oak-starter-sub">Totally optional! Leave it blank to keep {picked.displayName}.</p>
          <input
            className="oak-nickname-input"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            maxLength={10}
            placeholder="NICKNAME"
            aria-label={`Optional nickname for ${picked.displayName}`}
            autoComplete="off"
            spellCheck={false}
          />
          <div className="oak-intro-actions">
            <button
              type="button"
              className="oak-intro-button secondary"
              onClick={() => {
                setPickedId(null);
                setPhase("pick");
              }}
            >
              BACK
            </button>
            <button type="submit" className="oak-intro-button">
              I CHOOSE YOU!
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
