import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getSpecies, type PokedexEntry } from "../../lib/pokedex";
import { KANTO_STARTER_IDS, normalizeNickname, spriteForSpecies } from "../../lib/trainer-state";
import { DialogBox } from "./DialogBox";

export interface StarterChoice {
  speciesId: number;
  nickname?: string;
}

interface OakIntroProps {
  onComplete: (choice: StarterChoice) => void;
}

type Phase = "greeting" | "pick" | "nickname" | "farewell";

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

const starterSprite = (speciesId: number) => `/sprites/pokemon/${spriteForSpecies(speciesId)}.png`;

/**
 * First-run onboarding shown before any save exists: PROF. OAK's welcome
 * dialog, the white pick-your-starter screen (Squirtle / Charmander /
 * Bulbasaur), and an optional nickname before the adventure starts.
 */
export function OakIntro({ onComplete }: OakIntroProps) {
  const [phase, setPhase] = useState<Phase>("greeting");
  const [advance, setAdvance] = useState(0);
  const [pickedId, setPickedId] = useState<number | null>(null);
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

  // A / Space / Enter advance Oak's dialog like in-game text boxes. Buttons and
  // the nickname input keep their native key handling.
  useEffect(() => {
    if (phase !== "greeting" && phase !== "farewell") return;
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
      if (key === "z" || key === "Z" || key === " " || key === "Enter" || key === "ArrowDown") {
        event.preventDefault();
        setAdvance((current) => current + 1);
      }
    };
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [phase]);

  const chooseStarter = (speciesId: number) => {
    setPickedId(speciesId);
    setNickname("");
    setPhase("nickname");
  };

  const confirmNickname = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAdvance(0);
    setPhase("farewell");
  };

  const finish = () => {
    if (pickedId === null) return;
    onComplete({ speciesId: pickedId, nickname: finalNickname });
  };

  return (
    <div className="oak-intro" data-phase={phase}>
      {phase === "greeting" || phase === "farewell" ? (
        <div className="oak-intro-scene">
          {phase === "farewell" && picked ? (
            <img
              className="oak-intro-partner"
              src={starterSprite(picked.id)}
              alt={picked.displayName}
            />
          ) : (
            <div className="oak-intro-ball" aria-hidden="true" />
          )}
          <div className="oak-intro-speaker">PROF. OAK</div>
          <DialogBox
            key={phase}
            pages={phase === "greeting" ? GREETING_PAGES : picked ? farewellPages(picked, finalNickname) : []}
            advance={advance}
            onRequestAdvance={() => setAdvance((current) => current + 1)}
            onDone={phase === "greeting" ? () => setPhase("pick") : finish}
          />
        </div>
      ) : null}
      {phase === "pick" ? (
        <div className="oak-starter-screen">
          <h2 className="oak-starter-title">PICK YOUR STARTER!</h2>
          <p className="oak-starter-sub">Choose the POKéMON that will start this adventure with you.</p>
          <div className="oak-starter-grid">
            {starters.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="oak-starter-card"
                onClick={() => chooseStarter(entry.id)}
                aria-label={`Choose ${entry.displayName}, the ${entry.types.join(" and ")} type ${entry.genus} POKéMON`}
              >
                <img src={starterSprite(entry.id)} alt="" />
                <span className="oak-starter-name">{entry.displayName}</span>
                <span className="oak-starter-type">{entry.types.join(" / ")}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {phase === "nickname" && picked ? (
        <form className="oak-starter-screen" onSubmit={confirmNickname}>
          <img className="oak-nickname-sprite" src={starterSprite(picked.id)} alt={picked.displayName} />
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
