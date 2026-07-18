module.exports = {
	apps: [
		{
			name: 'pokeworld-map-test',
			namespace: 'pokeworld',
			autorestart: false,
			script: 'node modules/tests/runGenerateMap.js',
			watch: ['modules/tests'],
		},
	],
}
