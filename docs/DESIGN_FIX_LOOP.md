# Design-fix loop — durable state

**STATUS: REOPENED — PHASE 2 (2026-08-09).** Nikolaj found broken trees in
the live modal (forest-crossing "Sundappled Trailfork" seed 0) after phase 1
declared clean: crown-less half-trees. Phase-1 gaps: 10px sheets made
tree-1's half-tree art read as bushes, and the live scan only caught
magenta, not bad art. Phase 2 = root-cause fix (done: tree-1 banned) + full
re-review of all 500 at RENDER_PX=20 for ALL asset classes; the
edge-clipped-trees KEEP decision is OVERTURNED (was tree-1 all along).

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
- [x] Painter-archetype pass: render one family per distinct painter recipe
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
      pond ledges, struct roof/wall variants all correct;
      216:24 clean, 240:24 clean, 264:24 clean — greenhouses/gyms/
      plazas/sand blobs all correct;
      288:24 clean, 312:24 clean, 336:24 clean — dense groves, river
      junctions, desert ledges all correct;
      360:24 clean, 384:24 clean, 408:24 clean — 2-story structs,
      fountains, plaza villages all correct; registry pins exactly
      500 families, so 480:24 is the final batch;
      432:24 clean, 456:24 clean, 480:20 clean — ALL 500 families
      reviewed, zero magenta, zero broken sprites. PASS COMPLETE.)
- [x] Seed-variety spot pass: for 5 representative families render seeds
      0/7/31337 and review (mirrors/rotations can expose edge clipping).
      (haunted-grove, hoenn-village, lakeside-hamlet, mountain-pass,
      orchard-farmstead × seeds 0/7/31337 all clean — layouts vary
      coherently, ledges/houses/boulders/trees all intact.)
- [x] Polish check: trees half-clipped at diorama edges (placeTree allows
      row-0 anchors; in-game maps overflow edges, dioramas read it as cut) —
      DECIDED: KEEP. In the merged multi-block world the canopy overflows
      into the neighbour block and looks natural (authentic GBA border
      behaviour); only the standalone diorama PNG crops it, and it reads
      as photo-crop, not broken art. A forced margin would sterilise
      block seams and invalidate the completed 500-family review.
- [x] Final: /design browser check (Design browser tab thumbnails + a few
      modals), PR #14 body note, memory update, LOOP COMPLETE + CronDelete.
      (Built app served on 3949; SW cache hard-refreshed; all 500 thumbnail
      canvases programmatically pixel-scanned — 0 magenta, 0 blank; Hoenn
      village + Legendary cave detail views clean; no console errors. The
      Browser pane hid mid-check, so deep-scroll verification was done via
      DOM/canvas scans instead of screenshots — stronger coverage anyway.)

## Phase 2 (reopened 2026-08-09) — user-found breakage + full re-review

- [x] Root cause 2: tree-1 "small tree" was a HALF-TREE CROP (canopy sliced
      flat at the tile top edge over a trunk) scattered standalone by
      scatterTrees/treeBorder and as fake "palms" on beach/dunes/oasis
      families. Fixed: tree-1 moved to BANNED_OVERLAYS; all scatters now
      use shrub-1 (complete art, feature "shrub"); tiny-island + generated
      island "one tree" spots upgraded to a real tree-grand 2×2 with shrub
      fallback. Verified: forest-crossing/tiny-island/deep-forest-shrine/
      safari-thicket seed-0 renders at 28px — zero half trees; what looked
      like "edge-clipped trees" in phase 1 was tree-1 art all along, so the
      polish item is genuinely resolved by this ban.
- [x] Renderer parity: confirmed — the rebuilt app's forest-crossing seed-0
      modal matches the harness render layout-for-layout (same trees,
      shrubs, sign, paths); both consume the same generateDesign and draw
      img then img2.
- [ ] Full re-review at RENDER_PX=20, 12 families per sheet, ALL asset
      classes (trees, walls, buildings, water/ledges, shorelines, paths,
      signs, NPCs, items). Tick ranges as reviewed:
      (reviewed: 0:12 clean, 12:12 clean, 24:12 clean — post-fix trees/
      shrubs complete everywhere incl. hedge rings, domes, boulder rows,
      shorelines, oasis pockets, struct signs. Pending: 36:12 … 492:12.)
      FOLLOW-UP CANDIDATE (decide before completion): river crossings are
      bare path tiles over water (a ford) — no bridge-deck art exists in
      the vault; harvesting one is an asset task, not a paint bug.
- [x] Browser-verify the user's exact family (forest-crossing modal) on the
      rebuilt 3949 app — DONE post-rebuild: SW unregistered, fresh bundle
      confirmed (Rules tab lists the Half-tree crop ban), Sundappled
      Trailfork seed-0 modal screenshot shows complete trees + shrubs.
      Vercel preview rebuilds from the pushed branch (hard-refresh past
      the SW there too).
- [ ] Final: PR #14 body note, pokeworld-design-studio memory update,
      PHASE 2 COMPLETE + CronDelete.

Lock: (none)
