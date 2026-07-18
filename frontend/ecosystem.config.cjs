// Worktree-aware pokeworld frontend (Nuxt) dev app. The name/port/env come from
// the shared single source of truth in ../scripts/worktree-ports.cjs; the app
// name carries a clock-time suffix (e.g. -1005am) re-stamped on each start, and
// the API env var is pointed at this checkout's api instance.
//
// Prefer `npm run pms` from the repo root over a raw `pm2 start`/`pm2 restart`
// here — a raw restart would duplicate the app because the name changes each
// start.
const { pm2AppConfig } = require('../scripts/worktree-ports.cjs');

module.exports = {
  apps: [pm2AppConfig('frontend', __dirname)],
};
