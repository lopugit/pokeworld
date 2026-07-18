import { useState } from "react";
import type { PocketName, TrainerState } from "../../lib/trainer-state";
import { PanelFrame } from "./PanelFrame";

const POCKETS: Array<{ id: PocketName; label: string }> = [
  { id: "items", label: "ITEMS" },
  { id: "pokeballs", label: "POKé BALLS" },
  { id: "keyItems", label: "KEY ITEMS" },
];

export function BagPanel({ trainer, onClose }: { trainer: TrainerState; onClose: () => void }) {
  const [pocket, setPocket] = useState<PocketName>("items");
  const [selected, setSelected] = useState(0);
  const entries = trainer.bag[pocket] ?? [];
  const selectedEntry = entries[Math.min(selected, Math.max(entries.length - 1, 0))];

  return (
    <PanelFrame
      title="BAG"
      onClose={onClose}
      footer={<span className="pkmn-bag-description">{selectedEntry ? selectedEntry.description : "…"}</span>}
    >
      <div className="pkmn-bag-tabs">
        {POCKETS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`pkmn-bag-tab${pocket === entry.id ? " active" : ""}`}
            onClick={() => {
              setPocket(entry.id);
              setSelected(0);
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>
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
            </li>
          ))}
        </ul>
      ) : (
        <div className="pkmn-panel-empty">This pocket is empty.</div>
      )}
    </PanelFrame>
  );
}
