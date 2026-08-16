import { useEffect, useRef, useState } from "react";
import {
  setTrainerProfile,
  type TrainerGender,
  type TrainerState,
} from "../../lib/trainer-state";
import { PanelFrame } from "./PanelFrame";

interface SettingsPanelProps {
  trainer: TrainerState;
  /** Dev chrome (MAP overlay, zoom controls) is hidden until this is on. */
  devMode: boolean;
  onToggleDevMode: () => void;
  onChange: (trainer: TrainerState) => void;
  onClose: () => void;
}

const GENDERS: Array<{ id: TrainerGender; label: string; sprite: string }> = [
  { id: "boy", label: "BOY", sprite: "/sprites/player/boy/down-0.png" },
  { id: "girl", label: "GIRL", sprite: "/sprites/player/girl/down-0.png" },
];

export function SettingsPanel({ trainer, devMode, onToggleDevMode, onChange, onClose }: SettingsPanelProps) {
  const [name, setName] = useState(trainer.name);
  const [message, setMessage] = useState("Adjust your trainer profile.");
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  const flashSaved = (note: string) => {
    setMessage(note);
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1500);
  };

  const applyName = (value: string) => {
    const next = value.toUpperCase().slice(0, 7);
    setName(next);
    if (next.trim()) onChange(setTrainerProfile(trainer, { name: next }));
  };

  const applyGender = (gender: TrainerGender) => {
    if (gender !== trainer.gender) onChange(setTrainerProfile(trainer, { gender }));
    flashSaved(gender === "boy" ? "You are a BOY!" : "You are a GIRL!");
  };

  const save = () => {
    // Never save an empty name — fall back to the current one.
    const finalName = name.trim() ? name : trainer.name;
    setName(finalName || trainer.name);
    onChange(setTrainerProfile(trainer, { name: finalName, gender: trainer.gender }));
    flashSaved("Profile saved!");
  };

  return (
    <PanelFrame title="OPTION" onClose={onClose} footer={<span>{message}</span>}>
      <div className="pkmn-opt-body">
        <label className="pkmn-opt-row">
          <span className="pkmn-opt-label">PLAYER NAME</span>
          <input
            className="pkmn-opt-name"
            type="text"
            value={name}
            maxLength={7}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder={trainer.name}
            aria-label="Player name, up to 7 characters"
            onChange={(event) => applyName(event.target.value)}
            onBlur={() => {
              if (!name.trim()) setName(trainer.name);
            }}
          />
        </label>
        <div className="pkmn-opt-row">
          <span className="pkmn-opt-label">ARE YOU A BOY? OR ARE YOU A GIRL?</span>
          <div className="pkmn-opt-genders">
            {GENDERS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`pkmn-opt-gender${trainer.gender === option.id ? " selected" : ""}`}
                aria-pressed={trainer.gender === option.id}
                onClick={() => applyGender(option.id)}
              >
                <img src={option.sprite} alt={`${option.label} preview sprite`} />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="pkmn-opt-note">
          Your overworld sprite and how NPCs address you use this name and look.
        </p>
        <div className="pkmn-opt-row">
          <span className="pkmn-opt-label">DEV MODE</span>
          <button
            type="button"
            className={`pkmn-opt-gender${devMode ? " selected" : ""}`}
            aria-label="Toggle dev mode"
            aria-pressed={devMode}
            onClick={() => {
              onToggleDevMode();
              flashSaved(devMode ? "Dev mode off." : "Dev mode on: MAP + zoom unlocked!");
            }}
          >
            <span>{devMode ? "ON" : "OFF"}</span>
          </button>
        </div>
        <div className="pkmn-opt-save-row">
          <button type="button" className="pkmn-opt-save" onClick={save}>
            SAVE
          </button>
          <span className={`pkmn-opt-saved${saved ? " visible" : ""}`} role="status">
            Saved!
          </span>
        </div>
      </div>
    </PanelFrame>
  );
}
