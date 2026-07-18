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

- [ ] Orthogonal terrain edges are normalized.
- [ ] Every connected path and road is cardinally connected and no wider than three tiles.
- [ ] Deterministic replay and cross-block continuity hold for global coordinates.
- [ ] Property tests measure at least 500 distinct weighted grammar combinations.
- [ ] Ordinary ground has no large unintentional plain region.
- [ ] Spawn is safe and has access to a connected walkable route.
- [x] Google Static Maps success and fallback paths carry distinct provenance.
- [x] The map-pipeline benchmark executes and checks output equivalence.
- [x] Party, items, badges, PC storage, collision, ledges, and interaction rules have unit tests.
- [ ] All required commands pass together on the final commit.

## Native Chrome gates

- [ ] Melbourne desktop and mobile maps are dense and coherent.
- [ ] Sydney Harbour desktop and mobile maps preserve shoreline terrain and a safe spawn.
- [ ] Alpine desktop and mobile maps preserve elevation/biome character and a safe spawn.
- [ ] Full-page scrolling has no clipping, overlap, or horizontal overflow.
- [ ] Menus, movement, regeneration, persistence, and PC flows respond correctly.
- [ ] No missing assets, framework overlay, or app-origin console errors are present.
- [ ] Screenshots are saved outside the repository for the final accepted commit.

Candidate screenshots inherited from the dense-world branch and requiring final-commit re-verification:

- `docs/qa/dense-world-desktop.png`
- `docs/qa/dense-world-mobile.png`
- `docs/qa/trainer-party-desktop.png`
- `docs/qa/trainer-pc-mobile.png`

## Delivery gates

- [ ] Graphify outputs are refreshed and `graphify-out/graph.html` is preserved.
- [ ] `codex/dense-pokemon-worlds` is pushed.
- [ ] One ready-for-review pull request is open and current.

## Latest verification

2026-07-19 automation slice:

- `pnpm --dir app check` passed with 12 test files and 62 tests before the dense-world merge.
- The Vercel static shell and routing/output verifier passed before the dense-world merge.
- The map benchmark processed 262,144 pixels into 256 tiles with equivalent output;
  the optimized path measured 8.73x faster than the legacy path in that run.
- The dense-world branch claims 864 deterministic recipes plus terrain and UI coverage;
  the merged final commit must re-run those properties and native Chrome acceptance before
  this ledger is marked complete.
