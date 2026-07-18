# Procedural World Acceptance

Status: In Progress

Last reviewed: 2026-07-19

This ledger is the completion source of truth for the deterministic Emerald-style
world work on `codex/dense-pokemon-worlds`. Set `Status: Complete` only after every
gate below is backed by current automated and native Chrome evidence.

## Required commands

```bash
pnpm --dir app typecheck
pnpm --dir app test
pnpm --dir app benchmark:map
pnpm --dir app build:vercel
pnpm --dir app exec node scripts/verify-vercel-output.mjs
```

## Automated gates

- [x] Orthogonal terrain edges are normalized.
- [x] Every connected path and road is cardinally connected and no wider than three tiles.
- [x] Deterministic replay and cross-block continuity hold for global coordinates.
- [x] Property tests measure at least 500 distinct weighted grammar combinations.
- [x] Ordinary ground has no large unintentional plain region.
- [x] Spawn is safe and has access to a connected walkable route.
- [x] Google Static Maps success and fallback paths carry distinct provenance.
- [x] The map-pipeline benchmark executes and checks output equivalence.
- [x] Party, items, badges, PC storage, collision, ledges, and interaction rules have unit tests.
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

## Delivery gates

- [ ] Graphify outputs are refreshed and `graphify-out/graph.html` is preserved.
- [ ] `codex/dense-pokemon-worlds` is pushed.
- [ ] One ready-for-review pull request is open and current.

## Latest verification

2026-07-19 automation slice:

- `pnpm --dir app check` passed with 15 test files and 82 tests, including property
  coverage for orthogonal edges, route width and connectivity, deterministic replay,
  global-coordinate seams, plain-ground bounds, and safe land and all-water spawns.
- Weighted biome rules sampled at least 500 distinct deterministic compositions while
  reusing only the existing Emerald-era asset corpus.
- The Vercel static shell and routing/output verifier passed on the integrated branch.
- The map benchmark processed 262,144 pixels into 256 equivalent tiles over seven rounds;
  the optimized path measured 9.69x faster than the legacy path.
- Native Chrome desktop and mobile QA passed at Melbourne, Sydney Harbour, and Victorian
  alpine coordinates with full-page scrolling, persisted party/items/badges/PC flows,
  regeneration and movement. The Sydney run verified a deterministic one-tile bridge from
  an otherwise isolated shoreline spawn. There were no missing assets, horizontal overflow,
  framework overlays, or app-origin console warnings/errors.
