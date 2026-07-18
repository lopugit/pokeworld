// @ts-nocheck -- legacy modifier state is intentionally open-ended.

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

const addLife = (state, tiles, occupied) => {
	for (const tile of tiles) {
		const key = tileKey(tile.x, sourceY(tile))
		if (occupied.has(key)) continue
		const terrain = terrainOf(tile)
		const detail = hashUnit(tile.mapX, tile.mapY, 'life')
		if (terrain === 'building') {
			if (detail < 0.24) {
				tile.img2 = 'grass-dirt-2'
				tile.feature = 'brick-edge'
			}
			continue
		}
		if (!isGreen(terrain)) continue
		const greenNeighbours = [
			getOffsetTile(state, tile, -1, 1), getOffsetTile(state, tile, 0, 1), getOffsetTile(state, tile, 1, 1),
			getOffsetTile(state, tile, -1, 0), getOffsetTile(state, tile, 1, 0),
			getOffsetTile(state, tile, -1, -1), getOffsetTile(state, tile, 0, -1), getOffsetTile(state, tile, 1, -1),
		].filter(value => isGreen(terrainOf(value))).length

		if (terrain === 'natural' && detail < 0.045) {
			tile.img2 = 'tree-1'
			tile.feature = 'tree'
			tile.solid = true
		} else if (terrain !== 'grass' && detail < 0.085) {
			tile.img2 = 'shrub-1'
			tile.feature = 'shrub'
			tile.solid = true
		} else if (detail < (terrain === 'natural' ? 0.16 : 0.025) && greenNeighbours >= 5) {
			tile.img2 = 'rock-1'
			tile.feature = 'rock'
			tile.solid = true
		} else if (detail < (terrain === 'natural' ? 0.34 : 0.11) && greenNeighbours >= 6) {
			tile.img2 = 'grass-2'
			tile.feature = 'long-grass'
		} else if (detail < (terrain === 'natural' ? 0.44 : 0.155) && greenNeighbours >= 6) {
			const flower = 1 + Math.floor(hashUnit(tile.mapX, tile.mapY, 'flower') * 3)
			tile.img2 = `flower-${flower}`
			tile.feature = 'flower'
		}
	}
}

const terrainLife = (state, block) => {
	const tiles = blockTiles(state, block)
	if (!tiles.length) return
	const updated = Date.now()
	resetBaseSprites(tiles, state.version, updated)
	stitchSurfaces(state, tiles)
	const occupied = stitchHouses(tiles)
	stitchMountains(tiles, occupied)
	addLife(state, tiles, occupied)
}

export default {
	priority,
	run: terrainLife,
}
