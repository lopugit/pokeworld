// @ts-nocheck -- faithful ESM port of the original map generator.
import * as fs from 'node:fs'
import 'dotenv/config'
import * as nodePath from 'node:path'
import throttledQueue from 'throttled-queue'
import { MongoClient } from 'mongodb'
import log from './log'
import * as mapSource from './map-source'
import { GOOGLE_STATIC_MAP_STYLES, centeredCropRect } from '../terrain-classifier'
import {
	createSolidPngWithRgba,
	cropRgba,
	decodePng,
	encodePng,
} from './png'

let fallbackMapPromise
const getFallbackMap = () => {
	if (!fallbackMapPromise) {
		fallbackMapPromise = Promise.resolve(createSolidPngWithRgba(512, 512, {
			r: 112,
			g: 192,
			b: 160,
			alpha: 255,
		}))
	}

	return fallbackMapPromise
}

const mapAssetsDir = process.env.MAP_ASSETS_DIR || nodePath.resolve(process.cwd(), 'map-assets')
const legacyMongoUri = `${process.env.MONGODB_SCHEME || ''}${process.env.MONGODB_USER || ''}:${process.env.MONGODB_PWD || ''}@${process.env.MONGODB_URL || ''}/${process.env.MONGODB_DB || 'pokeworld'}?retryWrites=true&w=majority${process.env.MONGODB_URL_PARAMS || ''}`
const mongoUri = process.env.POKEWORLD_OFFLINE_MAP === 'true'
	? undefined
	: process.env.MONGODB_URI || (process.env.MONGODB_SCHEME ? legacyMongoUri : undefined)

let lats
let lngs
try {
	lats = JSON.parse(fs.readFileSync(nodePath.join(mapAssetsDir, 'lats.json')))
	lngs = JSON.parse(fs.readFileSync(nodePath.join(mapAssetsDir, 'lngs.json')))
} catch { }

const saveMapAtThrottled = throttledQueue(50, 1000)

function getXIncrement(width = 512, zoom = 20, scale = 2) {
	const degreesPerMeterAtEquator = 360 / (2 * Math.PI * 6378137)
	const metresAtEquatorPerTilePx = (156543.03392 / (2 ** zoom))
	const multiplier = 1
	const lngIncrement = (degreesPerMeterAtEquator * metresAtEquatorPerTilePx * (width / scale)) * multiplier
	return lngIncrement
}

function getYIncrement(lat, width = 512, zoom = 20, scale = 2) {
	const degreesPerMeterAtEquator = 360 / (2 * Math.PI * 6378137)
	const metresAtEquatorPerTilePx = (156543.03392 / (2 ** zoom))
	const multiplier = 1
	return (degreesPerMeterAtEquator * Math.cos(lat * Math.PI / 180) * metresAtEquatorPerTilePx * (width / scale)) * multiplier
}

const generateMap = ({
	latStart,
	lngStart,
	latEnd,
	lngEnd,
	startX = 0,
	endX = 10,
	startY = 0,
	endY = 10,
	zoom = 20,
	path = './assets/db',
	json = false,
	html = false,
	images = false,
	// mongodb = false,
}) => {

	// Mongodb setup
	// let cacheCollection
	// let map
	try {
		if (!mongoUri) throw new Error('MongoDB is not configured')
		log('Connecting to MongoDB')
		const client = new MongoClient(mongoUri)

		// Connect to client
		client.connect(err => {
			if (err) {
				console.error('Connection failed', err)
			} else {
				log('Connected to MongoDB')
				// cacheCollection = client.db(process.env.MONGODB_DB).collection('cache')
				// map = client.db(process.env.MONGODB_DB).collection('map')
			}
		})
	} catch (err) {
		console.error(err)
	}

	// Init
	if (typeof latStart === 'number' && typeof latEnd === 'number' && typeof lngStart === 'number' && typeof lngEnd === 'number') {
		const max = Math.max(lats.length, lngs.length)
		for (let i = 0; i < max; i++) {
			if (lngs[i]) {
				if (lngStart > lngs[i].lng) {
					startX = lngs[i].x
				}

				if (lngEnd > lngs[i].lng) {
					endX = lngs[i].x
				}
			}

			if (lats[i]) {
				if (latStart > lats[i].lat) {
					startY = lats[i].y
				}

				if (latEnd > lats[i].lat) {
					endY = lats[i].y
				}
			}
		}
	}

	const coords = {
		x: {
			start: startX,
			end: endX,
		},
		y: {
			start: startY,
			end: endY,
		},
	}

	log('coords', coords)

	// initialize dirs
	initDirs(path)

	const grid = {}

	let currentX = startX
	let currentY = startY
	let currentXWithinBounds = currentX < endX

	while (currentXWithinBounds) {

		if (json) {
			grid[currentY] = grid[currentY] || {}
			grid[currentY][currentX] = {}
		}

		log(`${currentX}_${currentY}`)
		// log(`currentX: ${currentX}, currentY: ${currentY}`)
		// log(`lng: ${lngs[currentX].lng}, lat: ${lats[currentY].lat}`)

		const cX = currentX
		const cY = currentY
		if (images) {
			saveMapAtThrottled(() => saveMapAt(cX, cY, lats[cY].lat, lngs[cX].lng, `${path}/tiles`, zoom))
		}

		currentY += 1

		const currentYOverBounds = currentY > endY
		if (currentYOverBounds) {
			currentY = startY
			currentX += 1

		}

		currentXWithinBounds = currentX < endX

	}

	generateOutputs(grid, path, json, html)

}

function generateOutputs(grid, path, json, html) {
	if (json) {
		fs.writeFileSync(`${path}/grid.json`, JSON.stringify(grid, null, 2))
	}

	if (html) {
		const template = body => `
			<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="UTF-8">
					<style>
					body {
						padding: 0px;
						margin: 0px;
					}
					.row {
						display: flex;
						align-items: flex-start;
						justify-content: flex-start;
					}
					.column {
						display: flex;
						flex-direction: column;
						align-items: flex-start;
						justify-content: flex-start;
					}
					img {
						max-width: 450px;
						height: auto;
						padding: 0px; 
						margin: 0px;
					}
					</style>
				</head>
				<body>
					${body}
				</body>
			</html>
		`
		let body = ''
		for (let iY = Object.keys(grid).length - 1; iY >= 0; iY--) {
			const currentX = Object.keys(grid)[iY]
			const currentYs = Object.keys(grid[currentX])
			body += '<div class="row">\n'
			for (let iY = 0; iY < currentYs.length; iY++) {
				body += '<div class="column">\n'
				const currentY = currentYs[iY]
				for (let offsetY = 0; offsetY < 512 / 32; offsetY++) {
					body += '<div class="row">\n'
					for (let offsetX = 0; offsetX < 512 / 32; offsetX++) {
						body += `<img src="tiles/${currentY}_${currentX}-tile-${offsetX}_${offsetY}.png" />\n`
					}

					body += '</div>\n'
				}

				body += '</div>\n'
			}

			body += '</div>\n'
		}

		fs.writeFileSync(`${path}/index.html`, template(body))
	}

}

function initDirs(path) {
	if (fs.existsSync(path)) {
		fs.rmSync(path, { recursive: true, force: true })
	}

	fs.mkdirSync(path, { recursive: true })
	fs.mkdirSync(path + '/lats', { recursive: true })
	fs.mkdirSync(path + '/tiles', { recursive: true })

}

function formatCoord(coord) {
	let coordFormatted = coord.toString().replace('-', 'n')
	if (coordFormatted[0] !== 'n') {
		coordFormatted = 'p' + coordFormatted
	}

	return coordFormatted
}

async function saveMapAt(x, y, lat, lng, path, zoom) {
	const image = await getMapAt(lat, lng, zoom)
	const rgba = decodePng(image)

	const promises = []

	for (let offsetX = 0; offsetX < 512 / 32; offsetX++) {
		for (let offsetY = 0; offsetY < 512 / 32; offsetY++) {
			const tile = encodePng(cropRgba(rgba, {
				left: offsetX * 32,
				top: offsetY * 32,
				width: 32,
				height: 32,
			}))
			promises.push(fs.promises.writeFile(`${path}/${x}_${y}-tile-${offsetX}_${offsetY}.png`, tile))
		}
	}

	await Promise.all(promises)

	// fs.rmSync(`${path}/${x}_${y}.png`)
	// fs.rmSync(`${path}/${x}_${y}-source.png`)

}

async function getMapAt(lat, lng, zoom = 20) {
	const result = await getMapAtWithSource(lat, lng, zoom)
	return result.image
}

function buildGoogleStaticMapUrl(lat, lng, zoom = 20, apiKey = process.env.GOOGLE_API_KEY) {
	const url = new URL('https://maps.googleapis.com/maps/api/staticmap')
	const params = new URLSearchParams({
		center: `${lat},${lng}`,
		zoom: String(zoom),
		scale: '2',
		size: '640x640',
		format: 'png32',
		key: apiKey,
		maptype: 'roadmap',
	})
	for (const style of GOOGLE_STATIC_MAP_STYLES) params.append('style', style)
	url.search = params.toString()
	return url
}

async function getMapAtWithSource(lat, lng, zoom = 20) {
	// No Google key: skip the doomed request and use the bundled 512x512 fallback
	// map so tile generation works fully offline (dev).
	if (!mapSource.canUseGoogleStaticMaps()) {
		const fallback = await getFallbackMap()
		return {
			...fallback,
			source: mapSource.MAP_SOURCE_FALLBACK,
		}
	}
	const url = buildGoogleStaticMapUrl(lat, lng, zoom)

	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
		if (!response.ok) throw new Error(`Google Static Maps returned ${response.status}`)
		const image = Buffer.from(await response.arrayBuffer())
		const decoded = decodePng(image)
		const rgba = cropRgba(decoded, centeredCropRect(decoded.width, decoded.height))
		const cropped = { image: encodePng(rgba), rgba }

		return {
			...cropped,
			source: mapSource.MAP_SOURCE_GOOGLE,
		}
	} catch (error) {
		console.error('Error fetching image data; using bundled fallback', error.message)
		const fallback = await getFallbackMap()
		return {
			...fallback,
			source: mapSource.MAP_SOURCE_FALLBACK,
		}
	}

}

async function generateCoordinatesGrid({
	write = false,
	mongodb = false,
}) {
	if (mongodb && process.env.ALLOW_GLOBAL_COORDINATE_MATERIALIZATION !== 'true') {
		throw new Error('Refusing to materialize the full global coordinate Cartesian product. Block coordinates are now derived in constant time; set ALLOW_GLOBAL_COORDINATE_MATERIALIZATION=true only for an intentional legacy migration.')
	}

	// Mongodb setup
	// let cacheCollection
	let map
	try {
		if (!mongodb) throw new Error('MongoDB output disabled')
		if (!mongoUri) throw new Error('MongoDB is not configured')
		log('Connecting to MongoDB')
		const client = new MongoClient(mongoUri)

		// Connect to client
		await client.connect()
		log('Connected to MongoDB')
		// cacheCollection = await client.db(process.env.MONGODB_DB).collection('cache')
		map = await client.db(process.env.MONGODB_DB || 'pokeworld').collection('map')
	} catch (err) {
		if (mongodb) console.error(err)
	}

	const lats = []
	const latsMap = {}
	for (let lat = -87; lat < 87; lat += getYIncrement(lat, 512, 20, 2)) {
		latsMap[Math.floor(lat)] = latsMap[Math.floor(lat)] || []
		const latObj = {
			y: lats.length,
			lat,
			latCenter: lat + (getYIncrement(lat, 512, 20, 2) / 2),
		}
		lats.push(latObj)
		latsMap[Math.floor(lat)].push(latObj)
	}

	log('Generated', lats.length, 'tiles')
	if (write) {
		fs.writeFileSync(nodePath.join(mapAssetsDir, 'lats-example.json'), JSON.stringify(lats.slice(0, 5), null, 2))
		fs.writeFileSync(nodePath.join(mapAssetsDir, 'lats.json'), JSON.stringify(lats, null, 2))
		fs.writeFileSync(nodePath.join(mapAssetsDir, 'latsMap.json'), JSON.stringify(latsMap, null, 2))
	}

	const lngs = []
	const lngsMap = {}
	const lngIncrement = getXIncrement(512, 20, 2)
	for (let lng = -180; lng < 180; lng += lngIncrement) {
		lngsMap[Math.floor(lng)] = lngsMap[Math.floor(lng)] || []
		const lngObj = {
			x: lngs.length,
			lng,
			lngCenter: lng + (lngIncrement / 2),
		}
		lngsMap[Math.floor(lng)].push(lngObj)
		lngs.push(lngObj)
	}

	log('Generated', lngs.length, 'tiles')
	if (write) {
		fs.writeFileSync(nodePath.join(mapAssetsDir, 'lngs-example.json'), JSON.stringify(lngs.slice(0, 5), null, 2))
		fs.writeFileSync(nodePath.join(mapAssetsDir, 'lngs.json'), JSON.stringify(lngs, null, 2))
		fs.writeFileSync(nodePath.join(mapAssetsDir, 'lngsMap.json'), JSON.stringify(lngsMap, null, 2))
	}

	log('Done, maybe running mongodb')

	if (mongodb) {
		let count = 0
		setInterval(() => {
			log('Current count', count)
		}, 4000)
		await map.deleteMany({})
		for (const lat of lats) {
			for (const lng of lngs) {
				await map.insertOne({
					geojson: {
						type: 'Point',
						coordinates: [lng.lngCenter, lat.latCenter],
					},
					x: lng.x,
					y: lat.y,
					key: `${lng.x}_${lat.y}`,
					px: 512,
					zoom: 20,
					scale: 2,
					created: new Date(),
				}).catch(err => {
					console.error('Error inserting map tile', err)
				})
				count++
			}
		}
	}

}

const getTileOffsetColour = (tile, offset, tileCache, colours) => {
	const offsetX = offset[0] * 32
	const offsetY = offset[1] * 32
	const tileX = tile.mapX + offsetX
	const tileY = tile.mapY + offsetY

	return getTileColour(tileX, tileY, tileCache, colours)

}

const getTileOffsetSprite = (tile, offset, tileCache, grass = true) => {
	const offsetX = offset[0] * 32
	const offsetY = offset[1] * 32
	const tileX = tile.mapX + offsetX
	const tileY = tile.mapY + offsetY

	return getTileSprite(tileX, tileY, tileCache, grass)

}

const getTileOffsetSprite2 = (tile, offset, tileCache, grass = true) => {
	const offsetX = offset[0] * 32
	const offsetY = offset[1] * 32
	const tileX = tile.mapX + offsetX
	const tileY = tile.mapY + offsetY

	return getTileSprite2(tileX, tileY, tileCache, grass)

}

const getTileOffset = (tile, offset, tileCache) => {
	const offsetX = offset[0] * 32
	const offsetY = offset[1] * 32
	const tileX = tile.mapX + offsetX
	const tileY = tile.mapY + offsetY

	return getTile(tileX, tileY, tileCache)

}

const getTile = (x, y, tileCache) => tileCache[`${x},${y}`]

const getTileColour = (x, y, tileCache, colours) => {
	const tile = getTile(x, y, tileCache)
	if (colours.includes(tile?.colourData?.max)) {
		return tile?.colourData?.max
	}

	return '112,192,160'
}

const getTileSprite = (x, y, tileCache, grass) => {
	const tile = getTile(x, y, tileCache)
	if (tile && tile.img) {
		return tile.img
	}

	return grass ? 'grass' : 'undefined'
}

const getTileSprite2 = (x, y, tileCache, grass) => {
	const tile = getTile(x, y, tileCache)
	if (tile && tile.img2) {
		return tile.img2
	}

	return grass ? 'grass' : 'undefined'
}

export { buildGoogleStaticMapUrl, generateCoordinatesGrid, generateMap, getMapAt, getMapAtWithSource, getTileOffsetColour, getTileOffsetSprite, getTileOffsetSprite2, getTileOffset, getTile, getTileColour, getTileSprite, getTileSprite2 }
