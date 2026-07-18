import { useState } from "react";
import {
  toggleBadge,
  type TrainerState,
  type TrainerTransition,
} from "../../lib/trainer-state";
import { PanelFrame } from "./PanelFrame";

const BADGE_TONES: Record<string, string> = {
  stone: "#a8a878",
  knuckle: "#c05038",
  dynamo: "#f8d030",
  heat: "#f08030",
  balance: "#8890f0",
  feather: "#78c8e0",
  mind: "#f85888",
  rain: "#6890f0",
};

interface BadgesPanelProps {
  trainer: TrainerState;
  onChange: (trainer: TrainerState) => void;
  onClose: () => void;
}

export function BadgesPanel({ trainer, onChange, onClose }: BadgesPanelProps) {
  const earnedCount = trainer.badges.filter((badge) => badge.earned).length;
  const [message, setMessage] = useState("Select a badge slot to record progress.");
  const apply = (transition: TrainerTransition) => {
    setMessage(transition.message);
    if (transition.changed) onChange(transition.state);
  };

  return (
    <PanelFrame
      title="BADGE CASE"
      onClose={onClose}
      footer={<span>{earnedCount} of {trainer.badges.length} earned · {message}</span>}
    >
      <div className="pkmn-badge-grid">
        {trainer.badges.map((badge) => (
          <button
            type="button"
            key={badge.id}
            className={`pkmn-badge-slot${badge.earned ? " earned" : ""}`}
            aria-label={`${badge.name} ${badge.earned ? "earned" : "not earned"}`}
            aria-pressed={badge.earned}
            onClick={() => apply(toggleBadge(trainer, badge.id))}
          >
            <span
              className="pkmn-badge-shape"
              style={{ backgroundColor: badge.earned ? BADGE_TONES[badge.id] ?? "#f8d030" : "#3a3a44" }}
              aria-hidden="true"
            />
            <span className="pkmn-badge-name">{badge.name.replace(" BADGE", "")}</span>
          </button>
        ))}
      </div>
    </PanelFrame>
  );
}
