# Emerald game systems — design & cross-agent contract

Goal: make Pokéworld play and feel like Pokémon Emerald — dense, magical maps
(500–1000 seeded details), organised preset structures, and real game systems
(collision, ledges, hidden items, signs, menus). Work is split across parallel
agents; this document is the shared contract.

## Division of labour

- **Server world-gen** (mods in `server/services/map/legacy/mods/`, terrain
  layout in `server/services/map/`): terrain squaring, coarse noise, cave
  stitching, ledge lines, decoration fill, forest walls with carved hidden
  paths, preset structures (villages, sign posts), path width capping.
- **Client game systems** (`src/lib/game-rules.ts`, `src/lib/trainer-state.ts`,
  `src/components/game-ui/`): collision enforcement, ledge jumping, item
  pickup, sign/cave/house dialogs, START menu with POKéMON / BAG / BADGES /
  PC / SAVE, persisted trainer state.

Either side can ship independently: the client reacts to whatever tile
metadata the server emits, and unknown features are inert.

## World ground scale & versioning (shared contract)

- The Google Static Maps source parameters live in one place:
  `GOOGLE_MAP_SOURCE` in `server/services/map/legacy/coordinates.ts`
  (currently zoom 19, scale 2, width 512 → a real-world house ≈ 3×3–3×4
  tiles; the player ≈ 1/9–1/12 of a house, matching Pokémon proportions).
  `server/services/map/coordinates.ts` (the constant-time mapper behind
  `/api/block-lat-lng`) imports the same constants — never fork the values.
- `MAP_BLOCK_VERSION` = `<TERRAIN_REVISION>-<GOOGLE_MAP_SOURCE_TAG>` (e.g.
  `2.4.0001-z19s2w512`). Bump `TERRAIN_REVISION` for terrain/sprite semantic
  changes; the source tag changes automatically with the ground scale. All
  stored-block consumers compare the string exactly, so any change lazily
  regenerates every block in place (same Mongo/Thingtime IDs — do NOT bump
  `POKEWORLD_BLOCK_WORLD` for a scale change).
- Client state keyed to world coordinates embeds `GOOGLE_MAP_SOURCE_TAG`:
  `locationKey()` (persisted map/player restore gate) and `tileCoordKey()`
  (trainer collected-item keys). A scale change therefore orphans stale
  saves/collections automatically instead of restoring wrong-world data.
- Gitignored precomputed grids (`map-assets/lats.json` / `lngs.json`) are
  validated at load by sampling entries against the closed-form mapper
  (both axes; both files stand or fall together) and ignored on mismatch.
  `generateCoordinatesGrid` now emits closed-form rows, so regenerated grids
  match `blockForCoordinates` by construction.
- Stored Mongo block docs never override computed geometry: `syncBlocks`
  strips `lat/lng/latCenter/lngCenter/x/y/mapX/mapY` from the merged doc so a
  pre-rescale record can never redirect imagery fetches to old-world ground.
- Lazy full-world regeneration consumes the public daily generation quota
  (default 500 blocks/UTC day). `POKEWORLD_GENERATION_DAILY_LIMIT` widens it
  temporarily during a migration window.
- The deployment's algorithm version is observable: `/api/health` reports
  `mapBlockVersion`, and `/api/blocks` + `/api/map-jobs` (+ `/:runId`)
  responses carry `version: MAP_BLOCK_VERSION`, so clients and audits can
  compare served tiles (`tile.version`) against the deployment.

## Map block streaming protocol (server → client)

- The client submits the complete nearby preload square immediately (3×3 at
  the normal zoom, capped at 5×5) in one map workflow request. The workflow
  resolves the centre first, then schedules the already-queued neighbours in
  bounded groups of four to avoid contention across the legacy generator's
  expanded block locks.
- While a run is `queued` or `running`, `GET /api/map-jobs/:runId` may include
  a cumulative `blocks` subset containing requested blocks that are already
  current in MongoDB. `status: "completed"` still means the full requested set
  is current.
- The client consumes each coordinate revision as it appears, renders it
  immediately, and retains request-owned absolute-coordinate `pending` /
  `complete` markers so movement, zoom, and overlapping regeneration calls do
  not start duplicate work or clear another request's state.
- Explicit `regenerate` jobs do not expose cached partial blocks because the
  old stored version cannot be treated as regeneration progress.

## Tile feature protocol (server → client)

The server communicates gameplay through `MapTile` fields the client already
receives (`img`, `img2`, `feature`, `solid`). The client recognises:

| feature value       | img2 convention        | client behaviour |
| ------------------- | ---------------------- | ---------------- |
| `ledge`             | `ledge-{left,middle,right}-N` | One-way: jumpable moving screen-down (world −y). Blocked from below/sides. Player hops 2 tiles. |
| `field-item`        | `field-item-N`         | Solid until collected via A-press facing it. Item is seeded from coords (`hashUnit(mapX, mapY, 'field-item')`), goes to BAG, overlay hidden afterwards, collection persisted client-side by world coord key. |
| `sign`              | `route-sign-N`         | A-press shows seeded signpost dialog. |
| `cave-entrance`     | `cave-N` / `cave-door-1` | A-press shows cave dialog (interiors: future iteration). `cave-door-1` fills the mountain-8 slot of 3×3 mountains. |
| `house`             | `{house-red,house-wide,house-grand,house-manor,struct-pokecenter,struct-pokemart}-N` | A-press on a door row shows flavor dialog. One structure per structure SITE: sites are hash-minimum cells of the world-space building mask (8-way, computed over `state.tiles.cache` so a google building spanning block seams still yields exactly one structure; window 13 tiles, influence ≤ 1 block ring = the edge re-stitch healing radius). The family (footprint 3×4 up to 6×5) scales with the site's locally connected building area. `houseKind` carries the family prefix, `houseSite` the world grid cell (`"gx,gy"`) that owns the structure. |
| `long-grass`        | `grass-2`              | Reserved for wild encounters (future). |
| any tile            |                        | `solid: true` blocks movement. A missing tile inside a loaded block stays walkable, but an absent destination block is a hard streaming boundary until it arrives. |

The client also falls back to `img2` prefix detection (`ledge-`, `field-item-`,
`route-sign-`) so features light up even if a mod forgets to stamp `feature`.

Determinism: the client mirrors the server's `hashUnit(x, y, salt)`
(terrain-life.ts) so seeded content (sign text, item identity) is stable per
tile without needing new server fields. A vitest parity test locks the two
implementations together.

## Movement rules (client)

`resolveMove(lookup, fromX, fromY, action, tileSize, collected)`:

1. Destination block missing → stop before the boundary, preload it, and clear buffered movement. Once the block arrives, the next input may cross. A target tile missing inside an already-loaded block remains walkable.
2. Target is a ledge → `jump` (2 tiles) only for `moveDown` (screen-down;
   world −y because tile y is flipped) and only if the landing tile is not
   solid; otherwise `blocked`.
3. Target `solid` → `blocked` — except a collected `field-item` tile, which
   becomes walkable.
4. Otherwise `move`.

Blocked moves still update `player.facing` (Emerald turn-in-place feel).
Debug `zoomMode` (8-tile steps) bypasses collision — it's a dev tool.
It does not bypass the unloaded-block boundary.

## Streaming boundary UI

The game renders after its centre block arrives while the rest of the nearby
preload square continues in the background. Every manual, repeated-key, and
debug stride checks the final destination block before mutating player or
camera coordinates. Missing blocks behave as solid streaming boundaries,
clear `queuedAction`, and keep the player facing the attempted direction.

While map requests are active, the screen shows a compact Emerald-style
progress bar. A boundary wait changes the label to “LOADING THE NEXT AREA...”.
Failures keep the boundary closed and expose one RETRY control; receiving an
unrelated block never clears the wait. The player can turn around and keep
walking through already-loaded terrain while that neighbouring request runs.

## Generation controls

Cached current-version blocks cost no generation allowance. Missing offsets
reserve from one global 500-block UTC daily budget before their workflow starts;
each actual generator step then needs one of 9 permits available in the rolling
5-second window. A workflow that reaches the burst limit sleeps durably until
the oldest permit expires, and a cache hit discovered after reservation releases
that daily slot idempotently.

Public builds reject explicit `regenerate=true` requests at the route, workflow,
and generator boundaries. They also fail closed with `503` when the shared Mongo
quota store is unavailable. The admin reset clears only the daily allowance; it
does not bypass or erase the active rolling window, and existing workflows keep
their reservation identity so the reset does not cancel them.

## Trainer state (client)

`localStorage["pokeworld:trainer:v3"]` — deliberately **not** in the
location-bound `things:v2` slices so it survives location changes. The loader
migrates the earlier v1 record and the interim trainer state stored inside
`things:v2`.

```ts
interface TrainerState {
  version: 3;
  name: string;                       // default "LOPU"
  party: PartyMember[];               // six-slot team with Emerald sprites
  bag: Record<"items" | "pokeballs" | "keyItems", BagItem[]>;
  badges: Badge[];                    // the 8 Hoenn badges, earned flags
  collectedItems: Record<string, string>; // "mapX,mapY" -> itemId
  pc: PartyMember[];                  // Box 1 deposit/withdraw storage
  pcItems: BagItem[];
}
```

## UI systems

Overlay layer `.game-ui-layer` sits absolutely inside `.board-screen`
(container-query units so it scales with the resizable Game Boy). Pokemon
Classic font (already shipped in `public/`, previously unused).

- **DialogBox** — Emerald textbox: cream panel, navy double border,
  typewriter text, blinking ▼, A/B/click advances.
- **StartMenu** — POKéMON / BAG / BADGES / PC / SAVE / EXIT. Enter (START
  button) toggles; arrows navigate; A selects; B closes.
- **PartyPanel** — exact Emerald-version Pokémon sprites, lead order, level,
  HP bar, types, and six party slots.
- **BagPanel** — pocket tabs (ITEMS / POKé BALLS / KEY ITEMS), quantities,
  target selection, item use, and description/status footer.
- **BadgesPanel** — interactive badge case with all 8 Hoenn badge slots.
- **PcPanel** — exact-sprite party and Box 1 deposit/withdraw flows.

Key routing (document keydown in Game.tsx): dialog open → any key advances;
panel open → B/Esc back; menu open → arrows/A/B; otherwise arrows move,
Z/Space = A (interact), Enter = START, X/Esc = B.

## Iteration roadmap (loop)

1. ✅ This iteration: client systems above + tests.
2. Directional player sprites sliced from `map-assets/tilesets/emerald-character-male.png`; walk animation.
3. Wild encounters in long grass; battle screen scaffold.
4. Cave interiors (roomInteriors.png is already served); door → interior scene.
5. ✅ Server presets: villages, forest walls, hidden one-wide paths, ledges,
   caves, signed routes, path width ≤ 3, and squared semantic edges.
6. ✅ Badge progress, PC withdraw/deposit, and item use (including POTION).

## /design — world-builder studio (asset DB, example blocks, remixes)

`/design` is a standalone studio page (React route + Nitro API, no game
dependencies) with three tabs:

- **Asset database** — searchable index of every shipped asset: the 98 curated
  `/tiles/*.png`, player/Pokémon sprites, plus the full Emerald exterior
  tileset and roomInteriors sheets sliced into deduped 16×16 cells, and
  animation reels (character sheet frames auto-detected by alpha islands;
  water/flower tile flips). Regenerate the manifest with
  `node scripts/design/build-asset-manifest.mjs` →
  `public/design/asset-manifest.json` (committed, deterministic — no
  timestamps). Sheets are served from `public/design/sheets/`.
- **Design browser** — 500 deterministic example dioramas from
  `src/lib/design/` (34 theme families × seeded variants). Blocks are 16×16
  screen-order grids that reuse the live map's tile conventions (autotile
  indexes 1–9, pond corners 20–23/24/25, `house-red-1..12` 3×4 footprints,
  ledge caps, invisible `hidden-item` features). A design is fully described
  by `{family, seed}` — the client regenerates tiles on demand and renders
  them to canvas.
- **Tile legality in the LIVE generator** (`TERRAIN_REVISION` 2.5.0001):
  `getWaterTileName` no longer emits pond-22/23 (their art is a bank bar, not
  a corner nub) — `smoothWater` floods SW/SE shoreline notches on plain
  grass/natural ground instead; `stitchMountains`/`stitchCave` place their
  rocky-backed art on `rocky-1` ground with a 1-tile walkable apron
  (feature `rocky-ground`, reserved against grass-backed decorations), and
  mountain-8's unpainted hole is now `cave-door-1` (feature `cave-entrance`,
  walkable). Stored blocks lazily regenerate on view under the daily quota.
- **Tile legality rules in /design** (enforced by `tests/design-legality.test.ts` over
  all 500 designs): every decoration may only stand on the ground family its
  art was drawn on — grass props (trees, shrubs, flowers, long grass, houses,
  route signs) on `grass`; the rocky-biome vocabulary (`mountain-*` domes,
  `cave-door-1`, `ledge-*`, `rock-1`, `boulder-mossy-1`, `rocky-bumps-1`,
  `sign-rocky-1`) only on full-bleed `rocky-1` ground. Water follows the live
  generator's `smoothWater` invariants (2×2 squares, ≤1 land diagonal when
  surrounded, no kissing corners), mirrored in `paint.ts`. `cave-1..4` is
  never composed free-standing (its crop carries foreign background); domes
  embed `cave-door-1` in the `mountain-8` slot instead. The rocky vocabulary
  is harvested from the Emerald exterior sheet by
  `scripts/design/build-design-tiles.mjs`.
- **Community** — designs saved by trainers via `POST /api/designs`
  (Thingtime session + same-origin required; the server re-derives
  name/tags/biome from the recipe so searchable fields can't be spoofed).
  `GET /api/designs?q=&biome=&tag=&author=&page=` is public search;
  `GET/DELETE /api/designs/:id` fetch/delete (owner or admin). Storage:
  Mongo collection `designs`, with a JSON-file fallback (`app/.data/`,
  gitignored) when Mongo is not configured (offline dev).

Remixing = regenerate the same family with a fresh seed (Minecraft-style
structure variation). Because recipes are deterministic, saved designs are a
few bytes and rebuild identically anywhere — including, in a future
iteration, insertion into the live world as preset structures.

## Detail-density accounting (toward 500–1000)

Seeded decorations already emit per block (16×16): trees, shrubs, rocks,
long grass, flowers (~15–40/block). Server iteration adds ledges, signs,
caves, field items, forest paths (~10–25/block). Target: every visible
viewport (≈4–9 blocks) shows 100+ intentional details; a 5×5 loaded area
carries 500–1000. Verified by counting emitted `feature` values per block in
tests and by eye in browser checks.
