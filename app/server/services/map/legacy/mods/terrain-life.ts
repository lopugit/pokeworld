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
	const { north, east, south, west, northWest, northEast, southWest, southEast } = neighbours
	if (north && south && east && west) {
		if (!northWest) return 'pond-20'
		if (!northEast) return 'pond-21'
		if (!southWest) return 'pond-22'
		if (!southEast) return 'pond-23'
		return `pond-center-${1 + Math.floor(hashUnit(mapX, mapY, 'water-ripple') * 4)}`
	}
	if (north && south && east && !west && !northWest && !southWest) return 'pond-25'
	if (north && south && !east && west && !northEast && !southEast) return 'pond-24'
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

const buildingComponents = tiles => {
	const byGrid = new Map(tiles.map(tile => [tileKey(tile.x, sourceY(tile)), tile]))
	const unseen = new Set(
		tiles.filter(tile => terrainOf(tile) === 'building').map(tile => tileKey(tile.x, sourceY(tile))),
	)
	const components = []

	while (unseen.size) {
		const start = unseen.values().next().value
		const queue = [start]
		const component = []
		unseen.delete(start)
		while (queue.length) {
			const key = queue.shift()
			const tile = byGrid.get(key)
			if (!tile) continue
			component.push(tile)
			const x = tile.x
			const y = sourceY(tile)
			for (const neighbour of [tileKey(x + 1, y), tileKey(x - 1, y), tileKey(x, y + 1), tileKey(x, y - 1)]) {
				if (!unseen.has(neighbour)) continue
				unseen.delete(neighbour)
				queue.push(neighbour)
			}
		}
		components.push(component)
	}

	return { byGrid, components }
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

const findHouseAnchor = (byGrid, component, occupied, preferredX) => {
	const xs = component.map(tile => tile.x)
	const ys = component.map(sourceY)
	const centerX = Math.max(0, Math.min(13, Math.round((preferredX ?? ((Math.min(...xs) + Math.max(...xs)) / 2)) - 1)))
	const centerY = Math.max(0, Math.min(12, Math.round(((Math.min(...ys) + Math.max(...ys)) / 2) - 1.5)))
	const candidates = []
	for (let top = 0; top <= 12; top++) {
		for (let left = 0; left <= 13; left++) {
			candidates.push({ left, top, distance: Math.abs(left - centerX) + Math.abs(top - centerY) })
		}
	}
	candidates.sort((a, b) => a.distance - b.distance || a.top - b.top || a.left - b.left)

	for (const candidate of candidates) {
		const footprint = footprintAt(byGrid, candidate.left, candidate.top, 3, 4)
		if (footprint.length !== 12) continue
		if (footprint.some(tile => occupied.has(tileKey(tile.x, sourceY(tile))) || !isWalkableGround(terrainOf(tile)))) continue
		return { ...candidate, footprint }
	}
	return null
}

const stitchHouses = tiles => {
	const { byGrid, components } = buildingComponents(tiles)
	const occupied = new Set()
	let houseNumber = 0

	for (const component of components.filter(value => value.length >= 3)) {
		const xs = component.map(tile => tile.x)
		const desired = component.length >= 48 ? 3 : component.length >= 24 ? 2 : 1
		const preferred = desired === 1
			? [(Math.min(...xs) + Math.max(...xs)) / 2]
			: Array.from({ length: desired }, (_, index) => Math.min(...xs) + ((index + 1) / (desired + 1)) * (Math.max(...xs) - Math.min(...xs)))

		for (const preferredX of preferred) {
			const anchor = findHouseAnchor(byGrid, component, occupied, preferredX)
			if (!anchor) continue
			houseNumber += 1
			anchor.footprint.forEach((tile, index) => {
				occupied.add(tileKey(tile.x, sourceY(tile)))
				tile.img = 'grass'
				tile.img2 = `house-red-${index + 1}`
				tile.feature = 'house'
				tile.houseId = houseNumber
				tile.houseTile = index + 1
				tile.solid = true
			})
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
			if (footprint.some(tile => occupied.has(tileKey(tile.x, sourceY(tile))) || !['natural', 'mountain'].includes(terrainOf(tile)))) continue
			const anchor = footprint[0]
			const chance = terrainOf(anchor) === 'mountain' ? 0.62 : 0.22
			if (hashUnit(anchor.mapX, anchor.mapY, 'mountain') >= chance) continue
			footprint.forEach((tile, index) => {
				occupied.add(tileKey(tile.x, sourceY(tile)))
				tile.img = 'grass'
				tile.img2 = `mountain-${index + 1}`
				tile.feature = 'mountain'
				tile.solid = true
			})
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
			if (footprint.some(tile => occupied.has(tileKey(tile.x, sourceY(tile))) || !['natural', 'mountain'].includes(terrainOf(tile)))) continue
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
		tile.img = 'grass'
		tile.img2 = `cave-${index + 1}`
		tile.feature = index === 3 ? 'cave-entrance' : 'cave'
		tile.caveId = caveId
		tile.caveTile = index + 1
		tile.solid = index !== 3
	})
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

const addLife = (state, tiles, occupied, reserved, profile) => {
	for (const tile of tiles) {
		const key = tileKey(tile.x, sourceY(tile))
		if (occupied.has(key)) continue
		const terrain = terrainOf(tile)
		const detail = hashUnit(tile.mapX, tile.mapY, 'life')
		if (terrain === 'building') {
			tile.img = 'grass'
			tile.img2 = detail < 0.42 ? `flower-${1 + Math.floor(hashUnit(tile.mapX, tile.mapY, 'yard-flower') * 3)}` : 'grass'
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
		const rockLimit = Math.max(0.05, palette.rocks + detailBias)
		const shrubLimit = rockLimit + 0.09
		const longGrassLimit = Math.min(0.72, shrubLimit + palette.longGrass)
		const flowerLimit = Math.min(0.91, longGrassLimit + palette.flowers)
		if (canBlock && terrain === 'natural' && detail < 0.065 + detailBias) {
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
		} else if (detail < longGrassLimit && greenNeighbours >= 5) {
			tile.img2 = 'grass-2'
			tile.feature = 'long-grass'
		} else if (detail < flowerLimit && greenNeighbours >= 5) {
			const flower = 1 + Math.floor(hashUnit(tile.mapX, tile.mapY, 'flower') * 3)
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
	const occupied = stitchHouses(tiles)
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
