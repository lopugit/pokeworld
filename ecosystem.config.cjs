const api = require('./api/ecosystem.config.cjs');
const frontend = require('./frontend/ecosystem.config.cjs');

module.exports = {
  apps: [...api.apps, ...frontend.apps],
};
