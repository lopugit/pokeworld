// @ts-nocheck -- pngjs is CommonJS and this module is bundled into Workflow steps.
import { PNG } from 'pngjs'

const assertCrop = (source, left, top, width, height) => {
	if (left < 0 || top < 0 || width < 1 || height < 1 || left + width > source.width || top + height > source.height) {
		throw new RangeError(`Cannot crop ${width}x${height} at ${left},${top} from ${source.width}x${source.height}`)
	}
}

const asBuffer = data => Buffer.isBuffer(data)
	? data
	: Buffer.from(data.buffer, data.byteOffset, data.byteLength)

const decodePng = input => {
	const image = PNG.sync.read(input)
	return {
		width: image.width,
		height: image.height,
		data: image.data,
	}
}

const encodePng = image => PNG.sync.write({
	width: image.width,
	height: image.height,
	data: asBuffer(image.data),
})

const cropRgba = (source, { left, top, width, height }) => {
	assertCrop(source, left, top, width, height)

	const sourceData = asBuffer(source.data)
	const outputData = Buffer.allocUnsafe(width * height * 4)
	for (let y = 0; y < height; y++) {
		const sourceStart = ((top + y) * source.width + left) * 4
		const outputStart = y * width * 4
		sourceData.copy(outputData, outputStart, sourceStart, sourceStart + width * 4)
	}

	return { width, height, data: outputData }
}

const cropPngWithRgba = (input, crop) => {
	const rgba = cropRgba(decodePng(input), crop)
	return {
		image: encodePng(rgba),
		rgba,
	}
}

const cropPng = (input, crop) => cropPngWithRgba(input, crop).image

const createSolidRgba = (width, height, { r, g, b, alpha = 255 }) => {
	const data = Buffer.allocUnsafe(width * height * 4)
	for (let index = 0; index < data.length; index += 4) {
		data[index] = r
		data[index + 1] = g
		data[index + 2] = b
		data[index + 3] = alpha
	}
	return { width, height, data }
}

const createSolidPngWithRgba = (width, height, colour) => {
	const rgba = createSolidRgba(width, height, colour)
	return {
		image: encodePng(rgba),
		rgba,
	}
}

const createSolidPng = (width, height, colour) => createSolidPngWithRgba(width, height, colour).image

// Summarize the decoded pixels directly. The original implementation first
// allocated a four-number array for every pixel and then constructed an RGB
// string for all 262,144 pixels. Packing RGB into an integer keeps the hot loop
// allocation-light; strings are created only once per distinct colour/tile.
const rgbaToTileColourData = (source, tileSize = 32) => {
	if (!Number.isInteger(tileSize) || tileSize < 1 || source.width % tileSize || source.height % tileSize) {
		throw new RangeError(`${source.width}x${source.height} cannot be divided into ${tileSize}px tiles`)
	}

	const data = asBuffer(source.data)
	const expectedBytes = source.width * source.height * 4
	if (data.length < expectedBytes) {
		throw new RangeError(`RGBA buffer contains ${data.length} bytes; expected at least ${expectedBytes}`)
	}

	const colourData = {}
	const tilesWide = source.width / tileSize
	const tilesHigh = source.height / tileSize

	for (let tileY = 0; tileY < tilesHigh; tileY++) {
		for (let tileX = 0; tileX < tilesWide; tileX++) {
			const counts = new Map()
			const pixelStartX = tileX * tileSize
			const pixelEndY = (tileY + 1) * tileSize

			for (let pixelY = tileY * tileSize; pixelY < pixelEndY; pixelY++) {
				let index = ((pixelY * source.width) + pixelStartX) * 4
				const rowEnd = index + (tileSize * 4)
				for (; index < rowEnd; index += 4) {
					const packedRgb = (data[index] << 16) | (data[index + 1] << 8) | data[index + 2]
					counts.set(packedRgb, (counts.get(packedRgb) || 0) + 1)
				}
			}

			const colourCounts = {}
			let maxColour = null
			let maxCount = 0
			for (const [packedRgb, count] of counts) {
				const colour = `${packedRgb >>> 16},${(packedRgb >>> 8) & 255},${packedRgb & 255}`
				colourCounts[colour] = count
				if (count > maxCount) {
					maxColour = colour
					maxCount = count
				}
			}
			colourCounts.max = maxColour
			colourData[`${tileX},${tileY}`] = colourCounts
		}
	}

	return colourData
}

export {
	createSolidPng,
	createSolidPngWithRgba,
	cropPng,
	cropPngWithRgba,
	cropRgba,
	decodePng,
	encodePng,
	rgbaToTileColourData,
}
