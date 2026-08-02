import { useEffect, useMemo, useRef, useState } from "react";
import { allSpecies, spriteUrl, type PokedexEntry } from "../../lib/pokedex";
import type { TrainerState } from "../../lib/trainer-state";
import { PanelFrame } from "./PanelFrame";

interface PokedexPanelProps {
  trainer: TrainerState;
  onClose: () => void;
}

const dexNo = (id: number): string => `No. ${String(id).padStart(3, "0")}`;

export function PokedexPanel({ trainer, onClose }: PokedexPanelProps) {
  const species = useMemo(() => allSpecies(), []);
  const seen = useMemo(() => new Set(trainer.pokedex.seen), [trainer.pokedex.seen]);
  const caught = useMemo(() => new Set(trainer.pokedex.caught), [trainer.pokedex.caught]);
  const [cursor, setCursor] = useState(0);
  const [detail, setDetail] = useState<PokedexEntry | null>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    rowRefs.current[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor, detail]);

  useEffect(() => {
    // Capture-phase listener so the panel wins over Game.tsx's document-level
    // B handling and can pop the detail view before the panel closes.
    const onKeydown = (event: KeyboardEvent) => {
      const key = event.key;
      const isA = key === "z" || key === "Z" || key === " " || key === "Enter";
      const isB = key === "x" || key === "X" || key === "Escape" || key === "Backspace";
      if (detail) {
        if (isB) {
          event.preventDefault();
          event.stopPropagation();
          setDetail(null);
        } else if (isA || key.startsWith("Arrow")) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      if (key === "ArrowUp" || key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        const delta = key === "ArrowUp" ? species.length - 1 : 1;
        setCursor((index) => (index + delta) % species.length);
      } else if (isA) {
        event.preventDefault();
        event.stopPropagation();
        const entry = species[cursor];
        if (entry && seen.has(entry.id)) setDetail(entry);
      } else if (isB) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeydown, true);
    return () => document.removeEventListener("keydown", onKeydown, true);
  }, [cursor, detail, onClose, seen, species]);

  return (
    <PanelFrame
      title="POKéDEX"
      onClose={onClose}
      footer={
        <span>
          {detail
            ? "Press B to return to the list."
            : "▲▼ scroll · A opens a SEEN entry · B closes."}
        </span>
      }
    >
      <div className="pkmn-dex-counts">
        <span>SEEN {seen.size}</span>
        <span>CAUGHT {caught.size}</span>
      </div>
      {detail ? (
        <div className="pkmn-dex-detail">
          <div className="pkmn-dex-detail-top">
            <img
              className={`pkmn-dex-detail-sprite${caught.has(detail.id) ? "" : " silhouette"}`}
              src={spriteUrl(detail.id)}
              alt={caught.has(detail.id) ? `${detail.displayName} sprite` : "Unknown POKéMON silhouette"}
            />
            <div className="pkmn-dex-detail-id">
              <strong>
                {dexNo(detail.id)} {detail.displayName}
                {caught.has(detail.id) ? <span className="pkmn-dex-ball" aria-label="Caught" /> : null}
              </strong>
              <span className="pkmn-dex-genus">{detail.genus.toUpperCase()} POKéMON</span>
              <span className="pkmn-dex-types">
                {detail.types.map((type) => (
                  <span className="pkmn-dex-type-chip" key={type}>{type}</span>
                ))}
              </span>
              <span className="pkmn-dex-measure">
                HT {detail.heightM.toFixed(1)} m · WT {detail.weightKg.toFixed(1)} kg
              </span>
            </div>
          </div>
          <p className="pkmn-dex-flavor">
            {caught.has(detail.id) ? detail.flavor : "Data will be recorded when caught."}
          </p>
          <button type="button" className="pkmn-dex-back" onClick={() => setDetail(null)}>
            ◀ BACK
          </button>
        </div>
      ) : (
        <ul className="pkmn-dex-list">
          {species.map((entry, index) => {
            const isSeen = seen.has(entry.id);
            const isCaught = caught.has(entry.id);
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  ref={(node) => { rowRefs.current[index] = node; }}
                  className={`pkmn-dex-row${index === cursor ? " selected" : ""}`}
                  onClick={() => {
                    setCursor(index);
                    if (isSeen) setDetail(entry);
                  }}
                >
                  <span className="pkmn-dex-cursor">{index === cursor ? "▶" : ""}</span>
                  <span className="pkmn-dex-no">{dexNo(entry.id)}</span>
                  <span className="pkmn-dex-thumb">
                    {isSeen ? (
                      <img
                        className={isCaught ? "" : "silhouette"}
                        src={spriteUrl(entry.id)}
                        alt=""
                        loading="lazy"
                      />
                    ) : null}
                  </span>
                  <span className="pkmn-dex-name">{isSeen ? entry.displayName : "?????"}</span>
                  {isCaught ? <span className="pkmn-dex-ball" aria-label="Caught" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </PanelFrame>
  );
}
