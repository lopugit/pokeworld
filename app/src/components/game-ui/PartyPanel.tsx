import { useState } from "react";
import {
  setLeadPartyMember,
  type TrainerState,
  type TrainerTransition,
} from "../../lib/trainer-state";
import { PanelFrame } from "./PanelFrame";

interface PartyPanelProps {
  trainer: TrainerState;
  onChange: (trainer: TrainerState) => void;
  onClose: () => void;
}

export function PartyPanel({ trainer, onChange, onClose }: PartyPanelProps) {
  const [message, setMessage] = useState("Choose a POKéMON.");
  const apply = (transition: TrainerTransition) => {
    setMessage(transition.message);
    if (transition.changed) onChange(transition.state);
  };

  return (
    <PanelFrame title="POKéMON" onClose={onClose} footer={<span>{message}</span>}>
      {trainer.party.length ? (
        <ul className="pkmn-party-list">
          {trainer.party.map((member, index) => {
            const ratio = member.maxHp > 0 ? member.hp / member.maxHp : 0;
            const barTone = ratio > 0.5 ? "high" : ratio > 0.2 ? "mid" : "low";
            return (
              <li key={member.id} className="pkmn-party-row">
                <img
                  className="pkmn-party-sprite"
                  src={`/sprites/pokemon/${member.sprite}.png`}
                  alt={`${member.species} Emerald sprite`}
                />
                <span className="pkmn-party-name">
                  {index === 0 ? "★ " : ""}{member.nickname ?? member.species}
                </span>
                <span className="pkmn-party-level">Lv{member.level}</span>
                <span className="pkmn-hp-bar" aria-label={`HP ${member.hp} of ${member.maxHp}`}>
                  <span className={`pkmn-hp-fill ${barTone}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
                </span>
                <span className="pkmn-party-hp">
                  {member.hp}/{member.maxHp}
                </span>
                <span className="pkmn-party-types">{member.types.join(" · ")}</span>
                <button
                  type="button"
                  className="pkmn-party-lead"
                  disabled={index === 0}
                  onClick={() => apply(setLeadPartyMember(trainer, member.id))}
                >
                  {index === 0 ? "LEAD" : "MAKE LEAD"}
                </button>
              </li>
            );
          })}
          {Array.from({ length: Math.max(0, 6 - trainer.party.length) }, (_, index) => (
            <li className="pkmn-party-empty" key={`empty-${index}`}>EMPTY PARTY SLOT</li>
          ))}
        </ul>
      ) : (
        <div className="pkmn-panel-empty">You have no POKéMON... yet!</div>
      )}
    </PanelFrame>
  );
}
