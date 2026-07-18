// @ts-nocheck -- pngjs is CommonJS and this module is bundled into Workflow steps.
import { PNG } from 'pngjs'

const assertCrop = (source, left, top, width, height) => {
	if (left < 0 || top < 0 || width < 1 || height < 1 || left + width > source.width || top + height > source.height) {
		throw new RangeError(`Cannot crop ${width}x${height} at ${left},${top} from ${source.width}x${source.height}`)
	}
}

const createSolidPng = (width, height, { r, g, b, alpha = 255 }) => {
	const image = new PNG({ width, height })
	for (let index = 0; index < image.data.length; index += 4) {
		image.data[index] = r
		image.data[index + 1] = g
		image.data[index + 2] = b
		image.data[index + 3] = alpha
	}
	return PNG.sync.write(image)
}

const cropPng = (input, { left, top, width, height }) => {
	const source = PNG.sync.read(input)
	assertCrop(source, left, top, width, height)

	const output = new PNG({ width, height })
	for (let y = 0; y < height; y++) {
		const sourceStart = ((top + y) * source.width + left) * 4
		const outputStart = y * width * 4
		source.data.copy(output.data, outputStart, sourceStart, sourceStart + width * 4)
	}

	return PNG.sync.write(output)
}

const imageToRgbaMatrix = input => {
	const image = PNG.sync.read(input)
	const matrix = new Array(image.height)

	for (let y = 0; y < image.height; y++) {
		const row = new Array(image.width)
		for (let x = 0; x < image.width; x++) {
			const index = (y * image.width + x) * 4
			row[x] = [
				image.data[index],
				image.data[index + 1],
				image.data[index + 2],
				image.data[index + 3],
			]
		}
		matrix[y] = row
	}

	return matrix
}

export { createSolidPng, cropPng, imageToRgbaMatrix }
