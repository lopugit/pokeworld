// @ts-nocheck -- faithful ESM port of the original coordinate helpers.
const EARTH_RADIUS_METRES = 6378137
// Google Static Maps source parameters. Zoom 19 puts a real-world house at
// roughly 3x3-3x4 tiles, matching Pokémon proportions (player ≈ 1/9-1/12 of a
// house). These values participate in MAP_BLOCK_VERSION: changing any of them
// shifts every block coordinate, so stored blocks must regenerate.
const DEFAULT_ZOOM = 19
const DEFAULT_WIDTH = 512
const DEFAULT_SCALE = 2

export const GOOGLE_MAP_SOURCE = {
	zoom: DEFAULT_ZOOM,
	width: DEFAULT_WIDTH,
	scale: DEFAULT_SCALE,
}

// Compact tag for anything keyed to the world's ground scale: the block
// version, client save keys, and collected-item coordinates all embed it so a
// scale change orphans every stale artifact at once.
export const GOOGLE_MAP_SOURCE_TAG = `z${DEFAULT_ZOOM}s${DEFAULT_SCALE}w${DEFAULT_WIDTH}`
const MIN_LATITUDE = -87
const MAX_LATITUDE = 87

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)
const toRadians = value => value * Math.PI / 180

function getXIncrement(width = DEFAULT_WIDTH, zoom = DEFAULT_ZOOM, scale = DEFAULT_SCALE) {
	const degreesPerMeterAtEquator = 360 / (2 * Math.PI * EARTH_RADIUS_METRES)
	const metresAtEquatorPerTilePx = 156543.03392 / (2 ** zoom)
	return degreesPerMeterAtEquator * metresAtEquatorPerTilePx * (width / scale)
}

const projectLatitude = latitude => Math.log(Math.tan((Math.PI / 4) + (toRadians(latitude) / 2)))
const unprojectLatitude = projected => (2 * Math.atan(Math.exp(projected)) - (Math.PI / 2)) * 180 / Math.PI

const X_INCREMENT = getXIncrement()
const Y_INDEX_SCALE = 180 / (Math.PI * X_INCREMENT)
const MIN_LATITUDE_PROJECTED = projectLatitude(MIN_LATITUDE)

function blockForCoordinates(latitudeRaw, longitudeRaw) {
	const latitude = clamp(Number(latitudeRaw), MIN_LATITUDE, MAX_LATITUDE)
	const longitude = clamp(Number(longitudeRaw), -180, 180 - Number.EPSILON)
	return {
		x: Math.max(0, Math.floor((longitude + 180) / X_INCREMENT)),
		y: Math.max(0, Math.floor((projectLatitude(latitude) - MIN_LATITUDE_PROJECTED) * Y_INDEX_SCALE)),
	}
}

function getLngForBlock(blockX) {
	const x = Math.max(0, Number(blockX))
	const lng = -180 + (x * X_INCREMENT)
	return { x, lng, lngCenter: lng + (X_INCREMENT / 2) }
}

function getLatForBlock(blockY) {
	const y = Math.max(0, Number(blockY))
	const projected = MIN_LATITUDE_PROJECTED + (y / Y_INDEX_SCALE)
	const nextProjected = MIN_LATITUDE_PROJECTED + ((y + 1) / Y_INDEX_SCALE)
	const lat = unprojectLatitude(projected)
	const nextLat = unprojectLatitude(nextProjected)
	return { y, lat, latCenter: lat + ((nextLat - lat) / 2) }
}

export {
	MAX_LATITUDE,
	MIN_LATITUDE,
	X_INCREMENT,
	blockForCoordinates,
	getLatForBlock,
	getLngForBlock,
	getXIncrement,
}
