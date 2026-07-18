#!/usr/bin/env node
'use strict';

// PM2 lifecycle for the pokeworld dev stack (api + frontend), worktree-aware
// and timestamp-aware. Adapted from lopugit/thingtime#36.
//
//   node scripts/dev-pm2.cjs start [--cwd <repoRoot>]   (npm run pms)
//   node scripts/dev-pm2.cjs stop  [--cwd <repoRoot>]   (npm run pms-stop)
//   node scripts/dev-pm2.cjs list                       (npm run ports:all)
//
// start/stop match on each app's stable base name, so re-stamping the
// clock-time suffix on each start never leaves an orphaned previous process.
// start launches each side through its own ecosystem.config.js (so the very
// files in api/ and frontend/ are what PM2 runs), after first deleting any
// prior app sharing that stable base. --cwd targets any checkout's repo root;
// names/ports derive from that checkout, so it works even for checkouts that
// predate this tooling (the name is assigned here, at pm2-start time).

const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const {
  formatClock,
  isDevAppForBase,
  isDevAppName,
  resolveDevContext
} = require('./worktree-ports.cjs');

// Match the repo convention: resolve the shim on win32.
const PM2_BIN = process.platform === 'win32' ? 'pm2.cmd' : 'pm2';

// The two sides of the stack, started in this order (api first so the frontend
// has something to talk to, though Nuxt tolerates the api coming up after it).
const SIDES = [
  { kind: 'api', subdir: 'api' },
  { kind: 'frontend', subdir: 'frontend' }
];

const parseArgs = (argv) => {
  const args = { command: argv[0], cwd: undefined, cwdProvided: false };

  for (let index = 1; index < argv.length; index++) {
    if (argv[index] === '--cwd') {
      args.cwdProvided = true;
      args.cwd = argv[index + 1];
      index++;
    }
  }

  return args;
};

const pm2 = (args, opts = {}) =>
  execFileSync(PM2_BIN, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    // pm2 jlist embeds each app's full env, so the JSON is large on a busy
    // daemon; the default 1MB buffer overflows (ENOBUFS) and looks like "no apps".
    maxBuffer: 64 * 1024 * 1024,
    // On win32 PM2_BIN is the pm2.cmd shim; modern Node (CVE-2024-27980
    // mitigation) refuses to spawn a .cmd without a shell and throws EINVAL.
    // darwin/linux use the real `pm2` executable, so no shell is involved there.
    shell: process.platform === 'win32',
    ...opts
  });

// throwOnError: mutating callers (start/stop) pass true so a failed pm2 query
// aborts loudly instead of being mistaken for "no apps" — a silent empty list
// would make start() skip cleanup and orphan the previous instance.
const jlist = ({ throwOnError = false } = {}) => {
  let out = '';

  try {
    out = pm2(['jlist']);
  } catch (err) {
    if (throwOnError) {
      throw err;
    }
    process.stderr.write(
      `[pms] warning: could not query pm2 (${err.code || err.message}); treating as no apps\n`
    );
    return [];
  }

  try {
    return JSON.parse(out);
  } catch (err) {
    if (throwOnError) {
      throw new Error(`pm2 jlist returned unparseable output: ${err.message}`);
    }
    return [];
  }
};

// Every app belonging to this stable base (the base, or base + a clock suffix).
const appsForBase = (apps, base) => apps.filter((app) => isDevAppForBase(app.name, base));

const deleteApps = (apps) => {
  for (const app of apps) {
    try {
      pm2(['delete', String(app.pm_id)]);
    } catch {
      // already gone; ignore
    }
  }
};

const resolveRepoRoot = (cwd) => (cwd ? path.resolve(cwd) : path.resolve(__dirname, '..'));

const sideDir = (repoRoot, side) => path.join(repoRoot, side.subdir);
const ecosystemPath = (dir) => path.join(dir, 'ecosystem.config.js');

const start = (repoRoot) => {
  let apps;

  try {
    apps = jlist({ throwOnError: true });
  } catch (err) {
    process.stderr.write(
      `[pms] aborting: could not query pm2 to clean up existing apps (${err.code || err.message}).\n` +
        '[pms] starting now would risk orphaning the previous instance — fix pm2 and retry.\n'
    );
    process.exit(1);
  }

  for (const side of SIDES) {
    const dir = sideDir(repoRoot, side);
    const ecosystem = ecosystemPath(dir);

    if (!existsSync(ecosystem)) {
      process.stderr.write(`[pms] skipping ${side.kind}: no ecosystem.config.js at ${ecosystem}\n`);
      continue;
    }

    const context = resolveDevContext(dir);
    const base = context.bases[side.kind];
    const stale = appsForBase(apps, base);

    if (stale.length) {
      process.stdout.write(
        `[pms] removing ${stale.length} existing ${base}* app(s): ${stale
          .map((app) => app.name)
          .join(', ')}\n`
      );
      deleteApps(stale);
    }

    process.stdout.write(
      `[pms] starting ${context.names[side.kind]} on port ${context.ports[side.kind]} (cwd ${dir})\n`
    );
    // Start through the side's own ecosystem.config.js so PM2 uses exactly that
    // file; it re-evaluates the config (fresh clock suffix) on each start.
    pm2(['start', ecosystem], { stdio: 'inherit' });
  }
};

const stop = (repoRoot) => {
  let apps;

  try {
    apps = jlist({ throwOnError: true });
  } catch (err) {
    process.stderr.write(`[pms] aborting: could not query pm2 (${err.code || err.message}); nothing removed.\n`);
    process.exit(1);
  }

  let removedAny = false;

  for (const side of SIDES) {
    const dir = sideDir(repoRoot, side);
    const base = resolveDevContext(dir).bases[side.kind];
    const matching = appsForBase(apps, base);

    if (matching.length) {
      process.stdout.write(`[pms] removing ${matching.map((app) => app.name).join(', ')}\n`);
      deleteApps(matching);
      removedAny = true;
    }
  }

  if (!removedAny) {
    process.stdout.write('[pms] no running pokeworld dev apps for this checkout\n');
  }
};

// Classify by the kind segment that sits just before the port/clock suffix, not
// by any 'frontend'/'api' token anywhere in the name — otherwise a worktree dir
// whose name contains 'frontend' (e.g. `frontend-rework`) would mislabel its api
// app. Strip the trailing clock suffix, then a trailing numeric port, then test
// the final segment.
const kindOf = (name) => {
  const stripped = name.replace(/-\d{3,4}(?:am|pm)$/, '').replace(/-\d+$/, '');

  return /(?:^|-)frontend$/.test(stripped) ? 'frontend' : /(?:^|-)api$/.test(stripped) ? 'api' : '?';
};

const portOf = (app) => {
  const fromEnv = app.pm2_env && app.pm2_env.env && app.pm2_env.env.PORT;

  if (fromEnv) {
    return String(fromEnv);
  }

  // Fallback: pull the port embedded in a worktree name (…-api-13001-1005am).
  const withoutClock = app.name.replace(/-\d{3,4}(?:am|pm)$/, '');
  const match = withoutClock.match(/(\d+)$/);

  return match ? match[1] : '?';
};

const list = () => {
  const apps = jlist().filter((app) => isDevAppName(app.name));

  if (!apps.length) {
    process.stdout.write('No pokeworld dev apps running under PM2.\n');
    return;
  }

  const rows = apps.map((app) => {
    const env = app.pm2_env || {};
    const started =
      env.status === 'online' && env.pm_uptime ? formatClock(new Date(env.pm_uptime)) : '—';

    return {
      name: app.name,
      kind: kindOf(app.name),
      status: env.status || '?',
      port: portOf(app),
      started,
      cwd: env.pm_cwd || '?'
    };
  });

  const width = (key) => Math.max(key.length, ...rows.map((row) => String(row[key]).length));
  const widths = {
    name: width('name'),
    kind: Math.max(4, width('kind')),
    status: width('status'),
    port: Math.max(4, width('port')),
    started: Math.max(7, width('started'))
  };
  const pad = (value, key) => String(value).padEnd(widths[key]);

  process.stdout.write(
    `${pad('NAME', 'name')}  ${pad('KIND', 'kind')}  ${pad('STATUS', 'status')}  ${pad('PORT', 'port')}  ${pad('STARTED', 'started')}  CWD\n`
  );

  for (const row of rows) {
    process.stdout.write(
      `${pad(row.name, 'name')}  ${pad(row.kind, 'kind')}  ${pad(row.status, 'status')}  ${pad(row.port, 'port')}  ${pad(row.started, 'started')}  ${row.cwd}\n`
    );
  }
};

const { command, cwd, cwdProvided } = parseArgs(process.argv.slice(2));

if (cwdProvided && !cwd) {
  process.stderr.write('[pms] --cwd requires a path to a checkout repo root\n');
  process.exit(1);
}

const repoRoot = resolveRepoRoot(cwd);

if ((command === 'start' || command === 'stop') && cwdProvided && !existsSync(repoRoot)) {
  process.stderr.write(`[pms] --cwd path does not exist: ${repoRoot}\n`);
  process.exit(1);
}

if (command === 'start') {
  start(repoRoot);
} else if (command === 'stop') {
  stop(repoRoot);
} else if (command === 'list') {
  list();
} else {
  process.stderr.write('Usage: dev-pm2.cjs <start|stop|list> [--cwd <repoRoot>]\n');
  process.exit(1);
}
