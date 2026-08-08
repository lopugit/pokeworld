# Asset-pipeline completion loop — durable state

Goal: EVERY pret/pokeemerald asset pipelined into the repo, with asset-manifest
entries, whole-object design entries, and frame animations stitched and shown
as whole animations on /design where appropriate.

Worktree: `.claude/worktrees/design-map-themes-review-cb860f-33fe92`, branch
`claude/design-map-themes-review-cb860f` (merge origin/main each iteration,
push after each verified wave; PR #14). Scripts:
`app/scripts/design/fetch-emerald-towns.mjs` (pret fetch/decode/render),
`app/scripts/map/extract-terrain-tiles.mjs`, `app/scripts/design/build-asset-manifest.mjs`.
Verify with `pnpm typecheck && pnpm test`, then browser-check /design (port
3949 config `pokeworld-worktree-live`; hard-refresh — service worker caches
the manifest). Every new sprite/crop MUST be visually reviewed on a contact
sheet before commit (render over grass at 3×+).

## Checklist (tick + commit as each lands; loop STOPS when all ticked)

- [x] Wave 2c-1: building harvests from town renders: Rustboro, Sootopolis,
      Fortree (tree houses), Lilycove (dept store, motel), Slateport,
      Lavaridge, Fallarbor, Verdanturf
      (DONE: Verdanturf battle-tent + house, Lavaridge gym + herb house,
      Devon Corp 8x8 + Fortree gym, Rustboro gym 7x5, Fortree treehouse 3x6,
      Lilycove house 4x4 + department store 10x7, Slateport battle tent +
      museum + compact PC + shipyard + lighthouse; Fallarbor/Dewford
      skipped — soot/sand-backed; COMPLETE: + Sootopolis gym 6x5, stone house,
      mini mart + mini PC — 22 struct families total) (gridded-render coordinate workflow;
      formations + BUILDING_TIERS only where grass-backed + verified).
- [x] Wave 2c-2 (COMPLETE — Day Care, flower shop, Weather Institute 9x9,
      Trick House 6x5, Seashore House [sand], Fossil Maniac [path],
      Lanette [medium tier]; Briney cottage = dock structure + New
      Mauville = bare cave mouth, both skipped): Day Care (Route 117), Weather Institute
      (R119), Trick House (R110), Pretty Petal flower shop (R104), Briney's
      cottage (R104), Seashore House (R109), Lanette's house (R114), Fossil
      Maniac (R114), New Mauville entrance. Route renders already exist in
      app/public/design/sheets/towns/.
- [x] Wave 2d-1 (COMPLETE — 101 portraits incl. all gym leaders, Elite
      Four, Wallace, Steven, Archie/Maxie, player backs; embedded palettes,
      no mapping needed): trainer battle portraits (graphics/trainers/front_pics +
      palettes/*.pal — map pic→palette from src/data/trainer_graphics/
      front_pic_tables or by same-name .pal convention) → whole-object
      Characters ("portrait" tag).
- [x] Wave 2d-2 (COMPLETE — 218 item icons incl. all balls, medicine,
      TMs/HMs, berries, key items; embedded palettes, new Items category):
      item + berry icons (graphics/items/icons/*.png + .pal same
      name) → new "Items" category, whole objects.
- [x] Wave 2d-3 (COMPLETE — 101 frames → 18 reels: water/flower/waterfall/
      shore edges + town anims incl. Mauville lights, Sootopolis stripes,
      frontier flags; playable in the existing file-per-frame player):
      tileset animation frames (data/tilesets/*/*/anim/**) →
      stitch per-animation frame reels into manifest `animations` (like the
      existing character walk reels) so /design plays them whole.
- [x] Wave 2d-4 (COMPLETE — 21 south-facing walk reels for the common
      townsfolk, stand/step sequenced): NPC walk cycles → animation reels for the ~20 most common
      NPCs (frames already in fetched pics; slice all frames not just first).
- [x] Wave 2d-5 (DOORS COMPLETE — 146 frames -> ~49 opening reels for
      every door in the game. Region map SKIPPED: its land tiles need
      pokenav UI palettes that exist only in C source. Emotes SKIPPED:
      not present at any data path — likely baked into event gfx):
      region map (graphics/pokenav/region_map*.png), emotes
      (graphics/field_effects/pics/emotes*), door animations
      (graphics/door_anims) → props/UI whole objects + door anim reels.
- [ ] Wave 2d-6: audio — Pokémon cries (sound/direct_sound_samples/cries)
      converted .aif→.mp3/.ogg under app/public/audio/cries/ + manifest
      "audio" entries with a /design player. Music (midi) optional; skip if
      conversion tooling unavailable — note plainly instead.

## Loop protocol (every iteration)

1. `git fetch origin && git merge origin/main --no-edit` (resolve; graphify
   conflicts → take theirs + `graphify cluster-only .`).
2. Pick the FIRST unticked item; if a lock line below names a live PID, no-op.
3. Do a coherent chunk (≤1 wave) with visual contact-sheet verification.
4. `pnpm typecheck && pnpm test`, regen manifest, commit (tick the box in the
   same commit), push branch. Never push main.
5. When ALL boxes ticked: verify /design in browser, update PR #14 body,
   update auto-memory (pokeworld-emerald-loop), delete the session cron, and
   replace this section with "LOOP COMPLETE <date>".

Lock: (none)
