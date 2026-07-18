import { useMemo, useState } from "react";
import {
  depositPartyMember,
  setLeadPartyMember,
  toggleBadge,
  useTrainerItem,
  withdrawPartyMember,
  type TrainerState,
  type TrainerTransition,
} from "../lib/trainer-state";

type MenuSection = "party" | "items" | "badges" | "pc";

interface EmeraldMenuProps {
  trainer: TrainerState;
  onChange: (trainer: TrainerState) => void;
  onClose: () => void;
}

const sections: Array<{ id: MenuSection; label: string }> = [
  { id: "party", label: "Party" },
  { id: "items", label: "Items" },
  { id: "badges", label: "Badges" },
  { id: "pc", label: "PC" },
];

export function EmeraldMenu({ trainer, onChange, onClose }: EmeraldMenuProps) {
  const [section, setSection] = useState<MenuSection>("party");
  const [selectedMemberId, setSelectedMemberId] = useState(trainer.party[0]?.id ?? "");
  const [message, setMessage] = useState("Choose a command.");
  const selectedMember = useMemo(
    () => trainer.party.find((candidate) => candidate.id === selectedMemberId) ?? trainer.party[0],
    [selectedMemberId, trainer.party],
  );

  const apply = (transition: TrainerTransition) => {
    setMessage(transition.message);
    if (transition.changed) onChange(transition.state);
  };

  return (
    <section className="emerald-menu" aria-label="Trainer menu">
      <nav className="emerald-menu__nav" aria-label="Trainer menu sections">
        {sections.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            data-menu-section={candidate.id}
            className={section === candidate.id ? "is-active" : ""}
            aria-pressed={section === candidate.id}
            onClick={() => {
              setSection(candidate.id);
              setMessage(`${candidate.label} opened.`);
            }}
          >
            {candidate.label}
          </button>
        ))}
        <button type="button" className="emerald-menu__close" onClick={onClose}>Close</button>
      </nav>

      <div className="emerald-menu__content">
        {section === "party" ? (
          <div className="emerald-party" aria-label="Party members">
            {trainer.party.map((partyMember, index) => (
              <article className="emerald-member" key={partyMember.id}>
                <img src={`/sprites/pokemon/${partyMember.sprite}.png`} alt={`${partyMember.name} Emerald sprite`} />
                <div className="emerald-member__details">
                  <strong>{index === 0 ? "★ " : ""}{partyMember.name}</strong>
                  <span>Lv. {partyMember.level} · {partyMember.status}</span>
                  <span>HP {partyMember.hp}/{partyMember.maxHp}</span>
                  <div className="emerald-hp"><span style={{ width: `${Math.round((partyMember.hp / partyMember.maxHp) * 100)}%` }} /></div>
                </div>
                <button type="button" onClick={() => apply(setLeadPartyMember(trainer, partyMember.id))}>Lead</button>
              </article>
            ))}
            {Array.from({ length: Math.max(0, 6 - trainer.party.length) }, (_, index) => (
              <div className="emerald-empty" key={`party-empty-${index}`}>Empty party slot</div>
            ))}
          </div>
        ) : null}

        {section === "items" ? (
          <div className="emerald-items">
            <label>
              Use on
              <select value={selectedMember?.id ?? ""} onChange={(event) => setSelectedMemberId(event.target.value)}>
                {trainer.party.map((partyMember) => <option value={partyMember.id} key={partyMember.id}>{partyMember.name}</option>)}
              </select>
            </label>
            {trainer.items.map((item) => (
              <article className="emerald-item" key={item.id}>
                <div><strong>{item.name} ×{item.quantity}</strong><span>{item.description}</span></div>
                <button type="button" disabled={item.quantity === 0} onClick={() => apply(useTrainerItem(trainer, item.id, selectedMember?.id ?? ""))}>Use</button>
              </article>
            ))}
          </div>
        ) : null}

        {section === "badges" ? (
          <div className="emerald-badges" aria-label="Badge case">
            {trainer.badges.map((badge) => (
              <button
                type="button"
                key={badge.id}
                data-badge-id={badge.id}
                className={badge.earned ? "is-earned" : ""}
                aria-pressed={badge.earned}
                onClick={() => apply(toggleBadge(trainer, badge.id))}
              >
                <span aria-hidden="true">◆</span>{badge.label}<small>{badge.earned ? "Earned" : "Not earned"}</small>
              </button>
            ))}
          </div>
        ) : null}

        {section === "pc" ? (
          <div className="emerald-pc">
            <h2>Box 1</h2>
            <p>Withdraw stored partners or deposit party members.</p>
            <div className="emerald-pc__grid">
              <section>
                <h3>Party</h3>
                {trainer.party.map((partyMember) => (
                  <button className="emerald-pc__member" type="button" key={partyMember.id} onClick={() => apply(depositPartyMember(trainer, partyMember.id))}>
                    <img src={`/sprites/pokemon/${partyMember.sprite}.png`} alt="" />
                    <span>Deposit<br /><strong>{partyMember.name}</strong></span>
                  </button>
                ))}
              </section>
              <section>
                <h3>Stored</h3>
                {trainer.pc.length ? trainer.pc.map((partyMember) => (
                  <button className="emerald-pc__member" type="button" key={partyMember.id} onClick={() => apply(withdrawPartyMember(trainer, partyMember.id))}>
                    <img src={`/sprites/pokemon/${partyMember.sprite}.png`} alt="" />
                    <span>Withdraw<br /><strong>{partyMember.name}</strong></span>
                  </button>
                )) : <span>Box is empty.</span>}
              </section>
            </div>
          </div>
        ) : null}
      </div>

      <output className="emerald-menu__message" aria-live="polite">{message}</output>
    </section>
  );
}
