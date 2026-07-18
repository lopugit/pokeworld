# Procedural Emerald world acceptance

Status: Complete

Last reviewed: 2026-07-19

This checklist is the stop condition for the ten-minute Pokeworld improvement loop. A checked item
has automated coverage or current native-Chrome evidence in `docs/qa/`.

- [x] Real Google Static Maps colour data remains the semantic source for water, roads, buildings,
  and ground.
- [x] Roads are cardinal, squared, connected, and no more than three tiles thick.
- [x] Large empty ground regions are replaced with coherent trees, long grass, flowers, shrubs,
  boulders, ledges, signs, caves, houses, and authored clearings.
- [x] Forests can contain deterministic natural secret paths and invisible hidden-item grass tiles.
- [x] Six biomes, eight structure templates, six detail palettes, and three route treatments provide
  864 deterministic world recipes, with biome-weighted structures and details rather than uniform
  combinations.
- [x] The player's central landing area is walkable and connected to an intentional route; adjacent
  blocks derive matching boundary portals from their shared global coordinates.
- [x] Every shipped terrain/object tile is an exact crop of the repository's original Pokémon
  Emerald exterior tileset; party and PC creatures use Emerald-version sprites.
- [x] Party, items, badges, and PC deposit/withdraw interactions persist locally and work with
  keyboard and Game Boy controls.
- [x] Unit, type, Vercel-output, real-Google-pipeline, desktop-Chrome, and mobile-Chrome checks pass.
- [x] Desktop and mobile layouts have no horizontal overflow, clipping, or application-origin
  console warnings/errors.

## Required verification

```bash
pnpm --dir app check
pnpm --dir app benchmark:map
pnpm --dir app map:generate -- 946579 488585 --regenerate
```

The automated suite includes explicit Google/fallback provenance checks, output-equivalent pipeline
benchmarking, route connectivity and thickness properties, deterministic grammar coverage, spawn
safety, exact Emerald tile crops, client/server seed parity, collision, ledges, hidden items, and
trainer-system transitions. The forced live generation must report `google-static-maps`, not the
offline fallback, before this ledger remains complete.

## Current visual evidence

- `qa/dense-world-desktop.png`
- `qa/dense-world-mobile.png`
- `qa/trainer-party-desktop.png`
- `qa/trainer-pc-mobile.png`

The screenshots are repository artifacts so each automated loop and pull-request reviewer can
compare the accepted desktop and mobile result with later changes.

## Latest verification

- `pnpm --dir app check`: 15 test files / 82 tests, typecheck, Vercel build, static shell, Workflow
  manifest, queue privacy, and maximum-duration checks passed.
- `pnpm --dir app benchmark:map`: 262,144 pixels produced 256 output-equivalent tiles; optimized
  median 4.45 ms versus legacy median 42.40 ms (9.53× in this run).
- Forced local Workflow `wrun_01KXV3H298BC79YV0MSP71MJXF`: one real Google Static Maps block,
  256 tiles, `fallbackGenerated: false`, current tile version `2.3.0000`; the selected recipe was
  `wild-route/secret-grove/route-garden/signed` and populated all 256 tiles with terrain or detail,
  including a tree grove, secret trail, hidden item, ledges, signs, houses, and long-grass fields.
- Native Chrome: desktop and 390×844 mobile maps, full-page bounds, Start menu, party lead, Bag,
  badge progress, Box 1 transfers, Save dialog, exact sprite loading, and application-origin console
  were verified. Chrome exposed and confirmed the fix for stale saves that referenced non-Emerald
  trainer sprites.
