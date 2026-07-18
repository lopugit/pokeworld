// @ts-nocheck -- faithful ESM port of the original map generator.
import mods from './mods'
import * as functions from './functions'
import * as coordinates from './coordinates'
import 'dotenv/config'
import { MongoClient } from 'mongodb'
import * as fs from 'node:fs'
import * as path from 'node:path'
import log from './log'
import * as mapSource from './map-source'
import { classifyTerrainPng, summarizeTerrain } from '../terrain-classifier'
import { v4 as uuidv4 } from 'uuid'
import { rgbaToTileColourData } from './png'

const sortedMods = [...mods].sort((a, b) => a.priority - b.priority)
const coordinateKey = value => `${value.x},${value.y}`

// Generated coordinate data (gitignored); tolerate absence so the server boots.
let latsDb = []
let lngsDb = []
try {
	latsDb = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'map-assets/lats.json')))
	lngsDb = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'map-assets/lngs.json')))
} catch {}

const legacyUrl = `${process.env.MONGODB_SCHEME || ''}${process.env.MONGODB_USER || ''}:${process.env.MONGODB_PWD || ''}@${process.env.MONGODB_URL || ''}/${process.env.MONGODB_DB || 'pokeworld'}?retryWrites=true&w=majority${process.env.MONGODB_URL_PARAMS || ''}`
const mongoUri = process.env.POKEWORLD_OFFLINE_MAP === 'true'
	? undefined
	: process.env.MONGODB_URI || (process.env.MONGODB_SCHEME ? legacyUrl : undefined)
// Only construct the client when Mongo is actually configured; otherwise the URL
// is `undefined...` and the MongoClient constructor throws at load, taking the
// whole server down. Leaving `client` undefined lets the server boot and serve
// everything except /v1/blocks (which needs the DB).
let client
if (mongoUri) {
	log('Connecting to MongoDB')
	client = new MongoClient(mongoUri)
} else {
	log('MONGODB_* env not set — /v1/blocks generation disabled (server still boots)')
}

const transactions = {
	current: undefined,
}

const transactionOptions = {
	readPreference: 'primary',
	readConcern: { level: 'local' },
	writeConcern: { w: 'majority' },
}

const toExport = version => {

	const v1Blocks = async req => {

		log('v1Blocks getting block')

		const { offsets, blockX, blockY, regenerate } = req.query

		if (
			(
				(typeof blockX === 'number' && typeof blockY === 'number')
				|| (typeof blockX === 'string' && typeof blockY === 'string')
			) && offsets instanceof Array
		) {

			// No-DB dev mode: with no Mongo configured we still run the pure tile
			// generation below (getMapAt falls back to assets/gmap.png), so the map
			// renders offline. The DB-only helpers (sync/lock/save) no-op.
			let session
			let blockDb
			if (client) {
				await client.connect()
				session = client.startSession()
				blockDb = await client.db(process.env.MONGODB_DB || 'pokeworld').collection('blocks')
			}

			const state = {
				blocks: {
					all: [],
					outer: [],
					edges: [],
					generate: [],
					cache: {},
				},
				tiles: {
					all: [],
					outer: [],
					edges: [],
					generate: [],
					cache: {},
				},
				regenerate: Boolean(regenerate === true || regenerate === 'true'),
				offsets,
				blockX,
				blockY,
				version,
				lockId: uuidv4(),
				session,
				blockDb,
				lats: latsDb,
				lngs: lngsDb,
				maps: {
					pending: new Map(),
				},
				mods: sortedMods,
			}

			await initBlocks(state)

			if (
				state.blocks.generate.some(block => block.regenerate)
			) {

				log('Generation required for', state.blocks.generate.length, 'blocks originating at', state.blockX, state.blockY)

				// wait for write lock on blocks
				await blockWriteLock(state)

				await syncBlocks(state)

				scanBlocks(state)

				if (
					state.blocks.generate.some(block => block.regenerate)
				) {
					// generate blocks that need generating
					await generateBlocks(state)

					state.regenerate = false

					// generate edge blocks that need regenerating
					await regenerateEdgeBlocks(state)

					// regenerate blocks to join to edges
					await regenerateBlocks(state)

					// save all blocks
					await saveAllBlocks(state)

					// unlock all blocks
					await blockWriteUnlock(state)

				}

			}

			return {
				send: {
					blocks: [...state.blocks.generate, ...state.blocks.edges],
				},
				status: 200,
			}

		}

		return {
			send: 'Latitude or Longitude is not a number',
			status: 400,
		}

	}

	const initBlocks = async state => {
		populateBlocks(state)

		// Explicit regeneration is known before the first Mongo read, so start the
		// Google request immediately and overlap it with DB synchronization/locking.
		if (state.regenerate) prefetchBlockMaps(state)

		await syncBlocks(state)

		scanBlocks(state)
		prefetchBlockMaps(state)

	}

	const populateBlocks = state => {
		for (const offsetRaw of state.offsets) {

			const offset = typeof offsetRaw === 'string' ? JSON.parse(offsetRaw) : offsetRaw
			const newBlockX = Number(state.blockX) + offset[0]
			const newBlockY = Number(state.blockY) + offset[1]
			const newBlock = {
				...getLngFromBlock(newBlockX, state.lngs),
				...getLatFromBlock(newBlockY, state.lats),
				x: newBlockX,
				y: newBlockY,
			}
			state.blocks.all.push(newBlock)
			state.blocks.generate.push(newBlock)
		}

		const offsets = [
			[1, 0],
			[0, 1],
			[-1, 0],
			[0, -1],
			[1, 1],
			[-1, 1],
			[-1, -1],
			[1, -1],
		]
		// get edges of generate blocks
		for (const block of state.blocks.generate) {
			for (const offset of offsets) {
				if (!state.blocks.all.find(b => b.x === block.x + offset[0] && b.y === block.y + offset[1])) {
					const newBlockX = Number(block.x) + offset[0]
					const newBlockY = Number(block.y) + offset[1]
					const newBlock = {
						...getLngFromBlock(newBlockX, state.lngs),
						...getLatFromBlock(newBlockY, state.lats),
						x: newBlockX,
						y: newBlockY,

					}
					state.blocks.all.push(newBlock)
					state.blocks.edges.push(newBlock)
				}
			}
		}

		// get outer edges of edges
		for (const block of state.blocks.edges) {
			for (const offset of offsets) {
				if (!state.blocks.all.find(b => b.x === block.x + offset[0] && b.y === block.y + offset[1])) {
					const newBlock = {
						x: Number(block.x) + offset[0],
						y: Number(block.y) + offset[1],
					}
					state.blocks.all.push(newBlock)
					state.blocks.outer.push(newBlock)
				}
			}
		}

		for (const block of state.blocks.all) {
			state.blocks.cache[block.x + ',' + block.y] = block
		}

	}

	const syncBlocks = async state => {
		if (!client) return
		const coordinates = state.blocks.all.map(block => ({ x: block.x, y: block.y }))
		const dbBlocks = await state.blockDb.find({ $or: coordinates }).toArray()
		const dbBlocksByCoordinate = new Map(dbBlocks.map(block => [coordinateKey(block), block]))

		for (const block of state.blocks.all) {
			const dbBlock = dbBlocksByCoordinate.get(coordinateKey(block))
			if (dbBlock) Object.assign(block, dbBlock)
		}

	}

	const prefetchBlockMaps = state => {
		for (const block of state.blocks.generate) {
			if (!block.regenerate && !state.regenerate) continue
			const key = coordinateKey(block)
			if (!state.maps.pending.has(key)) {
				const pending = functions.getMapAtWithSource(block.lat, block.lng, 20)
				// Attach a handler immediately so a very fast rejection cannot become an
				// unhandled promise while Mongo work is still in progress. The original
				// promise remains in the map and still rejects when awaited below.
				pending.catch(() => {})
				state.maps.pending.set(key, pending)
			}
		}
	}

	const scanBlocks = async state => {
		for (const block of state.blocks.generate) {
			const fallbackNeedsRegeneration = mapSource.shouldRegenerateFallbackBlock(block)
			if (!block?.tiles || block?.tiles?.length < (16 * 16) || state.regenerate || fallbackNeedsRegeneration || block.tiles.some(tile => tile.version !== state.version)) {
				if (fallbackNeedsRegeneration) {
					log('Regenerating fallback-derived block from Google Static Maps', block.x, block.y)
				}
				block.regenerate = true
				const offsets = [
					[1, 0],
					[0, 1],
					[-1, 0],
					[0, -1],
					[1, 1],
					[-1, 1],
					[-1, -1],
					[1, -1],
				]

				const edgeBlocks = offsets.map(offset => ({ x: block.x + offset[0], y: block.y + offset[1] }))
				state.blocks.all.forEach(potentialEdgeBlock => {

					if (
						edgeBlocks.find(edgeBlock => potentialEdgeBlock.x === edgeBlock.x && potentialEdgeBlock.y === edgeBlock.y)
						&& potentialEdgeBlock?.tiles?.length
					) {
						potentialEdgeBlock.regenerate = true
					}

				})
			}
		}

		for (const block of state.blocks.all) {
			for (const tile of block?.tiles || []) {
				state.tiles.cache[tile.mapX + ',' + tile.mapY] = tile
			}
		}
	}

	const blockWriteUnlock = async state => {
		if (!client) return
		await new Promise(async resolve => {
			const saveAndUnlockInterval = setInterval(async () => {
				if (!transactions.current) {
					transactions.current = true
					clearInterval(saveAndUnlockInterval)
					await state.session.withTransaction(async () => {
						try {
							const dbBlocks = await state.blockDb.find({
								$or: state.blocks.all.map(block => ({ x: block.x, y: block.y })),
							}).toArray()
							const dateNow = Date.now()
							const writeable = dbBlocks.every(block => block.lockId === state.lockId || (dateNow - block.lockDate > 1000 * 60))
							if (writeable) {
								await state.blockDb.bulkWrite(state.blocks.all.map(block => ({
									updateOne: {
										filter: { x: block.x, y: block.y },
										update: { $set: { lockId: null, lockDate: null } },
										upsert: true,
									},
								})), { ordered: false })
							}
						} finally {
							// session.endSession()
							// client.close()
						}

					}, transactionOptions)
					transactions.current = false
					resolve()
				}
			}, 50)
		})

	}

	const blockWriteLock = async state => {
		if (!client) return

		await new Promise(async resolve => {
			const blockWriteLockInterval = setInterval(async () => {
				if (!transactions.current) {
					transactions.current = true
					await state.session.withTransaction(async () => {
						const dbBlocks = await state.blockDb.find({
							$or: state.blocks.all.map(block => ({ x: block.x, y: block.y })),
						}).toArray()
						const writeable = dbBlocks.every(block => !block.lockId || (Date.now() - block.lockDate > 1000 * 60))
						if (writeable) {
							clearInterval(blockWriteLockInterval)
							const lockDate = Date.now()
							for (const block of state.blocks.all) {
								block.lockId = state.lockId
								block.lockDate = lockDate
								delete block.tiles
							}

							await state.blockDb.bulkWrite(state.blocks.all.map(block => ({
								updateOne: {
									filter: { x: block.x, y: block.y },
									update: { $set: { ...block } },
									upsert: true,
								},
							})), { ordered: false })
							resolve()
						}
					}, transactionOptions)
					transactions.current = false
				}
			}, 50)
		})

	}

	const saveAllBlocks = async state => {
		if (!client) return
		const blocks = [...state.blocks.generate, ...state.blocks.edges]
		const saveStartTime = Date.now()

		const blocksToSave = []
		for (const block of blocks) {
			if (block.regenerate) {
				block.needsSaving = false
				block.needsSprites = false
				block.regenerate = false
				blocksToSave.push(block)
			}
		}

		if (blocksToSave.length) {
			await state.blockDb.bulkWrite(blocksToSave.map(block => ({
				updateOne: {
					filter: { x: block.x, y: block.y },
					update: { $set: { ...block } },
					upsert: true,
				},
			})), { ordered: false })
		}

		const saveEndTime = Date.now()

		log('Took', (saveEndTime - saveStartTime) / 1000, 's to save')

	}

	const generateBlocks = async state => {
		const proms = []
		for (const block of state.blocks.generate) {
			if (block.regenerate) {
				const prom = generateBlock(state, block)
				proms.push(prom)
			}
		}

		await Promise.all(proms)
	}

	const regenerateEdgeBlocks = async state => {
		const proms = []
		for (const block of state.blocks.edges) {
			if (block.regenerate) {
				// we pass skipColourData as true because we are only regenerating edges which have had tiles generated previously
				const prom = generateBlock(state, block, true)
				proms.push(prom)
			}
		}

		await Promise.all(proms)
	}

	const regenerateBlocks = async state => {
		const proms = []
		for (const block of state.blocks.generate) {
			if (block.regenerate) {
				// we pass skipColourData as true because we already generated the colour data in the first stage
				const prom = generateBlock(state, block, true)
				proms.push(prom)
			}
		}

		await Promise.all(proms)
	}

	const generateBlock = async (state, block, skipColourData) => {

		if (!skipColourData) {
			// generate tiles
			log('Generating colour data for block', block.x, block.y)
			await generateBlockColourData(state, block)
			log('generate colour data for block', block.x, block.y)
		}

		// generate sprites
		await runMods(state, block)

	}

	const runMods = async (state, block) => {

		const startTime = Date.now()

		for (const mod of state.mods) {
			mod.run(state, block)
		}

		const endTime = Date.now()

		log('Took', (endTime - startTime) / 1000, 's to run mods for block', block.x, block.y)

	}

	const generateBlockColourData = async (state, block) => {

		const mapKey = coordinateKey(block)
		let mapResult
		try {
			mapResult = await (state.maps.pending.get(mapKey) || functions.getMapAtWithSource(block.lat, block.lng, 20))
		} finally {
			state.maps.pending.delete(mapKey)
		}
		const googleMap = mapResult.image

		block.googleMap = googleMap.toString('base64')
		block.mapSource = mapResult.source
		block.fallbackGenerated = mapResult.source === mapSource.MAP_SOURCE_FALLBACK
		block.mapGeneratedAt = Date.now()
		const terrainData = classifyTerrainPng(googleMap, {
			fallback: mapResult.source === mapSource.MAP_SOURCE_FALLBACK,
		})
		block.terrainSummary = summarizeTerrain(terrainData)

		const colourData = rgbaToTileColourData(mapResult.rgba, 32)

		block.tiles = []

		const updated = Date.now()
		for (let offsetX = 0; offsetX < 512 / 32; offsetX++) {
			for (let offsetY = 0; offsetY < 512 / 32; offsetY++) {
				const tile = {
					blockX: block.x,
					blockY: block.y,
					x: offsetX,
					y: 15 - offsetY,
					uuid: uuidv4(),
					updated,
					needsSaving: true,
					mapX: (block.x * 512) + (offsetX * 32),
					mapY: (block.y * 512) + ((15 - offsetY) * 32),
					colourData: colourData[offsetX + ',' + offsetY],
					terrain: terrainData[offsetY][offsetX].terrain,
					terrainConfidence: terrainData[offsetY][offsetX].confidence,
					terrainCoverage: terrainData[offsetY][offsetX].coverage,
				}
				block.tiles.push(tile)
				state.tiles.cache[tile.mapX + ',' + tile.mapY] = tile
			}
		}

	}

	const getLngFromBlock = (blockX, lngs) => lngs[blockX] || coordinates.getLngForBlock(blockX)
	const getLatFromBlock = (blockY, lats) => lats[blockY] || coordinates.getLatForBlock(blockY)

	return v1Blocks
}

export default toExport
