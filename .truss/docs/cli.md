# CLI reference

Every command runs through the dispatcher:

```bash
node .truss/bin/truss.mjs <command> [flags]
```

The examples below assume the alias `truss='node .truss/bin/truss.mjs'`.
The CLI has **zero dependencies** and needs only Node ≥ 20.

The command surface is defined once in `.truss/lib/command-meta.mjs`, which
drives both `truss help` and the dashboard's action whitelist — so the help
text can never drift from what is actually dispatched.

---

## `init`

Scaffold a **fresh** workspace from the core baseline. It only ever *writes*
whole files that don't exist yet — it never overwrites a live workspace, so it is
safe to re-run.

```bash
truss init --name "My Project" --lang English
```

| Flag | Meaning |
|---|---|
| `--name <name>` | project name (used in `profile.md`, VISION/README titles); skips the interactive prompt |
| `--lang <lang>` | primary language for agent output, e.g. `English`, `German` |
| `--overlay` | existing-project mode: installs the `ingest → operate` phase flow and adds `repo/` to `.gitignore` |
| `--repo <path\|url>` | (overlay only) bring the existing code in under `repo/`: a local path is symlinked, a URL is `git clone`d. Best-effort — a failure is reported, never fatal |

With no flags in a TTY, `init` asks interactively. With no TTY and missing
required answers it errors instead of hanging.

For the full existing-project flow, see
[overlay.md](overlay.md). Switching to a different lifecycle (e.g. the `software`
profile's `operate` phase) is a human-only phase change made *after* init — see
[../phase-profiles/README.md](../phase-profiles/README.md).

---

## `status`

Print a compact, read-only summary of the workspace — current phase and health.
The quickest "where am I?" command. In an overlay with a `repo/`
checkout it also prints a **Branch** line: the live `repo/` branch against the
`branch:` declared in `state/current.md` (`✓` when they match, `✗ MISMATCH` with a
switch hint when they don't). This is the live branch check — `doctor` itself
stays purely file-based and never reads the live branch (see `branch-guard`).

```bash
truss status
```

---

## `doctor`

Check workspace health. Runs every check family (see
[concepts.md §6](concepts.md#6-checks-the-doctor)) and prints findings grouped by
severity. **Read-only** — it never edits your files.

```bash
truss doctor              # human-readable report
truss doctor --gate       # also run phase-exit (PH-04) checks
truss doctor --json       # write .truss/out/doctor.json (for tooling)
truss doctor --html       # write .truss/out/doctor.html (static report)
truss doctor --fix-prompt # print a copyable remediation prompt for an agent
```

**Exit codes** (useful in CI): `0` clean · `1` warnings only · `2` at least one
error.

---

## `render`

Regenerate the phase block inside `AGENTS.md` from `state/phases.md`. Run it after
any edit to the phase definitions or the `current:` pointer. This is the only
sanctioned writer of that block; editing it by hand is a `BL` error.

```bash
truss render
```

---

## `phase`

Show the phases, or set the current one. With no argument it lists every defined
phase and marks where you are. With an `<id>` it validates the id against
`state/phases.md`, updates the `current:` pointer, and re-renders the `AGENTS.md`
phase block — the supported alternative to hand-editing `current:` and remembering
to `render`.

```bash
truss phase            # list phases, show the current one
truss phase operate    # switch to a defined phase and re-render
```

Phase changes stay **human-only** (AGENTS.md §4): this is your deliberate
set/override, not something the agent runs to self-advance. It does not bypass the
phase-exit ritual — confirm the previous phase's exit criteria were met first.

---

## `set`

Change one agent preference. The value is validated against the catalogue before
the preferences block in `AGENTS.md` is rewritten.

```bash
truss set criticality high
truss set response-style compact
```

### Preference keys

| Key | Values | Default |
|---|---|---|
| `orchestration` | low · medium · high | medium |
| `criticality` | low · medium · high | high |
| `clarify` | ask · infer | ask |
| `input-trust` | open · medium · critical | medium |
| `research-agent` | off · on | on |
| `review-agent` | off · on | on |
| `source-citation` | off · on | off |
| `work-style` | off · elegant · systematic | elegant |
| `auto-commit` | off · suggest · on | suggest |
| `post-task-check` | off · inline · subagent | off |
| `gate-advocate` | off · on | on |
| `phase-lock` | off · advisory | advisory |
| `branch-guard` | off · warn · strict | warn |
| `response-style` | normal · compact · maxcompact | normal |
| `control-word` | `off` or any short word | TRUSS |

Each non-omitted preference renders one directive line into the `AGENTS.md`
preferences block. `work-style: off` and `control-word: off` render no line.

---

## `map`

Regenerate `state/map.md`, the auto-generated overview of the domain files under
`context/`. Read-only for your content; it only rewrites the map file.

```bash
truss map
```

---

## `dashboard`

Start the local web dashboard — a browser view of status, phases, decisions, the
context budget, and drift warnings. Binds to `127.0.0.1` only.

```bash
truss dashboard
```

| Flag | Meaning |
|---|---|
| `--port <n>` | port to listen on (default `3741`) |
| `--no-open` | don't open a browser automatically |
| `--read-only` | start in read-only mode (all write endpoints disabled) |

See [architecture.md §Dashboard](architecture.md#dashboard) for the security
model.

---

## `prompt`

Manage user-created custom prompts (written to `.truss/prompts/custom/`). Mostly
driven by the dashboard, but available directly:

```bash
truss prompt save <id> [content]   # write custom/<id>.md
truss prompt reset <id>            # copy base/<id>.md → custom/<id>-custom.md
truss prompt delete <id>           # remove custom/<id>.md
```

---

## `help`

List all commands with a one-line summary.

```bash
truss help
```
