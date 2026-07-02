# Truss Dashboard

The Truss Dashboard is the local control center for a file-based Truss
workspace. It gives you a visual view of project status, the active phase,
decisions, the context budget, and any drift warnings — without leaving your
machine.

## Starting it

The dashboard is launched through the Truss CLI:

```bash
truss dashboard
```

This starts a local web server, reachable by default at `http://127.0.0.1:3741`.
Flags: `--port <n>`, `--no-open`, `--read-only` (see
[../docs/cli.md](../docs/cli.md#dashboard)).

## Architecture

The dashboard is a lightweight, self-contained application:

- **Zero npm dependencies.** No external packages, no `node_modules`, no build
  step.
- **Core-lib reuse.** The markdown parsers reuse the Truss core helpers
  (`lib/md.mjs`, `render.mjs`). The dashboard is therefore npm-free but not fully
  isolated from the core — changes to those helpers can affect it.
- **Node/browser built-ins only.** The server uses native Node modules
  (`node:http`, `node:fs`, `node:crypto`); the client uses ES modules.
- **Preact + HTM.** The UI shell is component-based, rendered directly in the
  browser with no compile step.
- **Local-only security model.** The server binds to `127.0.0.1`, checks the
  `Origin`/`Host` header, and guards write actions with a per-start session token
  (`x-truss-token`). It never writes files itself — all mutations go through a
  fixed whitelist of CLI commands. Full model:
  [../docs/architecture.md](../docs/architecture.md#dashboard).
- **Live updates via SSE.** Changes to workspace files (`state/`,
  `HUMAN-TODOS.md`, …) are watched and pushed to connected clients
  over Server-Sent Events, with a polling fallback.
