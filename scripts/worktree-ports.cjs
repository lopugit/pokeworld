#!/usr/bin/env node
'use strict';

// Single source of truth for local dev ports, the PM2 dev app names, and the
// full PM2 app definitions for the pokeworld stack (api + frontend).
//
// Adapted from the thingtime worktree-ports flow (lopugit/thingtime#36) for
// pokeworld's two-app layout:
//   - the main checkout keeps the canonical ports/names
//     (frontend 3000, api 3847; apps `pokeworld-frontend` / `pokeworld-api`);
//   - a linked git worktree gets a deterministic port pair derived from the
//     worktree directory name and worktree-scoped app names, so several
//     worktree stacks can run beside the main PM2-managed stack without
//     colliding.
// Explicit PW_FRONTEND_PORT / PW_API_PORT env vars always win.
//
// Ports are deterministic (a pure hash of the worktree name) so a stack keeps
// the same ports across restarts. The PM2 *name* additionally carries a
// clock-time suffix (e.g. -1005am) so `pm2 list` shows when each app was last
// started; the stable base (the *Base names) is what start/stop match on for
// cleanup, so re-stamping the time never orphans the previous process.

const { execSync } = require('node:child_process');
const path = require('node:path');

// Canonical main-checkout ports. api reads process.env.PORT (see modules/index.js,
// .env.example -> 3847); Nuxt dev defaults to 3000.
const DEFAULT_PORTS = { frontend: 3000, api: 3847 };
const DEFAULT_NAMES = { frontend: 'pokeworld-frontend', api: 'pokeworld-api' };
const NAMESPACE = 'pokeworld';

// Worktree slots are 10 ports apart inside 13000-18990, clear of the canonical
// dev ports (3000/3847) and common tooling ports.
const WORKTREE_PORT_BASE = 13000;
const WORKTREE_PORT_SLOTS = 600;

const git = (args, cwd) => {
  try {
    return execSync(`git ${args}`, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
};

// The worktree directory basename, or undefined for the main checkout.
const getWorktreeName = (dir = __dirname) => {
  const gitDir = git('rev-parse --git-dir', dir);
  const gitCommonDir = git('rev-parse --git-common-dir', dir);

  if (!gitDir || !gitCommonDir) {
    return undefined;
  }

  // In a linked worktree git-dir (.git/worktrees/<name>) differs from the
  // shared git-common-dir (the main .git); in the main checkout they match.
  if (path.resolve(dir, gitDir) === path.resolve(dir, gitCommonDir)) {
    return undefined;
  }

  const toplevel = git('rev-parse --show-toplevel', dir);

  return toplevel ? path.basename(toplevel) : undefined;
};

// FNV-1a: deterministic, so a worktree keeps the same ports across restarts.
const hashSlot = (name) => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < name.length; index++) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash % WORKTREE_PORT_SLOTS;
};

// frontend on the slot base, api one above it.
const worktreePorts = (worktreeName) => {
  const base = WORKTREE_PORT_BASE + hashSlot(worktreeName) * 10;

  return { frontend: base, api: base + 1 };
};

const envPort = (name) => {
  const value = Number.parseInt(process.env[name] ?? '', 10);

  return Number.isInteger(value) && value > 0 ? value : undefined;
};

const pad2 = (value) => String(value).padStart(2, '0');

// 12-hour clock, colon-free so it is safe in PM2 log filenames: 10:05 -> 1005am.
const formatClock = (now) => {
  const minutes = now.getMinutes();
  const meridiem = now.getHours() < 12 ? 'am' : 'pm';
  const hour12 = now.getHours() % 12 || 12;

  return `${pad2(hour12)}${pad2(minutes)}${meridiem}`;
};

// The clock-time suffix shape appended to every dev app name.
const CLOCK_SUFFIX = /-\d{3,4}(?:am|pm)$/;

// A pokeworld dev app by name (for display/listing) — prefix match so it still
// matches once the clock suffix is appended. Deliberately requires `api` or
// `frontend` after `pokeworld-` so the sibling `pokeworld-map-test` app is NOT
// treated as a dev stack app (start/stop/list leave it alone).
const isDevAppName = (name) =>
  typeof name === 'string' && /^(?:pokeworld-(?:api|frontend)|pw-wt-)/.test(name);

// Whether a running app belongs to a specific stable base — the base itself,
// or the base plus exactly a clock suffix. Anchoring on the clock shape (not a
// bare `-` prefix) stops a worktree base from matching a sibling whose
// directory name merely starts with it (e.g. `foo` vs `foo-11500-bar`).
const isDevAppForBase = (name, base) =>
  name === base ||
  (name.startsWith(`${base}-`) && /^\d{3,4}(?:am|pm)$/.test(name.slice(base.length + 1)));

const resolveDevContext = (dir = __dirname, opts = {}) => {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const worktree = getWorktreeName(dir);
  const defaults = worktree ? worktreePorts(worktree) : DEFAULT_PORTS;
  const ports = {
    frontend: envPort('PW_FRONTEND_PORT') ?? defaults.frontend,
    api: envPort('PW_API_PORT') ?? defaults.api
  };
  // The bases are the stable identity used for start/stop cleanup, so they must
  // be a pure function of the worktree name — use the deterministic default
  // ports, never the PW_*-overridable ports (which would let an override orphan
  // the previous app instead of replacing it).
  const bases = worktree
    ? {
        frontend: `pw-wt-${worktree}-frontend-${defaults.frontend}`,
        api: `pw-wt-${worktree}-api-${defaults.api}`
      }
    : { ...DEFAULT_NAMES };
  const suffix = formatClock(now);

  return {
    worktree,
    ports,
    bases,
    names: {
      frontend: `${bases.frontend}-${suffix}`,
      api: `${bases.api}-${suffix}`
    }
  };
};

// The API base URL the frontend should talk to. The api serves its routes under
// /v1 (see modules/index.js: /v1/blocks, /v1/blockLatLng) and Game.vue calls
// `process.env.API + '/blocks'`, so API must include the /v1 prefix.
const apiUrl = (context) => `http://localhost:${context.ports.api}/v1`;

// The full PM2 app definition for one side of the stack, shared by that side's
// ecosystem.config.cjs and by dev-pm2.cjs so there is one source of truth for
// how each dev app is launched. `kind` is 'api' or 'frontend'; `projectDir` is
// that package's directory (the __dirname of its ecosystem.config.cjs).
const pm2AppConfig = (kind, projectDir, opts = {}) => {
  const context = resolveDevContext(projectDir, opts);

  if (kind === 'api') {
    return {
      name: context.names.api,
      namespace: NAMESPACE,
      script: 'modules/index.js',
      cwd: projectDir,
      autorestart: false,
      watch: ['modules'],
      // db/tiles are generated at runtime; assets + deps must not trigger restarts.
      ignore_watch: ['node_modules', 'assets', 'db', 'modules/tests'],
      env: {
        // api reads process.env.PORT; dotenv (.env) does not override an
        // already-set env var, so this wins over any committed .env.
        PORT: String(context.ports.api)
      }
    };
  }

  if (kind === 'frontend') {
    return {
      name: context.names.frontend,
      namespace: NAMESPACE,
      // Run nuxt via npm's `dev` script. autorestart:false + no watch: Nuxt has
      // its own HMR, so PM2 should not restart it on every edit.
      script: 'npm',
      args: 'run dev',
      cwd: projectDir,
      autorestart: false,
      env: {
        PORT: String(context.ports.frontend),
        // Point the browser client at this worktree's api instance.
        API: apiUrl(context),
        // Nuxt 2 rides webpack 4; Node 17+ needs the legacy OpenSSL provider or
        // the build dies with ERR_OSSL_EVP_UNSUPPORTED.
        NODE_OPTIONS: '--openssl-legacy-provider'
      }
    };
  }

  throw new Error(`pm2AppConfig: unknown kind ${JSON.stringify(kind)} (expected 'api' or 'frontend')`);
};

module.exports = {
  CLOCK_SUFFIX,
  DEFAULT_NAMES,
  DEFAULT_PORTS,
  NAMESPACE,
  apiUrl,
  formatClock,
  getWorktreeName,
  isDevAppForBase,
  isDevAppName,
  pm2AppConfig,
  resolveDevContext
};

if (require.main === module) {
  const context = resolveDevContext(process.cwd());
  const flag = process.argv[2];
  const output =
    flag === '--frontend-port'
      ? String(context.ports.frontend)
      : flag === '--api-port'
        ? String(context.ports.api)
        : flag === '--frontend-name'
          ? context.names.frontend
          : flag === '--api-name'
            ? context.names.api
            : flag === '--api-url'
              ? apiUrl(context)
              : JSON.stringify(context, null, 2);

  process.stdout.write(`${output}\n`);
}
