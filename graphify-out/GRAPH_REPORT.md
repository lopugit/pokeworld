# Graph Report - .  (2026-07-18)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 345 nodes · 487 edges · 49 communities (22 shown, 27 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3aa98d43`
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
- [[_COMMUNITY_blocks.get.ts|blocks.get.ts]]
- [[_COMMUNITY_TODO fallback map regeneration|TODO: fallback map regeneration]]
- [[_COMMUNITY_vercel.json|vercel.json]]
- [[_COMMUNITY_finalize-static-shell.mjs|finalize-static-shell.mjs]]
- [[_COMMUNITY_ecosystem.config.js|ecosystem.config.js]]
- [[_COMMUNITY_Banner.vue|Banner.vue]]
- [[_COMMUNITY_Q Can we add a TODO-${task}.md to document the MongoDB fallback-generated block problem and implement automatic regeneration|Q: Can we add a TODO-${task}.md to document the MongoDB fallback-generated block problem and implement automatic regeneration?]]
- [[_COMMUNITY_Nitro Cache Bypass for Stale Fallback Blocks|Nitro Cache Bypass for Stale Fallback Blocks]]
- [[_COMMUNITY_Fallback Map Regeneration Query|Fallback Map Regeneration Query]]
- [[_COMMUNITY_Fallback Map Regeneration Repair|Fallback Map Regeneration Repair]]
- [[_COMMUNITY_Lazy Durable Workflow Regeneration|Lazy Durable Workflow Regeneration]]
- [[_COMMUNITY_Legacy Fallback Fingerprint Detection|Legacy Fallback Fingerprint Detection]]
- [[_COMMUNITY_Stale Fallback Block Detection|Stale Fallback Block Detection]]
- [[_COMMUNITY_TODO-fallback-map-regeneration|TODO-fallback-map-regeneration.md]]
- [[_COMMUNITY_generateMapWorkflow|generateMapWorkflow]]
- [[_COMMUNITY_Google Static Maps|Google Static Maps]]
- [[_COMMUNITY_Local World|Local World]]
- [[_COMMUNITY_GET apimap-jobsrunId|GET /api/map-jobs/:runId]]
- [[_COMMUNITY_POST apimap-jobs|POST /api/map-jobs]]
- [[_COMMUNITY_MongoDB|MongoDB]]
- [[_COMMUNITY_Nitro 3|Nitro 3]]
- [[_COMMUNITY_POKEWORLD_OFFLINE_MAP Mode|POKEWORLD_OFFLINE_MAP Mode]]
- [[_COMMUNITY_pokeworld-nitro-react-3847 PM2 Process|pokeworld-nitro-react-3847 PM2 Process]]
- [[_COMMUNITY_React 19|React 19]]
- [[_COMMUNITY_React Router|React Router]]
- [[_COMMUNITY_Vercel Build Verification|Vercel Build Verification]]
- [[_COMMUNITY_VERCEL_DEPLOYMENTS|VERCEL_DEPLOYMENTS.md]]
- [[_COMMUNITY_Pokeworld Vercel Project|Pokeworld Vercel Project]]
- [[_COMMUNITY_Vercel Workflow|Vercel Workflow]]
- [[_COMMUNITY_Vercel World|Vercel World]]
- [[_COMMUNITY_Vite 8|Vite 8]]

## God Nodes (most connected - your core abstractions)
1. `Game` - 35 edges
2. `scripts` - 13 edges
3. `compilerOptions` - 9 edges
4. `start()` - 8 edges
5. `loadThings()` - 7 edges
6. `saveThing()` - 7 edges
7. `stop()` - 6 edges
8. `parseMapJobInput()` - 6 edges
9. `log()` - 6 edges
10. `MapBlock` - 6 edges

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

## Communities (49 total, 27 thin omitted)

### Community 0 - "Game.vue"
Cohesion: 0.08
Nodes (29): latsDb, lngsDb, toExport(), transactionOptions, transactions, generateCoordinatesGrid(), generateMap(), generateOutputs() (+21 more)

### Community 1 - "functions.js"
Cohesion: 0.10
Nodes (28): blocksHandler, createLegacyBlocksHandler, generateMapBlock(), blocksCollection(), getStoredBlocks(), isMongoConfigured(), mongoUri(), MapBlock (+20 more)

### Community 2 - "package.json"
Cohesion: 0.10
Nodes (6): Game, isFiniteNumber(), emptyState(), loadThings(), saveThing(), ThingsState

### Community 3 - "blocks.js"
Cohesion: 0.10
Nodes (20): dependencies, dotenv, mongodb, nitro, pngjs, react, react-dom, react-router (+12 more)

### Community 4 - "dependencies"
Cohesion: 0.13
Nodes (12): App(), Banner(), BannerLink, BannerProps, Coordinates, DevKit(), Point, PRESETS (+4 more)

### Community 6 - "devDependencies"
Cohesion: 0.12
Nodes (14): config, configPath, fallbackIndex, filesystemIndex, functionConfigs, functionValues, index, indexPath (+6 more)

### Community 7 - "Nuxt 2 Frontend"
Cohesion: 0.32
Nodes (14): apps(), delay(), ecosystem, isOwned(), listeners(), ownedDirectories, pm2(), removeOwned() (+6 more)

### Community 8 - "DevKit.vue"
Cohesion: 0.15
Nodes (14): blockForCoordinates(), minLatitudeProjected, projectLatitude(), toRadians(), coordinatesForInput(), finiteInteger(), parseMapJobInput(), parseOffset() (+6 more)

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

### Community 15 - "TODO: fallback map regeneration"
Cohesion: 0.33
Nodes (5): Implemented behavior, Operational note, Problem, Remaining follow-up, TODO: fallback map regeneration

### Community 16 - "vercel.json"
Cohesion: 0.40
Nodes (4): buildCommand, framework, installCommand, $schema

### Community 17 - "finalize-static-shell.mjs"
Cohesion: 0.50
Nodes (3): root, target, transformedShell

### Community 18 - "ecosystem.config.js"
Cohesion: 0.20
Nodes (8): API routes, How Workflow works locally, Install and run, Map generation, Pokémon World, Verification and deployment, Build, Vercel deployments

### Community 20 - "Q: Can we add a TODO-${task}.md to document the MongoDB fallback-generated block problem and implement automatic regeneration?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Can we add a TODO-${task}.md to document the MongoDB fallback-generated block problem and implement automatic regeneration?, Source Nodes

## Knowledge Gaps
- **147 isolated node(s):** `name`, `version`, `private`, `type`, `description` (+142 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **27 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Game` connect `package.json` to `functions.js`, `dependencies`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Why does `scripts` connect `apis.js` to `blocks.js`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _147 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Game.vue` be split into smaller, more focused modules?**
  _Cohesion score 0.0797979797979798 - nodes in this community are weakly interconnected._
- **Should `functions.js` be split into smaller, more focused modules?**
  _Cohesion score 0.0990990990990991 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.09871794871794871 - nodes in this community are weakly interconnected._
- **Should `blocks.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._