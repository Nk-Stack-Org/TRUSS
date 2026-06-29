# Overlay an existing project

> Read when: you want to put Truss around a codebase (or project) that already
> exists, instead of starting from scratch.

This is the single end-to-end walkthrough for the overlay flow. It pulls together
what `truss init --overlay`, the `ingest` phase, and the two import guides
([import](../baseline/docs/import.md), [git](../baseline/docs/git.md)) do, so you
don't have to assemble it yourself.

## The model: a workspace *around* your code, code nested under `repo/`

Truss adds a thin Markdown workspace (VISION, state/, decisions, phases) that sits
**around** your project. Your existing code lives **nested** under a single
`repo/` directory inside that workspace:

```
my-project/            ← the Truss workspace (its own git history)
├── .truss/            ← the engine
├── AGENTS.md          ← boot file
├── VISION.md
├── state/             ← phases, decisions, current focus, profile
├── repo/              ← YOUR existing code (its own git history; gitignored here)
└── .gitignore         ← contains `repo/`
```

Why nested and not "Truss files dropped into your repo root"? Because the nesting
is what makes Truss's guarantees *mechanical* rather than a matter of discipline:

- **Clean git separation.** `repo/` is gitignored, so workspace commits (state,
  decisions) and code commits never mix — the two keep separate histories. This is
  the gitignore doing the work, not your discipline.
- **A clear boundary.** The workspace's own files (VISION, state/, docs/) and your
  code never tangle: one is the frame, the other lives under `repo/`. The `ingest`
  phase keeps you read-only over that code (its `forbidden:` list bars refactors
  and deletions) while you import what matters.

A single `repo/` folder is the unit even if you have several codebases: put them
in as `repo/<name>/`. The `.gitignore` rule (`repo/`) and the phase glob
(`repo/**`) stay correct for one repo or five.

## Step 1 — Create the workspace and drop the engine in

```bash
mkdir my-project && cd my-project
git clone --depth 1 https://github.com/Nk-Stack-Org/truss.git /tmp/truss
cp -R /tmp/truss/.truss ./.truss && rm -rf /tmp/truss
```

## Step 2 — Initialise as an overlay, bringing your code in

```bash
# Local code → symlinked into repo/ (keeps its own .git in place):
node .truss/bin/truss.mjs init --overlay --name "My Project" --lang English --repo /path/to/code

# Or a remote → cloned into repo/:
node .truss/bin/truss.mjs init --overlay --name "My Project" --lang English --repo https://github.com/you/code.git
```

`--repo` is optional. Without it, init still sets up the overlay; place the code
yourself afterwards:

```bash
git clone <your-repo-url> repo/      # or: ln -s /path/to/code repo
```

Symlink (local code in place), clone (self-contained), or — only if you need to
*pin* the repo version — a tracked submodule: see the options matrix in
[../baseline/docs/git.md](../baseline/docs/git.md). Symlink and clone keep the two
git histories separate (the overlay default); a submodule deliberately couples
them.

Run with no flags in a terminal to be asked interactively (it offers the `--repo`
step when you choose overlay).

## Step 3 — Check health

```bash
node .truss/bin/truss.mjs doctor
node .truss/bin/truss.mjs status   # if repo/ is checked out, confirm the Branch line
```

Fix any findings before working. A fresh overlay should be clean. Once `repo/`
holds a checkout, `status` shows its branch against the declared one — see
[Branches in repo/](#branches-in-repo) below.

## Step 4 — Start the `ingest` phase

An overlay starts in `ingest`. Point your AI tool at `AGENTS.md` and start the
phase. The ingest phase runs two prompts in order:

1. **`overlay-intake`** — asks *you* the handful of things the code cannot reveal:
   the problem and vision, where the project stands and where it's headed
   (Aussicht), your role and working style, hard constraints, and the biggest open
   questions. These seed `VISION.md`, `state/profile.md`, and `state/current.md`.
2. **`repo-import`** — surveys the code itself (architecture, stack, domains, past
   decisions) and maps it onto the workspace files, leaving the code untouched.

Intake first, then survey: the human framing makes the code survey far more useful.

## Step 5 — Move to `operate` when the import is done

Once the system is mapped and summarised (the `ingest` exit criteria), switch the
phase:

```bash
node .truss/bin/truss.mjs phase operate
```

`truss phase` with no argument lists the phases and shows where you are. From
`operate` you run the ongoing work — features, fixes, iteration — flagging any
significant change as a decision (`D-NNN`).

## Branches in repo/

The nested `repo/` has its own branches, and the branch you're on *is* part of the
current reality — work, decisions, and docs are branch-specific. Truss keeps this
honest without heavy machinery:

- **Declare** the active branch in `state/current.md` `branch:` — the branch the
  current focus belongs to.
- **Verify** at session start: `truss status` reads the live `repo/` branch and
  shows it against the declared one (`✓` or `✗ MISMATCH`). The dashboard's **Git**
  view shows the same, plus the local branch list.
- **Enforce** via the `branch-guard` preference (default `warn`): if `branch:` is
  declared and the checkout is on a *different* branch, the agent STOPs and
  recommends `git -C repo switch <declared>` before doing branch-specific work.
  `strict` additionally requires a `branch:` to be declared whenever a `repo/`
  checkout exists. `doctor`'s SY-05 fires when a `repo/.git` is present but
  `current.md` has no `branch:` — it only checks file existence, never the live
  checkout (that comparison is `truss status`'s job).

The live comparison runs at session start (and whenever you open `status` or the
dashboard); it is not a continuous watcher. If you switch the `repo/` branch
mid-session, re-run `truss status` and update `branch:` to match. For genuinely
parallel work across several branches, use git **worktrees** (one `repo/` checkout
per branch/focus) rather than flipping a single checkout — see
[../baseline/docs/git.md](../baseline/docs/git.md).

## When the overlay's two phases are the wrong fit

The overlay is `ingest → operate`: import an existing system, then run it. If your
"existing project" is actually still an *idea or prototype* — not yet built — the
overlay is too coarse. Use a fresh `init` (core `discover → validate → plan →
build`) or a [phase profile](../phase-profiles/README.md) (`founders-thinking` for
think-it-through work, `software` for build-then-operate) instead. The
`overlay-intake` prompt will flag this if your answers point that way.

## See also

- [import.md](../baseline/docs/import.md) — the file-by-file mapping table.
- [git.md](../baseline/docs/git.md) — overlay git mechanics and commit discipline.
- [cli.md](cli.md) — `init`, `--overlay`, `--repo`, and `phase` reference.
