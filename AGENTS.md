# Pokeworld — agent instructions

Read `CLAUDE.md` in this directory and follow it. In particular, the
**multi-agent main-branch sync protocol** there is mandatory for every AI agent
(Codex, Claude, or other) doing local or worktree work in this repo: branch off
`main`, merge `origin/main` into your branch at least every 10 minutes,
resolve conflicts immediately, and merge verified work back into `main` and
push on the same cadence so all agents share the same scope.
