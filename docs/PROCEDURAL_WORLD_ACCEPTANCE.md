# Procedural World Acceptance

Status: Complete

Last reviewed: 2026-07-19

This ledger is the completion source of truth for the deterministic Emerald-style
world work on `codex/dense-pokemon-worlds`. Complete status is retained only while
every gate below remains backed by current automated and native Chrome evidence.

## Required commands

```bash
pnpm --dir app typecheck
pnpm --dir app test
pnpm --dir app benchmark:map
pnpm --dir app map:generate -- 946579 488585 --regenerate
pnpm --dir app build:vercel
pnpm --dir app exec node scripts/verify-vercel-output.mjs
```

## Automated gates

- [x] Orthogonal terrain edges are normalized.
- [x] Every connected path and road is cardinally connected and no wider than three tiles.
- [x] Deterministic replay and cross-block continuity hold for global coordinates.
- [x] Property tests measure at least 500 distinct weighted grammar combinations.
- [x] Ordinary ground has no large unintentional plain region.
- [x] Spawn is safe and has access to a connected walkable route; water bridges derive
  matching edge portals from neighboring blocks' shared global coordinates.
- [x] Real Google colour data remains the semantic source for water, roads, buildings, and ground.
- [x] Google Static Maps success and fallback paths carry distinct provenance.
- [x] The map-pipeline benchmark executes and checks output equivalence.
- [x] Forest grammar includes deterministic natural secret trails and hidden-item pockets.
- [x] Every shipped terrain/object tile is an exact crop of the repository's supplied Emerald tileset.
- [x] Party, items, badges, PC storage, collision, ledges, and interaction rules have unit tests.
- [x] Persisted trainer saves migrate stale non-Emerald sprite references to supplied Emerald assets.
- [x] All required commands pass together on the final commit.

## Native Chrome gates

- [x] Melbourne desktop and mobile maps are dense and coherent.
- [x] Sydney Harbour desktop and mobile maps preserve shoreline terrain and a safe spawn.
- [x] Alpine desktop and mobile maps preserve elevation/biome character and a safe spawn.
- [x] Full-page scrolling has no clipping, overlap, or horizontal overflow.
- [x] Menus, movement, regeneration, persistence, and PC flows respond correctly.
- [x] No missing assets, framework overlay, or app-origin console errors are present.
- [x] Screenshots are saved outside the repository for the final accepted commit.

Final native Chrome screenshots saved outside the repository:

- `/tmp/pokeworld-melbourne-desktop-20260719.png`
- `/tmp/pokeworld-melbourne-mobile-20260719.png`
- `/tmp/pokeworld-sydney-harbour-desktop-final-20260719.png`
- `/tmp/pokeworld-sydney-harbour-mobile-20260719.png`
- `/tmp/pokeworld-alpine-desktop-20260719.png`
- `/tmp/pokeworld-alpine-mobile-20260719.png`

Earlier accepted visual baselines remain in `docs/qa/` for pull-request comparison; the
current final-commit screenshots above remain outside the repository as required by this run.

## Delivery gates

- [x] Graphify outputs are refreshed and `graphify-out/graph.html` is preserved.
- [x] `codex/dense-pokemon-worlds` and the compatible Codex/Claude branches are synchronized.
- [x] One ready-for-review pull request is open and current.

## Latest verification

2026-07-19 automation slice:

- `pnpm --dir app check` passed with 15 test files and 84 tests, including property
  coverage for orthogonal edges, route width and connectivity, deterministic replay,
  global-coordinate seams, plain-ground bounds, and safe land and all-water spawns.
- Weighted biome rules sampled at least 500 distinct deterministic compositions while
  reusing only the existing Emerald-era asset corpus.
- The Vercel static shell and routing/output verifier passed on the integrated branch.
- Forced local Workflow `wrun_01KXV574452BB1DND5RJ246Y9K` completed one real Google
  Static Maps block with 256 tiles, `mapSource: google-static-maps`,
  `fallbackGenerated: false`, tile version `2.3.0001`, and a populated
  `wild-route/secret-grove/route-garden/signed` profile from 864 deterministic recipes.
- The latest map benchmark processed 262,144 pixels into 256 equivalent tiles over seven rounds;
  the optimized path measured 9.84x faster than the legacy path in that run (10.10x in an
  earlier acceptance run).
- Native Chrome desktop and mobile QA passed at Melbourne, Sydney Harbour, and Victorian
  alpine coordinates with full-page scrolling, persisted party/items/badges/PC flows,
  regeneration and movement. The Sydney run verified a deterministic one-tile bridge from
  an otherwise isolated shoreline spawn. There were no missing assets, horizontal overflow,
  framework overlays, or app-origin console warnings/errors; stale trainer saves were also
  verified to resolve to supplied Emerald-version sprites.
