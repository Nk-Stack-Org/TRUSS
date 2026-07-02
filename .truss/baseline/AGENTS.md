# AGENTS.md

> Boot file for all AI agents in this workspace (open agents.md standard, tool-agnostic).
> Files are the single source of truth. Scripts only check and report — except the two generated blocks below.
> Read this file fully, then load per §1.

<!-- truss:begin preferences -->
> Rendered by `node .truss/bin/truss.mjs init` — edit via `truss set <key> <value>`, never by hand.
<!-- truss:end preferences -->

<!-- truss:begin phase -->
> Rendered by `node .truss/bin/truss.mjs init`/`render` from `state/phases.md` — edit there, then run `truss render`.
<!-- truss:end phase -->

## 1 Load order

1. This file — fully, every session.
2. `state/current.md` — focus, next actions, blockers.
3. `VISION.md` — once per session.
4. `state/decisions.md` — before making or proposing any decision; if your task touches an open question, also load `state/open-decisions.md`.
5. `state/profile.md` — project language, tools, style.
6. The phase block's read list, then the one domain file your task belongs to (§2).

Stop as soon as your task is unambiguous. Load `docs/*` or other domains only when triggered (§6). Never auto-load: `archive/`, `repo/` history, `.truss/` internals.

## 2 Structure & routing

This table lists core system files. Domain (topic) files live under `context/` and do not need to be registered here (see `state/map.md` for a script-generated map). Owner: H human · A agent · S script.

| Path | Owner | Purpose / what belongs here |
|---|---|---|
| AGENTS.md | A body · S blocks | router, this table, rules |
| README.md | H | human onboarding — not agent context |
| VISION.md | H+A | problem, idea, principles, constraints |
| HUMAN-TODOS.md | A→H | everything only a human can do (HT-NNN); humans check off |
| state/map.md (on demand) | S | auto-generated domain map; read-only |
| state/current.md | A | focus · next (≤5) · blockers · recently done (≤7 days); update every session end |
| state/decisions.md | A | decided decisions D-NNN; supersede, never delete |
| state/open-decisions.md | A | briefings for undecided questions (options + trade-offs); on decision → D-NNN, remove here |
| state/learnings.md | A | repository of systemic agent weaknesses and structural fixes; triggers L-NNN |
| state/phases.md | H pointer · H+A definitions | phase definitions and `current:` pointer |
| state/profile.md | H+A | project name/language, PM method, tools and subscriptions, style and moral notes |
| docs/conventions.md | A | ID schemes, entry grammars, file templates |
| docs/protocols.md | A | session ritual detail, controlled forgetting |
| docs/git.md | A | commit discipline, overlay git mechanics |
| docs/import.md | A | guided import of an existing project |
| .gitignore | S | excludes `.truss/out/`; overlay mode adds `repo/` |
| package.json | S | metadata + `test`/`doctor` script aliases; zero dependencies (GE-14) |
| CLAUDE.md · GEMINI.md · .cursorrules · .github/copilot-instructions.md | S | adapter stubs — one line each pointing to AGENTS.md (GE-10); checked by ST-04 |
| .truss/ | S | engine: scripts, checks, prompts, phase-profiles, dashboard — read-only for agents except `prompts/custom/` |
| archive/ (on demand) | A | superseded material with one-line invalidation note — summary row |
| repo/ (on demand) | H+A | the work product (code repo or overlay target) — summary row, contents not table-managed |
| pm/ · skills/ (on demand) | A | PM files per profile method · agent skills — summary rows |
| context/ (on demand) | H+A | domain (topic) files — one canonical home per topic (`context/<domain>.md`, folder at ~450 lines/5+ themes); summary row, contents mapped in state/map.md |

Routing tie-breakers: behavior/style rule ("always plan first") → state/profile.md · technical convention ("use pattern X") → docs/conventions.md · describes the world → domain file · commits us to act → owning domain · is a decision → state/decisions.md · only a human can do it → HUMAN-TODOS.md · unsure → ask, don't guess.

## 3 Rules

Canonical truth: every operational fact lives in exactly one file; link, never copy.

Language: write all free-text in the `language:` set in state/profile.md — this includes entry titles and bodies (the text after `## OD-NNN — ` / `## D-NNN — `), briefings, focus, learnings, and notes; the dashboard displays this text as-is. Only the machine-parsed skeleton stays English: ID tokens (D-NNN, OD-NNN, …), keys and field labels (`focus:`, `Opened:`, `Leaning:`, `Options:`, `Date:`), and fixed file headings (e.g. profile.md's `## Project`).

Consistency — a change is complete only after its follow-ups:

1. Human decided something → D-NNN entry + update affected files + remove the open-decisions entry.
2. New undecided question that blocks or shapes work → open-decisions briefing.
3. New fact learned → its one canonical file; contradicted content gets an invalidation note.
4. Task finished → remove it from its task list; reflect in state/current.md.
5. Same number/name in several files → fix the canonical file, then grep and sync the copies.
6. Superseded content → archive/ plus one-line invalidation note — never silent drift.
7. Session ends → state/current.md current, loose ends routed.

Quality flags — never knowingly pass a problem by:

- Contradiction found → fix if no human input is needed and say so; otherwise flag via open-decisions or HT entry.
- Suspected wrong or suboptimal → say "X may be wrong because Y", propose a fix; do not silently comply.
- Future trap, not yet blocking → record it where it belongs with a `latent:` note.

Conflict tie-breaker — if two files contradict each other: AGENTS.md §2 table governs structure · state/decisions.md governs decided facts · domain files govern domain content · flag all others via state/open-decisions.md.

IDs: D-NNN decisions · HT-NNN human todos · OD-NNN open decisions · L-NNN learnings · R-NNN risks (state/risks.md once needed). Sequential, never reused. Entry grammars: docs/conventions.md.

## 4 Session protocol

Start: load §1; state what you will do; if the task is unclear, ask before touching files (`clarify` preference). If a `repo/` overlay exists, confirm its checked-out branch matches `state/current.md` `branch:` before working — run `node .truss/bin/truss.mjs status`; resolve a mismatch per `branch-guard`.
During: respect the phase block; flag instead of drifting; if a task would violate `forbidden`, stop and ask (phase-lock).
End — mandatory: update state/current.md (incl. `branch:` if a `repo/` overlay is in use); route loose ends; if `auto-commit: suggest`, propose the commit message. Run `node .truss/bin/truss.mjs doctor` when unsure about workspace health; at phase exits use the procedure below (`doctor --gate`).

Phase exit — when exit criteria appear met (never self-declare a phase change):
1. Run `node .truss/bin/truss.mjs doctor --gate` — collect all exit findings.
2. If `gate-advocate: on` — spawn a review subagent with the phase's gate prompt from `.truss/prompts/`.
3. Write `HT-NNN — Phase [X] exit: [exit criteria status + findings summary]` — include doctor output and advocate findings.
4. STOP. Do not touch `current:` in state/phases.md. The human decides.

## 5 Hard limits

- Never change `current:` in state/phases.md, declare a phase change, or proceed past exit criteria — human act only; use the phase exit procedure (§4).
- Never edit the generated blocks by hand; `truss set` / `truss render` are the only writers.
- Never write or commit secrets/API keys to files tracked by git. Always store them in a local `.env` file (which must be gitignored) and document the required key names in a tracked `.env.example` file.
- Never store the same truth twice, create empty folders, or add per-folder index files.
- Never delete a decision — supersede it.
- Never ignore a known problem — fix it if no human input is needed, otherwise flag it explicitly (open-decisions or HT entry).

## 6 On-demand docs

| Read | when |
|---|---|
| docs/conventions.md | writing your first D-/HT-/R- entry or a new file type this session |
| docs/protocols.md | unsure about session ritual or archiving |
| docs/git.md | before the first commit of the session; anything overlay or git |
| docs/import.md | importing an existing project |
