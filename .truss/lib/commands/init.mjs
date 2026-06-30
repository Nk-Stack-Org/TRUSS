// lib/commands/init.mjs — `truss init` (WP-INIT).
//
// init configures a FRESH workspace from the core baseline. It never mutates an
// existing live workspace in place (A1/A3): every whole file is written via
// scaffold.writeFileSafe, which skips — never overwrites — existing files.
//
// Argument semantics, step order and write discipline:
//   --name <name>   → profile.md `name:`, VISION/README titles
//   --lang <lang>   → profile.md `language:` (the language the agent answers in)
//   --overlay       → existing-project mode (phases ingest→operate, .gitignore +repo/)
//   --repo <path|url> → (overlay only) bring the existing code in under repo/:
//                       a local path is symlinked, a URL is `git clone`d (best-effort).
//                       The nested repo/ keeps its own git history; the workspace
//                       gitignores it, so the two never share commits.
// Missing required answers + TTY → interactive readline; no TTY → error (no hang).
//
// A project that needs a different lifecycle (software's +operate, the
// founders-thinking concept flow) adopts a phase profile from
// .truss/phase-profiles/ as a human-only phase change after init — see that
// directory's README. init itself only ever scaffolds the core baseline (or the
// overlay); domain (context/) files are created on demand during the work.
//
// Phase source is resolved EXACTLY ONCE (overlay → core-overlay phases; else
// baseline core phases) and state/phases.md is written once, BEFORE
// applyTree(baseline) — so the baseline's own phases.md is harmlessly skipped
// rather than written twice. Substituted skeletons (VISION/README/profile, and the
// overlay .gitignore) are likewise pre-written before applyTree; these expected
// skips are filtered out of the conflict report.
//
// runInit THROWS on a fatal user error (bad args, already-initialised) and RETURNS
// a result object on success — so it is testable in-process. The CLI dispatcher
// (bin/truss.mjs) wraps it to map a throw to exit code 2.

import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import readline from 'node:readline/promises'
import { applyTree, writeFileSafe } from '../scaffold.mjs'
import { writeBlock } from '../writer.mjs'
import { renderPrefsBlock, renderPhaseBlock } from '../render.mjs'
import { parsePhases, parseBlocks } from '../md.mjs'
import { defaultPrefsRows } from '../defaults.mjs'
import { generateMapContent } from './map.mjs'

const execFileP = promisify(execFile)

/** A fatal, user-facing init error (mapped to exit code 2 by the dispatcher). */
export class InitError extends Error {}

const LANG_TOKEN = '[primary language for all agent output — e.g. English, German]'

async function exists(p) {
  try { await fs.access(p); return true } catch { return false }
}

/** Parse argv into { name, lang, overlay, repo }. Supports "--flag v" and "--flag=v". */
export function parseInitArgs(argv) {
  const opts = { name: null, lang: null, overlay: false, repo: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    // Consume the next token as a value; reject a missing value or one that looks
    // like another flag (so `--name --overlay` errors clearly instead of taking
    // '--overlay' as the name).
    const value = (flag) => {
      const v = argv[i + 1]
      if (v === undefined || v.startsWith('-')) throw new InitError(`init: ${flag} expects a value`)
      i++
      return v
    }
    if (a === '--overlay') opts.overlay = true
    else if (a === '--name') opts.name = value('--name')
    else if (a === '--lang') opts.lang = value('--lang')
    else if (a === '--repo') opts.repo = value('--repo')
    else if (a.startsWith('--name=')) opts.name = a.slice('--name='.length)
    else if (a.startsWith('--lang=')) opts.lang = a.slice('--lang='.length)
    else if (a.startsWith('--repo=')) opts.repo = a.slice('--repo='.length)
    else throw new InitError(`init: unknown argument '${a}'. Flags: --name --lang --overlay --repo`)
  }
  if (opts.repo && !opts.overlay) {
    throw new InitError('init: --repo only applies with --overlay (it places existing code under repo/).')
  }
  return opts
}

/** Fill missing answers interactively when stdin is a TTY; otherwise leave them. */
async function resolveInteractive(opts) {
  if (opts.name && opts.lang) return
  if (!process.stdin.isTTY) return
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    if (!opts.name) opts.name = (await rl.question('Project name: ')).trim() || null
    if (!opts.lang) opts.lang = (await rl.question('Primary agent language (e.g. English): ')).trim() || null
    if (!opts.overlay) {
      const o = (await rl.question('Overlay an existing project? (y/N): ')).trim().toLowerCase()
      if (o === 'y' || o === 'yes') opts.overlay = true
    }
    if (opts.overlay && !opts.repo) {
      opts.repo = (await rl.question('Path or URL of the existing code to place under repo/ (blank to skip): ')).trim() || null
    }
  } finally { rl.close() }
}

/** Pre-flight: refuse to init an already-initialised workspace (A1) — never clobber. */
async function assertNotInitialised(root) {
  const agentsPath = path.join(root, 'AGENTS.md')
  let raw
  try { raw = await fs.readFile(agentsPath, 'utf8') } catch { return } // no AGENTS.md → fresh
  const blocks = parseBlocks(raw.split('\n'))
  const phase = blocks.get('phase')
  const rendered = phase?.innerLines?.some(l => l.startsWith('**Phase '))
  if (rendered) {
    throw new InitError(
      'init: this workspace already looks initialised (AGENTS.md has a rendered phase block).\n' +
      "       init never overwrites an existing instance (A1). Use 'truss set' / 'render' instead."
    )
  }
}

/** Resolve the single phase-source content for state/phases.md. */
async function resolvePhasesContent(baselineDir, overlay) {
  if (overlay) return fs.readFile(path.join(baselineDir, 'overlay', 'phases.md'), 'utf8')
  return fs.readFile(path.join(baselineDir, 'state', 'phases.md'), 'utf8')
}

async function gitInitMaybe(root, report) {
  if (process.env.TRUSS_NO_GIT) { report.git = 'skipped (TRUSS_NO_GIT)'; return }
  if (await exists(path.join(root, '.git'))) { report.git = 'existing repo — left as is'; return }
  try {
    await execFileP('git', ['init'], { cwd: root })
    report.git = 'initialised wrapper repo (git init)'
  } catch (err) {
    const msg = err?.message || String(err) || 'unknown error';
    report.git = `git init skipped (${msg.split('\n')[0]}) — workspace is valid without git`;
  }
}

/** A value that looks like a clonable URL rather than a local path. */
function looksLikeUrl(v) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) || /^[^/\s]+@[^/\s]+:/.test(v) // scheme:// or scp-like git@host:path
}

/**
 * (overlay) Bring the existing code in under repo/. A local path is symlinked
 * (keeps its own .git in place); a URL is cloned. Best-effort: a failure is
 * reported but never fatal — the user can place repo/ by hand (docs/import.md).
 * Skipped under TRUSS_NO_GIT for a URL (no network in tests); symlink still runs.
 */
async function placeRepoMaybe(root, repoArg, report) {
  if (!repoArg) return
  const dest = path.join(root, 'repo')
  if (await exists(dest)) { report.repo = `repo/ already exists — left as is`; return }
  try {
    if (looksLikeUrl(repoArg)) {
      if (process.env.TRUSS_NO_GIT) { report.repo = 'clone skipped (TRUSS_NO_GIT)'; return }
      await execFileP('git', ['clone', repoArg, dest])
      report.repo = `cloned ${repoArg} → repo/`
    } else {
      const src = path.resolve(repoArg)
      if (!await exists(src)) { report.repo = `repo path not found: ${repoArg} — place repo/ by hand (docs/import.md)`; return }
      await fs.symlink(src, dest, 'dir')
      report.repo = `symlinked ${repoArg} → repo/`
    }
  } catch (err) {
    const msg = (err?.message || String(err) || 'unknown error').split('\n')[0]
    report.repo = `repo placement skipped (${msg}) — place repo/ by hand (docs/import.md)`
  }
}

/**
 * Configure a fresh workspace. See file header / ADR §4 for the contract.
 * @param {string}   root  Absolute workspace root (from resolveRoot).
 * @param {string[]} argv  Arguments after "init".
 * @returns {Promise<object>}  Result summary (also printed). Throws InitError on fatal error.
 */
export async function runInit(root, argv) {
  const opts = parseInitArgs(argv)
  await resolveInteractive(opts)
  if (!opts.name || !opts.lang) {
    throw new InitError('init: --name and --lang are required (or run in a TTY to answer interactively).')
  }

  const trussDir = path.join(root, '.truss')
  const baselineDir = path.join(trussDir, 'baseline')
  if (!await exists(baselineDir)) {
    throw new InitError(`init: baseline not found at ${baselineDir} — is this a truss clone?`)
  }

  await assertNotInitialised(root)

  // 1. Resolve the phase source content (exactly once).
  const phasesContent = await resolvePhasesContent(baselineDir, opts.overlay)

  // 2. Pre-write resolved/substituted files BEFORE applyTree, so the no-overwrite
  //    guard does not clobber them and we control their content. A pre-write target
  //    that already exists is a REAL conflict (partial re-run / live workspace) and
  //    is reported; the path is also marked expected so the later baseline skip of
  //    the same file is not double-counted.
  const subst = (s) => s.replace(/\[project name\]/gi, opts.name).split(LANG_TOKEN).join(opts.lang)
  const errors = []
  const prewriteConflicts = []
  const expectedSkips = new Set()
  const prewrite = async (rel, content) => {
    const abs = path.join(root, rel)
    expectedSkips.add(abs)
    const r = await writeFileSafe(abs, content)
    if (r.status === 'skipped-exists') prewriteConflicts.push(abs)
    else if (r.status === 'error') errors.push(r)
  }

  await prewrite('state/phases.md', phasesContent)
  for (const rel of ['VISION.md', 'README.md', 'state/profile.md']) {
    const raw = await fs.readFile(path.join(baselineDir, rel), 'utf8')
    await prewrite(rel, subst(raw))
  }
  if (opts.overlay) {
    const gi = await fs.readFile(path.join(baselineDir, '.gitignore'), 'utf8')
    await prewrite('.gitignore', gi.includes('repo/') ? gi : gi.replace(/\s*$/, '') + '\nrepo/\n')
  }

  // 3. Apply the core baseline skeleton (pre-written files are skipped).
  const baseRes = await applyTree(baselineDir, root)
  errors.push(...baseRes.errors)

  // Clean up the overlay directory that was inadvertently copied by applyTree from the baseline
  const overlayPhasePath = path.join(root, 'overlay', 'phases.md')
  if (baseRes.written.includes(overlayPhasePath)) {
    try { await fs.unlink(overlayPhasePath) } catch {}
    try { await fs.rm(path.join(root, 'overlay'), { recursive: true, force: true }) } catch {}
    baseRes.written = baseRes.written.filter(p => p !== overlayPhasePath && p !== path.join(root, 'overlay'))
  }

  // 5. Render the two AGENTS.md blocks (the only block writes — GE-9).
  const agentsMd = path.join(root, 'AGENTS.md')
  await writeBlock(agentsMd, 'preferences', renderPrefsBlock(await defaultPrefsRows(root)))
  const parsed = parsePhases(phasesContent.split('\n'))
  const currentId = parsed.frontmatter.current
  const def = parsed.defs.get(currentId)
  if (!def) throw new InitError(`init: resolved phases.md has no current phase '${currentId}'`)
  const pos = parsed.ordered.indexOf(currentId) + 1
  await writeBlock(agentsMd, 'phase', renderPhaseBlock(def, currentId, pos, parsed.ordered.length))

  // 5b. Generate state/map.md.
  const mapContent = await generateMapContent(root)
  await prewrite('state/map.md', mapContent)

  // 6. git init (best-effort; an instance is valid without git).
  const report = {}
  await gitInitMaybe(root, report)

  // 6b. (overlay) Place the existing code under repo/ if --repo was given.
  await placeRepoMaybe(root, opts.repo, report)

  // 7. Build + print the bundled report.
  const baselineConflicts = baseRes.skipped.filter(p => !expectedSkips.has(p))
  const conflicts = [...prewriteConflicts, ...baselineConflicts]
  const result = {
    name: opts.name, lang: opts.lang, overlay: opts.overlay,
    currentPhase: currentId,
    baselineWritten: baseRes.written.length,
    conflicts, errors,
    git: report.git,
    repo: report.repo ?? null,
  }
  printReport(root, result)
  return result
}

function rel(root, p) { return path.relative(root, p) || p }

function printReport(root, r) {
  const L = []
  L.push('')
  L.push(`truss init — '${r.name}' (${r.lang})${r.overlay ? ', overlay' : ''}`)
  L.push('')
  L.push(`  Baseline files written: ${r.baselineWritten}`)
  L.push(`  Current phase:          ${r.currentPhase}`)
  L.push(`  Git:                    ${r.git}`)
  if (r.repo) L.push(`  Repo:                   ${r.repo}`)
  if (r.conflicts.length) {
    L.push('')
    L.push(`  Skipped (already existed — not overwritten):`)
    for (const p of r.conflicts) L.push(`    - ${rel(root, p)}`)
  }
  if (r.errors.length) {
    L.push('')
    L.push(`  Errors:`)
    for (const e of r.errors) L.push(`    - ${rel(root, e.path)}: ${e.error}`)
  }
  L.push('')
  L.push('  Next steps:')
  // Numbered steps are built in a list so the dashboard step renumbers itself
  // whether or not the overlay "bring code in" step is present.
  const steps = []
  if (r.overlay && !r.repo) {
    steps.push([
      'Bring your existing code in under repo/ (it stays gitignored, keeps its own history):',
      '     git clone <your-repo-url> repo/      # or: ln -s /path/to/code repo',
      '     (or re-run init with --repo <path|url> next time)',
    ])
  }
  if (r.overlay) {
    steps.push(['Run: node .truss/bin/truss.mjs doctor'])
    steps.push([
      'Start the ingest phase — the overlay-onboard prompt asks you the',
      '   few things the code can\'t tell it (vision, status, role), then',
      '   surveys the code and fits the phase model. Move to operate when done.',
    ])
  } else {
    steps.push(['Fill VISION.md (#Problem first) and state/profile.md.'])
    steps.push(['Run: node .truss/bin/truss.mjs doctor'])
  }
  steps.push(['Optional: node .truss/bin/truss.mjs dashboard — visual status, phases, and the prompt library in your browser.'])
  steps.forEach((lines, i) => {
    L.push(`    ${i + 1}. ${lines[0]}`)
    for (const extra of lines.slice(1)) L.push(`    ${extra}`)
  })
  L.push('')
  L.push('  Boot prompt for your AI tool:')
  for (const line of bootPromptLines(r)) L.push(`    ${line}`)
  L.push('')
  console.log(L.join('\n'))
}

/**
 * The copy-paste boot prompt, tailored to how the workspace was initialised.
 * Fresh projects just start the current phase; an overlay points the agent
 * straight at the overlay-onboard ritual (the ingest phase's one prompt), and
 * the no-repo variant defers it until repo/ holds the code.
 */
function bootPromptLines(r) {
  if (!r.overlay) {
    return ['"Read AGENTS.md fully, then follow §1 load order and start the current phase."']
  }
  const ritual =
    'run the overlay-onboard ritual (.truss/prompts/base/overlay-onboard.md, ' +
    'also on the dashboard\'s Setup shelf) to onboard'
  if (!r.repo) {
    return [
      '"Once repo/ holds your code, read AGENTS.md fully, then follow §1 load',
      `  order. You are in the ingest phase: ${ritual} it."`,
    ]
  }
  return [
    '"Read AGENTS.md fully, then follow §1 load order. You are in the ingest',
    `  phase: ${ritual} the existing code under repo/."`,
  ]
}
