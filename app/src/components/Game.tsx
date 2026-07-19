import { Component, createRef } from "react";
import type { MapBlock, MapTile } from "../../server/services/map/types";
import { getBlockForCoordinates, getMapBlocks } from "../lib/map-api";
import { mapOffsetLimitForZoom, nextZoomValue } from "../lib/game-zoom";
import { prioritizeMapPreloadOffsets } from "../lib/map-load";
import { loadThings, locationKey, saveThing } from "../lib/persisted-state";
import {
  actionDirection,
  directionDelta,
  fieldItemFor,
  interactionFor,
  isFieldItemTile,
  resolveMove,
  tileCoordKey,
  type Direction,
} from "../lib/game-rules";
import {
  collectFieldItem,
  hasCollected,
  loadTrainer,
  saveTrainer,
  type TrainerState,
} from "../lib/trainer-state";
import { DialogBox } from "./game-ui/DialogBox";
import { MENU_ITEMS, StartMenu, type MenuItemId } from "./game-ui/StartMenu";
import { PartyPanel } from "./game-ui/PartyPanel";
import { BagPanel } from "./game-ui/BagPanel";
import { BadgesPanel } from "./game-ui/BadgesPanel";
import { PcPanel } from "./game-ui/PcPanel";
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
}

type PanelId = "party" | "bag" | "badges" | "pc";

interface UiState {
  menuOpen: boolean;
  menuIndex: number;
  panel: PanelId | null;
  dialog: { pages: string[]; advance: number } | null;
}

interface GameComponentState {
  boardWidth: number;
  game: GameSettings;
  locationError: boolean;
  loadError: string;
  map: MapView;
  player: PlayerState;
  revision: number;
  ui: UiState;
  trainer: TrainerState;
}

interface StoredImage {
  element: HTMLImageElement;
  loaded: boolean;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export class Game extends Component<Record<string, never>, GameComponentState> {
  override state: GameComponentState = {
    boardWidth: 520,
    locationError: false,
    loadError: "",
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
    ui: { menuOpen: false, menuIndex: 0, panel: null, dialog: null },
    trainer: loadTrainer(),
  };

  private readonly canvasRef = createRef<HTMLCanvasElement>();
  private readonly layer1Ref = createRef<HTMLCanvasElement>();
  private readonly gmapRef = createRef<HTMLCanvasElement>();
  private readonly gameboyRef = createRef<HTMLDivElement>();
  private readonly blockDb: Record<string, MapBlock> = {};
  private readonly tileDb: Record<string, MapTile> = {};
  private readonly tileHistoryDb: Record<string, MapTile[]> = {};
  private readonly queries: Record<string, number | "complete"> = {};
  private querySequence = 0;
  private readonly storedImages = new Map<string, StoredImage>();
  private readonly abortControllers = new Set<AbortController>();
  private animationFrame?: number;
  private movementInterval?: number;
  private resizeInterval?: number;
  private loadedTimer?: number;
  private mounted = false;
  private boardResize = { active: false, startX: 0, originWidth: 520 };

  override componentDidMount() {
    this.mounted = true;
    void this.initialize();
  }

  override componentWillUnmount() {
    this.mounted = false;
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    if (this.movementInterval) window.clearInterval(this.movementInterval);
    if (this.resizeInterval) window.clearInterval(this.resizeInterval);
    if (this.loadedTimer) window.clearTimeout(this.loadedTimer);
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
    };
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

  private onKeydown = (event: KeyboardEvent) => {
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

  private toggleMenu = () => {
    if (this.state.ui.dialog || this.state.ui.panel) return;
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
    if (id === "party" || id === "bag" || id === "badges" || id === "pc") {
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
    const { ui } = this.state;
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
    const { ui } = this.state;
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

  private interact = () => {
    const { player, game, trainer } = this.state;
    const facing = player.facing ?? "down";
    const { dx, dy } = directionDelta[facing];
    const targetX = player.x + dx * game.tileSize;
    const targetY = player.y + dy * game.tileSize;
    const tile = this.tileDb[`${targetX},${targetY}`];
    const collected = (coordKey: string) => hasCollected(trainer, coordKey);
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
    if (interaction.pages?.length) this.openDialog(interaction.pages);
  };

  private action = (action: MoveAction) => {
    if (this.state.ui.dialog || this.state.ui.menuOpen || this.state.ui.panel) return;
    const now = Date.now();
    if (this.state.player.lastAction && now - this.state.player.lastAction < 300) {
      if (!this.state.player.queuedAction) {
        this.setState(({ player }) => ({ player: { ...player, queuedAction: action } }));
      }
      return;
    }

    const game = this.state.game;
    const player = { ...this.state.player, lastAction: now, queuedAction: undefined, facing: actionDirection[action] };
    const map = { ...this.state.map };
    const distance = game.tileSize * (game.zoomMode ? 8 : 1);

    // Debug zoomMode strides 8 tiles and bypasses collision; normal movement
    // resolves against tile solidity and one-way ledges.
    let steps = 1;
    if (!game.zoomMode) {
      const resolution = resolveMove(
        (x, y) => this.tileDb[`${x},${y}`],
        player.x,
        player.y,
        action,
        game.tileSize,
        (coordKey) => hasCollected(this.state.trainer, coordKey),
      );
      if (resolution.kind === "blocked") {
        this.setState({ player }, () => saveThing("player", player));
        return;
      }
      steps = resolution.kind === "jump" ? 2 : 1;
    }

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

    const previousBlock = `${player.blockX},${player.blockY}`;
    const updatedPlayer = this.withUpdatedPlayerBlock(player);
    map.blockX = updatedPlayer.blockX;
    map.blockY = updatedPlayer.blockY;
    map.lat = updatedPlayer.lat ?? null;
    map.lng = updatedPlayer.lng ?? null;
    const nextGame = game.tileBrowserUsePlayer
      ? { ...game, tileBrowserX: updatedPlayer.x, tileBrowserY: updatedPlayer.y }
      : game;

    this.setState({ player: updatedPlayer, map, game: nextGame }, () => {
      saveThing("player", updatedPlayer);
      saveThing("map", map);
      if (nextGame !== game) saveThing("game", nextGame);
      if (previousBlock !== `${updatedPlayer.blockX},${updatedPlayer.blockY}`) void this.getBlocks();
    });
  };

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
    const centerX = map.x + (game.canvasWidth * game.zoom) / 2;
    if (player.x >= centerX - 32 && player.x < centerX + 64) map.x += direction === "in" ? 32 : -32;
    else map.x += player.x < centerX ? -64 : 64;

    const centerY = map.y + (game.canvasHeight * game.zoom) / 2;
    if (player.y >= centerY - 32 && player.y < centerY + 64) map.y += direction === "in" ? 32 : -32;
    else map.y += player.y < centerY ? -64 : 64;

    // nextZoom is intentionally accepted so the operation remains explicit at call sites.
    void nextZoom;
    return map;
  }

  private async getBlocks() {
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
    for (const [x, y] of requestedOffsets) {
      this.queries[`${player.blockX + x},${player.blockY + y}`] = requestToken;
    }

    const controller = new AbortController();
    this.abortControllers.add(controller);
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
      this.setState({ loadError: error instanceof Error ? error.message : "Map generation failed" });
    } finally {
      this.abortControllers.delete(controller);
    }
  }

  private receiveBlocks(blocks: MapBlock[], requestToken: number) {
    if (!this.mounted || blocks.length === 0) return;
    this.processBlocks(blocks);
    for (const block of blocks) {
      const key = `${block.x},${block.y}`;
      if (this.queries[key] === requestToken) this.queries[key] = "complete";
    }

    const { player } = this.state;
    if (!this.state.game.anyLoaded && !this.loadedTimer && this.blockDb[`${player.blockX},${player.blockY}`]) {
      this.loadedTimer = window.setTimeout(() => {
        this.loadedTimer = undefined;
        this.setGame({ anyLoaded: true });
      }, 500);
    }
    this.setState(({ revision }) => ({ revision: revision + 1, loadError: "" }));
  }

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

    const { game, map, player } = this.state;
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
    for (const tile of Object.values(this.tileDb)) {
      if (!this.tileShouldRender(tile)) continue;
      const blockKey = `${tile.blockX}_${tile.blockY}`;
      if (!map.blocks.includes(blockKey)) map.blocks.push(blockKey);
      map.tileCount += 1;
      const x = tile.mapX - map.x;
      const y = tile.mapY - map.y;
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
      if (top?.loaded) canvasContext.drawImage(top.element, drawX, drawY, width, height);
    }

    for (const block of Object.values(this.blockDb)) {
      if (!this.blockShouldRender(block) || !block.googleMap || !gmapContext) continue;
      const image = this.storedImages.get(block.googleMap);
      if (!image?.loaded) continue;
      const x = (Number(block.mapX) - map.x) * game.zoomScale;
      const y = Number(block.mapY) - map.y;
      const width = game.blockSize * game.zoomScale;
      const height = game.blockSize * game.zoomScale;
      gmapContext.drawImage(image.element, x, this.convertY(y, height), width, height);
    }

    this.loadImage(player.sprite, `/sprites/${player.sprite}.png`);
    const character = this.storedImages.get(player.sprite);
    if (character?.loaded) {
      const x = player.x - map.x;
      const y = player.y - map.y;
      const drawX = (x + 2) * game.zoomScale;
      const width = 28 * game.zoomScale;
      const height = 42 * game.zoomScale;
      const drawY = this.convertY(y, height);
      canvasContext.drawImage(character.element, drawX, drawY, width, height);
      gmapContext?.drawImage(character.element, drawX, drawY, width, height);
      layerContext?.drawImage(character.element, drawX, drawY, width, height);
    }
  }

  private tileShouldRender(tile: MapTile) {
    const { map, game } = this.state;
    return (
      tile.mapX >= map.x &&
      tile.mapX < map.x + game.canvasWidth * game.zoom &&
      tile.mapY >= map.y &&
      tile.mapY < map.y + game.canvasWidth * game.zoom
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
    const { game, map, player } = this.state;
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
                  className="screen-canvas bg-black rounded-lg"
                  width={game.canvasWidth}
                  height={game.canvasHeight}
                />
                <div className="game-ui-layer">
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
              <div className="w-full pt-10 md:pt-14 pb-12">
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
                <button type="button" className={debugButton} onClick={() => this.setGame({ regenerate: !game.regenerate }, () => void this.getBlocks())}>
                  Regenerate {game.regenerate ? "On" : "Off"}
                </button>
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
