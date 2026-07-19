export interface ThingsState {
  loggedIn: boolean;
  player: Record<string, unknown>;
  map: Record<string, unknown>;
  game: Record<string, unknown>;
  trainer: Record<string, unknown>;
}

const STORAGE_KEY = "things:v2";
const LEGACY_STORAGE_KEY = "things";

const emptyState = (): ThingsState => ({ loggedIn: false, player: {}, map: {}, game: {}, trainer: {} });

function parseThings(raw: string | null): ThingsState | null {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as ThingsState | { things?: ThingsState } | null;
  if (!parsed) return null;
  return { ...emptyState(), ...("things" in parsed ? parsed.things : parsed) };
}

export function loadThings(): ThingsState {
  try {
    return (
      parseThings(window.localStorage.getItem(STORAGE_KEY)) ??
      parseThings(window.localStorage.getItem(LEGACY_STORAGE_KEY)) ??
      emptyState()
    );
  } catch {
    return emptyState();
  }
}

function writeThings(value: ThingsState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, things: value }));
  } catch {
    // Storage can be disabled or quota-limited; the running game remains usable.
  }
}

export function saveThing(key: keyof ThingsState, value: unknown) {
  const next = { ...loadThings(), [key]: value };
  writeThings(next);
}

export function locationKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

export function resetLocationBoundThings(state: ThingsState): ThingsState {
  return {
    ...state,
    map: {},
    player: {},
    game: { ...state.game, anyLoaded: false, coords: { latitude: null, longitude: null } },
  };
}

export function clearLocationBoundState() {
  writeThings(resetLocationBoundThings(loadThings()));
}
