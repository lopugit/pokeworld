import { Component, createRef, type PointerEvent as ReactPointerEvent } from "react";
import type { MapBlock, MapTile } from "../../server/services/map/types";
import { getBlockForCoordinates, getMapBlocks } from "../lib/map-api";
import { mapOffsetLimitForZoom, nextZoomValue } from "../lib/game-zoom";
import {
  clampOverlayOpacity,
  clampOverlaySplit,
  overlaySplitHit,
} from "../lib/game-overlay";
import {
  blockCoordinatesForWorldPosition,
  prioritizeMapPreloadOffsets,
  type BlockCoordinates,
} from "../lib/map-load";
import { isTallTileArt, sortTallEntities } from "../lib/tall-sprites";
import {
  centroidOf,
  clampPanToPlayer,
  computePinchUpdate,
  distanceOf,
  snapToTileGrid,
  type GesturePoint,
  type PinchStart,
} from "../lib/pinch-zoom";
import { fetchInvite, inviteIdFromLocation, type PublicInvite } from "../lib/invites";
import { loadThings, locationKey, saveThing } from "../lib/persisted-state";
import {
  actionDirection,
  directionDelta,
  fieldItemFor,
  formatDialogPages,
  interactionFor,
  isFieldItemTile,
  isNearCaveEntrance,
  isSurfableTile,
  resolveMove,
  streetNameOf,
  tileCoordKey,
  type Direction,
} from "../lib/game-rules";
import {
  collectFieldItem,
  emptyTrainer,
  hasCollected,
  hasSavedTrainer,
  loadTrainer,
  registerSeen,
  saveTrainer,
  starterTrainer,
  type TrainerState,
} from "../lib/trainer-state";
import {
  defaultSpawnRules,
  encounterBiomeFor,
  encounterTriggered,
  mergeSpawnRules,
  rollEncounter,
  type SpeciesSpawnOverride,
  type SpawnRule,
} from "../lib/encounters";
import {
  advanceMessage,
  applyBattleOutcome,
  createWildBattle,
  submitAction,
  type BattleAction,
  type BattleState,
} from "../lib/battle";
import { DialogBox } from "./game-ui/DialogBox";
import { OakIntro, type StarterChoice } from "./game-ui/OakIntro";
import { MENU_ITEMS, StartMenu, type MenuItemId } from "./game-ui/StartMenu";
import { PartyPanel } from "./game-ui/PartyPanel";
import { BagPanel } from "./game-ui/BagPanel";
import { BadgesPanel } from "./game-ui/BadgesPanel";
import { PcPanel } from "./game-ui/PcPanel";
import { PokedexPanel } from "./game-ui/PokedexPanel";
import { SettingsPanel } from "./game-ui/SettingsPanel";
import { BattleScreen } from "./game-ui/BattleScreen";
import { MapLoadingIndicator } from "./game-ui/MapLoadingIndicator";
import "../styles/game.scss";
import "../styles/game-ui.css";

const tileSize = 32;
const blockSize = 512;
const blockCount = 16;
const playerBoundaryOffset = 4;
const defaultCoordinates = { latitude: -37.87569351417865, longitude: 145.00569971273293 };

interface GameSettings {
  scale: number;
  zoomMode: boolean;
  noMaxZoom: boolean;
  zoom: number;
  zoomScale: number;
  regenerate: boolean;
  anyLoaded: boolean;
  debugPosition: boolean;
  canvasWidth: number;
  canvasHeight: number;
  debug: boolean;
  initialized: boolean;
  showLayer1: boolean;
  showLayerGmap: boolean;
  showStats: boolean;
  columns: number;
  blockCount: number;
  blockWidth: number;
  blockHeight: number;
  playerXBoundaryOffset: number;
  playerYBoundaryOffset: number;
  coords: { latitude: number | null; longitude: number | null };
  tileSize: number;
  blockSize: number;
  tileBrowser: boolean;
  tileBrowserUsePlayer: boolean;
  tileBrowserX: number;
  tileBrowserY: number;
  overlay: boolean;
  overlayOpacity: number;
  overlaySplit: boolean;
  overlaySplitX: number;
}

interface MapView {
  initialized: boolean;
  width: number;
  x: number;
  y: number;
  blockX: number;
  blockY: number;
  lat: number | null;
  lng: number | null;
  locationKey?: string;
  tileCount?: number;
  blocks?: string[];
}

type MoveAction = "moveUp" | "moveRight" | "moveDown" | "moveLeft";

interface PlayerState {
  initialized: boolean;
  sprite: string;
  blockX: number;
  blockY: number;
  x: number;
  y: number;
  lat?: number;
  lng?: number;
  latlng?: string;
  locationKey?: string;
  lastAction?: number;
  queuedAction?: MoveAction;
  facing?: Direction;
  surfing?: boolean;
}

type PanelId = "party" | "bag" | "badges" | "pc" | "pokedex" | "settings";

// Visual-only interpolation for a tile step: game logic stays tile-snapped,
// the render loop lerps the scene between the previous and new positions.
interface MoveAnimation {
  fromX: number;
  fromY: number;
  mapFromX: number;
  mapFromY: number;
  start: number;
  duration: number;
  kind: "walk" | "jump";
  parity: 0 | 1;
}

const WALK_ANIMATION_MS = 250;
const JUMP_ANIMATION_MS = 360;
const PLAYER_FRAME_DIRECTORY: Record<Direction, string> = {
  up: "up",
  down: "down",
  left: "side",
  right: "side",
};

interface UiState {
  menuOpen: boolean;
  menuIndex: number;
  panel: PanelId | null;
  dialog: { pages: string[]; advance: number } | null;
  /** Emerald-style location plate shown when entering a named street. */
  streetBanner: { text: string; key: number } | null;
}

interface BoundaryWait {
  action: MoveAction;
  blockX: number;
  blockY: number;
  error?: string;
  status: "loading" | "error";
}

interface MapLoadingState {
  activeRequests: number;
  completed: number;
  requested: number;
  waitingForBlock: BoundaryWait | null;
}

interface GameComponentState {
  boardWidth: number;
  game: GameSettings;
  locationError: boolean;
  loadError: string;
  mapLoading: MapLoadingState;
  map: MapView;
  player: PlayerState;
  revision: number;
  ui: UiState;
  trainer: TrainerState;
  battle: BattleState | null;
  /** True while a brand-new player is in the PROF. OAK starter onboarding. */
  onboarding: boolean;
  /** Resolved `?invite=` link: personalizes OAK's greeting for the friend. */
  invite: PublicInvite | null;
}

interface StoredImage {
  element: HTMLImageElement;
  loaded: boolean;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

// A browser with no trainer save belongs to a brand-new player: PROF. OAK
// greets them and they pick their one starter before anything is persisted.
// loadTrainer() writes a default save as a side effect, so it only runs for
// returning players.
const bootTrainerState = (): { trainer: TrainerState; onboarding: boolean } =>
  hasSavedTrainer()
    ? { trainer: loadTrainer(), onboarding: false }
    : { trainer: emptyTrainer(), onboarding: true };

export class Game extends Component<Record<string, never>, GameComponentState> {
  override state: GameComponentState = {
    boardWidth: 520,
    locationError: false,
    loadError: "",
    mapLoading: {
      activeRequests: 0,
      completed: 0,
      requested: 0,
      waitingForBlock: null,
    },
    revision: 0,
    map: {
      initialized: false,
      width: blockCount - 1,
      x: 0,
      y: 0,
      blockX: 0,
      blockY: 0,
      lat: null,
      lng: null,
    },
    game: {
      scale: 1,
      zoomMode: false,
      noMaxZoom: false,
      zoom: 1.25,
      zoomScale: 0.8,
      regenerate: false,
      anyLoaded: false,
      debugPosition: false,
      canvasWidth: 512,
      canvasHeight: 512,
      debug: false,
      initialized: false,
      showLayer1: false,
      showLayerGmap: false,
      showStats: false,
      columns: 1,
      blockCount,
      blockWidth: tileSize * blockCount,
      blockHeight: tileSize * blockCount,
      playerXBoundaryOffset: tileSize * playerBoundaryOffset,
      playerYBoundaryOffset: tileSize * playerBoundaryOffset,
      coords: { latitude: null, longitude: null },
      tileSize,
      blockSize,
      tileBrowser: false,
      tileBrowserUsePlayer: false,
      tileBrowserX: 0,
      tileBrowserY: 0,
      overlay: false,
      overlayOpacity: 0.5,
      overlaySplit: false,
      overlaySplitX: 0.5,
    },
    player: {
      initialized: false,
      sprite: "char-walk-1",
      blockX: 0,
      blockY: 0,
      x: 0,
      y: 0,
      facing: "down",
    },
    ui: { menuOpen: false, menuIndex: 0, panel: null, dialog: null, streetBanner: null },
    ...bootTrainerState(),
    battle: null,
    invite: null,
  };

  private readonly canvasRef = createRef<HTMLCanvasElement>();
  private readonly layer1Ref = createRef<HTMLCanvasElement>();
  private readonly gmapRef = createRef<HTMLCanvasElement>();
  private readonly gameboyRef = createRef<HTMLDivElement>();
  private readonly blockDb: Record<string, MapBlock> = {};
  private readonly tileDb: Record<string, MapTile> = {};
  private readonly tileHistoryDb: Record<string, MapTile[]> = {};
  private readonly queries: Record<string, number | "complete"> = {};
  private readonly activeLoadRequests = new Map<
    number,
    { completed: Set<string>; requested: Set<string> }
  >();
  private querySequence = 0;
  private readonly storedImages = new Map<string, StoredImage>();
  private readonly abortControllers = new Set<AbortController>();
  private animationFrame?: number;
  private movementInterval?: number;
  private resizeInterval?: number;
  private loadedTimer?: number;
  private mounted = false;
  private boardResize = { active: false, startX: 0, originWidth: 520 };
  // Wild-encounter tables: defaults immediately, admin overrides merged in
  // once /api/spawn-rules answers (offline play keeps the defaults).
  private spawnRules: SpawnRule[] = defaultSpawnRules();
  private moveAnim: MoveAnimation | null = null;
  private stepParity: 0 | 1 = 0;

  override componentDidMount() {
    this.mounted = true;
    void this.initialize();
    void this.loadSpawnRuleOverrides();
    void this.resolveInviteLink();
    this.preloadPlayerFrames();
  }

  // A `?invite=` link personalizes PROF. OAK's greeting for the invited
  // friend. Only meaningful during onboarding; returning players keep their
  // save and the greeting never replays.
  private async resolveInviteLink() {
    const inviteId = inviteIdFromLocation(window.location.search);
    if (!inviteId || !this.state.onboarding) return;
    const controller = new AbortController();
    this.abortControllers.add(controller);
    try {
      const invite = await fetchInvite(inviteId, controller.signal);
      if (invite && this.mounted && this.state.onboarding) this.setState({ invite });
    } finally {
      this.abortControllers.delete(controller);
    }
  }

  private async loadSpawnRuleOverrides() {
    const controller = new AbortController();
    this.abortControllers.add(controller);
    try {
      const response = await fetch("/api/spawn-rules", {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { overrides?: SpeciesSpawnOverride[] };
      if (Array.isArray(payload.overrides) && this.mounted) {
        this.spawnRules = mergeSpawnRules(payload.overrides);
      }
    } catch {
      // Offline or unavailable — the computed defaults stay in effect.
    } finally {
      this.abortControllers.delete(controller);
    }
  }

  private preloadPlayerFrames() {
    for (const gender of ["boy", "girl"]) {
      for (const direction of ["down", "up", "side"]) {
        for (let frame = 0; frame < 3; frame += 1) {
          const key = `player/${gender}/${direction}-${frame}`;
          this.loadImage(key, `/sprites/${key}.png`);
        }
      }
    }
  }

  override componentWillUnmount() {
    this.mounted = false;
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    if (this.movementInterval) window.clearInterval(this.movementInterval);
    if (this.resizeInterval) window.clearInterval(this.resizeInterval);
    if (this.loadedTimer) window.clearTimeout(this.loadedTimer);
    if (this.streetBannerTimer) window.clearTimeout(this.streetBannerTimer);
    document.removeEventListener("keydown", this.onKeydown);
    window.removeEventListener("resize", this.resizeGame);
    this.removeBoardResizeListeners();
    for (const controller of this.abortControllers) controller.abort();
  }

  private setStateAsync = (state: Partial<GameComponentState>) =>
    new Promise<void>((resolve) => this.setState(state as Pick<GameComponentState, keyof GameComponentState>, resolve));

  private async initialize() {
    this.restoreBoardWidth();
    const coords = await this.getLocation();
    if (!coords || !this.mounted) return;
    await this.initializeGame(coords);
    await this.initializeMap();
    await this.initializePlayer();
    if (!this.mounted) return;
    this.animationFrame = requestAnimationFrame(this.renderLoop);
  }

  private getLocation(): Promise<{ latitude: number; longitude: number } | null> {
    try {
      const override = JSON.parse(window.localStorage.getItem("devGeocode") || "null") as
        | { latitude: number; longitude: number }
        | null;
      if (override && isFiniteNumber(override.latitude) && isFiniteNumber(override.longitude)) {
        return Promise.resolve(override);
      }
    } catch {
      // Ignore malformed dev-only state.
    }

    if (window.localStorage.getItem("continueWithoutLocation") === "true") {
      return Promise.resolve(defaultCoordinates);
    }

    if (!navigator.geolocation) {
      this.setState({ locationError: true });
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }),
        () => {
          if (window.localStorage.getItem("continueWithoutLocation") === "true") {
            resolve(defaultCoordinates);
          } else {
            this.setState({ locationError: true });
            resolve(null);
          }
        },
      );
    });
  }

  private async initializeGame(coords: { latitude: number; longitude: number }) {
    const stored = loadThings().game as Partial<GameSettings>;
    const game: GameSettings = {
      ...this.state.game,
      ...stored,
      anyLoaded: false,
      initialized: true,
      playerXBoundaryOffset: tileSize * playerBoundaryOffset,
      playerYBoundaryOffset: tileSize * playerBoundaryOffset,
      coords,
      // World geometry always comes from the code constants — a persisted
      // save from an older build must not pin stale tile/block dimensions.
      tileSize,
      blockSize,
      blockCount,
      blockWidth: tileSize * blockCount,
      blockHeight: tileSize * blockCount,
    };
    if (!import.meta.env.DEV) game.regenerate = false;
    game.zoomScale = game.canvasWidth / (game.canvasWidth * game.zoom);
    await this.setStateAsync({ game });
    saveThing("game", game);
    this.resizeGame();
    window.addEventListener("resize", this.resizeGame);
    this.resizeInterval = window.setInterval(this.resizeGame, 1000);
  }

  private async initializeMap() {
    const stored = loadThings().map as Partial<MapView>;
    const activeLocationKey = locationKey(
      this.state.game.coords.latitude as number,
      this.state.game.coords.longitude as number,
    );
    let map: MapView;
    if (
      stored.locationKey === activeLocationKey &&
      isFiniteNumber(stored.x) &&
      isFiniteNumber(stored.y) &&
      isFiniteNumber(stored.blockX) &&
      isFiniteNumber(stored.blockY)
    ) {
      map = { ...this.state.map, ...stored, initialized: true, locationKey: activeLocationKey };
    } else {
      const controller = new AbortController();
      this.abortControllers.add(controller);
      try {
        const block = await getBlockForCoordinates(
          this.state.game.coords.latitude as number,
          this.state.game.coords.longitude as number,
          controller.signal,
        );
        map = {
          ...this.state.map,
          initialized: true,
          blockX: block.x,
          blockY: block.y,
          x: block.x * this.state.game.blockWidth,
          y: block.y * this.state.game.blockHeight,
          locationKey: activeLocationKey,
        };
      } finally {
        this.abortControllers.delete(controller);
      }
    }
    await this.setStateAsync({ map });
    saveThing("map", map);
  }

  private async initializePlayer() {
    const stored = loadThings().player as Partial<PlayerState>;
    const restoreStoredPlayer = stored.locationKey === this.state.map.locationKey;
    const player = {
      ...this.state.player,
      x:
        restoreStoredPlayer && isFiniteNumber(stored.x) && isFiniteNumber(stored.y)
          ? stored.x
          : this.state.map.x + (this.state.game.blockCount / 2) * this.state.game.tileSize,
      y:
        restoreStoredPlayer && isFiniteNumber(stored.x) && isFiniteNumber(stored.y)
          ? stored.y
          : this.state.map.y + (this.state.game.blockCount / 2) * this.state.game.tileSize,
      initialized: true,
      locationKey: this.state.map.locationKey,
    };
    const updated = this.withUpdatedPlayerBlock(player);
    await this.setStateAsync({ player: updated });
    saveThing("player", updated);
    document.addEventListener("keydown", this.onKeydown);
    this.movementInterval = window.setInterval(() => {
      if (this.state.player.queuedAction) this.action(this.state.player.queuedAction);
    }, 50);
    void this.getBlocks();
  }

  private withUpdatedPlayerBlock(player: PlayerState): PlayerState {
    const next = {
      ...player,
      blockX: Math.floor(player.x / this.state.game.blockSize),
      blockY: Math.floor(player.y / this.state.game.blockSize),
    };
    const block = Object.values(this.blockDb).find((candidate) => candidate.x === next.blockX && candidate.y === next.blockY);
    if (block) {
      if (isFiniteNumber(block.lat)) next.lat = block.lat;
      if (isFiniteNumber(block.lng)) next.lng = block.lng;
      if (isFiniteNumber(block.lat) && isFiniteNumber(block.lng)) next.latlng = `${block.lat}, ${block.lng}`;
    }
    return next;
  }

  private mapLoadingSnapshot(
    waitingForBlock = this.state.mapLoading.waitingForBlock,
  ): MapLoadingState {
    let requested = 0;
    let completed = 0;
    for (const request of this.activeLoadRequests.values()) {
      requested += request.requested.size;
      completed += request.completed.size;
    }
    return {
      activeRequests: this.activeLoadRequests.size,
      completed,
      requested,
      waitingForBlock,
    };
  }

  private syncMapLoading(waitingForBlock = this.state.mapLoading.waitingForBlock) {
    if (this.mounted) this.setState({ mapLoading: this.mapLoadingSnapshot(waitingForBlock) });
  }

  private waitForDestinationBlock(
    destinationX: number,
    destinationY: number,
    action: MoveAction,
    player: PlayerState,
  ): boolean {
    const block = blockCoordinatesForWorldPosition(
      destinationX,
      destinationY,
      this.state.game.blockSize,
    );
    const key = `${block.x},${block.y}`;
    if (this.blockDb[key]) {
      if (this.state.mapLoading.waitingForBlock) {
        this.setState({
          loadError: "",
          mapLoading: this.mapLoadingSnapshot(null),
        });
      }
      return false;
    }

    const stoppedPlayer = { ...player, queuedAction: undefined };
    const waitingForBlock: BoundaryWait = {
      action,
      blockX: block.x,
      blockY: block.y,
      status: "loading",
    };
    this.setState(
      {
        loadError: "",
        mapLoading: this.mapLoadingSnapshot(waitingForBlock),
        player: stoppedPlayer,
      },
      () => {
        saveThing("player", stoppedPlayer);
        void this.getBlocks(block);
      },
    );
    return true;
  }

  private onKeydown = (event: KeyboardEvent) => {
    // OakIntro owns all input until the starter is chosen.
    if (this.state.onboarding) return;
    const moveKeys: Record<string, MoveAction> = {
      ArrowRight: "moveRight",
      ArrowLeft: "moveLeft",
      ArrowDown: "moveDown",
      ArrowUp: "moveUp",
    };
    const { ui } = this.state;
    const key = event.key;
    const isA = key === "z" || key === "Z" || key === " " || key === "Enter";
    const isB = key === "x" || key === "X" || key === "Escape" || key === "Backspace";

    // Typing in a form field (e.g. the OPTION name input) must never trigger
    // game shortcuts like B-to-close or movement.
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
    ) {
      return;
    }

    // BattleScreen owns the keyboard (capture-phase listener) while a battle runs.
    if (this.state.battle) return;

    if (ui.dialog) {
      if (isA || isB || moveKeys[key]) {
        event.preventDefault();
        this.advanceDialog();
      }
      return;
    }

    if (ui.panel) {
      if (isB) {
        event.preventDefault();
        this.setUi({ panel: null, menuOpen: true });
      }
      return;
    }

    if (ui.menuOpen) {
      if (key === "ArrowUp" || key === "ArrowDown") {
        event.preventDefault();
        const count = MENU_ITEMS.length;
        const delta = key === "ArrowUp" ? count - 1 : 1;
        this.setUi({ menuIndex: (ui.menuIndex + delta) % count });
      } else if (isA) {
        event.preventDefault();
        this.selectMenuItem(MENU_ITEMS[ui.menuIndex].id);
      } else if (isB) {
        event.preventDefault();
        this.setUi({ menuOpen: false });
      }
      return;
    }

    if (key === "m" || key === "M") {
      event.preventDefault();
      this.toggleMenu();
      return;
    }

    const action = moveKeys[key];
    if (action) {
      event.preventDefault();
      this.action(action);
      return;
    }
    if (key === "Enter") {
      event.preventDefault();
      this.toggleMenu();
      return;
    }
    if (key === "z" || key === "Z" || key === " ") {
      event.preventDefault();
      this.interact();
    }
  };

  private setUi = (patch: Partial<UiState>) => {
    this.setState(({ ui }) => ({ ui: { ...ui, ...patch } }));
  };

  private setTrainer = (trainer: TrainerState) => {
    this.setState({ trainer });
    saveTrainer(trainer);
  };

  // The chosen starter becomes the player's very first save — one Pokémon,
  // nothing else in the party, PC, or Pokédex. Invited friends start with
  // the name their invite carries, so dialog addresses them directly.
  private completeOnboarding = (choice: StarterChoice) => {
    const trainer = starterTrainer(choice, this.state.invite?.inviteeName);
    this.setState({ trainer, onboarding: false }, () => saveTrainer(trainer));
  };

  private toggleMenu = () => {
    if (this.state.ui.dialog || this.state.ui.panel || this.state.battle) return;
    this.setUi({ menuOpen: !this.state.ui.menuOpen, menuIndex: 0 });
  };

  private openDialog = (pages: string[]) => {
    this.setUi({ dialog: { pages, advance: 0 }, menuOpen: false });
  };

  private advanceDialog = () => {
    const { dialog } = this.state.ui;
    if (!dialog) return;
    this.setUi({ dialog: { ...dialog, advance: dialog.advance + 1 } });
  };

  private closeDialog = () => this.setUi({ dialog: null });

  private selectMenuItem = (id: MenuItemId) => {
    if (
      id === "party" ||
      id === "bag" ||
      id === "badges" ||
      id === "pc" ||
      id === "pokedex" ||
      id === "settings"
    ) {
      this.setUi({ menuOpen: false, panel: id });
      return;
    }
    if (id === "save") {
      saveTrainer(this.state.trainer);
      saveThing("player", this.state.player);
      saveThing("map", this.state.map);
      this.openDialog([`${this.state.trainer.name} saved the game!`]);
      return;
    }
    this.setUi({ menuOpen: false });
  };

  private pressA = () => {
    const { ui, battle } = this.state;
    if (battle) {
      // Hardware A drives the battle's message flow; menus are on-screen.
      if (battle.phase === "message") this.onBattleMessage();
      else if (battle.phase === "over") this.onBattleFinish();
      return;
    }
    if (ui.dialog) {
      this.advanceDialog();
      return;
    }
    if (ui.menuOpen) {
      this.selectMenuItem(MENU_ITEMS[ui.menuIndex].id);
      return;
    }
    if (!ui.panel) this.interact();
  };

  private pressB = () => {
    const { ui, battle } = this.state;
    if (battle) {
      if (battle.phase === "message") this.onBattleMessage();
      else if (battle.phase === "over") this.onBattleFinish();
      return;
    }
    if (ui.dialog) {
      this.advanceDialog();
      return;
    }
    if (ui.panel) {
      this.setUi({ panel: null, menuOpen: true });
      return;
    }
    if (ui.menuOpen) this.setUi({ menuOpen: false });
  };

  // --- Wild battles ---------------------------------------------------------

  private startWildBattle(rules: SpawnRule[], biome: "long-grass" | "water" | "cave") {
    const { player, trainer } = this.state;
    if (!isFiniteNumber(player.lat) || !isFiniteNumber(player.lng)) return;
    const encounter = rollEncounter(rules, biome, player.lat, player.lng, Math.random);
    if (!encounter) return;
    const battle = createWildBattle(trainer.party, encounter);
    const seenTrainer = registerSeen(trainer, encounter.speciesId);
    this.setState(
      ({ player: current }) => ({
        battle,
        trainer: seenTrainer,
        player: { ...current, queuedAction: undefined },
      }),
      () => saveTrainer(this.state.trainer),
    );
  }

  private onBattleAction = (action: BattleAction) => {
    const { battle } = this.state;
    if (!battle) return;
    this.setState({ battle: submitAction(battle, action, Math.random) });
  };

  private onBattleMessage = () => {
    const { battle } = this.state;
    if (!battle) return;
    this.setState({ battle: advanceMessage(battle) });
  };

  private onBattleFinish = () => {
    const { battle, trainer } = this.state;
    if (!battle) return;
    const applied = applyBattleOutcome(trainer, battle);
    this.setState({ battle: null, trainer: applied.trainer }, () => {
      saveTrainer(applied.trainer);
      if (applied.messages.length) this.openDialog(applied.messages);
    });
  };

  private interact = () => {
    const { player, game, trainer, battle } = this.state;
    if (battle) return;
    const facing = player.facing ?? "down";
    const { dx, dy } = directionDelta[facing];
    const targetX = player.x + dx * game.tileSize;
    const targetY = player.y + dy * game.tileSize;
    const tile = this.tileDb[`${targetX},${targetY}`];
    const collected = (coordKey: string) => hasCollected(trainer, coordKey);

    // Facing open water: a WATER-type partner lets the player surf onto it.
    if (!player.surfing && isSurfableTile(tile)) {
      const surfer = trainer.party.find(
        (member) => member.hp > 0 && member.types.some((type) => type.toUpperCase() === "WATER"),
      );
      if (!surfer) {
        this.openDialog(["The water is a deep, clear blue...", "A WATER POKéMON could SURF\nacross it."]);
        return;
      }
      const previous = { x: player.x, y: player.y, mapX: this.state.map.x, mapY: this.state.map.y };
      const surfingPlayer = this.withUpdatedPlayerBlock({
        ...player,
        x: targetX,
        y: targetY,
        surfing: true,
        lastAction: Date.now(),
        queuedAction: undefined,
      });
      this.stepParity = this.stepParity === 0 ? 1 : 0;
      this.moveAnim = {
        fromX: previous.x,
        fromY: previous.y,
        mapFromX: previous.mapX,
        mapFromY: previous.mapY,
        start: performance.now(),
        duration: JUMP_ANIMATION_MS,
        kind: "jump",
        parity: this.stepParity,
      };
      this.setState({ player: surfingPlayer }, () => {
        saveThing("player", surfingPlayer);
        this.openDialog([`${surfer.nickname ?? surfer.species} used SURF!`]);
      });
      return;
    }

    const interaction = interactionFor(tile, collected);
    if (interaction.type === "item" && tile) {
      const coordKey = tileCoordKey(tile.mapX, tile.mapY);
      const item = fieldItemFor(
        tile.mapX,
        tile.mapY,
        tile.feature === "hidden-item" || tile.hiddenItem === "pokeball"
          ? "poke-ball"
          : undefined,
      );
      const nextTrainer = collectFieldItem(trainer, coordKey, item);
      if (nextTrainer) {
        this.setState({ trainer: nextTrainer }, () => saveTrainer(nextTrainer));
        this.openDialog([
          `${trainer.name} found a ${item.name}!`,
          `${trainer.name} put the ${item.name}\nin the BAG.`,
        ]);
      }
      return;
    }
    if (interaction.pages?.length) {
      this.openDialog(formatDialogPages(interaction.pages, trainer.name));
    }
  };

  private action = (action: MoveAction) => {
    if (this.state.ui.dialog || this.state.ui.menuOpen || this.state.ui.panel || this.state.battle) return;
    const boundaryWait = this.state.mapLoading.waitingForBlock;
    const now = Date.now();
    if (!boundaryWait && this.state.player.lastAction && now - this.state.player.lastAction < 300) {
      if (!this.state.player.queuedAction) {
        this.setState(({ player }) => ({ player: { ...player, queuedAction: action } }));
      }
      return;
    }

    const game = this.state.game;
    const player = { ...this.state.player, lastAction: now, queuedAction: undefined, facing: actionDirection[action] };
    const map = { ...this.state.map };
    const distance = game.tileSize * (game.zoomMode ? 8 : 1);
    const animFrom = {
      x: this.state.player.x,
      y: this.state.player.y,
      mapX: this.state.map.x,
      mapY: this.state.map.y,
    };

    // Debug zoomMode strides 8 tiles and bypasses collision; normal movement
    // resolves against tile solidity and one-way ledges.
    let steps = 1;
    let destinationX = player.x;
    let destinationY = player.y;
    if (!game.zoomMode) {
      const resolution = resolveMove(
        (x, y) => this.tileDb[`${x},${y}`],
        player.x,
        player.y,
        action,
        game.tileSize,
        (coordKey) => hasCollected(this.state.trainer, coordKey),
        { surfing: player.surfing },
      );
      if (resolution.kind === "blocked") {
        if (boundaryWait) {
          this.setState(
            {
              loadError: "",
              mapLoading: this.mapLoadingSnapshot(null),
              player,
            },
            () => saveThing("player", player),
          );
        } else {
          this.setState({ player }, () => saveThing("player", player));
        }
        return;
      }
      steps = resolution.kind === "jump" ? 2 : 1;
      destinationX = resolution.toX;
      destinationY = resolution.toY;
    } else {
      const { dx, dy } = directionDelta[actionDirection[action]];
      destinationX += dx * distance;
      destinationY += dy * distance;
    }

    if (this.waitForDestinationBlock(destinationX, destinationY, action, player)) return;

    for (let step = 0; step < steps; step += 1) {
      if (action === "moveRight") {
        const cutoff = map.x + game.canvasWidth * game.zoom - game.playerXBoundaryOffset;
        if (player.x >= cutoff) map.x += distance;
        player.x += distance;
      } else if (action === "moveLeft") {
        const cutoff = map.x + game.playerXBoundaryOffset;
        if (player.x < cutoff) map.x -= distance;
        player.x -= distance;
      } else if (action === "moveUp") {
        const cutoff = map.y + game.canvasHeight * game.zoom - game.playerYBoundaryOffset;
        if (player.y >= cutoff) map.y += distance;
        player.y += distance;
      } else {
        const cutoff = map.y + game.playerYBoundaryOffset;
        if (player.y < cutoff) map.y -= distance;
        player.y -= distance;
      }
    }

    // A free-look pan (two-finger drag) can leave the camera anywhere within
    // its clamp radius; the first step afterwards snaps the view back so the
    // player sits inside the boundary box, where normal scrolling keeps them.
    const spanX = game.canvasWidth * game.zoom;
    const spanY = game.canvasHeight * game.zoom;
    map.x = snapToTileGrid(
      Math.min(Math.max(map.x, player.x + game.tileSize + game.playerXBoundaryOffset - spanX), player.x - game.playerXBoundaryOffset),
      game.tileSize,
    );
    map.y = snapToTileGrid(
      Math.min(Math.max(map.y, player.y + game.tileSize + game.playerYBoundaryOffset - spanY), player.y - game.playerYBoundaryOffset),
      game.tileSize,
    );

    const previousBlock = `${player.blockX},${player.blockY}`;
    const destinationTile = this.tileDb[`${player.x},${player.y}`];
    // Stepping from water back onto walkable land ends the surf ride.
    if (player.surfing && !game.zoomMode && destinationTile && !isSurfableTile(destinationTile)) {
      player.surfing = false;
    }
    const updatedPlayer = this.withUpdatedPlayerBlock(player);
    map.blockX = updatedPlayer.blockX;
    map.blockY = updatedPlayer.blockY;
    map.lat = updatedPlayer.lat ?? null;
    map.lng = updatedPlayer.lng ?? null;
    const nextGame = game.tileBrowserUsePlayer
      ? { ...game, tileBrowserX: updatedPlayer.x, tileBrowserY: updatedPlayer.y }
      : game;

    // Kick the visual step animation (logic above already snapped the tile).
    if (!game.zoomMode) {
      this.stepParity = this.stepParity === 0 ? 1 : 0;
      this.moveAnim = {
        fromX: animFrom.x,
        fromY: animFrom.y,
        mapFromX: animFrom.mapX,
        mapFromY: animFrom.mapY,
        start: performance.now(),
        duration: steps > 1 ? JUMP_ANIMATION_MS : WALK_ANIMATION_MS,
        kind: steps > 1 ? "jump" : "walk",
        parity: this.stepParity,
      };
    }

    this.setState({ player: updatedPlayer, map, game: nextGame }, () => {
      saveThing("player", updatedPlayer);
      saveThing("map", map);
      if (nextGame !== game) saveThing("game", nextGame);
      if (previousBlock !== `${updatedPlayer.blockX},${updatedPlayer.blockY}`) void this.getBlocks();
      this.maybeShowStreetBanner(destinationTile);
      this.maybeStartEncounter(updatedPlayer, game.zoomMode);
    });
  };

  // The last street name announced, so re-entering the same street stays
  // quiet until the player has been somewhere else in between.
  private lastStreetBanner: string | null = null;
  private streetBannerTimer?: number;

  /** Stepping onto a named road/path pops the Emerald-style location plate. */
  private maybeShowStreetBanner(tile: MapTile | undefined) {
    const onStreet = tile && (tile.terrain === "road" || tile.terrain === "path");
    const name = onStreet ? streetNameOf(tile) : null;
    if (!onStreet) {
      // Leaving the street re-arms the banner for the next street entered.
      this.lastStreetBanner = null;
      return;
    }
    if (!name || name === this.lastStreetBanner) return;
    this.lastStreetBanner = name;
    if (this.streetBannerTimer) window.clearTimeout(this.streetBannerTimer);
    this.setUi({ streetBanner: { text: name, key: Date.now() } });
    this.streetBannerTimer = window.setTimeout(() => {
      this.streetBannerTimer = undefined;
      if (this.mounted) this.setUi({ streetBanner: null });
    }, 2700);
  }

  // Rolls a wild encounter for the tile the player just stepped onto:
  // long grass on foot, open water while surfing, and cave-mouth zones.
  private maybeStartEncounter(player: PlayerState, debugStride: boolean) {
    if (debugStride || this.state.battle || !this.mounted) return;
    if (!this.state.trainer.party.some((member) => member.hp > 0)) return;
    const tile = this.tileDb[`${player.x},${player.y}`];
    const lookup = (x: number, y: number) => this.tileDb[`${x},${y}`];
    const biome = encounterBiomeFor(tile, {
      surfing: player.surfing,
      nearCave: isNearCaveEntrance(lookup, player.x, player.y, this.state.game.tileSize),
    });
    if (!biome || !encounterTriggered(biome, Math.random)) return;
    this.startWildBattle(this.spawnRules, biome);
  }

  private resizeGame = () => {
    let columns = 1;
    let scale = 1;
    if (window.innerWidth > 2 * this.state.game.canvasWidth * 1.2) columns = 2;
    else if (window.innerWidth <= this.state.game.canvasWidth * 1.2) {
      scale = (window.innerWidth / this.state.game.canvasWidth) * 0.91;
    }
    if (columns !== this.state.game.columns || Math.abs(scale - this.state.game.scale) > 0.0001) {
      const game = { ...this.state.game, columns, scale };
      this.setState({ game });
      saveThing("game", game);
    }
  };

  private restoreBoardWidth() {
    const saved = Number.parseFloat(window.localStorage.getItem("boardWidth") || "");
    if (saved > 0) {
      this.setState({ boardWidth: Math.max(280, Math.min(saved, window.innerWidth - 24)) });
    }
  }

  private startBoardResize = (event: React.MouseEvent | React.TouchEvent) => {
    const point = "touches" in event ? event.touches[0] : event;
    this.boardResize = {
      active: true,
      startX: point.clientX,
      originWidth: this.gameboyRef.current?.offsetWidth || this.state.boardWidth,
    };
    window.addEventListener("mousemove", this.onBoardResize);
    window.addEventListener("mouseup", this.endBoardResize);
    window.addEventListener("touchmove", this.onBoardResize, { passive: false });
    window.addEventListener("touchend", this.endBoardResize);
    event.preventDefault();
  };

  private onBoardResize = (event: MouseEvent | TouchEvent) => {
    if (!this.boardResize.active) return;
    const point = "touches" in event ? event.touches[0] : event;
    const next = this.boardResize.originWidth + (point.clientX - this.boardResize.startX) * 2;
    this.setState({ boardWidth: Math.max(280, Math.min(next, window.innerWidth - 24)) });
    if (event.cancelable) event.preventDefault();
  };

  private endBoardResize = () => {
    this.boardResize.active = false;
    this.removeBoardResizeListeners();
    window.localStorage.setItem("boardWidth", String(Math.round(this.state.boardWidth)));
  };

  private removeBoardResizeListeners() {
    window.removeEventListener("mousemove", this.onBoardResize);
    window.removeEventListener("mouseup", this.endBoardResize);
    window.removeEventListener("touchmove", this.onBoardResize);
    window.removeEventListener("touchend", this.endBoardResize);
  }

  private setGame = (patch: Partial<GameSettings>, callback?: () => void) => {
    this.setState(
      ({ game }) => ({ game: { ...game, ...patch } }),
      () => {
        saveThing("game", this.state.game);
        callback?.();
      },
    );
  };

  private zoom = (direction: "in" | "out") => {
    const { game } = this.state;
    const zoom = nextZoomValue(
      game.zoom,
      direction,
      (tileSize * 2) / game.canvasWidth,
      game.noMaxZoom,
    );
    if (zoom === null) return;

    const map = this.centeredMap(direction, zoom);
    this.setState(
      ({ game }) => ({
        game: { ...game, zoom, zoomScale: game.canvasWidth / (game.canvasWidth * zoom) },
        map,
      }),
      () => {
        saveThing("game", this.state.game);
        saveThing("map", map);
        void this.getBlocks();
      },
    );
  };

  private centeredMap(direction: "in" | "out", nextZoom: number): MapView {
    const map = { ...this.state.map };
    const { player, game } = this.state;
    // Preserve the view's world-space centre so the tile canvas and the Google
    // map layer stay locked to the same ground across zoom steps.
    map.x += (game.canvasWidth * (game.zoom - nextZoom)) / 2;
    map.y += (game.canvasHeight * (game.zoom - nextZoom)) / 2;
    // Keep the player inside the zoomed viewport, snapped to the tile grid.
    const spanX = game.canvasWidth * nextZoom;
    const spanY = game.canvasHeight * nextZoom;
    map.x = Math.min(Math.max(map.x, player.x + tileSize - spanX), player.x);
    map.y = Math.min(Math.max(map.y, player.y + tileSize - spanY), player.y);
    map.x = Math.round(map.x / tileSize) * tileSize;
    map.y = Math.round(map.y / tileSize) * tileSize;
    void direction;
    return map;
  }

  private async getBlocks(requiredBlock?: BlockCoordinates) {
    const { player, game } = this.state;
    if (!Number.isFinite(player.blockX) || !Number.isFinite(player.blockY)) return;

    const offsetLimit = mapOffsetLimitForZoom(game.zoom);
    const offsets: Array<[number, number]> = [];
    for (let x = 0; x < offsetLimit; x += 1) {
      for (let y = 0; y < offsetLimit; y += 1) {
        offsets.push([x, y]);
        if (x !== 0) offsets.push([-x, y]);
        if (y !== 0) offsets.push([x, -y]);
        if (x !== 0 && y !== 0) offsets.push([-x, -y]);
      }
    }
    if (requiredBlock) {
      const requiredOffset: [number, number] = [
        requiredBlock.x - player.blockX,
        requiredBlock.y - player.blockY,
      ];
      if (!offsets.some(([x, y]) => x === requiredOffset[0] && y === requiredOffset[1])) {
        offsets.push(requiredOffset);
      }
    }

    const offsetsToQuery = offsets.filter(([x, y]) => {
      const key = `${player.blockX + x},${player.blockY + y}`;
      if (typeof this.queries[key] === "number") return false;
      if (!game.regenerate && this.queries[key] === "complete") return false;
      return true;
    });
    if (!offsetsToQuery.length) return;

    // Queue the complete nearby square immediately. The poll endpoint streams
    // completed stored blocks back while the rest of this one workflow runs.
    const requestedOffsets = prioritizeMapPreloadOffsets(offsetsToQuery);
    const requestToken = ++this.querySequence;
    const requestKeys = new Set(
      requestedOffsets.map(([x, y]) => `${player.blockX + x},${player.blockY + y}`),
    );
    for (const [x, y] of requestedOffsets) {
      this.queries[`${player.blockX + x},${player.blockY + y}`] = requestToken;
    }
    this.activeLoadRequests.set(requestToken, {
      completed: new Set(),
      requested: requestKeys,
    });
    this.syncMapLoading();

    const controller = new AbortController();
    this.abortControllers.add(controller);
    let loadFailure = "";
    try {
      await getMapBlocks(
        {
          blockX: player.blockX,
          blockY: player.blockY,
          offsets: requestedOffsets,
          regenerate: game.regenerate,
        },
        controller.signal,
        { onBlocks: (ready) => this.receiveBlocks(ready, requestToken) },
      );
      for (const [x, y] of requestedOffsets) {
        const key = `${player.blockX + x},${player.blockY + y}`;
        if (this.queries[key] === requestToken) delete this.queries[key];
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      for (const [x, y] of requestedOffsets) {
        const key = `${player.blockX + x},${player.blockY + y}`;
        if (this.queries[key] === requestToken) delete this.queries[key];
      }
      loadFailure = error instanceof Error ? error.message : "Map generation failed";
    } finally {
      this.abortControllers.delete(controller);
      this.activeLoadRequests.delete(requestToken);
      if (this.mounted) {
        const waiting = this.state.mapLoading.waitingForBlock;
        const waitingKey = waiting ? `${waiting.blockX},${waiting.blockY}` : "";
        const waitingForBlock =
          loadFailure && waiting && requestKeys.has(waitingKey)
            ? { ...waiting, error: loadFailure, status: "error" as const }
            : waiting;
        this.setState(({ loadError }) => ({
          loadError: loadFailure || loadError,
          mapLoading: this.mapLoadingSnapshot(waitingForBlock),
        }));
      }
    }
  }

  private receiveBlocks(blocks: MapBlock[], requestToken: number) {
    if (!this.mounted || blocks.length === 0) return;
    this.processBlocks(blocks);
    const activeRequest = this.activeLoadRequests.get(requestToken);
    for (const block of blocks) {
      const key = `${block.x},${block.y}`;
      if (this.queries[key] === requestToken) this.queries[key] = "complete";
      if (activeRequest?.requested.has(key)) activeRequest.completed.add(key);
    }

    const { player } = this.state;
    if (!this.state.game.anyLoaded && !this.loadedTimer && this.blockDb[`${player.blockX},${player.blockY}`]) {
      this.loadedTimer = window.setTimeout(() => {
        this.loadedTimer = undefined;
        this.setGame({ anyLoaded: true });
      }, 500);
    }
    const waiting = this.state.mapLoading.waitingForBlock;
    const waitingForBlock =
      waiting && this.blockDb[`${waiting.blockX},${waiting.blockY}`] ? null : waiting;
    this.setState(({ revision }) => ({
      revision: revision + 1,
      loadError: "",
      mapLoading: this.mapLoadingSnapshot(waitingForBlock),
    }));
  }

  private retryMapLoad = () => {
    const waiting = this.state.mapLoading.waitingForBlock;
    const requiredBlock = waiting ? { x: waiting.blockX, y: waiting.blockY } : undefined;
    if (requiredBlock) delete this.queries[`${requiredBlock.x},${requiredBlock.y}`];
    const waitingForBlock = waiting
      ? { ...waiting, error: undefined, status: "loading" as const }
      : null;
    this.setState(
      {
        loadError: "",
        mapLoading: this.mapLoadingSnapshot(waitingForBlock),
      },
      () => void this.getBlocks(requiredBlock),
    );
  };

  private processBlocks(blocks: MapBlock[]) {
    for (const block of blocks) {
      block.mapX ??= block.x * blockSize;
      block.mapY ??= block.y * blockSize;
      const blockKey = `${block.x},${block.y}`;
      const current = this.blockDb[blockKey];
      if (!current || !current.updated || !block.updated || current.updated < block.updated) this.blockDb[blockKey] = block;

      for (const tile of block.tiles || []) {
        if (!tile) continue;
        const tileCoordinateKey = `${tile.mapX},${tile.mapY}`;
        const currentTile = this.tileDb[tileCoordinateKey];
        if (!currentTile || !currentTile.updated || !tile.updated || currentTile.updated < tile.updated) {
          this.tileDb[tileCoordinateKey] = tile;
        }
        this.tileHistoryDb[tileCoordinateKey] ||= [];
        this.tileHistoryDb[tileCoordinateKey].push(tile);
      }
    }
    this.storeTileData();
    this.storeBlockData();
    this.ensureWalkableSpawn();
    this.stampDevPond();
  }

  // Dev-only: the offline fallback world never classifies water, so surf
  // can't be exercised there. localStorage "devPond" = "true" stamps a small
  // pond two tiles east of spawn for visual surf testing. Stripped from
  // production builds.
  private devPondStamped = false;

  private stampDevPond() {
    if (!import.meta.env.DEV || this.devPondStamped) return;
    if (window.localStorage.getItem("devPond") !== "true") return;
    const { player } = this.state;
    const spawnTile = this.tileDb[`${player.x},${player.y}`];
    if (!spawnTile) return;
    this.devPondStamped = true;
    for (let dx = 2; dx <= 5; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const mapX = player.x + dx * tileSize;
        const mapY = player.y + dy * tileSize;
        const existing = this.tileDb[`${mapX},${mapY}`];
        if (!existing) continue;
        this.tileDb[`${mapX},${mapY}`] = {
          ...existing,
          img: "pond-5",
          img2: undefined,
          feature: undefined,
          terrain: "water",
          solid: true,
          updated: Date.now(),
        };
      }
    }
    this.setState(({ revision }) => ({ revision: revision + 1 }));
  }

  // A fresh load-in (or a restore into a re-generated world) can land the
  // player on a solid tile such as a house roof; nudge them to the nearest
  // walkable tile once their spawn tile is known.
  private spawnChecked = false;

  private ensureWalkableSpawn() {
    if (this.spawnChecked) return;
    const { player } = this.state;
    const spawnTile = this.tileDb[`${player.x},${player.y}`];
    if (!spawnTile) return;
    this.spawnChecked = true;
    if (!spawnTile.solid) return;

    const visited = new Set([`${player.x},${player.y}`]);
    const queue: Array<[number, number]> = [[player.x, player.y]];
    while (queue.length && visited.size <= 400) {
      const [x, y] = queue.shift() as [number, number];
      for (const [dx, dy] of [[0, tileSize], [tileSize, 0], [0, -tileSize], [-tileSize, 0]]) {
        const nextX = x + dx;
        const nextY = y + dy;
        const key = `${nextX},${nextY}`;
        if (visited.has(key)) continue;
        visited.add(key);
        const tile = this.tileDb[key];
        if (!tile) continue;
        if (!tile.solid) {
          const relocated = this.withUpdatedPlayerBlock({ ...this.state.player, x: nextX, y: nextY });
          this.setState({ player: relocated }, () => saveThing("player", relocated));
          return;
        }
        queue.push([nextX, nextY]);
      }
    }
  }

  private loadImage(key: string, source: string) {
    if (this.storedImages.has(key)) return;
    const element = new Image();
    const stored = { element, loaded: false };
    this.storedImages.set(key, stored);
    element.onload = () => {
      stored.loaded = true;
    };
    element.src = source;
  }

  private storeTileData() {
    for (const tile of Object.values(this.tileDb)) {
      if (tile.img2) this.loadImage(tile.img2, `/tiles/${tile.img2}.png`);
      if (tile.img) this.loadImage(tile.img, `/tiles/${tile.img}.png`);
      if (tile.image) this.loadImage(tile.image, `data:image/png;base64,${tile.image}`);
    }
  }

  private storeBlockData() {
    for (const block of Object.values(this.blockDb)) {
      if (block.googleMap) this.loadImage(block.googleMap, `data:image/png;base64,${block.googleMap}`);
    }
  }

  private renderLoop = () => {
    if (!this.mounted) return;
    this.renderCanvas();
    this.animationFrame = requestAnimationFrame(this.renderLoop);
  };

  private renderCanvas() {
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const canvasContext = canvas.getContext("2d");
    const layerContext = this.layer1Ref.current?.getContext("2d");
    const gmapContext = this.gmapRef.current?.getContext("2d");
    if (!canvasContext) return;

    const { game, map, player, trainer } = this.state;

    // Visual step interpolation: the whole scene (tiles, overlays, player)
    // renders against a camera lerped between the pre-step and post-step
    // positions, so tile-snapped logic looks like Emerald's smooth walk.
    const anim = this.moveAnim;
    let animProgress = 1;
    if (anim) {
      animProgress = Math.min(1, (performance.now() - anim.start) / anim.duration);
      if (animProgress >= 1) this.moveAnim = null;
    }
    const animating = anim !== null && animProgress < 1;
    const view =
      animating && anim
        ? {
            x: anim.mapFromX + (map.x - anim.mapFromX) * animProgress,
            y: anim.mapFromY + (map.y - anim.mapFromY) * animProgress,
          }
        : { x: map.x, y: map.y };

    this.loadImage("grass", "/tiles/grass.png");
    const grassBackground = this.storedImages.get("grass");
    for (const context of [canvasContext, layerContext, gmapContext]) {
      if (!context) continue;
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, context.canvas.width, context.canvas.height);
      context.fillStyle = "#70c0a0";
      context.fillRect(0, 0, context.canvas.width, context.canvas.height);
      if (context !== gmapContext && grassBackground?.loaded) {
        const pattern = context.createPattern(grassBackground.element, "repeat");
        if (pattern) {
          context.fillStyle = pattern;
          context.fillRect(0, 0, context.canvas.width, context.canvas.height);
        }
      }
    }
    map.tileCount = 0;
    map.blocks = [];
    // Tall (16x32) img2 art is deferred out of the flat tile pass into a
    // north-to-south pass shared with the player (see tall-sprites.ts).
    const tallTiles: MapTile[] = [];
    for (const tile of Object.values(this.tileDb)) {
      if (!this.tileShouldRender(tile)) continue;
      const blockKey = `${tile.blockX}_${tile.blockY}`;
      if (!map.blocks.includes(blockKey)) map.blocks.push(blockKey);
      map.tileCount += 1;
      const x = tile.mapX - view.x;
      const y = tile.mapY - view.y;
      const width = game.tileSize * game.zoomScale;
      const height = game.tileSize * game.zoomScale;
      const drawX = x * game.zoomScale;
      const drawY = this.convertY(y, height);
      const base = tile.img ? this.storedImages.get(tile.img) : undefined;
      if (base?.loaded) {
        canvasContext.drawImage(base.element, drawX, drawY, width, height);
        layerContext?.drawImage(base.element, drawX, drawY, width, height);
      }
      const overlayHidden =
        isFieldItemTile(tile) && hasCollected(this.state.trainer, tileCoordKey(tile.mapX, tile.mapY));
      const top = !overlayHidden && tile.img2 ? this.storedImages.get(tile.img2) : undefined;
      if (top?.loaded) {
        if (isTallTileArt(top.element.naturalWidth, top.element.naturalHeight)) {
          tallTiles.push(tile);
        } else {
          canvasContext.drawImage(top.element, drawX, drawY, width, height);
        }
      }
    }

    if (gmapContext) this.drawGoogleBlocks(gmapContext, view);

    if (game.overlay) {
      canvasContext.save();
      if (game.overlaySplit) {
        const splitPx = clampOverlaySplit(game.overlaySplitX) * canvasContext.canvas.width;
        canvasContext.beginPath();
        canvasContext.rect(0, 0, splitPx, canvasContext.canvas.height);
        canvasContext.clip();
      }
      canvasContext.globalAlpha = clampOverlayOpacity(game.overlayOpacity);
      this.drawGoogleBlocks(canvasContext, view);
      canvasContext.restore();
      if (game.overlaySplit) this.drawOverlayDivider(canvasContext);
    }

    // Directional Emerald walk frames: idle (0) or the alternating step
    // frames (1/2) for the first 60% of each tile step. "side" faces left
    // and is mirrored when walking right.
    const facing = player.facing ?? "down";
    const frameDirectory = PLAYER_FRAME_DIRECTORY[facing];
    let frame = 0;
    if (animating && anim) {
      frame = animProgress < 0.6 ? (anim.parity ? 1 : 2) : 0;
    }
    const gender = trainer.gender === "girl" ? "girl" : "boy";
    const spriteKey = `player/${gender}/${frameDirectory}-${frame}`;
    this.loadImage(spriteKey, `/sprites/${spriteKey}.png`);
    let character = this.storedImages.get(spriteKey);
    if (!character?.loaded) {
      // Frames still decoding on first paint: fall back to the legacy sprite.
      this.loadImage("char-walk-1", "/sprites/char-walk-1.png");
      character = this.storedImages.get("char-walk-1");
    }
    const playerWorldY = animating && anim ? anim.fromY + (player.y - anim.fromY) * animProgress : player.y;

    // Tall art and the player share one north-to-south paint pass so southern
    // canopies overlap northern trunks and the player is occluded by (or
    // occludes) tall trees exactly the way Emerald layers its forests.
    const entities = sortTallEntities<{ mapY: number; isPlayer?: boolean; tile?: MapTile }>([
      ...tallTiles.map((tile) => ({ mapY: tile.mapY, tile })),
      { mapY: playerWorldY, isPlayer: true },
    ]);
    for (const entity of entities) {
      if (entity.tile) {
        const image = entity.tile.img2 ? this.storedImages.get(entity.tile.img2) : undefined;
        if (!image?.loaded) continue;
        const width = game.tileSize * game.zoomScale;
        const height = game.tileSize * 2 * game.zoomScale;
        const drawX = (entity.tile.mapX - view.x) * game.zoomScale;
        const drawY = this.convertY(entity.tile.mapY - view.y, height);
        canvasContext.drawImage(image.element, drawX, drawY, width, height);
        continue;
      }
      if (!character?.loaded) continue;
      const worldX = animating && anim ? anim.fromX + (player.x - anim.fromX) * animProgress : player.x;
      const x = worldX - view.x;
      const y = playerWorldY - view.y;
      const width = tileSize * game.zoomScale;
      const height = tileSize * 2 * game.zoomScale;
      const drawX = x * game.zoomScale;
      let drawY = this.convertY(y, height);
      if (animating && anim?.kind === "jump") {
        drawY -= Math.sin(animProgress * Math.PI) * tileSize * 0.5 * game.zoomScale;
      } else if (player.surfing && !animating) {
        drawY -= (Math.sin(performance.now() / 280) + 1) * 1.5 * game.zoomScale;
      }
      const flip = facing === "right";
      for (const context of [canvasContext, gmapContext, layerContext]) {
        if (!context) continue;
        if (flip) {
          context.save();
          context.scale(-1, 1);
          context.drawImage(character.element, -drawX - width, drawY, width, height);
          context.restore();
        } else {
          context.drawImage(character.element, drawX, drawY, width, height);
        }
      }
    }
  }

  private drawGoogleBlocks(context: CanvasRenderingContext2D, view: { x: number; y: number }) {
    const { game } = this.state;
    for (const block of Object.values(this.blockDb)) {
      if (!this.blockShouldRender(block) || !block.googleMap) continue;
      const image = this.storedImages.get(block.googleMap);
      if (!image?.loaded) continue;
      const x = (Number(block.mapX) - view.x) * game.zoomScale;
      const y = Number(block.mapY) - view.y;
      const width = game.blockSize * game.zoomScale;
      const height = game.blockSize * game.zoomScale;
      context.drawImage(image.element, x, this.convertY(y, height), width, height);
    }
  }

  private drawOverlayDivider(context: CanvasRenderingContext2D) {
    const { width, height } = context.canvas;
    const x = clampOverlaySplit(this.state.game.overlaySplitX) * width;
    context.save();
    context.strokeStyle = "rgba(20, 28, 36, 0.85)";
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    context.strokeStyle = "rgba(255, 255, 255, 0.95)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();

    const gripY = height / 2;
    context.fillStyle = "rgba(20, 28, 36, 0.85)";
    context.beginPath();
    context.arc(x, gripY, 11, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "rgba(255, 255, 255, 0.95)";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, gripY, 11, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = "rgba(255, 255, 255, 0.95)";
    context.beginPath();
    context.moveTo(x - 7, gripY);
    context.lineTo(x - 2, gripY - 4);
    context.lineTo(x - 2, gripY + 4);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(x + 7, gripY);
    context.lineTo(x + 2, gripY - 4);
    context.lineTo(x + 2, gripY + 4);
    context.closePath();
    context.fill();
    context.restore();
  }

  private overlayDragPointerId: number | null = null;
  // Live pointers on the canvas (CSS px relative to the canvas box) — two of
  // them make a pan/pinch gesture (see pinch-zoom.ts for the camera math).
  private readonly gesturePointers = new Map<number, GesturePoint>();
  private pinchStart: PinchStart | null = null;
  // Free-look pan distance: the viewport centre may drift up to two blocks
  // from the player, which stays inside the block-preload/render radius.
  private static readonly MAX_PAN_WORLD = blockSize * 2;

  private overlayPointerFraction(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    if (!canvas.clientWidth) return Number.NaN;
    return event.nativeEvent.offsetX / canvas.clientWidth;
  }

  private canvasPoint(event: ReactPointerEvent<HTMLCanvasElement>): GesturePoint {
    return { x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY };
  }

  private beginPinchIfPaired(canvas: HTMLCanvasElement) {
    if (this.gesturePointers.size !== 2) return;
    // A second finger always wins over an in-flight overlay-divider drag.
    if (this.overlayDragPointerId !== null) {
      if (canvas.hasPointerCapture(this.overlayDragPointerId)) {
        canvas.releasePointerCapture(this.overlayDragPointerId);
      }
      this.overlayDragPointerId = null;
    }
    const [a, b] = [...this.gesturePointers.values()];
    const { game, map } = this.state;
    this.pinchStart = {
      distance: distanceOf(a, b),
      centroid: centroidOf(a, b),
      zoom: game.zoom,
      mapX: map.x,
      mapY: map.y,
    };
  }

  private updatePinch(canvas: HTMLCanvasElement) {
    const start = this.pinchStart;
    if (!start || this.gesturePointers.size !== 2) return;
    const [a, b] = [...this.gesturePointers.values()];
    const { game, player } = this.state;
    const update = clampPanToPlayer(
      computePinchUpdate(
        start,
        { distance: distanceOf(a, b), centroid: centroidOf(a, b) },
        {
          canvasWidth: game.canvasWidth,
          canvasHeight: game.canvasHeight,
          clientWidth: canvas.clientWidth || game.canvasWidth,
          clientHeight: canvas.clientHeight || game.canvasHeight,
        },
        game.noMaxZoom,
      ),
      { x: player.x, y: player.y },
      { canvasWidth: game.canvasWidth, canvasHeight: game.canvasHeight },
      Game.MAX_PAN_WORLD,
    );
    this.setState(({ game: current, map }) => ({
      game: {
        ...current,
        zoom: update.zoom,
        zoomScale: current.canvasWidth / (current.canvasWidth * update.zoom),
      },
      map: { ...map, x: update.mapX, y: update.mapY },
    }));
  }

  private endPinch() {
    if (!this.pinchStart) return;
    this.pinchStart = null;
    // Movement logic steps the camera by whole tiles, so settle on the grid.
    this.setState(
      ({ map }) => ({
        map: { ...map, x: snapToTileGrid(map.x, tileSize), y: snapToTileGrid(map.y, tileSize) },
      }),
      () => {
        saveThing("game", this.state.game);
        saveThing("map", this.state.map);
        void this.getBlocks();
      },
    );
  }

  private onCanvasPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    if (event.pointerType === "touch" || event.button === 0) {
      this.gesturePointers.set(event.pointerId, this.canvasPoint(event));
      canvas.setPointerCapture(event.pointerId);
      if (this.gesturePointers.size === 2) {
        this.beginPinchIfPaired(canvas);
        event.preventDefault();
        return;
      }
    }

    const { game } = this.state;
    if (!game.overlay || !game.overlaySplit) return;
    // Only the primary pointer's main button may grab the divider; a
    // right-click or second touch must not start (or steal) a drag.
    if (event.button !== 0 || !event.isPrimary || this.overlayDragPointerId !== null) return;
    const fraction = this.overlayPointerFraction(event);
    if (!overlaySplitHit(fraction, game.overlaySplitX)) return;
    this.overlayDragPointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  private onCanvasPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (this.gesturePointers.has(event.pointerId)) {
      this.gesturePointers.set(event.pointerId, this.canvasPoint(event));
      if (this.pinchStart) {
        this.updatePinch(event.currentTarget);
        event.preventDefault();
        return;
      }
    }
    if (event.pointerId !== this.overlayDragPointerId) return;
    const fraction = clampOverlaySplit(this.overlayPointerFraction(event));
    // Persisting on release keeps drag updates cheap.
    this.setState(({ game }) => ({ game: { ...game, overlaySplitX: fraction } }));
  };

  private onCanvasPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (this.gesturePointers.delete(event.pointerId)) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (this.pinchStart && this.gesturePointers.size < 2) this.endPinch();
    }
    if (event.pointerId !== this.overlayDragPointerId) return;
    this.overlayDragPointerId = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    saveThing("game", this.state.game);
  };

  private tileShouldRender(tile: MapTile) {
    const { map, game } = this.state;
    // One-tile margin keeps edge tiles visible while the camera lerps a step.
    return (
      tile.mapX >= map.x - tileSize &&
      tile.mapX < map.x + game.canvasWidth * game.zoom + tileSize &&
      tile.mapY >= map.y - tileSize &&
      tile.mapY < map.y + game.canvasWidth * game.zoom + tileSize
    );
  }

  private blockShouldRender(block: MapBlock) {
    const { blockX, blockY } = this.state.map;
    return Math.abs(block.x - blockX) <= 2 && Math.abs(block.y - blockY) <= 2;
  }

  private convertY(y: number, scaledHeight: number) {
    const { game } = this.state;
    return (game.canvasHeight * game.zoom - y) * game.zoomScale - scaledHeight;
  }

  private resetGame = () => {
    window.localStorage.clear();
    window.location.reload();
  };

  private get tileBrowserTile() {
    return Object.values(this.tileDb).find(
      (tile) => tile.mapX === this.state.game.tileBrowserX && tile.mapY === this.state.game.tileBrowserY,
    );
  }

  override render() {
    const { game, map, mapLoading, player } = this.state;
    // New players meet PROF. OAK before anything else — even before the
    // location prompt or map load resolves (both continue in the background).
    // The intro plays on the same gameboy shell the game itself renders in.
    if (this.state.onboarding) {
      return (
        <div className="w-full flex flex-col items-center justify-center pb-12">
          <div
            className="gameboy bg-gameboy-grey max-w-full flex flex-col items-center justify-center rounded-2xl shadow-md px-2 py-2 md:px-4 md:py-4 relative"
            style={{ width: `min(${this.state.boardWidth}px, calc(100vw - 24px))` }}
          >
            <div className="flex flex-row justify-center w-full relative">
              <OakIntro onComplete={this.completeOnboarding} invite={this.state.invite} />
            </div>
          </div>
        </div>
      );
    }
    if (this.state.locationError) {
      return (
        <div className="w-full flex flex-col items-center justify-center pb-12">
          <div className="text-center text-red">
            This game does not work without location access, please enable location services and reload the page.
            <div className="flex w-full pt-4 justify-center">
              <button
                type="button"
                className="flex rounded-md cursor-pointer shadow-md px-5 py-2 text-white bg-grass"
                onClick={() => {
                  window.localStorage.setItem("continueWithoutLocation", "true");
                  window.location.reload();
                }}
              >
                Continue without location
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (!game.anyLoaded) {
      return (
        <div className="w-full flex flex-col items-center justify-center pb-12">
          <div className="loading-container">
            <img src="/loading.gif" alt="" />
          </div>
          <div className="text-lg text-grass">Loading..</div>
          {this.state.loadError ? <div className="max-w-lg text-center text-red pt-4">{this.state.loadError}</div> : null}
          <button
            type="button"
            className="px-4 py-2 cursor-pointer mt-7 shadow-md text-white bg-grass rounded-md"
            onClick={this.resetGame}
          >
            Reset
          </button>
        </div>
      );
    }

    const debugButton = "py-2 px-8 mr-4 mb-4 bg-grass text-white cursor-pointer";
    const browserTile = this.tileBrowserTile;
    const { ui, trainer } = this.state;
    return (
      <div className="w-full flex flex-col items-center justify-center pb-12">
        <div
          className={`w-full flex justify-center ${game.debugPosition ? "flex-row" : "flex-col items-center"}`}
        >
          <div>
            <div
              ref={this.gameboyRef}
              className="gameboy bg-gameboy-grey max-w-full flex flex-col items-center justify-center rounded-2xl shadow-md px-2 py-2 md:px-4 md:py-4 relative"
              style={{ width: `min(${this.state.boardWidth}px, calc(100vw - 24px))` }}
            >
              <div className="flex flex-row justify-center w-full board-screen relative">
                <canvas
                  ref={this.canvasRef}
                  className={`screen-canvas bg-black rounded-lg ${game.overlay && game.overlaySplit ? "overlay-split-active" : ""}`}
                  width={game.canvasWidth}
                  height={game.canvasHeight}
                  onPointerDown={this.onCanvasPointerDown}
                  onPointerMove={this.onCanvasPointerMove}
                  onPointerUp={this.onCanvasPointerUp}
                  onPointerCancel={this.onCanvasPointerUp}
                />
                <div className="game-ui-layer">
                  {ui.streetBanner ? (
                    <div className="pkmn-street-banner" key={ui.streetBanner.key}>
                      {ui.streetBanner.text}
                    </div>
                  ) : null}
                  <MapLoadingIndicator
                    active={mapLoading.activeRequests > 0 || Boolean(mapLoading.waitingForBlock)}
                    completed={mapLoading.completed}
                    error={mapLoading.waitingForBlock?.error || this.state.loadError}
                    onRetry={this.retryMapLoad}
                    requested={mapLoading.requested}
                    waitingForBoundary={Boolean(mapLoading.waitingForBlock)}
                  />
                  {ui.menuOpen ? (
                    <StartMenu
                      selectedIndex={ui.menuIndex}
                      onSelect={this.selectMenuItem}
                      onHighlight={(index) => this.setUi({ menuIndex: index })}
                    />
                  ) : null}
                  {ui.panel === "party" ? (
                    <PartyPanel
                      trainer={trainer}
                      onChange={this.setTrainer}
                      onClose={() => this.setUi({ panel: null, menuOpen: true })}
                    />
                  ) : null}
                  {ui.panel === "bag" ? (
                    <BagPanel
                      trainer={trainer}
                      onChange={this.setTrainer}
                      onClose={() => this.setUi({ panel: null, menuOpen: true })}
                    />
                  ) : null}
                  {ui.panel === "badges" ? (
                    <BadgesPanel
                      trainer={trainer}
                      onChange={this.setTrainer}
                      onClose={() => this.setUi({ panel: null, menuOpen: true })}
                    />
                  ) : null}
                  {ui.panel === "pc" ? (
                    <PcPanel
                      trainer={trainer}
                      onChange={this.setTrainer}
                      onClose={() => this.setUi({ panel: null, menuOpen: true })}
                    />
                  ) : null}
                  {ui.panel === "pokedex" ? (
                    <PokedexPanel
                      trainer={trainer}
                      onClose={() => this.setUi({ panel: null, menuOpen: true })}
                    />
                  ) : null}
                  {ui.panel === "settings" ? (
                    <SettingsPanel
                      trainer={trainer}
                      onChange={this.setTrainer}
                      onClose={() => this.setUi({ panel: null, menuOpen: true })}
                    />
                  ) : null}
                  {this.state.battle ? (
                    <BattleScreen
                      battle={this.state.battle}
                      trainer={trainer}
                      onAction={this.onBattleAction}
                      onAdvanceMessage={this.onBattleMessage}
                      onFinish={this.onBattleFinish}
                    />
                  ) : null}
                  {ui.dialog ? (
                    <DialogBox
                      pages={ui.dialog.pages}
                      advance={ui.dialog.advance}
                      onRequestAdvance={this.advanceDialog}
                      onDone={this.closeDialog}
                    />
                  ) : null}
                </div>
              </div>
              <div className="overlay-controls w-full flex flex-row items-center justify-center gap-2 pt-3">
                <button
                  type="button"
                  className={`overlay-chip ${game.overlay ? "overlay-chip-active" : ""}`}
                  aria-pressed={game.overlay}
                  onClick={() => this.setGame({ overlay: !game.overlay })}
                >
                  MAP
                </button>
                {game.overlay ? (
                  <>
                    <input
                      type="range"
                      className="overlay-opacity"
                      min={0}
                      max={100}
                      step={5}
                      value={Math.round(clampOverlayOpacity(game.overlayOpacity) * 100)}
                      aria-label="Map overlay opacity"
                      onChange={(event) =>
                        this.setGame({ overlayOpacity: Number(event.target.value) / 100 })
                      }
                    />
                    <button
                      type="button"
                      className={`overlay-chip ${game.overlaySplit ? "overlay-chip-active" : ""}`}
                      aria-pressed={game.overlaySplit}
                      onClick={() => this.setGame({ overlaySplit: !game.overlaySplit })}
                    >
                      SPLIT
                    </button>
                  </>
                ) : null}
              </div>
              <div className="w-full pt-6 md:pt-10 pb-12">
                <div className="controls flex flex-row">
                  <div className="dpad ml-4 md:ml-12">
                    <button type="button" aria-label="Move up" className="up" onClick={() => this.action("moveUp")} />
                    <button type="button" aria-label="Move right" className="right" onClick={() => this.action("moveRight")} />
                    <button type="button" aria-label="Move down" className="down" onClick={() => this.action("moveDown")} />
                    <button type="button" aria-label="Move left" className="left" onClick={() => this.action("moveLeft")} />
                    <div className="middle" />
                  </div>
                  <div className="ml-auto a-b mr-4 md:mr-12">
                    <button type="button" className="b" aria-label="Back or close" onClick={this.pressB}>B</button>
                    <button type="button" className="a" aria-label="Interact or confirm" onClick={this.pressA}>A</button>
                  </div>
                </div>
                <div className="pt-12 md:pt-20" />
                <div className="start-select">
                  <button type="button" className="select" onClick={() => this.zoom("out")}>-</button>
                  <button type="button" className="select" onClick={() => this.zoom("in")}>+</button>
                  <button type="button" className="select" onClick={() => this.setGame({ debug: !game.debug })}>SELECT</button>
                  <button
                    type="button"
                    className="start"
                    aria-label="Toggle Start menu"
                    aria-pressed={ui.menuOpen}
                    onClick={this.toggleMenu}
                  >
                    START
                  </button>
                </div>
              </div>
              <div
                className="board-resize-handle"
                title="Drag to resize the Game Boy"
                onMouseDown={this.startBoardResize}
                onTouchStart={this.startBoardResize}
              />
            </div>
          </div>
          {game.debug ? (
            <div className="flex flex-col md:px-12">
              <div className={`flex flex-row items-center flex-wrap pt-8 ${game.debugPosition ? "" : "justify-center"}`}>
                {import.meta.env.DEV ? (
                  <button type="button" className={debugButton} onClick={() => this.setGame({ regenerate: !game.regenerate }, () => void this.getBlocks())}>
                    Regenerate {game.regenerate ? "On" : "Off"}
                  </button>
                ) : null}
                <button type="button" className={debugButton} onClick={() => this.setGame({ tileBrowser: !game.tileBrowser })}>
                  Tile Browser {game.tileBrowser ? "On" : "Off"}
                </button>
                <button type="button" className={debugButton} onClick={() => this.setGame({ tileBrowserUsePlayer: !game.tileBrowserUsePlayer })}>
                  Tile Browser Use Player Location {game.tileBrowserUsePlayer ? "On" : "Off"}
                </button>
                <button type="button" className={debugButton} onClick={() => this.setGame({ showLayer1: !game.showLayer1 })}>
                  Layer 1 {game.showLayer1 ? "On" : "Off"}
                </button>
                <button type="button" className={debugButton} onClick={() => this.setGame({ showLayerGmap: !game.showLayerGmap })}>
                  Gmap {game.showLayerGmap ? "On" : "Off"}
                </button>
                <button type="button" className={debugButton} onClick={() => this.setGame({ showStats: !game.showStats })}>
                  Stats {game.showStats ? "On" : "Off"}
                </button>
                <button type="button" className={debugButton} onClick={() => this.setGame({ zoomMode: !game.zoomMode })}>
                  Zoom Mode {game.zoomMode ? "On" : "Off"}
                </button>
                <button
                  type="button"
                  className={debugButton}
                  aria-pressed={game.noMaxZoom}
                  title="Allow the - button to zoom out past the normal 3x limit while keeping map loading bounded"
                  onClick={() => this.setGame({ noMaxZoom: !game.noMaxZoom })}
                >
                  No Max Zoom Value {game.noMaxZoom ? "On" : "Off"}
                </button>
                <button type="button" className={debugButton} onClick={() => this.setGame({ debugPosition: !game.debugPosition })}>
                  Debug {game.debugPosition ? "Right" : "Bottom"}
                </button>
                <button type="button" className={`${debugButton} mr-0`} onClick={this.resetGame}>Reset</button>
              </div>
              {game.showLayer1 || game.showLayerGmap ? (
                <div className="debug-layer-grid" aria-label="Map rendering layers">
                  {game.showLayer1 ? (
                    <figure className="debug-layer-card">
                      <figcaption>Base terrain tiles</figcaption>
                      <canvas
                        ref={this.layer1Ref}
                        className="debug-layer-canvas"
                        width={game.canvasWidth}
                        height={game.canvasHeight}
                      />
                    </figure>
                  ) : null}
                  {game.showLayerGmap ? (
                    <figure className="debug-layer-card">
                      <figcaption>Google Static Maps source</figcaption>
                      <canvas
                        ref={this.gmapRef}
                        className="debug-layer-canvas"
                        width={game.canvasWidth}
                        height={game.canvasHeight}
                      />
                    </figure>
                  ) : null}
                </div>
              ) : null}
              {game.tileBrowser ? (
                <div>
                  <div className="flex flex-row pb-4">
                    <div className="flex-col mr-2">
                      <input
                        type="number"
                        value={game.tileBrowserX}
                        placeholder="map X"
                        className="py-2 px-4"
                        onChange={(event) => this.setGame({ tileBrowserX: Number(event.target.value) })}
                      />
                      <div className="flex pt-2">
                        <button type="button" className="cursor-pointer bg-grass text-white py-1 px-3" onClick={() => this.setGame({ tileBrowserX: game.tileBrowserX - 32 })}>-</button>
                        <button type="button" className="cursor-pointer bg-grass text-white py-1 px-3 ml-auto" onClick={() => this.setGame({ tileBrowserX: game.tileBrowserX + 32 })}>+</button>
                      </div>
                    </div>
                    <div className="flex-col">
                      <input
                        type="number"
                        value={game.tileBrowserY}
                        placeholder="map Y"
                        className="py-2 px-4"
                        onChange={(event) => this.setGame({ tileBrowserY: Number(event.target.value) })}
                      />
                      <div className="flex pt-2">
                        <button type="button" className="cursor-pointer bg-grass text-white py-1 px-3" onClick={() => this.setGame({ tileBrowserY: game.tileBrowserY - 32 })}>-</button>
                        <button type="button" className="cursor-pointer bg-grass text-white py-1 px-3 ml-auto" onClick={() => this.setGame({ tileBrowserY: game.tileBrowserY + 32 })}>+</button>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <div>{browserTile ? "Current" : "None Found"} {game.tileBrowserX} {game.tileBrowserY}</div>
                    <pre className="whitespace-pre-wrap">{JSON.stringify(browserTile, null, 2)}</pre>
                    {(browserTile ? this.tileHistoryDb[`${browserTile.mapX},${browserTile.mapY}`] : [])?.map((tile, index) => (
                      <div key={`${tile.uuid}-${index}`}>
                        <div>Tile History {index}</div>
                        <pre className="whitespace-pre-wrap">{JSON.stringify(tile, null, 2)}</pre>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {game.showStats ? (
                <div className="debug flex flex-col">
                  <pre className="pt-4 whitespace-pre-wrap">player {JSON.stringify(player, null, 2)}</pre>
                  <pre className="pt-4 whitespace-pre-wrap">game {JSON.stringify(game, null, 2)}</pre>
                  <pre className="pt-4 whitespace-pre-wrap">map {JSON.stringify(map, null, 2)}</pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
}
