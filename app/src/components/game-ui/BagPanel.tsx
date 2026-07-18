import { useMemo, useState } from "react";
import {
  useBagItem,
  type PocketName,
  type TrainerState,
  type TrainerTransition,
} from "../../lib/trainer-state";
import { PanelFrame } from "./PanelFrame";

const POCKETS: Array<{ id: PocketName; label: string }> = [
  { id: "items", label: "ITEMS" },
  { id: "pokeballs", label: "POKé BALLS" },
  { id: "keyItems", label: "KEY ITEMS" },
];

interface BagPanelProps {
  trainer: TrainerState;
  onChange: (trainer: TrainerState) => void;
  onClose: () => void;
}

export function BagPanel({ trainer, onChange, onClose }: BagPanelProps) {
  const [pocket, setPocket] = useState<PocketName>("items");
  const [selected, setSelected] = useState(0);
  const [selectedMemberId, setSelectedMemberId] = useState(trainer.party[0]?.id ?? "");
  const [message, setMessage] = useState("Choose an item.");
  const entries = trainer.bag[pocket] ?? [];
  const selectedEntry = entries[Math.min(selected, Math.max(entries.length - 1, 0))];
  const selectedMember = useMemo(
    () => trainer.party.find((member) => member.id === selectedMemberId) ?? trainer.party[0],
    [selectedMemberId, trainer.party],
  );

  const apply = (transition: TrainerTransition) => {
    setMessage(transition.message);
    if (transition.changed) onChange(transition.state);
  };

  return (
    <PanelFrame
      title="BAG"
      onClose={onClose}
      footer={
        <span className="pkmn-bag-description">
          {message}<br />{selectedEntry ? selectedEntry.description : "…"}
        </span>
      }
    >
      <div className="pkmn-bag-tabs">
        {POCKETS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`pkmn-bag-tab${pocket === entry.id ? " active" : ""}`}
            aria-pressed={pocket === entry.id}
            onClick={() => {
              setPocket(entry.id);
              setSelected(0);
              setMessage(`${entry.label} opened.`);
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <label className="pkmn-bag-target">
        USE ON
        <select
          value={selectedMember?.id ?? ""}
          onChange={(event) => setSelectedMemberId(event.target.value)}
        >
          {trainer.party.map((member) => (
            <option value={member.id} key={member.id}>{member.species}</option>
          ))}
        </select>
      </label>
      {entries.length ? (
        <ul className="pkmn-bag-list">
          {entries.map((entry, index) => (
            <li key={entry.id}>
              <button
                type="button"
                className={`pkmn-bag-item${index === selected ? " selected" : ""}`}
                onClick={() => setSelected(index)}
              >
                <span>{entry.name}</span>
                <span className="pkmn-bag-qty">×{entry.quantity}</span>
              </button>
              <button
                type="button"
                className="pkmn-use-item"
                disabled={entry.quantity <= 0}
                onClick={() => apply(useBagItem(trainer, entry.id, selectedMember?.id ?? ""))}
              >
                USE
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="pkmn-panel-empty">This pocket is empty.</div>
      )}
    </PanelFrame>
  );
}
