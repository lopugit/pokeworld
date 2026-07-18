module.exports = {
	apps: [
		{
			name: 'pokeworld-api',
			script: 'modules/index.js',
			watch: ['.', './node'],
			autorestart: false,
			/* eslint-disable camelcase */
			// exec_mode: 'cluster',
			// instances: 2,
			ignore_watch: './db',
			/* eslint-enable camelcase */
			namespace: 'pokeworld',
		},
	],
};
