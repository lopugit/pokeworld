interface ThingsState {
  loggedIn: boolean;
  player: Record<string, unknown>;
  map: Record<string, unknown>;
  game: Record<string, unknown>;
}

const emptyState = (): ThingsState => ({ loggedIn: false, player: {}, map: {}, game: {} });

export function loadThings(): ThingsState {
  try {
    const parsed = JSON.parse(window.localStorage.getItem("things") || "null") as
      | ThingsState
      | { things?: ThingsState }
      | null;
    return { ...emptyState(), ...((parsed && "things" in parsed ? parsed.things : parsed) || {}) };
  } catch {
    return emptyState();
  }
}

export function saveThing(key: keyof ThingsState, value: unknown) {
  const next = { ...loadThings(), [key]: value };
  window.localStorage.setItem("things", JSON.stringify({ things: next }));
}
