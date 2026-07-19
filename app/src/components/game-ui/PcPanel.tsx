import { useState } from "react";
import {
  depositPartyMember,
  withdrawPartyMember,
  type PartyMember,
  type TrainerState,
  type TrainerTransition,
} from "../../lib/trainer-state";
import { PanelFrame } from "./PanelFrame";

interface PcPanelProps {
  trainer: TrainerState;
  onChange: (trainer: TrainerState) => void;
  onClose: () => void;
}

const MemberButton = ({
  action,
  member,
  onClick,
}: {
  action: "DEPOSIT" | "WITHDRAW";
  member: PartyMember;
  onClick: () => void;
}) => (
  <button
    type="button"
    className="pkmn-pc-member"
    aria-label={`${action === "DEPOSIT" ? "Deposit" : "Withdraw"} ${member.species}`}
    onClick={onClick}
  >
    <img src={`/sprites/pokemon/${member.sprite}.png`} alt="" />
    <span>{action}<strong>{member.species}</strong><small>Lv{member.level}</small></span>
  </button>
);

export function PcPanel({ trainer, onChange, onClose }: PcPanelProps) {
  const [message, setMessage] = useState("Withdraw or deposit a POKéMON.");
  const apply = (transition: TrainerTransition) => {
    setMessage(transition.message);
    if (transition.changed) onChange(transition.state);
  };

  return (
    <PanelFrame title={`${trainer.name}'s PC`} onClose={onClose} footer={<span>{message}</span>}>
      <div className="pkmn-pc-grid">
        <section>
          <h3>PARTY · {trainer.party.length}/6</h3>
          {trainer.party.map((member) => (
            <MemberButton
              key={member.id}
              action="DEPOSIT"
              member={member}
              onClick={() => apply(depositPartyMember(trainer, member.id))}
            />
          ))}
        </section>
        <section>
          <h3>BOX 1 · {trainer.pc.length}</h3>
          {trainer.pc.length ? trainer.pc.map((member) => (
            <MemberButton
              key={member.id}
              action="WITHDRAW"
              member={member}
              onClick={() => apply(withdrawPartyMember(trainer, member.id))}
            />
          )) : <div className="pkmn-panel-empty">The box is empty.</div>}
        </section>
      </div>
      {trainer.pcItems.length ? (
        <div className="pkmn-pc-item-storage">
          ITEM STORAGE · {trainer.pcItems.map((item) => `${item.name} ×${item.quantity}`).join(" · ")}
        </div>
      ) : null}
    </PanelFrame>
  );
}
