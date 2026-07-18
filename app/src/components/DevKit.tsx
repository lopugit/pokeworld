import { useCallback, useEffect, useRef, useState } from "react";
import { clearLocationBoundState } from "../lib/persisted-state";
import "../styles/devkit.css";

const PRESETS = [
  { label: "My location (Melbourne)", latitude: -37.859210163186276, longitude: 144.98227557143792 },
  { label: "App default fallback", latitude: -37.87569351417865, longitude: 145.00569971273293 },
  { label: "Sydney", latitude: -33.856784, longitude: 151.215297 },
  { label: "Sydney Harbour shoreline", latitude: -33.856784, longitude: 151.216 },
  { label: "Victorian alpine terrain", latitude: -36.732, longitude: 146.9597 },
  { label: "San Francisco", latitude: 37.774929, longitude: -122.419418 },
  { label: "London", latitude: 51.507351, longitude: -0.127758 },
  { label: "Tokyo", latitude: 35.681236, longitude: 139.767125 },
];

type Point = { x: number; y: number };
type Coordinates = { latitude: number; longitude: number };

const clampToViewport = (point: Point): Point => ({
  x: Math.min(Math.max(0, point.x), window.innerWidth - 56),
  y: Math.min(Math.max(0, point.y), window.innerHeight - 56),
});

export function DevKit() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Coordinates | null>(null);
  const [position, setPosition] = useState<Point>({ x: 24, y: 24 });
  const drag = useRef({ active: false, moved: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  useEffect(() => {
    const host = window.location.hostname;
    const isLocal =
      host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host.endsWith(".local");
    const forced = /(?:[?&])dev(?:=|&|$)/.test(window.location.search);
    if (!isLocal && !forced) return;
    setVisible(true);

    let next = { x: window.innerWidth - 72, y: window.innerHeight - 72 };
    try {
      const saved = JSON.parse(window.localStorage.getItem("devkitPos") || "null") as Point | null;
      if (saved && typeof saved.x === "number" && typeof saved.y === "number") next = clampToViewport(saved);
    } catch {
      // Ignore malformed dev-only state.
    }
    setPosition(next);

    try {
      const saved = JSON.parse(window.localStorage.getItem("devGeocode") || "null") as Coordinates | null;
      if (saved && typeof saved.latitude === "number" && typeof saved.longitude === "number") setActive(saved);
    } catch {
      // Ignore malformed dev-only state.
    }
  }, []);

  const endDrag = useCallback(() => {
    drag.current.active = false;
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", endDrag);
  }, []);

  const onDrag = useCallback((event: MouseEvent) => {
    if (!drag.current.active) return;
    const dx = event.clientX - drag.current.startX;
    const dy = event.clientY - drag.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.current.moved = true;
    setPosition(clampToViewport({ x: drag.current.originX + dx, y: drag.current.originY + dy }));
  }, []);

  useEffect(() => () => {
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", endDrag);
  }, [endDrag, onDrag]);

  const startDrag = (event: React.MouseEvent) => {
    drag.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", () => {
      endDrag();
      window.localStorage.setItem("devkitPos", JSON.stringify(position));
    }, { once: true });
    event.preventDefault();
  };

  if (!visible) return null;

  const isActive = (preset: Coordinates) =>
    active &&
    Math.abs(active.latitude - preset.latitude) < 1e-9 &&
    Math.abs(active.longitude - preset.longitude) < 1e-9;

  const select = (preset: Coordinates) => {
    clearLocationBoundState();
    window.localStorage.setItem("devGeocode", JSON.stringify(preset));
    window.localStorage.removeItem("continueWithoutLocation");
    window.location.reload();
  };

  return (
    <div className="devkit" style={{ left: position.x, top: position.y }}>
      {open ? (
        <div className="devkit-panel" onMouseDown={(event) => event.stopPropagation()}>
          <div className="devkit-head">
            <span>📍 Dev location</span>
            <button type="button" className="devkit-close" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
          </div>
          <div className="devkit-hint">
            Pick a geocode to use when the browser can&apos;t grant location. Reloads the game with the chosen coords.
          </div>
          <div className="devkit-list">
            {PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.label}
                className={`devkit-item ${isActive(preset) ? "devkit-item--active" : ""}`}
                onClick={() => select(preset)}
              >
                <span className="devkit-item-label">
                  {isActive(preset) ? <span className="devkit-dot">●</span> : null}
                  {preset.label}
                </span>
                <span className="devkit-item-coords">
                  {preset.latitude.toFixed(5)}, {preset.longitude.toFixed(5)}
                </span>
              </button>
            ))}
          </div>
          <div className="devkit-actions">
            <button
              type="button"
              className="devkit-reset"
              onClick={() => {
                clearLocationBoundState();
                window.localStorage.removeItem("devGeocode");
                window.localStorage.removeItem("continueWithoutLocation");
                window.location.reload();
              }}
            >
              ↺ Use real device location
            </button>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className={`devkit-icon ${active ? "devkit-icon--on" : ""}`}
        title="Dev location picker (drag to move, click to open)"
        onMouseDown={startDrag}
        onClick={() => {
          if (drag.current.moved) {
            drag.current.moved = false;
            return;
          }
          setOpen((value) => !value);
        }}
      >
        📍
      </button>
    </div>
  );
}
