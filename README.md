# Pokeworld

Two apps:

- **`api/`** — Express API (entry `modules/index.js`, reads `PORT`). Package manager: **pnpm** (`npm` is aliased to pnpm locally).
- **`frontend/`** — Nuxt 2 app. Package manager: **yarn** (a `yarn.lock` is committed and is the source of truth).

## Local dev — worktree-aware PM2 flow

Adapted from [thingtime#36](https://github.com/lopugit/thingtime/pull/36). One command starts
both apps under PM2 with deterministic, per-checkout ports and timestamped app names, so the
main checkout and any number of linked git worktrees can run side by side without colliding.

Run these from the **repo root**:

| Command | What it does |
| --- | --- |
| `npm run pms` | Start/restart this checkout's stack (api + frontend). Deletes any prior app sharing the stable base name, then starts a freshly time-stamped one — **restarts never orphan a process**. This is the blessed lifecycle command. |
| `npm run pms-stop` | Remove this checkout's api + frontend PM2 apps (matches the stable base, any timestamp). |
| `npm run ports` | Print this checkout's derived ports and app names. |
| `npm run ports:all` | List every pokeworld dev app PM2 knows about across worktrees, with kind, status, port, start time, and cwd. |

> **Do not** use a raw `pm2 start`/`pm2 restart` on the ecosystem files: the app name carries a
> clock-time suffix that is re-stamped on each start, so a raw restart spawns a duplicate instead
> of replacing in place. Always go through `npm run pms`.

### Ports & names

- **Main checkout:** frontend `3000`, api `3847`; PM2 apps `pokeworld-frontend` / `pokeworld-api`.
- **Linked worktree:** a deterministic port pair in `13000–18990` (FNV-1a hash of the worktree
  directory name, frontend = base, api = base+1); PM2 apps
  `pw-wt-<worktree>-frontend-<port>` / `pw-wt-<worktree>-api-<port>`.
- Every app name additionally carries a clock-time suffix (e.g. `-1005am`) showing when it was
  last started. The port embedded in the *name* is always the deterministic derived port (the
  stable identity used for cleanup).
- Overrides: `PW_FRONTEND_PORT` / `PW_API_PORT` change the bound ports but not the name/base, so
  start/stop still match and never orphan.
- The frontend is automatically pointed at this checkout's api via `API=http://localhost:<apiPort>/v1`.

Start another checkout's stack from here (name/ports derived from that checkout):

```sh
node scripts/dev-pm2.cjs start --cwd /path/to/other/pokeworld
```

Single source of truth for all of the above: [`scripts/worktree-ports.cjs`](scripts/worktree-ports.cjs)
(consumed by both `ecosystem.config.cjs` files and [`scripts/dev-pm2.cjs`](scripts/dev-pm2.cjs)).

## Install

```sh
# api  (pnpm — `npm` is aliased to pnpm)
cd api && npm i

# frontend  (yarn; --ignore-engines is needed for the committed @nuxt/kit RC on Node 18+)
cd frontend && yarn install --ignore-engines
```

Notes:

- **api / sharp:** `sharp` is pinned to a prebuilt-binary version and `package.json`'s `pnpm.neverBuiltDependencies`
  skips its install script, so nothing compiles against a globally-installed libvips (node-gyp
  fails on Python 3.12+, which removed `distutils`).
- **frontend:** installing with pnpm/npm resolves incompatible newer transitive deps (webpack 5,
  a newer `@nuxt/kit`) that break Nuxt 2 — use yarn so the committed `yarn.lock` is honored.

### api runtime config (`api/.env`)

`PORT` is injected by the PM2 flow. For real block generation the api also needs `MONGODB_*` and
`GOOGLE_API_KEY`; without them the server still boots and `/v1/blocks` returns `503` while
`/v1/blockLatLng` returns "No block found".
