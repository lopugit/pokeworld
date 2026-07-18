# Procedural Emerald world acceptance

This checklist is the stop condition for the ten-minute Pokeworld improvement loop. A checked item
has automated coverage or current native-Chrome evidence in `docs/qa/`.

- [x] Real Google Static Maps colour data remains the semantic source for water, roads, buildings,
  and ground.
- [x] Roads are cardinal, squared, connected, and no more than three tiles thick.
- [x] Large empty ground regions are replaced with coherent trees, long grass, flowers, shrubs,
  boulders, ledges, signs, caves, houses, and authored clearings.
- [x] Forests can contain deterministic natural secret paths and invisible hidden-item grass tiles.
- [x] Six biomes, eight structure templates, six detail palettes, and three route treatments provide
  864 deterministic world recipes.
- [x] The player's central landing area and route boundary portals remain traversable.
- [x] Every shipped terrain/object tile is an exact crop of the repository's original Pokémon
  Emerald exterior tileset; party and PC creatures use Emerald-version sprites.
- [x] Party, items, badges, and PC deposit/withdraw interactions persist locally and work with
  keyboard and Game Boy controls.
- [x] Unit, type, Vercel-output, real-Google-pipeline, desktop-Chrome, and mobile-Chrome checks pass.
- [x] Desktop and mobile layouts have no horizontal overflow, clipping, or application-origin
  console warnings/errors.

## Current visual evidence

- `qa/dense-world-desktop.png`
- `qa/dense-world-mobile.png`
- `qa/trainer-party-desktop.png`
- `qa/trainer-pc-mobile.png`
