<p align="center">
  <img src=".github/social-preview.png" alt="Truss — a file-based, dependency-free workspace structure for AI coding agents" width="640">
</p>

<!-- TODO(release): replace the banner above with a short product demo GIF
     (an agent using Truss, or the dashboard). The GIF is the strongest
     conversion lever — see planning/LAUNCH-HANDOVER.md in the dev repo. -->

# Truss

**A file-based, dependency-free workspace structure for AI coding agents.**

[![CI](https://github.com/Nk-Stack-Org/truss/actions/workflows/ci.yml/badge.svg)](https://github.com/Nk-Stack-Org/truss/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2020-brightgreen.svg)](https://nodejs.org)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)

> A truss is a light framework of struts that carries the load and holds a
> structure's shape — without being the building itself. Truss does the same for
> a project worked on with AI agents: a thin frame your work rests on, never a
> replacement for it.

AI subscriptions (Claude Code, Cowork, Copilot, Gemini CLI, …) are powerful and
already paid for — but they only reach you through a chat box. Every session
starts from zero, knowledge scatters, and consistency rests on human discipline.
Truss gives an agent a structure it can reliably **boot-strap from**: a small
set of Markdown files that hold the project's context, decisions, and current
focus, plus a tiny CLI that _checks_ the structure but never decides for you.

## Principles

- **Files are the single source of truth.** Everything an agent needs lives in
  plain Markdown you can read, edit, and diff. No database, no lock-in.
- **Scripts check and report — they never decide.** The CLI validates the
  structure and surfaces drift; humans and agents make the calls.
- **Zero dependencies.** Node ≥ 20 is the only requirement. No `npm install`.
- **Tool-agnostic.** Built on the open [AGENTS.md](https://agents.md) convention;
  one-line adapter stubs point Claude, Gemini, Cursor, and Copilot at the same
  boot file.
- **Lightweight context.** The mandatory per-session reading is ~3,000 tokens by
  design — the agent loads everything else on demand.

## How it compares

|                        | **Truss**                                              | Raw `AGENTS.md`                | Heavy agent frameworks                  |
| ---------------------- | ------------------------------------------------------ | ------------------------------ | --------------------------------------- |
| Setup                  | Copy one `.truss/` folder, run `init`                  | Write & maintain a file by hand | Install deps, configure, sometimes a service |
| Dependencies           | None — Node ≥ 20 only                                  | None                           | Many (npm/PyPI, lockfiles)              |
| Memory across sessions | Structured Markdown: context, decisions, phases        | One flat file you curate       | Framework DB or vendor-hosted store     |
| Drift detection        | `doctor` checks the files still agree                  | None                           | Varies                                  |
| Guardrails             | Human-gated phases narrow what the agent may do        | None                           | Often fully autonomous                  |
| Who decides            | Humans & agents; scripts only report                   | You                            | The framework may act on its own        |
| Tool-agnostic          | Yes — AGENTS.md standard (Claude, Gemini, Cursor, Copilot) | Yes                         | Usually tied to one runtime             |
| Lock-in                | None — plain, git-diffable files                       | None                           | Framework + sometimes hosted state      |
| Mandatory context      | ~3k tokens                                             | Whatever you put in the file   | Can be heavy                            |

## Quickstart

Requires **Node ≥ 20**. There is nothing to install.

Truss is a **drop-in**: you copy the `.truss/` engine folder into your
project, then let it scaffold the workspace around itself. This repo is the
_source_ of that folder — don't run `init` inside the clone; copy `.truss/`
into a project of its own (everything else here, README and docs included, is
documentation that stays in the source repo).

**macOS / Linux:**

```bash
# In an empty or existing project directory:

# 1. Drop the engine in — just the .truss/ folder, nothing else.
git clone --depth 1 https://github.com/Nk-Stack-Org/truss.git /tmp/truss
cp -R /tmp/truss/.truss ./.truss && rm -rf /tmp/truss

# 2. Scaffold a fresh workspace next to the engine.
node .truss/bin/truss.mjs init

# 3. Check that the workspace is healthy.
node .truss/bin/truss.mjs doctor

# 4. Point your AI tool at AGENTS.md and ask it to start a session.

# 5. Start the dashboard for a visual overview and control center
node .truss/bin/truss.mjs dashboard
```

**Windows (PowerShell):**

```powershell
# In an empty or existing project directory:

# 1. Drop the engine in.
git clone --depth 1 https://github.com/Nk-Stack-Org/truss.git $env:TEMP\truss
Copy-Item -Recurse $env:TEMP\truss\.truss .\.truss
Remove-Item -Recurse -Force $env:TEMP\truss

# 2. Scaffold a fresh workspace next to the engine.
node .truss/bin/truss.mjs init

# 3. Check that the workspace is healthy.
node .truss/bin/truss.mjs doctor

# 4. Point your AI tool at AGENTS.md and ask it to start a session.

# 5. Start the dashboard for a visual overview and control center
node .truss/bin/truss.mjs dashboard
```

The product documentation travels with the engine under
[`.truss/docs/`](.truss/docs/), so it is available inside any project that
adopted Truss — out of the agent's way and never colliding with your own
`docs/`.

Optional convenience alias:

```bash
# bash / zsh
alias truss='node .truss/bin/truss.mjs'
```

```powershell
# PowerShell
function truss { node .truss/bin/truss.mjs @args }
```

```cmd
rem cmd.exe
doskey truss=node .truss/bin/truss.mjs $*
```

Working on an **existing** codebase? Make a Truss workspace, then bring your code
in under `repo/`:

```bash
node .truss/bin/truss.mjs init --overlay --name "My Project" --lang English \
  --repo /path/to/code            # local path → symlinked, or a URL → cloned
```

This sets up an import-first phase flow (`ingest → operate`), nests your code
under `repo/` (its own git history, gitignored here so commits never mix), and
starts an `ingest` phase that first asks you the context the code can't reveal,
then surveys the code. Full walkthrough:
[.truss/docs/overlay.md](.truss/docs/overlay.md).

## Agent setup

Truss needs the AI tool to have **terminal/command execution** permission in
the workspace (to run `truss doctor`, `render`, `set`) and **read/write
access** to the workspace files. The system stays functional without terminal
access — agents can still read and write the Markdown files — but the CLI
validation and generated blocks will not update automatically.

> **Tip:** Allow auto-run for `node .truss/bin/truss.mjs` commands to get the
> smoothest experience. The CLI never writes outside the workspace.

## Session-health marker

By default, Truss sets a **control word** (`TRUSS`) that the agent prepends
to every response: `` `TRUSS — ` ``. If the marker disappears mid-session, it
signals that context may be degrading — a simple, visible canary for session
health. You can change the word (`truss set control-word MYWORD`), or disable
it entirely (`truss set control-word off`).

## How it works

`init` scaffolds a workspace of Markdown files around the hidden `.truss/`
engine:

```
my-project/
├── AGENTS.md          # boot file — every agent reads this first
├── VISION.md          # problem, idea, principles, constraints
├── README.md          # human onboarding
├── HUMAN-TODOS.md     # things only a human can do (HT-NNN)
├── INBOX.md           # human → agent notes between sessions
├── state/             # current focus, decisions, phases, profile, learnings
├── docs/              # conventions, protocols, git, import
├── context/           # domain files, created on demand
└── .truss/            # the engine (read-only for agents)
```

An agent's loop is always the same: read `AGENTS.md`, load the few state files it
points to, do the work, update `state/current.md`, stop. The CLI's `doctor`
command checks that the files still agree with each other and flags any drift.

A project moves through four **phases** — `discover → validate → plan → build` —
that widen or narrow what an agent is allowed to do at each stage. Phase changes
are deliberately human-only. (Alternative lifecycles ship as
[phase profiles](.truss/phase-profiles/README.md).)

## Commands

Run as `node .truss/bin/truss.mjs <command>` (or `truss <command>` with the
alias). Full reference: [.truss/docs/cli.md](.truss/docs/cli.md).

| Command                                            | What it does                                             |
| -------------------------------------------------- | -------------------------------------------------------- |
| `init [--name --lang --overlay]`                   | scaffold a fresh workspace                               |
| `status`                                           | compact workspace status summary                         |
| `doctor [--gate] [--json] [--html] [--fix-prompt]` | check workspace health                                   |
| `render`                                           | sync the phase block in AGENTS.md from `state/phases.md` |
| `set <key> <value>`                                | change an agent preference                               |
| `map`                                              | regenerate the `state/map.md` domain overview            |
| `dashboard`                                        | start the local web dashboard                            |
| `prompt <save\|reset\|delete> <id>`                | manage custom prompts                                    |
| `help`                                             | list commands                                            |

## Documentation

| Doc                                                                  | Read it for                                                 |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| [.truss/docs/concepts.md](.truss/docs/concepts.md)                   | the model — files, state layer, phases, checks, preferences |
| [.truss/docs/cli.md](.truss/docs/cli.md)                             | command reference and flags                                 |
| [.truss/docs/architecture.md](.truss/docs/architecture.md)           | how the engine is built (contributors)                      |
| [.truss/prompts/README.md](.truss/prompts/README.md)                 | the prompt library                                          |
| [.truss/phase-profiles/README.md](.truss/phase-profiles/README.md)   | alternative lifecycles                                      |
| [.truss/dashboard/README.md](.truss/dashboard/README.md)             | the local dashboard                                         |

## Contributing

Issues and pull requests are welcome. Please keep the **zero-dependency** rule
intact, run the test suite (`cd .truss && node --test`) before opening a PR, and
keep changes small and focused. For larger ideas, open an issue first so we can
agree on the direction.

## Status

`1.0.0-alpha`. The engine and its test suite are stable; the API and file
grammar may still change before `1.0.0`.

## License

[MIT](LICENSE) © 2026 Niklas Korn
