# Protocols

> Load when: unsure about session ritual or archiving procedure.
> Defines the session ritual and controlled forgetting.

## Session ritual

### Start

1. Load files per AGENTS.md §1 (load order).
2. State what you will do — one sentence. If the task is unclear, ask (`clarify` preference).
3. Read state/current.md. If the focus is stale or the next list is empty, surface this and ask.
4. If a `repo/` overlay exists, confirm its checked-out branch matches `current.md` `branch:` (run `truss status`, or `git -C repo symbolic-ref --short HEAD`). On a mismatch, apply the `branch-guard` preference: with `warn` (default) or `strict`, STOP, tell the human, and recommend `git -C repo switch <declared>` before doing branch-specific work; with `off`, just note it and continue.

### During

- Respect the phase block (allowed/forbidden). If a task would violate `forbidden`, state the conflict and ask before proceeding (`phase-lock` preference).
- Flag instead of drifting: if something is wrong or suboptimal, name it.
- Route facts, decisions, and todos as they arise — don't batch at the end.

### End (mandatory, in order)

1. Update state/current.md: current focus, next ≤5, blockers, recently-done (≤7 days). With a `repo/` overlay, set `branch:` to the branch the work belongs to.
2. Route any loose ends: unresolved open questions → open-decisions, unresolved todos → HUMAN-TODOS.md.
3. Use `node .truss/bin/truss.mjs doctor` manually when unsure or at phase exits.
4. If `auto-commit: suggest`, propose a commit message: `<area>: <action> — <context>`.

## Controlled forgetting

The goal: keep the active workspace scannable in one pass. Archive is not deletion — it's relocation with a pointer.

**When to archive:**

- A domain file exceeds ~500 lines → split the oldest / least-active section to `archive/<domain>/<topic>.md`
- A decision is superseded (see D-NNN grammar in docs/conventions.md) → the old entry stays in state/decisions.md with `superseded-by` status; no archiving needed
- A task is fully done and has been in recently-done for >14 days → remove from state/current.md (it's in git history)

**How to archive:**

1. Move the content to `archive/<path>`.
2. In the original location, add a one-line invalidation note: `> Archived to archive/<path> on YYYY-MM-DD — [reason].`
3. Update the §2 table in AGENTS.md if the original file is removed.

**Never silently drop content.** If it existed and mattered, the trace must remain.

## Latent notes

When you spot a future problem that isn't yet blocking, record it with a `latent:` prefix in the relevant file:

```
latent: [YYYY-MM-DD] this approach may break at scale because [reason] — revisit before build phase.
```

Latent notes are not action items. They are traps marked for future sessions.
