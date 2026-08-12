// @ts-nocheck -- legacy modifier state is intentionally open-ended.

import {
	WORLD_RECIPE_COUNT,
	selectWorldProfile,
} from '../../world-grammar'

const priority = 100
const TILE_SIZE = 32
const BLOCK_TILES = 16

const tileKey = (x, y) => `${x},${y}`
const sourceY = tile => (BLOCK_TILES - 1) - tile.y

export const hashUnit = (x, y, salt = '') => {
	let value = Math.imul((x | 0) ^ 0x9e3779b9, 0x85ebca6b)
	value ^= Math.imul((y | 0) ^ 0xc2b2ae35, 0x27d4eb2d)
	for (let index = 0; index < salt.length; index++) {
		value = Math.imul(value ^ salt.charCodeAt(index), 0x165667b1)
	}
	value ^= value >>> 16
	return (value >>> 0) / 0x100000000
}

const lerp = (start, end, amount) => start + (end - start) * amount
const smoothstep = value => value * value * (3 - 2 * value)

export const coarseNoise = (x, y, salt = '', scale = 6) => {
	const cellX = Math.floor(x / scale)
	const cellY = Math.floor(y / scale)
	const offsetX = smoothstep((x / scale) - cellX)
	const offsetY = smoothstep((y / scale) - cellY)
	const top = lerp(hashUnit(cellX, cellY, salt), hashUnit(cellX + 1, cellY, salt), offsetX)
	const bottom = lerp(hashUnit(cellX, cellY + 1, salt), hashUnit(cellX + 1, cellY + 1, salt), offsetX)
	return lerp(top, bottom, offsetY)
}

export const getAutotileIndex = ({ north, east, south, west }) => {
	if (!north && east && south && !west) return 1
	if (!north && east && south && west) return 2
	if (!north && !east && south && west) return 3
	if (north && east && south && !west) return 4
	if (north && !east && south && west) return 6
	if (north && east && !south && !west) return 7
	if (north && east && !south && west) return 8
	if (north && !east && !south && west) return 9
	return 5
}

export const getWaterTileName = (neighbours, mapX = 0, mapY = 0) => {
	const { north, east, south, west, northWest, northEast } = neighbours
	if (north && south && east && west) {
		if (!northWest) return 'pond-20'
		if (!northEast) return 'pond-21'
		// pond-22/23 are NOT SW/SE corner nubs — their art is a full-height
		// vertical bank bar (near-duplicates of the pond-24/25 channel walls),
		// which rendered as a floating bar in open water. smoothWater now fills
		// SW/SE notches instead; any residual case renders as open water.
		return `pond-center-${1 + Math.floor(hashUnit(mapX, mapY, 'water-ripple') * 4)}`
	}
	if (north && south && east && !west && !neighbours.northWest && !neighbours.southWest) return 'pond-25'
	if (north && south && !east && west && !neighbours.northEast && !neighbours.southEast) return 'pond-24'
	return `pond-${getAutotileIndex(neighbours)}`
}

const terrainOf = tile => tile?.terrain || 'grass'
const isWalkableGround = terrain => !['water', 'road', 'path'].includes(terrain)
const isGreen = terrain => ['grass', 'natural', 'mountain'].includes(terrain)

const getTile = (state, mapX, mapY) => state.tiles.cache[tileKey(mapX, mapY)]
const getOffsetTile = (state, tile, x, y) => getTile(state, tile.mapX + x * TILE_SIZE, tile.mapY + y * TILE_SIZE)
const sameTerrainAt = (state, tile, terrain, x, y) => {
	const neighbour = getOffsetTile(state, tile, x, y)
	return !neighbour || terrainOf(neighbour) === terrain
}

const neighbourTerrain = (state, tile, terrain) => ({
	north: sameTerrainAt(state, tile, terrain, 0, 1),
	east: sameTerrainAt(state, tile, terrain, 1, 0),
	south: sameTerrainAt(state, tile, terrain, 0, -1),
	west: sameTerrainAt(state, tile, terrain, -1, 0),
	northWest: sameTerrainAt(state, tile, terrain, -1, 1),
	northEast: sameTerrainAt(state, tile, terrain, 1, 1),
	southWest: sameTerrainAt(state, tile, terrain, -1, -1),
	southEast: sameTerrainAt(state, tile, terrain, 1, -1),
})

const blockTiles = (state, block) => {
	const tiles = []
	for (let x = 0; x < BLOCK_TILES; x++) {
		for (let y = 0; y < BLOCK_TILES; y++) {
			const tile = getTile(state, block.x * 512 + x * TILE_SIZE, block.y * 512 + y * TILE_SIZE)
			if (tile) tiles.push(tile)
		}
	}
	return tiles
}

const SPAWN_ROUTE_TERRAINS = new Set(['grass', 'natural', 'sand', 'road', 'path'])
const SPAWN_BRIDGE_TERRAINS = new Set([...SPAWN_ROUTE_TERRAINS, 'water'])

const setTerrain = (tile, terrain) => {
	tile.terrain = terrain
	tile.terrainConfidence = 1
	tile.terrainCoverage = {
		grass: 0,
		natural: 0,
		mountain: 0,
		water: 0,
		road: 0,
		path: 0,
		building: 0,
		sand: 0,
		[terrain]: 1,
	}
}

const findSpawnPath = (byGrid, starts, goals, allowedTerrains = SPAWN_ROUTE_TERRAINS) => {
	const queue = [...starts]
	const parents = new Map(starts.map(([x, y]) => [tileKey(x, y), null]))
	let destination = null
	while (queue.length && !destination) {
		const [x, y] = queue.shift()
		const key = tileKey(x, y)
		if (goals.has(key)) {
			destination = key
			break
		}
		for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
			const nextX = x + dx
			const nextY = y + dy
			const nextKey = tileKey(nextX, nextY)
			const tile = byGrid.get(nextKey)
			if (!tile || parents.has(nextKey) || !allowedTerrains.has(terrainOf(tile))) continue
			parents.set(nextKey, key)
			queue.push([nextX, nextY])
		}
	}
	if (!destination) return []
	const path = []
	for (let cursor = destination; cursor; cursor = parents.get(cursor)) {
		path.push(cursor)
	}
	return path.reverse()
}

const carveSpawnPath = (byGrid, path) => {
	for (const key of path) {
		const tile = byGrid.get(key)
		if (tile && !['road', 'path'].includes(terrainOf(tile))) setTerrain(tile, 'path')
	}
}

const sharedPortal = (x, y, salt) => 1 + Math.floor(hashUnit(x, y, salt) * (BLOCK_TILES - 2))
const waterBridgeSide = (x, y) => Math.floor(hashUnit(x, y, 'spawn-bridge-side') * 4)
const WATER_BRIDGE_NEIGHBOURS = [
	[1, 0, 1],
	[-1, 0, 0],
	[0, 1, 3],
	[0, -1, 2],
]

const ensureSpawnRoute = (tiles, block) => {
	const byGrid = new Map(tiles.map(tile => [tileKey(tile.x, sourceY(tile)), tile]))
	const landing = tiles.filter(isCentralLanding)
	for (const tile of landing) setTerrain(tile, 'grass')
	const starts = landing.map(tile => [tile.x, sourceY(tile)])
	const existingRoute = new Set(
		tiles
			.filter(tile => ['road', 'path'].includes(terrainOf(tile)))
			.map(tile => tileKey(tile.x, sourceY(tile))),
	)
	if (existingRoute.size) {
		const path = findSpawnPath(byGrid, starts, existingRoute)
		if (path.length) {
			carveSpawnPath(byGrid, path)
			return
		}
	}
	const waterCount = tiles.filter(tile => terrainOf(tile) === 'water').length
	if (waterCount) {
		const land = new Set(
			tiles
				.filter(tile => !isCentralLanding(tile) && ['grass', 'natural', 'sand'].includes(terrainOf(tile)))
				.map(tile => tileKey(tile.x, sourceY(tile))),
		)
		if (land.size) {
			const bridge = findSpawnPath(byGrid, starts, land, SPAWN_BRIDGE_TERRAINS)
			if (bridge.length) {
				carveSpawnPath(byGrid, bridge)
				return
			}
		}
	}

	const portals = [
		[BLOCK_TILES - 1, sharedPortal(block.x + 1, block.y, 'vertical-portal')],
		[0, sharedPortal(block.x, block.y, 'vertical-portal')],
		[sharedPortal(block.x, block.y + 1, 'horizontal-portal'), 0],
		[sharedPortal(block.x, block.y, 'horizontal-portal'), BLOCK_TILES - 1],
	]
	const selectedPortals = waterCount
		? portals.filter((portal, index) => {
			const [dx, dy, neighbourSide] = WATER_BRIDGE_NEIGHBOURS[index]
			return waterBridgeSide(block.x, block.y) === index ||
				waterBridgeSide(block.x + dx, block.y + dy) === neighbourSide
		})
		: portals
	for (const [x, y] of selectedPortals) {
		const goal = tileKey(x, y)
		const tile = byGrid.get(goal)
		const allowed = waterCount ? SPAWN_BRIDGE_TERRAINS : SPAWN_ROUTE_TERRAINS
		if (!tile || !allowed.has(terrainOf(tile))) continue
		const path = findSpawnPath(byGrid, starts, new Set([goal]), allowed)
		if (path.length) carveSpawnPath(byGrid, path)
	}
}

const waterAt = (state, tile, x, y) => sameTerrainAt(state, tile, 'water', x, y)

// The pond tileset can only draw a closed shoreline when every water tile sits
// inside at least one full 2x2 square of water, surrounded tiles have at most
// one land diagonal, and no two water bodies touch corner-to-corner. Erode any
// tile that breaks those rules until the water mass is fully representable.
const smoothWater = (state, tiles) => {
	for (let pass = 0; pass < 40; pass++) {
		let changed = false
		for (const tile of tiles) {
			if (terrainOf(tile) !== 'water') continue
			const n = neighbourTerrain(state, tile, 'water')
			const inWaterSquare = [[1, 1], [1, -1], [-1, 1], [-1, -1]].some(([x, y]) =>
				waterAt(state, tile, x, 0) && waterAt(state, tile, 0, y) && waterAt(state, tile, x, y))
			const landDiagonals = [n.northWest, n.northEast, n.southWest, n.southEast]
				.filter(value => !value).length
			const surrounded = n.north && n.east && n.south && n.west
			const kissingCorner =
				(!n.north && !n.east && n.northEast)
				|| (!n.north && !n.west && n.northWest)
				|| (!n.south && !n.east && n.southEast)
				|| (!n.south && !n.west && n.southWest)
			if (!inWaterSquare || (surrounded && landDiagonals >= 2) || kissingCorner) {
				setTerrain(tile, 'grass')
				changed = true
				continue
			}
			// The SW/SE inner-corner art (pond-22/23) is unusable (see
			// getWaterTileName) — flood plain-ground notches so the shoreline
			// smooths instead of needing the nub. Roads/paths/sand stay dry.
			for (const [offsetX, offsetY] of [[-1, -1], [1, -1]]) {
				const diagonalSame = offsetX === -1 ? n.southWest : n.southEast
				if (!surrounded || diagonalSame) continue
				const notch = getOffsetTile(state, tile, offsetX, offsetY)
				if (notch && ['grass', 'natural'].includes(terrainOf(notch))) {
					setTerrain(notch, 'water')
					changed = true
				}
			}
		}
		if (!changed) break
	}
}

const resetBaseSprites = (tiles, version, updated) => {
	for (const tile of tiles) {
		const terrain = terrainOf(tile)
		let sprite = 'grass'
		if (terrain === 'water') sprite = 'pond-5'
		else if (terrain === 'road') sprite = 'road-5'
		else if (terrain === 'path') sprite = 'path-5'
		else if (terrain === 'sand') sprite = 'sand-5'

		tile.img = sprite
		tile.img2 = sprite
		tile.feature = terrain
		tile.solid = terrain === 'water'
		tile.version = version
		tile.updated = updated
		tile.needsSaving = true
	}
}

const stitchSurfaces = (state, tiles) => {
	for (const tile of tiles) {
		const terrain = terrainOf(tile)
		if (!['water', 'road', 'path', 'sand'].includes(terrain)) continue
		const neighbours = neighbourTerrain(state, tile, terrain)
		if (terrain === 'water') {
			tile.img = getWaterTileName(neighbours, tile.mapX, tile.mapY)
		} else {
			tile.img = `${terrain}-${getAutotileIndex(neighbours)}`
		}
		tile.img2 = tile.img
	}
}

// --- world-space building components ---------------------------------------
// Google building footprints routinely span map-block boundaries, and the
// classifier can leave diagonal-only joins inside one roof mass. Components
// are therefore traced in WORLD tile coordinates over every tile the
// generation state can see (this block, the ring of edge blocks that re-run
// their mods alongside it, and any stored neighbours), with 8-way
// connectivity — so one real-world building resolves to ONE component no
// matter how many blocks it crosses.
const worldTileAt = (state, gridX, gridY) => getTile(state, gridX * TILE_SIZE, gridY * TILE_SIZE)
const localIndex = value => ((value % BLOCK_TILES) + BLOCK_TILES) % BLOCK_TILES
// Every block's central 4x4 landing is flattened to grass by ensureSpawnRoute,
// but a neighbouring block may not have run yet when this one stitches.
// Excluding landings from the mask up front keeps the component view
// identical no matter which block generates first.
const isCentralLandingWorld = (gridX, gridY) =>
	localIndex(gridX) >= 6 && localIndex(gridX) <= 9 && localIndex(gridY) >= 6 && localIndex(gridY) <= 9
const inBuildingMask = (state, gridX, gridY) => {
	const tile = worldTileAt(state, gridX, gridY)
	return Boolean(tile) && terrainOf(tile) === 'building' && !isCentralLandingWorld(gridX, gridY)
}

// Safety valve for pathological masks (airports, malls): a component stops
// growing here. Blocks more than a couple of seams apart may then disagree
// about its extent, which at worst yields one structure per far-apart region.
const WORLD_COMPONENT_LIMIT = 4096

const worldBuildingComponents = (state, tiles) => {
	const seen = new Set()
	const components = []

	for (const seed of tiles) {
		const seedX = Math.floor(seed.mapX / TILE_SIZE)
		const seedY = Math.floor(seed.mapY / TILE_SIZE)
		const seedKey = tileKey(seedX, seedY)
		if (seen.has(seedKey) || !inBuildingMask(state, seedX, seedY)) continue

		seen.add(seedKey)
		const queue = [[seedX, seedY]]
		const cells = []
		while (queue.length) {
			const [gridX, gridY] = queue.shift()
			cells.push({ gridX, gridY })
			if (cells.length >= WORLD_COMPONENT_LIMIT) break
			for (let offsetY = -1; offsetY <= 1; offsetY++) {
				for (let offsetX = -1; offsetX <= 1; offsetX++) {
					if (!offsetX && !offsetY) continue
					const nextX = gridX + offsetX
					const nextY = gridY + offsetY
					const nextKey = tileKey(nextX, nextY)
					if (seen.has(nextKey) || !inBuildingMask(state, nextX, nextY)) continue
					seen.add(nextKey)
					queue.push([nextX, nextY])
				}
			}
		}
		components.push(cells)
	}

	return components
}

const footprintAt = (byGrid, left, top, columns, rows) => {
	const footprint = []
	for (let row = 0; row < rows; row++) {
		for (let column = 0; column < columns; column++) {
			const tile = byGrid.get(tileKey(left + column, top + row))
			if (!tile) return []
			footprint.push(tile)
		}
	}
	return footprint
}

// Building sprite families, ordered largest-first. Each detected google-maps
// building component places exactly ONE structure; the family is chosen from
// the component's tile area so bigger real-world buildings become bigger
// sprites. The larger homes are composed from the red house's own cells (see
// scripts/map/extract-terrain-tiles.mjs) and the mid tier mixes in the whole
// 4x4 Pokémon Center / PokéMart harvests as town landmarks. When the
// preferred family cannot fit near the component, the search degrades tier by
// tier down to the small cottage before giving up.
const BUILDING_TIERS = [
	{
		minArea: 72,
		variants: [
			{ prefix: 'house-manor', columns: 6, rows: 5 },
			{ prefix: 'struct-trick-house', columns: 6, rows: 5 },
		],
	},
	{
		minArea: 36,
		variants: [
			{ prefix: 'house-grand', columns: 5, rows: 4 },
			{ prefix: 'struct-house-littleroot', columns: 5, rows: 5 },
			{ prefix: 'struct-flower-shop', columns: 5, rows: 5 },
		],
	},
	{
		minArea: 18,
		variants: [
			{ prefix: 'house-wide', columns: 4, rows: 4 },
			{ prefix: 'struct-pokecenter', columns: 4, rows: 4 },
			{ prefix: 'struct-pokemart', columns: 4, rows: 4 },
			{ prefix: 'struct-house-mossdeep', columns: 4, rows: 4 },
			{ prefix: 'struct-house-wood', columns: 4, rows: 4 },
			{ prefix: 'struct-house-berry', columns: 4, rows: 4 },
			{ prefix: 'struct-shop-mauville', columns: 3, rows: 4 },
			{ prefix: 'struct-house-verdanturf', columns: 4, rows: 4 },
			{ prefix: 'struct-house-lavaridge', columns: 4, rows: 4 },
			{ prefix: 'struct-daycare', columns: 4, rows: 4 },
			{ prefix: 'struct-lanette-house', columns: 4, rows: 4 },
		],
	},
	{ minArea: 0, variants: [{ prefix: 'house-red', columns: 3, rows: 4 }] },
]

const componentBounds = component => {
	let minX = Infinity
	let maxX = -Infinity
	let minY = Infinity
	let maxY = -Infinity
	let sumX = 0
	let sumY = 0
	for (const { gridX, gridY } of component) {
		minX = Math.min(minX, gridX)
		maxX = Math.max(maxX, gridX)
		minY = Math.min(minY, gridY)
		maxY = Math.max(maxY, gridY)
		sumX += gridX
		sumY += gridY
	}
	return { minX, maxX, minY, maxY, centroidX: sumX / component.length, centroidY: sumY / component.length }
}

const chooseBuildingVariant = (tier, bounds) => {
	if (tier.variants.length === 1) return tier.variants[0]
	// Seeded from the component's own world-space corner so every block that
	// can see the component rolls the same variant.
	const roll = hashUnit(bounds.minX, bounds.minY, 'building-style')
	return tier.variants[Math.floor(roll * tier.variants.length)]
}

// One deterministic anchor per world-space component. Footprints are laid out
// from a north-west corner cell (world grid coords, +gridY = north) and must
// sit entirely inside ONE block: every block that sees the same component
// derives the same anchor, and only the block that owns it paints — which is
// what keeps a seam-spanning building down to a single structure.
const ANCHOR_SEARCH_MARGIN = 4

const findWorldStructureAnchor = (state, block, occupied, bounds, columns, rows) => {
	const candidates = []
	for (let top = bounds.maxY + rows + ANCHOR_SEARCH_MARGIN - 1; top >= bounds.minY - ANCHOR_SEARCH_MARGIN; top--) {
		if (Math.floor((top - rows + 1) / BLOCK_TILES) !== Math.floor(top / BLOCK_TILES)) continue
		for (let left = bounds.minX - columns - ANCHOR_SEARCH_MARGIN + 1; left <= bounds.maxX + ANCHOR_SEARCH_MARGIN; left++) {
			if (Math.floor(left / BLOCK_TILES) !== Math.floor((left + columns - 1) / BLOCK_TILES)) continue
			const ownerX = Math.floor(left / BLOCK_TILES)
			const ownerY = Math.floor(top / BLOCK_TILES)
			candidates.push({
				left,
				top,
				ownerX,
				ownerY,
				distance: Math.abs(left + ((columns - 1) / 2) - bounds.centroidX)
					+ Math.abs(top - ((rows - 1) / 2) - bounds.centroidY),
			})
		}
	}
	// Nearest to the component's centroid, ties broken north-then-west so the
	// ordering is identical from every viewing block.
	candidates.sort((a, b) => a.distance - b.distance || b.top - a.top || a.left - b.left)

	const mine = block ? `${block.x},${block.y}` : null
	for (const candidate of candidates) {
		let valid = true
		const footprint = []
		for (let row = 0; row < rows && valid; row++) {
			for (let column = 0; column < columns; column++) {
				const gridX = candidate.left + column
				const gridY = candidate.top - row
				const tile = worldTileAt(state, gridX, gridY)
				if (
					!tile
					|| !isWalkableGround(terrainOf(tile))
					|| isCentralLandingWorld(gridX, gridY)
					|| (`${candidate.ownerX},${candidate.ownerY}` === mine && occupied.has(tileKey(tile.x, sourceY(tile))))
				) {
					valid = false
					break
				}
				footprint.push(tile)
			}
		}
		if (valid) return { ...candidate, footprint }
	}
	return null
}

// The mountain-/cave- art carries the exterior sheet's rocky-mauve ground in
// its background, so those structures are only legal on matching ground. Paint
// a walkable rocky-1 apron under and around each footprint (plain grass and
// natural ground only — roads, paths, sand and water stay untouched) and
// reserve it so decorations with grass-backed art never land on rock.
const applyRockyApron = (byGrid, occupied, left, top, width, height) => {
	for (let y = top - 1; y <= top + height; y++) {
		for (let x = left - 1; x <= left + width; x++) {
			const inFootprint = x >= left && x < left + width && y >= top && y < top + height
			if (inFootprint) continue
			const key = tileKey(x, y)
			if (occupied.has(key)) continue
			const tile = byGrid.get(key)
			if (!tile) continue
			if (!['grass', 'natural', 'mountain'].includes(terrainOf(tile))) continue
			tile.img = 'rocky-1'
			tile.img2 = 'rocky-1'
			tile.feature = 'rocky-ground'
			tile.solid = false
			occupied.add(key)
		}
	}
}

// A structure's anchor may land in ANY block whose tiles are visible in the
// state cache. Whichever block owns the anchor paints it: blocks generated in
// the same pass compute the identical anchor from the identical terrain, and
// a stored neighbour already painted that same anchor when it converged with
// this seam (its edge re-run sees the full component too), so exactly one
// structure survives per component.
const stitchHouses = (state, tiles, block) => {
	// Deterministic world-space processing order keeps the occupied-set
	// evolution aligned between blocks that share seam components.
	const components = worldBuildingComponents(state, tiles)
		.map(component => ({ component, bounds: componentBounds(component) }))
		.sort((a, b) => a.bounds.minX - b.bounds.minX || a.bounds.minY - b.bounds.minY)
	const occupied = new Set()
	let houseNumber = 0

	for (const { component, bounds } of components.filter(value => value.component.length >= 3)) {
		const tierIndex = BUILDING_TIERS.findIndex(tier => component.length >= tier.minArea)
		// One structure per detected building: try the size-matched family
		// first, then fall through the smaller tiers until one fits.
		for (let fallback = tierIndex; fallback < BUILDING_TIERS.length; fallback++) {
			const variant = chooseBuildingVariant(BUILDING_TIERS[fallback], bounds)
			const anchor = findWorldStructureAnchor(state, block, occupied, bounds, variant.columns, variant.rows)
			if (!anchor) continue
			// Deterministic single owner: every block sharing this component
			// computes the same anchor, and only the owning block paints it.
			if (anchor.ownerX === block.x && anchor.ownerY === block.y) {
				houseNumber += 1
				anchor.footprint.forEach((tile, index) => {
					occupied.add(tileKey(tile.x, sourceY(tile)))
					tile.img = 'grass'
					tile.img2 = `${variant.prefix}-${index + 1}`
					tile.feature = 'house'
					tile.houseId = houseNumber
					tile.houseKind = variant.prefix
					tile.houseTile = index + 1
					tile.solid = true
				})
			}
			break
		}
	}

	return occupied
}

const stitchMountains = (tiles, occupied) => {
	const byGrid = new Map(tiles.map(tile => [tileKey(tile.x, sourceY(tile)), tile]))
	const naturalCount = tiles.filter(tile => ['natural', 'mountain'].includes(terrainOf(tile))).length
	if (naturalCount < 18) return

	for (let top = 1; top <= 12; top += 4) {
		for (let left = 1; left <= 13; left += 4) {
			const footprint = footprintAt(byGrid, left, top, 3, 3)
			if (footprint.length !== 9) continue
			if (footprint.some(tile => occupied.has(tileKey(tile.x, sourceY(tile))) || !['natural', 'mountain'].includes(terrainOf(tile)) || isCentralLanding(tile))) continue
			const anchor = footprint[0]
			const chance = terrainOf(anchor) === 'mountain' ? 0.62 : 0.22
			if (hashUnit(anchor.mapX, anchor.mapY, 'mountain') >= chance) continue
			footprint.forEach((tile, index) => {
				occupied.add(tileKey(tile.x, sourceY(tile)))
				tile.img = 'rocky-1'
				if (index === 7) {
					// mountain-8's source art is an unpainted hole in the sheet —
					// the harvested cave doorway fills it and doubles as an entrance.
					tile.img2 = 'cave-door-1'
					tile.feature = 'cave-entrance'
					tile.solid = false
				} else {
					tile.img2 = `mountain-${index + 1}`
					tile.feature = 'mountain'
					tile.solid = true
				}
			})
			applyRockyApron(byGrid, occupied, left, top, 3, 3)
		}
	}
}

const isCentralLanding = tile => tile.x >= 6 && tile.x <= 9 && sourceY(tile) >= 6 && sourceY(tile) <= 9

const buildReservedGround = (tiles, occupied) => {
	const byGrid = new Map(tiles.map(tile => [tileKey(tile.x, sourceY(tile)), tile]))
	const reserved = new Set(occupied)
	for (const tile of tiles) {
		const terrain = terrainOf(tile)
		if (isGreen(terrain) && terrain !== 'building') continue
		const x = tile.x
		const y = sourceY(tile)
		for (let offsetY = -1; offsetY <= 1; offsetY++) {
			for (let offsetX = -1; offsetX <= 1; offsetX++) {
				if (byGrid.has(tileKey(x + offsetX, y + offsetY))) reserved.add(tileKey(x + offsetX, y + offsetY))
			}
		}
	}
	for (const tile of tiles) if (isCentralLanding(tile)) reserved.add(tileKey(tile.x, sourceY(tile)))
	return { byGrid, reserved }
}

const stitchCave = (tiles, occupied, block) => {
	const naturalCount = tiles.filter(tile => ['natural', 'mountain'].includes(terrainOf(tile))).length
	if (naturalCount < 48) return false
	const byGrid = new Map(tiles.map(tile => [tileKey(tile.x, sourceY(tile)), tile]))
	const candidates = []
	for (let top = 1; top <= 13; top++) {
		for (let left = 1; left <= 13; left++) {
			const footprint = footprintAt(byGrid, left, top, 2, 2)
			if (footprint.length !== 4) continue
			if (footprint.some(tile => occupied.has(tileKey(tile.x, sourceY(tile))) || !['natural', 'mountain'].includes(terrainOf(tile)) || isCentralLanding(tile))) continue
			const mountainBonus = footprint.filter(tile => terrainOf(tile) === 'mountain').length / 20
			candidates.push({
				left,
				top,
				footprint,
				score: hashUnit(block.x * BLOCK_TILES + left, block.y * BLOCK_TILES + top, 'cave-site') + mountainBonus,
			})
		}
	}
	const candidate = candidates.sort((a, b) => b.score - a.score || a.top - b.top || a.left - b.left)[0]
	if (!candidate) return false
	const caveId = `${block.x}:${block.y}`
	candidate.footprint.forEach((tile, index) => {
		occupied.add(tileKey(tile.x, sourceY(tile)))
		tile.img = 'rocky-1'
		tile.img2 = `cave-${index + 1}`
		tile.feature = index === 3 ? 'cave-entrance' : 'cave'
		tile.caveId = caveId
		tile.caveTile = index + 1
		tile.solid = index !== 3
	})
	applyRockyApron(byGrid, occupied, candidate.left, candidate.top, 2, 2)
	return true
}

const addLine = (set, fromX, fromY, toX, toY) => {
	let x = fromX
	let y = fromY
	set.add(tileKey(x, y))
	while (x !== toX) {
		x += Math.sign(toX - x)
		set.add(tileKey(x, y))
	}
	while (y !== toY) {
		y += Math.sign(toY - y)
		set.add(tileKey(x, y))
	}
}

const stitchSecretGrove = (tiles, occupied, reserved, block, pattern = 'elbow') => {
	const byGrid = new Map(tiles.map(tile => [tileKey(tile.x, sourceY(tile)), tile]))
	const candidates = []
	for (const size of [7, 6, 5]) {
		for (let top = 1; top <= BLOCK_TILES - size - 1; top++) {
			for (let left = 1; left <= BLOCK_TILES - size - 1; left++) {
				const footprint = footprintAt(byGrid, left, top, size, size)
				if (footprint.length !== size * size) continue
				if (footprint.some(tile => !isGreen(terrainOf(tile)) || occupied.has(tileKey(tile.x, sourceY(tile))) || reserved.has(tileKey(tile.x, sourceY(tile))))) continue
				candidates.push({
					left,
					top,
					size,
					footprint,
					score: size + hashUnit(block.x * BLOCK_TILES + left, block.y * BLOCK_TILES + top, 'secret-grove'),
				})
			}
		}
	}
	const grove = candidates.sort((a, b) => b.score - a.score || a.top - b.top || a.left - b.left)[0]
	if (!grove) return false

	const right = grove.left + grove.size - 1
	const bottom = grove.top + grove.size - 1
	const pocketX = grove.left + 2 + Math.floor(hashUnit(block.x, block.y, 'grove-pocket-x') * Math.max(1, grove.size - 4))
	const pocketY = grove.top + 2 + Math.floor(hashUnit(block.x, block.y, 'grove-pocket-y') * Math.max(1, grove.size - 4))
	const side = Math.floor(hashUnit(block.x, block.y, `grove-side:${pattern}`) * 4)
	const entry = side === 0
		? [pocketX, grove.top]
		: side === 1
			? [right, pocketY]
			: side === 2
				? [pocketX, bottom]
				: [grove.left, pocketY]
	const elbow = side % 2 === 0
		? [Math.max(grove.left + 1, Math.min(right - 1, pocketX + (hashUnit(block.x, block.y, 'grove-bend') > 0.5 ? 1 : -1))), pocketY]
		: [pocketX, Math.max(grove.top + 1, Math.min(bottom - 1, pocketY + (hashUnit(block.x, block.y, 'grove-bend') > 0.5 ? 1 : -1)))]
	const trail = new Set()
	const pathPoints = pattern === 'hook'
		? [entry, [entry[0], pocketY], [pocketX, pocketY]]
		: pattern === 'switchback'
			? [
				entry,
				[side % 2 === 0 ? grove.left + 1 : entry[0], side % 2 === 0 ? entry[1] : grove.top + 1],
				[side % 2 === 0 ? right - 1 : pocketX, side % 2 === 0 ? pocketY : bottom - 1],
				[pocketX, pocketY],
			]
			: pattern === 'notch'
				? [entry, [Math.max(grove.left + 1, Math.min(right - 1, entry[0])), Math.max(grove.top + 1, Math.min(bottom - 1, entry[1]))], [pocketX, pocketY]]
				: [entry, elbow, [pocketX, pocketY]]
	for (let index = 1; index < pathPoints.length; index++) {
		addLine(trail, pathPoints[index - 1][0], pathPoints[index - 1][1], pathPoints[index][0], pathPoints[index][1])
	}
	if (pattern === 'spiral-pocket') {
		for (const [x, y] of [
			[pocketX - 1, pocketY - 1], [pocketX, pocketY - 1], [pocketX + 1, pocketY - 1],
			[pocketX + 1, pocketY], [pocketX + 1, pocketY + 1], [pocketX, pocketY + 1],
		]) {
			if (x > grove.left && x < right && y > grove.top && y < bottom) trail.add(tileKey(x, y))
		}
	}
	const clearing = new Set([
		tileKey(pocketX, pocketY),
		tileKey(Math.max(grove.left + 1, pocketX - 1), pocketY),
		tileKey(Math.min(right - 1, pocketX + 1), pocketY),
	])

	for (const tile of grove.footprint) {
		const key = tileKey(tile.x, sourceY(tile))
		occupied.add(key)
		tile.img = 'grass'
		if (tile.x === pocketX && sourceY(tile) === pocketY) {
			// Emerald's hidden items are deliberately invisible until discovered.
			tile.img2 = 'grass'
			tile.feature = 'hidden-item'
			tile.hiddenItem = 'pokeball'
			tile.solid = false
		} else if (trail.has(key) || clearing.has(key)) {
			tile.img2 = clearing.has(key) && hashUnit(tile.mapX, tile.mapY, 'secret-flower') > 0.65
				? `flower-${1 + Math.floor(hashUnit(tile.mapX, tile.mapY, 'secret-flower-colour') * 3)}`
				: 'grass'
			tile.feature = trail.has(key) ? 'secret-trail' : 'secret-clearing'
			tile.solid = false
		} else {
			tile.img2 = 'tree-1'
			tile.feature = 'tree'
			tile.solid = true
		}
	}
	return true
}

const stitchLedges = (tiles, occupied, reserved, block, maximum = 2) => {
	const byGrid = new Map(tiles.map(tile => [tileKey(tile.x, sourceY(tile)), tile]))
	const candidates = []
	for (let top = 2; top <= 13; top++) {
		for (const length of [5, 4, 3]) {
			for (let left = 1; left <= BLOCK_TILES - length - 1; left++) {
				const footprint = footprintAt(byGrid, left, top, length, 1)
				const landing = footprintAt(byGrid, left, top + 1, length, 1)
				if (footprint.length !== length || landing.length !== length) continue
				if ([...footprint, ...landing].some(tile => !isGreen(terrainOf(tile)) || occupied.has(tileKey(tile.x, sourceY(tile))) || reserved.has(tileKey(tile.x, sourceY(tile))))) continue
				candidates.push({ left, top, length, footprint, score: hashUnit(block.x * BLOCK_TILES + left, block.y * BLOCK_TILES + top, 'ledge-site') })
			}
		}
	}
	let placed = 0
	for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
		if (placed >= maximum) break
		if (candidate.footprint.some(tile => occupied.has(tileKey(tile.x, sourceY(tile))))) continue
		candidate.footprint.forEach((tile, index) => {
			occupied.add(tileKey(tile.x, sourceY(tile)))
			tile.img = 'grass'
			tile.img2 = index === 0 ? 'ledge-left-1' : index === candidate.length - 1 ? 'ledge-right-1' : 'ledge-middle-1'
			tile.feature = 'ledge'
			tile.jumpDirection = 'south'
			tile.solid = false
		})
		placed += 1
	}
	return placed
}

const addSigns = (tiles, occupied, block, maximum = 2) => {
	const byGrid = new Map(tiles.map(tile => [tileKey(tile.x, sourceY(tile)), tile]))
	const candidates = new Map()
	for (const tile of tiles.filter(value => ['road', 'path'].includes(terrainOf(value)))) {
		for (const [offsetX, offsetY] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
			const candidate = byGrid.get(tileKey(tile.x + offsetX, sourceY(tile) + offsetY))
			if (!candidate || !isGreen(terrainOf(candidate)) || isCentralLanding(candidate)) continue
			const key = tileKey(candidate.x, sourceY(candidate))
			if (occupied.has(key)) continue
			candidates.set(key, {
				tile: candidate,
				score: hashUnit(candidate.mapX + block.x, candidate.mapY + block.y, 'route-sign'),
			})
		}
	}
	const signs = []
	for (const candidate of [...candidates.values()].sort((a, b) => b.score - a.score)) {
		if (signs.length >= maximum) break
		if (signs.some(sign => Math.abs(sign.x - candidate.tile.x) + Math.abs(sourceY(sign) - sourceY(candidate.tile)) < 4)) continue
		const tile = candidate.tile
		occupied.add(tileKey(tile.x, sourceY(tile)))
		tile.img = 'grass'
		tile.img2 = 'route-sign-1'
		tile.feature = 'sign'
		tile.solid = true
		signs.push(tile)
	}
	return signs.length
}

const stitchWorldStructure = (tiles, occupied, reserved, block, preset) => {
	if (!preset?.cells?.length) return false
	const byGrid = new Map(tiles.map(tile => [tileKey(tile.x, sourceY(tile)), tile]))
	const candidates = []
	for (let top = 1; top <= BLOCK_TILES - preset.height - 1; top++) {
		for (let left = 1; left <= BLOCK_TILES - preset.width - 1; left++) {
			const footprint = footprintAt(byGrid, left, top, preset.width, preset.height)
			if (footprint.length !== preset.width * preset.height) continue
			if (footprint.some(tile => !isGreen(terrainOf(tile)) || occupied.has(tileKey(tile.x, sourceY(tile))) || reserved.has(tileKey(tile.x, sourceY(tile))))) continue
			candidates.push({
				left,
				top,
				footprint,
				score: hashUnit(block.x * BLOCK_TILES + left, block.y * BLOCK_TILES + top, `structure:${preset.id}`),
			})
		}
	}
	const candidate = candidates.sort((a, b) => b.score - a.score || a.top - b.top || a.left - b.left)[0]
	if (!candidate) return false

	for (const tile of candidate.footprint) {
		occupied.add(tileKey(tile.x, sourceY(tile)))
		tile.img = 'grass'
		tile.img2 = 'grass'
		tile.feature = `${preset.id}-floor`
		tile.solid = false
	}

	const roleAt = new Map(preset.cells.map(cell => [`${cell.x},${cell.y}`, cell.role]))
	for (const cell of preset.cells) {
		const tile = byGrid.get(tileKey(candidate.left + cell.x, candidate.top + cell.y))
		if (!tile) continue
		switch (cell.role) {
			case 'tree':
				tile.img2 = 'tree-1'
				tile.solid = true
				break
			case 'shrub':
				tile.img2 = 'shrub-1'
				tile.solid = true
				break
			case 'rock':
				tile.img2 = 'rock-1'
				tile.solid = true
				break
			case 'flower':
				tile.img2 = `flower-${1 + Math.floor(hashUnit(tile.mapX, tile.mapY, `${preset.id}:flower`) * 3)}`
				break
			case 'long-grass':
				tile.img2 = 'grass-2'
				break
			case 'ledge': {
				const hasLeft = roleAt.get(`${cell.x - 1},${cell.y}`) === 'ledge'
				const hasRight = roleAt.get(`${cell.x + 1},${cell.y}`) === 'ledge'
				tile.img2 = !hasLeft ? 'ledge-left-1' : !hasRight ? 'ledge-right-1' : 'ledge-middle-1'
				tile.jumpDirection = 'south'
				break
			}
			case 'sign':
				tile.img2 = 'route-sign-1'
				tile.solid = true
				break
			case 'hidden-item':
				tile.img2 = 'grass'
				tile.hiddenItem = 'pokeball'
				break
			case 'clear':
				tile.img2 = 'grass'
				break
		}
		tile.feature = cell.role === 'clear' ? `${preset.id}-path` : cell.role
	}
	return true
}

const addForestClusters = (state, tiles, occupied, reserved, profile) => {
	for (const tile of tiles) {
		const key = tileKey(tile.x, sourceY(tile))
		const terrain = terrainOf(tile)
		if (!isGreen(terrain) || occupied.has(key) || reserved.has(key)) continue
		const neighbours = [
			getOffsetTile(state, tile, -1, 1), getOffsetTile(state, tile, 0, 1), getOffsetTile(state, tile, 1, 1),
			getOffsetTile(state, tile, -1, 0), getOffsetTile(state, tile, 1, 0),
			getOffsetTile(state, tile, -1, -1), getOffsetTile(state, tile, 0, -1), getOffsetTile(state, tile, 1, -1),
		].filter(value => isGreen(terrainOf(value))).length
		if (neighbours < 6) continue
		const globalX = Math.floor(tile.mapX / TILE_SIZE)
		const globalY = Math.floor(tile.mapY / TILE_SIZE)
		const terrainAdjustment = terrain === 'natural' ? -0.09 : terrain === 'mountain' ? 0.02 : 0.08
		const threshold = Math.max(0.42, Math.min(0.92, profile.biome.forestThreshold + terrainAdjustment))
		if (coarseNoise(globalX, globalY, 'forest-mass', 7) <= threshold) continue
		occupied.add(key)
		tile.img = 'grass'
		tile.img2 = 'tree-1'
		tile.feature = 'tree'
		tile.solid = true
	}
}

// Flower beds are authored per 6x6 world cell: at most one small single-colour
// bed per cell, so blooms read as deliberate garden patches instead of noise.
const FLOWER_BED_CELL = 6
const flowerBedAt = (globalX, globalY, chance) => {
	const cellX = Math.floor(globalX / FLOWER_BED_CELL)
	const cellY = Math.floor(globalY / FLOWER_BED_CELL)
	if (hashUnit(cellX, cellY, 'flower-bed') >= chance) return null
	const bedX = cellX * FLOWER_BED_CELL + 1 + Math.floor(hashUnit(cellX, cellY, 'flower-bed-x') * 3)
	const bedY = cellY * FLOWER_BED_CELL + 1 + Math.floor(hashUnit(cellX, cellY, 'flower-bed-y') * 3)
	const wide = hashUnit(cellX, cellY, 'flower-bed-shape') > 0.5
	const inBed = globalX >= bedX && globalX <= bedX + (wide ? 2 : 1)
		&& globalY >= bedY && globalY <= bedY + 1
	if (!inBed) return null
	return 1 + Math.floor(hashUnit(cellX, cellY, 'flower-bed-colour') * 3)
}

// Long grass grows in chunky meadows: sampling the coarse noise on a 2x2
// lattice squares the patch edges off the way hand-placed Emerald routes do.
const inMeadow = (globalX, globalY, threshold) =>
	coarseNoise(Math.floor(globalX / 2) * 2, Math.floor(globalY / 2) * 2, 'meadow-mass', 6) > threshold

const addLife = (state, tiles, occupied, reserved, profile) => {
	for (const tile of tiles) {
		const key = tileKey(tile.x, sourceY(tile))
		if (occupied.has(key)) continue
		const terrain = terrainOf(tile)
		const detail = hashUnit(tile.mapX, tile.mapY, 'life')
		const globalX = Math.floor(tile.mapX / TILE_SIZE)
		const globalY = Math.floor(tile.mapY / TILE_SIZE)
		if (terrain === 'building') {
			tile.img = 'grass'
			const yardFlower = flowerBedAt(globalX, globalY, 0.5)
			tile.img2 = yardFlower ? `flower-${yardFlower}` : 'grass'
			tile.feature = 'building-yard'
			tile.solid = false
			continue
		}
		if (!isGreen(terrain)) continue
		const greenNeighbours = [
			getOffsetTile(state, tile, -1, 1), getOffsetTile(state, tile, 0, 1), getOffsetTile(state, tile, 1, 1),
			getOffsetTile(state, tile, -1, 0), getOffsetTile(state, tile, 1, 0),
			getOffsetTile(state, tile, -1, -1), getOffsetTile(state, tile, 0, -1), getOffsetTile(state, tile, 1, -1),
		].filter(value => isGreen(terrainOf(value))).length

		const canBlock = !reserved.has(key) && !isCentralLanding(tile)
		const palette = profile.detailPalette
		const detailBias = profile.biome.detailBias
		const treeLimit = 0.03 + Math.max(0, detailBias) * 0.5
		const rockLimit = Math.max(0.012, (palette.rocks + detailBias) * 0.22)
		const shrubLimit = rockLimit + 0.02
		const meadowThreshold = Math.max(0.38, Math.min(0.66, 0.64 - palette.longGrass * 0.58 - detailBias * 0.4))
		const bedChance = Math.max(0.2, Math.min(0.65, (palette.flowers + detailBias) * 2.2))
		const flower = flowerBedAt(globalX, globalY, bedChance)
		if (canBlock && terrain === 'natural' && detail < treeLimit) {
			tile.img2 = 'tree-1'
			tile.feature = 'tree'
			tile.solid = true
		} else if (canBlock && detail < rockLimit) {
			tile.img2 = 'rock-1'
			tile.feature = 'boulder'
			tile.solid = true
		} else if (canBlock && detail < shrubLimit) {
			tile.img2 = 'shrub-1'
			tile.feature = 'shrub'
			tile.solid = true
		} else if (greenNeighbours >= 5 && inMeadow(globalX, globalY, meadowThreshold)) {
			tile.img2 = 'grass-2'
			tile.feature = 'long-grass'
		} else if (flower && greenNeighbours >= 5) {
			tile.img2 = `flower-${flower}`
			tile.feature = 'flower'
		} else {
			tile.img2 = 'grass'
			tile.feature = 'short-grass-pocket'
			tile.solid = false
		}
	}
}

const terrainLife = (state, block) => {
	const tiles = blockTiles(state, block)
	if (!tiles.length) return
	const updated = Date.now()
	ensureSpawnRoute(tiles, block)
	smoothWater(state, tiles)
	resetBaseSprites(tiles, state.version, updated)
	stitchSurfaces(state, tiles)
	const terrainCounts = tiles.reduce((counts, tile) => {
		const terrain = terrainOf(tile)
		counts[terrain] = (counts[terrain] || 0) + 1
		return counts
	}, {})
	const profile = selectWorldProfile(block.x, block.y, terrainCounts)
	block.worldProfile = {
		biome: profile.biome.id,
		structure: profile.structure.id,
		detailPalette: profile.detailPalette.id,
		routeTreatment: profile.routeTreatment.id,
		secretPattern: profile.secretPattern,
		recipeId: profile.recipeId,
		recipeCount: WORLD_RECIPE_COUNT,
	}
	const occupied = stitchHouses(state, tiles, block)
	stitchCave(tiles, occupied, block)
	stitchMountains(tiles, occupied)
	const { reserved } = buildReservedGround(tiles, occupied)
	const structured = profile.structure.id === 'secret-grove'
		? stitchSecretGrove(tiles, occupied, reserved, block, profile.secretPattern)
		: stitchWorldStructure(tiles, occupied, reserved, block, profile.structure)
	if (!structured || hashUnit(block.x, block.y, 'bonus-secret-grove') < 0.18) {
		stitchSecretGrove(tiles, occupied, reserved, block, profile.secretPattern)
	}
	stitchLedges(tiles, occupied, reserved, block, profile.routeTreatment.ledges)
	addSigns(tiles, occupied, block, profile.routeTreatment.signs)
	addForestClusters(state, tiles, occupied, reserved, profile)
	addLife(state, tiles, occupied, reserved, profile)
	block.featureSummary = tiles.reduce((summary, tile) => {
		const feature = tile.feature || terrainOf(tile)
		summary[feature] = (summary[feature] || 0) + 1
		return summary
	}, {})
}

export default {
	priority,
	run: terrainLife,
}
