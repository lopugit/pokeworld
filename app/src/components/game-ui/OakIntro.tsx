import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { inviteGreetingPages, type PublicInvite } from "../../lib/invites";
import { getSpecies, type PokedexEntry } from "../../lib/pokedex";
import { KANTO_STARTER_IDS, normalizeNickname } from "../../lib/trainer-state";
import { DialogBox } from "./DialogBox";

export interface StarterChoice {
  speciesId: number;
  nickname?: string;
}

interface OakIntroProps {
  onComplete: (choice: StarterChoice) => void;
  /** A resolved invite personalizes OAK's greeting for the invited friend. */
  invite?: PublicInvite | null;
}

type Phase = "greeting" | "pick" | "confirm" | "nickname" | "farewell";

// Each page is at most two lines of ~33 characters — the textbox is the
// authentic 2-line GBA message window and never scrolls.
const GREETING_PAGES = [
  "Hello there!\nWelcome to the world of POKéMON!",
  "My name is OAK!\nPeople call me the POKéMON PROF!",
  "This world is inhabited by\ncreatures called POKéMON!",
  "For some people, POKéMON are\npets. Others use them for fights.",
  "Myself... I study POKéMON\nas a profession.",
  "Your very own POKéMON legend is\nabout to unfold!",
  "A world of dreams and adventures\nwith POKéMON awaits! Let's go!",
  "First things first, though!\nEvery TRAINER needs a partner.",
  "Go on, pick your very first\nPOKéMON!",
];

const farewellPages = (species: PokedexEntry, nickname?: string): string[] => {
  const partner = nickname ?? species.displayName;
  const pages = [
    `So! You want the ${species.types[0].toUpperCase()}\nPOKéMON, ${species.displayName}?`,
    "This POKéMON is really\nenergetic!",
  ];
  if (nickname) pages.push(`And you named it ${nickname}!\nWhat a fitting name!`);
  pages.push(
    `${partner} and you will write\nyour very own legend together!`,
    "Your adventure is about to\nbegin... Let's go!",
  );
  return pages;
};

// Face-on FireRed/LeafGreen front sprites for the selection scene (the Emerald
// gen3 fronts read like PC-box icons at this size — see PR discussion).
const starterSprite = (speciesId: number) => `/sprites/pokemon/frlg/${speciesId}.png`;

// Assets composed from the vendored pokeemerald graphics by
// scripts/intro/build-intro-assets.mjs.
const LECTURE_BG = "/sprites/intro/lecture-bg.png";
const STARTER_BG = "/sprites/intro/starter-bg.png";
const BALL_SPRITE = "/sprites/intro/pokeball.png";
const BALL_TILT_A = "/sprites/intro/pokeball-tilt-a.png";
const BALL_TILT_B = "/sprites/intro/pokeball-tilt-b.png";
const HAND_SPRITE = "/sprites/intro/hand.png";
const CIRCLE_SPRITE = "/sprites/intro/starter-circle.png";
const OAK_SPRITE = "/sprites/intro/oak.png";

/** One GBA pixel on the 240x160 stage. */
const gpx = (n: number) => `calc(${n} * var(--px))`;

// Everything below is positioned with pokeemerald's own coordinates
// (src/starter_choose.c / src/main_menu.c), on a 240x160 stage.
/** sPokeballCoords — sprite centers of the three POKé BALLs. */
const BALL_CENTERS: Array<[number, number]> = [
  [60, 64],
  [120, 88],
  [180, 64],
];
/** sCursorCoords — sprite center of the 32x32 hand cursor per selection. */
const CURSOR_CENTERS: Array<[number, number]> = [
  [60, 32],
  [120, 56],
  [180, 32],
];
/** sStarterLabelCoords * 8 — top-left of the 104x32 species label window. */
const LABEL_ORIGINS: Array<[number, number]> = [
  [0, 72],
  [128, 80],
  [64, 32],
];
/** STARTER_PKMN_POS — where the reveal circle + POKéMON slide to. */
const REVEAL_CENTER: [number, number] = [120, 64];
/** Ground line of the spotlight platform (Birch's feet: 64x64 pic at y=60). */
const PLATFORM_FEET_Y = 92;
/** oak.png is 80x80 with the art's feet on row 78. */
const OAK_SIZE = 80;
const OAK_FEET_OFFSET = 79;

const spriteBox = (centerX: number, centerY: number, size: number): CSSProperties => ({
  left: gpx(centerX - size / 2),
  top: gpx(centerY - size / 2),
  width: gpx(size),
  height: gpx(size),
});

/**
 * First-run onboarding, staged like the original Emerald intro: the professor
 * lecture on the spotlit circle, then Birch's field bag with the three POKé
 * BALLs, the floating glove cursor, the white-circle reveal with YES/NO, and
 * an optional nickname before the adventure starts. Backgrounds and sprites
 * are the exact pokeemerald graphics; coordinates match the decomp.
 */
export function OakIntro({ onComplete, invite }: OakIntroProps) {
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

  const inBagScene = phase === "pick" || phase === "confirm";
  const labelOrigin = LABEL_ORIGINS[ballIndex];
  const selectedBall = BALL_CENTERS[ballIndex];

  return (
    <div className="oak-intro" data-phase={phase}>
      {phase === "greeting" || phase === "farewell" ? (
        <div className="oak-lecture">
          <img className="oak-stage-bg" src={LECTURE_BG} alt="" />
          <img
            className="oak-lecture-oak"
            src={OAK_SPRITE}
            alt="PROF. OAK"
            style={{
              // Feet on the spotlight platform; centered alone, at Birch's
              // spot (136, 60) when the partner joins for the farewell.
              left: gpx((phase === "farewell" ? 136 : 120) - OAK_SIZE / 2),
              top: gpx(PLATFORM_FEET_Y - OAK_FEET_OFFSET),
              width: gpx(OAK_SIZE),
              height: gpx(OAK_SIZE),
            }}
          />
          {phase === "farewell" && picked ? (
            <img
              className="oak-lecture-partner"
              src={starterSprite(picked.id)}
              alt={picked.displayName}
              style={spriteBox(100, 75, 64)}
            />
          ) : null}
          <DialogBox
            key={phase}
            pages={
              phase === "greeting"
                ? invite
                  ? inviteGreetingPages(invite)
                  : GREETING_PAGES
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
          <img className="oak-stage-bg" src={STARTER_BG} alt="" />
          {starters.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              className={`oak-ball ${phase === "pick" && index === ballIndex ? "selected" : ""}`}
              style={spriteBox(BALL_CENTERS[index][0], BALL_CENTERS[index][1], 32)}
              disabled={phase === "confirm"}
              onClick={() => openConfirm(index)}
              onPointerEnter={() => phase === "pick" && setBallIndex(index)}
              onFocus={() => setBallIndex(index)}
              aria-label={`POKé BALL containing ${entry.displayName}`}
            >
              <img className="oak-ball-frame" src={BALL_SPRITE} alt="" />
              <img className="oak-ball-frame oak-ball-tilt-a" src={BALL_TILT_A} alt="" />
              <img className="oak-ball-frame oak-ball-tilt-b" src={BALL_TILT_B} alt="" />
            </button>
          ))}
          {phase === "pick" ? (
            <img
              className="oak-hand"
              src={HAND_SPRITE}
              alt=""
              style={spriteBox(CURSOR_CENTERS[ballIndex][0], CURSOR_CENTERS[ballIndex][1], 32)}
            />
          ) : null}
          {phase === "pick" && starters[ballIndex] ? (
            // The species label: a 104x32 window whose surroundings darken by
            // BLDY 7/16 inside WIN0 (4px wider than the window on each side).
            <div
              className="oak-starter-label"
              style={{ left: gpx(labelOrigin[0] - 4), top: gpx(labelOrigin[1]) }}
            >
              <span className="oak-starter-label-genus">
                {starters[ballIndex].genus} POKéMON
              </span>
              <span className="oak-starter-label-name">{starters[ballIndex].displayName}</span>
            </div>
          ) : null}
          {phase === "pick" ? <div className="oak-question">Choose a POKéMON.</div> : null}
          {phase === "confirm" && picked ? (
            <>
              <div
                className="oak-reveal"
                style={
                  {
                    ...spriteBox(REVEAL_CENTER[0], REVEAL_CENTER[1], 64),
                    "--slide-dx": gpx(selectedBall[0] - REVEAL_CENTER[0]),
                    "--slide-dy": gpx(selectedBall[1] - REVEAL_CENTER[1]),
                  } as CSSProperties
                }
              >
                <img className="oak-reveal-circle" src={CIRCLE_SPRITE} alt="" />
                <img
                  className="oak-reveal-sprite"
                  src={starterSprite(picked.id)}
                  alt={picked.displayName}
                />
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
