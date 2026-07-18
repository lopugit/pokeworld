import type { TrainerState } from "../../lib/trainer-state";
import { PanelFrame } from "./PanelFrame";

export function PartyPanel({ trainer, onClose }: { trainer: TrainerState; onClose: () => void }) {
  return (
    <PanelFrame title="POKéMON" onClose={onClose}>
      {trainer.party.length ? (
        <ul className="pkmn-party-list">
          {trainer.party.map((member) => {
            const ratio = member.maxHp > 0 ? member.hp / member.maxHp : 0;
            const barTone = ratio > 0.5 ? "high" : ratio > 0.2 ? "mid" : "low";
            return (
              <li key={member.id} className="pkmn-party-row">
                <span className="pkmn-ball-icon" aria-hidden="true" />
                <span className="pkmn-party-name">{member.nickname ?? member.species}</span>
                <span className="pkmn-party-level">Lv{member.level}</span>
                <span className="pkmn-hp-bar" aria-label={`HP ${member.hp} of ${member.maxHp}`}>
                  <span className={`pkmn-hp-fill ${barTone}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
                </span>
                <span className="pkmn-party-hp">
                  {member.hp}/{member.maxHp}
                </span>
                <span className="pkmn-party-types">{member.types.join(" · ")}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="pkmn-panel-empty">You have no POKéMON... yet!</div>
      )}
    </PanelFrame>
  );
}
