const api = require('./api/ecosystem.config.js');
const frontend = require('./frontend/ecosystem.config.js');

module.exports = {
  apps: [...api.apps, ...frontend.apps],
};
