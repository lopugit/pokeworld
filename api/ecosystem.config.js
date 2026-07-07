// Worktree-aware pokeworld API dev app. The name/port/env come from the shared
// single source of truth in ../scripts/worktree-ports.cjs, and the app name
// carries a clock-time suffix (e.g. -1005am) re-stamped on each start.
//
// Prefer `npm run pms` from the repo root (it deletes the previous timestamped
// app and starts a fresh one) over a raw `pm2 start`/`pm2 restart` here — a raw
// restart would spawn a duplicate because the name changes each start.
const { pm2AppConfig } = require('../scripts/worktree-ports.cjs');

module.exports = {
  apps: [pm2AppConfig('api', __dirname)],
};
