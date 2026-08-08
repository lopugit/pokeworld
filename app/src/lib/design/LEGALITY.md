# /design tile legality — rules, database, and enforcement

Every sprite in the Emerald exterior sheet was drawn **on a specific ground**:
its background pixels are baked into the tile. Composition is therefore only
legal when a sprite stands on the ground family its art carries, when
multi-tile art appears as the complete formation it was drawn as, and when
autotiled grounds (path/road/sand/pond) use the index that matches their
actual neighbourhood.

The machine-readable database lives in [`legality.ts`](./legality.ts) and is
enforced three ways, so a broken transition **cannot ship**:

1. `validateDesign(tiles)` — runs in `tests/design-legality.test.ts` over
   every catalog design, remix-range seeds, and world merges.
2. The generators only compose through helpers (`paint.ts`) that check the
   same rules at placement time.
3. The `/design` Rules tab renders the same database, so docs cannot drift
   from enforcement.

## Ground families

| Ground | Tiles | Notes |
| --- | --- | --- |
| grass | `grass` | The universal connector: every autotile family below carries grass in its border art. |
| path / dirt | `path-1..9` | Autotiled; `dirt` bakes with the path family. |
| road | `road-1..9` | Autotiled. |
| sand | `sand-1..9` | Autotiled beach/dune. |
| water | `pond-1..9`, `pond-20/21`, `pond-24/25`, `pond-center-1..4` | Follows the live map's `smoothWater` invariants (2×2 squares, ≤1 exposed land diagonal, no kissing corners). |
| rocky | `rocky-1` | Full-bleed beige speckle. **No transition art to any other ground exists** — rocky scenes are full-bleed, and in multi-block worlds rocky blocks may only neighbour rocky blocks. |

## Overlay → ground rules

Grass-backed: trees (`big-tree-*`, `tree-1`), `shrub-1`, `flower-1..3`,
long grass (`grass-2`), `route-sign-1`, houses. Rocky-backed:
dome parts, `cave-door-1`, `boulder-mossy-1`, `rocky-bumps-1`, `sign-rocky-1`.
Hidden items copy their ground tile exactly (invisible until found).

## Formations (multi-tile sprites)

- **house-red** — 3×4, slots `house-red-1..12`, grass only, fully solid.
- **dome** — 3×3, slots `mountain-1..7`, `cave-door-1` (never `mountain-8`),
  `mountain-9`, rocky only, solid except the walkable doorway.

Any formation part outside a complete formation is a violation — this is the
rule that permanently retires the old "ledges", which were `mountain-1/2/3`
(the dome's top row) drawn as a standalone bar with a sheared-off body.

## Banned art (with reasons)

| Art | Why it can never compose |
| --- | --- |
| `ledge-left/middle/right-1` | Byte-identical crops of `mountain-1/2/3`; a standalone row renders a cliff crest with no body below it. Real ledge art was never harvested from the sheet. |
| `rock-1` | Its body is drawn in the pink-cobble mountain ground palette (41% of pixels) and can never blend with the beige speckle. Use `boulder-mossy-1`. |
| `pond-22/23` | Full-height bank bars (duplicate crops of the 24/25 channel walls), not inner-corner nubs; shorelines smooth the notch instead. |
| `cave-1..4` | Foreign background + sand sliver; cave entrances only exist as the dome's `cave-door-1` slot. |
| `grass-dirt-2` | A live-map transition speck that reads as noise in dioramas. |
| `mountain-8` | The sheet slot is an unpainted navy hole; domes embed `cave-door-1` there. |

## Re-grounded art

`mountain-1..9` ship re-grounded: the sheet instance sits on pink-cobble
ground, so `build-design-tiles.mjs` replaces border-connected pink-palette
pixels (hue rule `R−B ≥ 24 ∧ R−G ≥ 16`, flood-filled from the tile border)
with `rocky-1`'s pixels at the same coordinates. Deterministic, and the dome
fringe now continues the speckle pattern seamlessly.

## Multi-block worlds

`world.ts` paints every block's ground into one supergrid, harmonizes seams,
then bakes autotiles/water **globally**, so shorelines and paths continue
across block boundaries by construction. The ground adjacency matrix applies
at seams: grass-backed families interconnect freely; rocky only meets rocky.

## Known roadmap

- Harvest the wavy cliff-edge strips + grass-backed dome variants from the
  sheet to legalize rocky↔grass transitions (unlocks mixed mountain worlds).
- Harvest true beach (sand↔water) shoreline tiles; until then pond banks show
  grass-toned edges against sand shores.
- Harvest real hop-ledge art if it exists in another sheet region.
