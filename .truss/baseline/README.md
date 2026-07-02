# [Project Name]

A project managed with **Truss** — a file-based, dependency-free workspace for AI agents.

## What this is

Files are the single source of truth. AI agents read `AGENTS.md` first, then load context on demand.
Scripts check and report — they never decide.

## Setup

1. **Node ≥ 20** is the only requirement. There are no npm dependencies to install.
2. Grant your AI tool permission to run terminal commands in this workspace.
3. Run a single top-level agent at a time — parallel sessions can collide on `state/current.md`.
4. Optional shell alias:

   ```sh
   alias truss='node .truss/bin/truss.mjs'
   ```

## Getting started

1. `node .truss/bin/truss.mjs doctor` — check workspace health.
2. `node .truss/bin/truss.mjs dashboard` — open the visual control center (optional, see below).
3. Point your AI tool at `AGENTS.md` and start a session.
4. Human tasks go to `HUMAN-TODOS.md`.

## Dashboard

`node .truss/bin/truss.mjs dashboard` starts a local-only web view of the
workspace and opens it in your browser. It's the fastest way to see, at a glance:

- current phase and `doctor` health,
- decisions, current focus, and the structure map,
- the **prompt library** — copy-ready prompts for each phase, including the
  `overlay-onboard` ritual on the Setup shelf.

It runs entirely on your machine (no data leaves it) and is the recommended way
to drive Truss day to day. Stop it with `Ctrl+C`.

## Commands

| Command | What it does |
|---|---|
| `doctor [--gate] [--json] [--fix-prompt]` | check workspace health; `--gate` adds phase-exit checks |
| `dashboard` | start the local web dashboard (visual status + prompt library) |
| `render` | sync the phase block in AGENTS.md from `state/phases.md` |
| `set <key> <value>` | change an agent preference |
| `map` | regenerate the `state/map.md` domain overview |
