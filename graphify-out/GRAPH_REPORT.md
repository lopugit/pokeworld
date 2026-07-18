# Graph Report - .  (2026-07-18)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 335 nodes · 506 edges · 25 communities (22 shown, 3 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `44118605`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Game.vue|Game.vue]]
- [[_COMMUNITY_functions.js|functions.js]]
- [[_COMMUNITY_package.json|package.json]]
- [[_COMMUNITY_blocks.js|blocks.js]]
- [[_COMMUNITY_dependencies|dependencies]]
- [[_COMMUNITY_index.js|index.js]]
- [[_COMMUNITY_devDependencies|devDependencies]]
- [[_COMMUNITY_Nuxt 2 Frontend|Nuxt 2 Frontend]]
- [[_COMMUNITY_DevKit.vue|DevKit.vue]]
- [[_COMMUNITY_dependencies|dependencies]]
- [[_COMMUNITY_scripts|scripts]]
- [[_COMMUNITY_apis.js|apis.js]]
- [[_COMMUNITY_devDependencies|devDependencies]]
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_ecosystem.config.js|ecosystem.config.js]]
- [[_COMMUNITY_Banner.vue|Banner.vue]]
- [[_COMMUNITY_Community 20|Community 20]]

## God Nodes (most connected - your core abstractions)
1. `Game` - 35 edges
2. `scripts` - 13 edges
3. `Pokémon World` - 10 edges
4. `compilerOptions` - 9 edges
5. `start()` - 8 edges
6. `loadThings()` - 7 edges
7. `saveThing()` - 7 edges
8. `stop()` - 6 edges
9. `parseMapJobInput()` - 6 edges
10. `log()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `BlocksResponse` --references--> `MapBlock`  [EXTRACTED]
  src/lib/map-api.ts → server/services/map/types.ts
- `generateMapBlockStep()` --calls--> `generateMapBlock()`  [EXTRACTED]
  workflows/map-generation/steps.ts → server/services/map/generate.ts
- `generateMapBlock()` --calls--> `isMongoConfigured()`  [EXTRACTED]
  server/services/map/generate.ts → server/services/map/mongo.ts
- `toExport()` --calls--> `log()`  [EXTRACTED]
  server/services/map/legacy/blocks.ts → server/services/map/legacy/log.ts
- `toExport()` --calls--> `imageToRgbaMatrix()`  [EXTRACTED]
  server/services/map/legacy/blocks.ts → server/services/map/legacy/png.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Full-Stack Application Architecture** — readme_react_19, readme_react_router, readme_vite_8, readme_nitro_3 [EXTRACTED 1.00]
- **Durable Map Generation Flow** — readme_blocks_api, readme_map_jobs_api, readme_generate_map_workflow, readme_map_job_status_api [EXTRACTED 0.98]
- **Map Persistence and Colour Sources** — readme_generate_map_workflow, readme_mongodb, readme_google_static_maps, readme_offline_map_mode [EXTRACTED 0.95]
- **Fallback Map Regeneration Solution** — graphify_out_memory_query_20260718_130154_can_we_add_a_todo___task__md_to_document_the_mongo_stale_fallback_detection, graphify_out_memory_query_20260718_130154_can_we_add_a_todo___task__md_to_document_the_mongo_legacy_fallback_fingerprint, graphify_out_memory_query_20260718_130154_can_we_add_a_todo___task__md_to_document_the_mongo_cache_bypass, graphify_out_memory_query_20260718_130154_can_we_add_a_todo___task__md_to_document_the_mongo_lazy_workflow_regeneration [EXTRACTED 0.98]
- **Fallback-Derived Block Repair Flow** — todo_fallback_map_regeneration_stale_fallback_detection, todo_fallback_map_regeneration_map_provenance, todo_fallback_map_regeneration_lazy_regeneration, todo_fallback_map_regeneration_admin_sweep [EXTRACTED 0.98]
- **Pokémon World Map and Character Visual Assets** — map_assets_gmap_image, map_assets_sprites_grass_image, map_assets_sprites_sand_1_image, map_assets_sprites_sand_2_image, map_assets_sprites_sand_3_image, map_assets_sprites_sand_4_image, map_assets_sprites_sand_5_image, map_assets_sprites_sand_6_image, map_assets_sprites_sand_7_image, map_assets_sprites_sand_8_image, map_assets_sprites_sand_9_image, map_assets_tilesets_game_boy_advance_pokemon_emerald_exterior_tileset_image, map_assets_tilesets_char_walk_1_image, map_assets_tilesets_emerald_character_male_image [INFERRED 0.90]
- **Pond Terrain Tile Set** — public_tiles_pond_3_image, public_tiles_pond_4_image, public_tiles_pond_5_image, public_tiles_pond_6_image, public_tiles_pond_7_image, public_tiles_pond_8_image, public_tiles_pond_9_image [INFERRED 0.95]
- **Road Terrain Tile Set** — public_tiles_road_1_image, public_tiles_road_2_image, public_tiles_road_3_image, public_tiles_road_4_image, public_tiles_road_5_image, public_tiles_road_6_image, public_tiles_road_7_image, public_tiles_road_8_image, public_tiles_road_9_image [INFERRED 0.95]
- **Sand Terrain Tile Set** — public_tiles_sand_1_image, public_tiles_sand_2_image, public_tiles_sand_3_image [INFERRED 0.95]
- **Terrain Tile Image Set** — public_tiles_grass_dirt_2_image, public_tiles_grass_image, public_tiles_images_image, public_tiles_path_1_image, public_tiles_path_2_image, public_tiles_path_3_image, public_tiles_path_4_image, public_tiles_path_5_image, public_tiles_path_6_image, public_tiles_path_7_image, public_tiles_path_8_image, public_tiles_path_9_image, public_tiles_pond_1_image, public_tiles_pond_2_image, public_tiles_pond_20_image, public_tiles_pond_21_image, public_tiles_pond_22_image, public_tiles_pond_23_image, public_tiles_pond_24_image, public_tiles_pond_25_image [INFERRED 0.95]
- **Large Tree Tile Variant Set** — public_tiles_big_tree_1_big_tree_tile_1, public_tiles_big_tree_2_big_tree_tile_2, public_tiles_big_tree_3_big_tree_tile_3, public_tiles_big_tree_4_big_tree_tile_4, public_tiles_big_tree_5_big_tree_tile_5, public_tiles_big_tree_6_big_tree_tile_6, public_tiles_big_tree_7_big_tree_tile_7, public_tiles_big_tree_8_big_tree_tile_8, public_tiles_big_tree_9_big_tree_tile_9, public_tiles_big_tree_10_big_tree_tile_10 [INFERRED 0.98]
- **Flower Tile Variant Set** — public_tiles_flower_1_flower_tile_1, public_tiles_flower_2_flower_tile_2, public_tiles_flower_3_flower_tile_3 [INFERRED 0.98]
- **Website Icon Set** — public_icons_apple_touch_icon_apple_touch_icon, public_icons_favicon_16x16_favicon_16x16, public_icons_favicon_32x32_favicon_32x32 [INFERRED 0.98]

## Communities (25 total, 3 thin omitted)

### Community 0 - "Game.vue"
Cohesion: 0.07
Nodes (33): latsDb, lngsDb, toExport(), transactionOptions, transactions, generateCoordinatesGrid(), generateMap(), generateOutputs() (+25 more)

### Community 1 - "functions.js"
Cohesion: 0.11
Nodes (25): blockForCoordinates(), minLatitudeProjected, projectLatitude(), toRadians(), blocksHandler, createLegacyBlocksHandler, generateMapBlock(), coordinatesForInput() (+17 more)

### Community 2 - "package.json"
Cohesion: 0.10
Nodes (6): Game, isFiniteNumber(), emptyState(), loadThings(), saveThing(), ThingsState

### Community 3 - "blocks.js"
Cohesion: 0.10
Nodes (20): dependencies, dotenv, mongodb, nitro, pngjs, react, react-dom, react-router (+12 more)

### Community 4 - "dependencies"
Cohesion: 0.13
Nodes (12): App(), Banner(), BannerLink, BannerProps, Coordinates, DevKit(), Point, PRESETS (+4 more)

### Community 5 - "index.js"
Cohesion: 0.13
Nodes (19): GET /api/blocks, generateMapWorkflow, Google Static Maps, Local World, GET /api/map-jobs/:runId, POST /api/map-jobs, MongoDB, Nitro 3 (+11 more)

### Community 6 - "devDependencies"
Cohesion: 0.12
Nodes (14): config, configPath, fallbackIndex, filesystemIndex, functionConfigs, functionValues, index, indexPath (+6 more)

### Community 7 - "Nuxt 2 Frontend"
Cohesion: 0.32
Nodes (14): apps(), delay(), ecosystem, isOwned(), listeners(), ownedDirectories, pm2(), removeOwned() (+6 more)

### Community 8 - "DevKit.vue"
Cohesion: 0.19
Nodes (13): MapBlock, defaultCoordinates, GameComponentState, GameSettings, MapView, MoveAction, PlayerState, StoredImage (+5 more)

### Community 9 - "dependencies"
Cohesion: 0.14
Nodes (13): compilerOptions, allowJs, jsx, jsxImportSource, noEmit, paths, plugins, strict (+5 more)

### Community 10 - "scripts"
Cohesion: 0.15
Nodes (13): devDependencies, autoprefixer, jiti, postcss, sass, tailwindcss, @types/node, @types/react (+5 more)

### Community 11 - "apis.js"
Cohesion: 0.15
Nodes (13): scripts, build, build:vercel, check, dev, map:generate, pms, pms-stop (+5 more)

### Community 12 - "devDependencies"
Cohesion: 0.25
Nodes (8): blockForCoordinates(), clamp(), getLatForBlock(), MIN_LATITUDE_PROJECTED, projectLatitude(), toRadians(), unprojectLatitude(), X_INCREMENT

### Community 13 - "compilerOptions"
Cohesion: 0.22
Nodes (8): args, baseUrl, blockX, blockY, offsets, positional, radiusFlag, regenerate

### Community 14 - "Community 14"
Cohesion: 0.25
Nodes (8): blocks.get.ts, Nitro Cache Bypass for Stale Fallback Blocks, Fallback Map Regeneration Query, Fallback Map Regeneration Repair, Lazy Durable Workflow Regeneration, Legacy Fallback Fingerprint Detection, Stale Fallback Block Detection, TODO-fallback-map-regeneration.md

### Community 15 - "Community 15"
Cohesion: 0.33
Nodes (5): Implemented behavior, Operational note, Problem, Remaining follow-up, TODO: fallback map regeneration

### Community 16 - "Community 16"
Cohesion: 0.40
Nodes (4): buildCommand, framework, installCommand, $schema

### Community 17 - "Community 17"
Cohesion: 0.50
Nodes (3): root, target, transformedShell

## Knowledge Gaps
- **129 isolated node(s):** `Problem`, `Implemented behavior`, `Operational note`, `Remaining follow-up`, `Build` (+124 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Game` connect `package.json` to `DevKit.vue`, `dependencies`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **Why does `MapBlock` connect `DevKit.vue` to `functions.js`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `scripts` connect `apis.js` to `blocks.js`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `Problem`, `Implemented behavior`, `Operational note` to the rest of the system?**
  _129 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Game.vue` be split into smaller, more focused modules?**
  _Cohesion score 0.06980392156862746 - nodes in this community are weakly interconnected._
- **Should `functions.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10520487264673312 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.09871794871794871 - nodes in this community are weakly interconnected._