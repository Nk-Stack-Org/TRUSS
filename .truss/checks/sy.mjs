// checks/sy.mjs — State-layer & entry-grammar checks (SY-01 … SY-05)
//
// SY-01  W  state/current.md missing a required key OR stale (> 7 days)
// SY-02  I  state/open-decisions.md holds an entry open > 30 days (per-entry Opened: date)
// SY-03  W  entry grammar violated (profile / decisions D-NNN / open-decisions OD-NNN / HUMAN-TODOS list form)
// SY-04  —  retired (INBOX.md removed from the baseline; id not reused)
//
// Grammar is grounded in the *baseline* the `init` command renders, which is the
// canonical fresh-instance format (STRUKTUR.md §2.1). Notably current.md uses
// `key:` lines (focus:/next:/…), NOT `## Section` headings — so this module does
// not rely on parseHeadings for current.md.
//
// SY-02 prefers the per-entry `Opened: YYYY-MM-DD` date (open-decisions grammar,
// §11 / docs/conventions.md) so it can age each open question individually. It
// falls back to the file mtime only when no entry carries a parseable date
// (older instances or hand-written notes) — an honest, coarse signal that the
// finding labels as such. No git shell-out: checks stay pure file reads.
//
// SY-05 nudges an overlay to declare its active branch. It is still pure: it only
// reads whether `repo/.git` exists on disk (fs.access) — it never runs git. The
// live branch *comparison* (actual vs declared) is deliberately NOT here; it
// lives in `truss status` and the dashboard so the check engine stays hermetic.

import fs from 'node:fs/promises'
import path from 'node:path'

export const meta = [
  { id: 'SY-01', severity: 'W', title: 'current.md missing a required key or stale (> 7 days)' },
  { id: 'SY-02', severity: 'I', title: 'open-decisions.md holds an entry open > 30 days', description: 'Per-entry Opened: date when present, else file mtime' },
  { id: 'SY-03', severity: 'W', title: 'state entry grammar violated (profile / decisions / open-decisions / learnings / HUMAN-TODOS)' },
  { id: 'SY-05', severity: 'W', title: 'overlay repo/ checkout present but no branch: declared in current.md' },
]

const CURRENT_REQUIRED_KEYS = ['focus', 'next', 'blockers', 'recently-done', 'updated']
const CURRENT_STALE_DAYS    = 7
const OPEN_DECISIONS_DAYS   = 30
const DAY_MS = 86_400_000

const ageInDays = (sinceMs) => (Date.now() - sinceMs) / DAY_MS

/**
 * @param {import('../lib/workspace.mjs').WorkspaceContext} ctx
 * @returns {Promise<Array>}
 */
export async function run(ctx) {
  const findings = []

  // ── SY-01: current.md required keys + staleness ────────────────────────────
  const current = ctx.files.get('state/current.md')
  if (current) {
    const lc = current.lines.map(l => l.toLowerCase())

    const missing = CURRENT_REQUIRED_KEYS.filter(
      k => !lc.some(l => l.startsWith(`${k}:`))
    )
    if (missing.length) {
      findings.push({
        id: 'SY-01', severity: 'W',
        file: 'state/current.md',
        message: `current.md is missing required key${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
        fix: `Add ${missing.map(k => `'${k}:'`).join(', ')} to state/current.md (required keys: ${CURRENT_REQUIRED_KEYS.join(', ')}).`,
      })
    }

    // Staleness: prefer the file's own `updated:` date, fall back to mtime.
    const updatedLine = current.lines.find(l => l.toLowerCase().startsWith('updated:'))
    const dateMatch = updatedLine && updatedLine.match(/(\d{4})-(\d{2})-(\d{2})/)
    let days = null
    let basis = ''
    if (dateMatch) {
      const parsed = Date.parse(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T00:00:00Z`)
      if (!Number.isNaN(parsed)) { days = ageInDays(parsed); basis = `the 'updated:' date (${dateMatch[0]})` }
    }
    if (days === null && current.stat) { days = ageInDays(current.stat.mtimeMs); basis = 'the file mtime (no parseable updated: date)' }

    if (days !== null && days > CURRENT_STALE_DAYS) {
      findings.push({
        id: 'SY-01', severity: 'W',
        file: 'state/current.md',
        message: `current.md looks stale — ${Math.floor(days)} days since ${basis} (> ${CURRENT_STALE_DAYS})`,
        fix: `Refresh state/current.md (focus / next / blockers / recently-done) at the session end and set 'updated:' to today, or confirm it is still current.`,
      })
    }
  }

  // ── SY-02: open-decisions.md staleness — prefer per-entry Opened: date ──────
  const openDec = ctx.files.get('state/open-decisions.md')
  if (openDec) {
    const entries = openDecisionEntries(openDec.lines)
    if (entries.length) {
      const dated = entries.filter(e => e.openedMs !== null)
      if (dated.length) {
        // Real per-entry age: flag the stalest entry that has been open too long.
        const stalest = dated.reduce((a, b) => (a.openedMs <= b.openedMs ? a : b))
        const days = ageInDays(stalest.openedMs)
        if (days > OPEN_DECISIONS_DAYS) {
          findings.push({
            id: 'SY-02', severity: 'I',
            file: 'state/open-decisions.md', line: stalest.line,
            message: `open decision "${stalest.title}" has been open ${Math.floor(days)} days (> ${OPEN_DECISIONS_DAYS})`,
            fix: `Resolve it (→ D-NNN in state/decisions.md, then remove the entry here) or confirm it is still genuinely open.`,
          })
        }
      } else if (openDec.stat) {
        // No parseable Opened: date on any entry → fall back to the coarse file mtime.
        const days = ageInDays(openDec.stat.mtimeMs)
        if (days > OPEN_DECISIONS_DAYS) {
          findings.push({
            id: 'SY-02', severity: 'I',
            file: 'state/open-decisions.md',
            message: `open-decisions.md untouched for ${Math.floor(days)} days (> ${OPEN_DECISIONS_DAYS}) — no entry carries an 'Opened:' date, so this is the file mtime`,
            fix: `Add an 'Opened: YYYY-MM-DD' line per entry for precise per-entry ageing, or review the open decisions now.`,
          })
        }
      }
    }
  }

  // ── SY-03: entry grammars ──────────────────────────────────────────────────
  checkProfileGrammar(ctx.files.get('state/profile.md'), findings)
  checkDecisionsGrammar(ctx.files.get('state/decisions.md'), findings)
  checkOpenDecisionsGrammar(ctx.files.get('state/open-decisions.md'), findings)
  checkLearningsGrammar(ctx.files.get('state/learnings.md'), findings)
  checkHumanTodosGrammar(ctx.files.get('HUMAN-TODOS.md'), findings)

  // ── SY-05: overlay repo/ present but branch: undeclared ────────────────────
  // Pure fs read (no git): if repo/ is a checkout, current.md should declare the
  // branch the work belongs to so `truss status` / branch-guard can compare.
  await checkOverlayBranchDeclared(ctx, findings)

  return findings
}

/** SY-05 — repo/.git exists but current.md has no non-empty `branch:` line. */
async function checkOverlayBranchDeclared(ctx, findings) {
  let isCheckout = false
  try { await fs.access(path.join(ctx.root, 'repo', '.git')); isCheckout = true } catch { /* no overlay checkout */ }
  if (!isCheckout) return

  const current = ctx.files.get('state/current.md')
  const branchLine = current?.lines?.find(l => l.toLowerCase().startsWith('branch:'))
  const declared = branchLine ? branchLine.slice(branchLine.indexOf(':') + 1).trim() : ''
  if (declared) return

  findings.push({
    id: 'SY-05', severity: 'W',
    file: 'state/current.md',
    message: 'repo/ is a git checkout but no active branch is declared (branch:)',
    fix: "Add 'branch: <name>' to state/current.md (the repo/ branch this focus belongs to). `truss status` then flags a mismatch.",
  })
}

// Indices of lines inside fenced code blocks (``` or ~~~). Entry-grammar checks
// skip these so a documented example like `## HT-009 — …` or `## D-001` shown in a
// code block is not mistaken for a real (malformed) entry. Mirrors parseIdReferences.
function fencedLines(lines) {
  const inside = new Set()
  let open = false
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { inside.add(i); open = !open; continue }
    if (open) inside.add(i)
  }
  return inside
}

// ── decisions.md: check heading format only ──
function checkDecisionsGrammar(file, findings) {
  if (!file) return
  const { lines } = file
  const fenced = fencedLines(lines)

  for (let i = 0; i < lines.length; i++) {
    if (fenced.has(i)) continue
    // Only check level-2 headings that aren't the file title.
    if (!/^##\s+\S/.test(lines[i])) continue

    const m = lines[i].match(/^##\s+(D-\d{3})\b/)
    if (!m) {
      findings.push({
        id: 'SY-03', severity: 'W',
        file: 'state/decisions.md', line: i + 1,
        message: `decision entry must be numbered '## D-NNN — title'`,
        fix: `Number the entry '## D-NNN — title'. See docs/conventions.md.`,
      })
    }
  }
}

// ── learnings.md: check heading format only ──
function checkLearningsGrammar(file, findings) {
  if (!file) return
  const { lines } = file
  const fenced = fencedLines(lines)

  for (let i = 0; i < lines.length; i++) {
    if (fenced.has(i)) continue
    // Only check level-2 headings that aren't the file title.
    if (!/^##\s+\S/.test(lines[i])) continue

    const m = lines[i].match(/^##\s+(L-\d{3})\b/)
    if (!m) {
      findings.push({
        id: 'SY-03', severity: 'W',
        file: 'state/learnings.md', line: i + 1,
        message: `learning entry must be numbered '## L-NNN — title'`,
        fix: `Number the entry '## L-NNN — title'. See docs/conventions.md.`,
      })
    }
  }
}

// ── open-decisions.md entries: level-2 headings other than the file title, with
//    their `Opened: YYYY-MM-DD` date when present. Skips fenced examples. Shared
//    by SY-02 (ageing) and informs SY-03 (grammar). ──────────────────────────
function openDecisionEntries(lines) {
  const fenced = fencedLines(lines)
  // The file title is an H1 (`# Open Decisions`); restrict to H1 so a title-less
  // file starting straight with `## OD-001` does not swallow its first entry.
  const titleIdx = lines.findIndex((l, i) => !fenced.has(i) && /^#\s+\S/.test(l))
  const entries = []
  for (let i = 0; i < lines.length; i++) {
    if (fenced.has(i) || i === titleIdx) continue
    if (!/^##\s+\S/.test(lines[i])) continue
    const title = lines[i].replace(/^##\s+/, '').trim()
    let openedMs = null
    for (let j = i + 1; j < lines.length; j++) {
      if (/^##\s/.test(lines[j]) && !fenced.has(j)) break
      const m = lines[j].match(/^\s*opened:\s*(\d{4})-(\d{2})-(\d{2})/i)
      if (m) {
        const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`)
        if (!Number.isNaN(t)) { openedMs = t; break }
      }
    }
    entries.push({ title, line: i + 1, openedMs })
  }
  return entries
}

// ── open-decisions.md: check heading format and Opened date ──
function checkOpenDecisionsGrammar(file, findings) {
  if (!file) return
  const { lines } = file
  const fenced = fencedLines(lines)
  const titleIdx = lines.findIndex((l, i) => !fenced.has(i) && /^#\s+\S/.test(l))

  for (let i = 0; i < lines.length; i++) {
    if (fenced.has(i) || i === titleIdx) continue
    if (!/^##\s+\S/.test(lines[i])) continue        // only level-2 entry headings

    const m = lines[i].match(/^##\s+(OD-\d{3})\b/)
    if (!m) {
      findings.push({
        id: 'SY-03', severity: 'W',
        file: 'state/open-decisions.md', line: i + 1,
        message: `open-decision entry must be numbered '## OD-NNN — title'`,
        fix: `Number the entry '## OD-NNN — title' (sequential, never reused — the OD counter is its own). See docs/conventions.md.`,
      })
      continue
    }

    const body = []
    for (let j = i + 1; j < lines.length; j++) {
      if (/^##\s/.test(lines[j]) && !fenced.has(j)) break
      body.push(lines[j])
    }
    const hasOpened = body.some(l => l.trim().toLowerCase().startsWith('opened:'))
    if (!hasOpened) {
      findings.push({
        id: 'SY-03', severity: 'W',
        file: 'state/open-decisions.md', line: i + 1,
        message: `${m[1]} is missing required field: Opened`,
        fix: `Add 'Opened: YYYY-MM-DD' under ${m[1]} so its age can be tracked accurately.`,
      })
    }
  }
}

// ── HUMAN-TODOS.md: entries must be the checkbox list form ───────────────────
// Canonical (AGENTS.md §2 + STRUKTUR.md §11 + the shipped file):
// `- [ ] HT-NNN — description` (checkbox list form, em-dash separator).
function checkHumanTodosGrammar(file, findings) {
  if (!file) return
  const fenced = fencedLines(file.lines)
  for (let i = 0; i < file.lines.length; i++) {
    if (fenced.has(i)) continue                        // examples inside ``` blocks are not entries
    const line = file.lines[i]
    if (!/\bHT-\d{3}\b/.test(line)) continue           // only lines that define/mention a real HT id
    const t = line.trimStart()
    if (t.startsWith('>') || t.startsWith('<!--')) continue   // doc/comment lines, not entries
    if (!/^[-*]\s+\[[ xX]\]\s+HT-\d{3}\s+—\s+\S/.test(t)) {
      findings.push({
        id: 'SY-03', severity: 'W',
        file: 'HUMAN-TODOS.md', line: i + 1,
        message: `HT entry does not match the list grammar '- [ ] HT-NNN — description'`,
        fix: `Rewrite as '- [ ] HT-NNN — description' (use '[x]' when the human has done it; never delete). See docs/conventions.md.`,
      })
    }
  }
}

// ── profile.md: strict headings for core config ───────────────────────────────
function checkProfileGrammar(file, findings) {
  if (!file) return
  const { lines } = file
  const REQUIRED = ['## Project', '## Tools & subscriptions', '## Style & moral']
  
  const lcLines = lines.map(l => l.trim().toLowerCase().replace(/\s+/g, ' '))
  const missing = REQUIRED.filter(
    key => !lcLines.some(l => l.startsWith(key.toLowerCase()))
  )

  if (missing.length) {
    findings.push({
      id: 'SY-03', severity: 'W',
      file: 'state/profile.md', line: 1,
      message: `profile.md is missing required section${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
      fix: `Restore the missing sections: ${missing.join(', ')} (see STRUKTUR.md §11).`,
    })
  }
}
