// @ts-nocheck -- small adapter shared by the ESM workflow step bundle.
import { createHash } from 'node:crypto'

const MAP_SOURCE_FALLBACK = 'fallback'
const MAP_SOURCE_GOOGLE = 'google-static-maps'
// SHA-256 of the original map-assets/gmap.png. The bundled fallback was
// losslessly re-encoded for serverless use, so the pixels match but its encoded
// bytes differ from fallback images already stored in MongoDB.
const LEGACY_FALLBACK_MAP_SHA256 = 'd057327ad2db1bf1bd5b55f8ae3383289093083e2cb286f8230ef853ccd13930'

const canUseGoogleStaticMaps = (env = process.env) => {
	const apiKey = env.GOOGLE_API_KEY
	const hasApiKey = typeof apiKey === 'string' ? apiKey.trim().length > 0 : Boolean(apiKey)

	return hasApiKey && env.POKEWORLD_OFFLINE_MAP !== 'true'
}

const getBase64ImageSha256 = base64Image => createHash('sha256')
	.update(Buffer.from(base64Image, 'base64'))
	.digest('hex')

const isFallbackGeneratedBlock = block => {
	if (!block) return false
	if (block.fallbackGenerated === true || block.mapSource === MAP_SOURCE_FALLBACK) return true
	if (typeof block.googleMap !== 'string' || block.googleMap.length === 0) return false

	return getBase64ImageSha256(block.googleMap) === LEGACY_FALLBACK_MAP_SHA256
}

const shouldRegenerateFallbackBlock = (block, env = process.env) => (
	canUseGoogleStaticMaps(env) && isFallbackGeneratedBlock(block)
)

export {
	LEGACY_FALLBACK_MAP_SHA256,
	MAP_SOURCE_FALLBACK,
	MAP_SOURCE_GOOGLE,
	canUseGoogleStaticMaps,
	isFallbackGeneratedBlock,
	shouldRegenerateFallbackBlock,
}
