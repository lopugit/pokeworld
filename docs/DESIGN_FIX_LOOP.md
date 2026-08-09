# Design-fix loop — durable state

Goal: every /design family checked for broken/ugly sprites and fixed at the
root cause. Trigger: the Haunted Grove (and siblings) rendered "big trees"
from the banned-quality big-tree-1..10 overlap slices.

Worktree: `.claude/worktrees/design-map-themes-review-cb860f-33fe92`, branch
`claude/design-map-themes-review-cb860f` (PR #14). Verify with
`pnpm typecheck && pnpm test`. Render samples with:
`RENDER_SAMPLES=1 [RENDER_FAMILY=<substr>|RENDER_RANGE=start:count]
[RENDER_SEED=n] [RENDER_PX=n] [RENDER_OUT=path] pnpm vitest run
tests/render-samples.test.ts` (from app/). Review EVERY rendered sheet
visually before committing fixes; magenta cells mark missing overlay art.

## Protocol (each iteration)

1. `git fetch origin && git merge origin/main --no-edit`.
2. Take the first unticked batch below; render at RENDER_PX>=10 in chunks of
   ~24 families (RENDER_RANGE), review, fix root causes in
   src/lib/design/{paint,families,legality}. Prefer painter-level fixes (they
   repair every family at once).
3. `pnpm typecheck && pnpm test`; commit (tick progress here) + push branch.
4. All ticked → browser-verify /design Design browser, update PR #14, update
   pokeworld-design-studio memory, mark LOOP COMPLETE, CronDelete the job.

## Checklist

- [x] Root cause 1: big-tree groves (Haunted Grove etc.) — placeTree now
      paints the tree-grand 2×2 (real Littleroot canopy tree); all
      big-tree-1..10 slices banned outright. Verified via RENDER_FAMILY=
      haunted contact sheet: proper round trees along the path.
- [ ] Painter-archetype pass: render one family per distinct painter recipe
      (grove/maze, village, lakeside, meadow, rocky/dome, orchard, garden…)
      at seed 0 + one high seed; fix any painter-level breakage found.
      (~550 families total — cover by RENDER_RANGE batches of 24:
      0:24, 24:24, 48:24, … tick ranges here as reviewed:)
      (reviewed: 0:24 clean, 24:24 clean, 48:24 clean — real trees
      propagate everywhere; bridges/shorelines/domes/villages healthy;
      new struct buildings appear correctly in village families;
      72:24 clean, 96:24 clean, 120:24 clean — no magenta, tree-grand
      canopies everywhere, marts/gyms/greenhouses/fountains all render;
      144:24 clean, 168:24 clean, 192:24 clean — river bridges, complex
      pond ledges, struct roof/wall variants all correct)
- [ ] Seed-variety spot pass: for 5 representative families render seeds
      0/7/31337 and review (mirrors/rotations can expose edge clipping).
- [ ] Polish check: trees half-clipped at diorama edges (placeTree allows
      row-0 anchors; in-game maps overflow edges, dioramas read it as cut) —
      decide keep-or-margin and implement.
- [ ] Final: /design browser check (Design browser tab thumbnails + a few
      modals), PR #14 body note, memory update, LOOP COMPLETE + CronDelete.

Lock: (none)
