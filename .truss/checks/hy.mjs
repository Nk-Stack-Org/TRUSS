// checks/hy.mjs — Hygiene / archive-candidate check (HY-01)
//
// HY-01  I  a workspace content file has been untouched > 90 days (archive candidate).
//
// Scope (deliberate refinement of STRUKTUR.md §8): the real archive candidates are
// the flat root-level *domain* files (the markdown the human or agent adds),
// not the structural template. Nudging to archive AGENTS.md, the state layer or
// package.json would be nonsense — a file ST-01 *requires* to exist can never be an
// archive candidate. So HY-01 looks only at root-level `.md` files that are not part
// of the template, and whitelists VISION.md and docs/ per spec.
//
// mtime-based: a fresh `git clone` resets mtimes, so HY-01 stays silent on new
// instances and only speaks up on genuinely long-lived ones. That is intended —
// HY-01 is a lifecycle hint, not an init check. (Per-file age has no git fallback:
// checks are pure file reads.)

import fs from 'node:fs/promises'
import path from 'node:path'

export const meta = [
  { id: 'HY-01', severity: 'I', title: 'archive candidate: domain file untouched > 90 days', description: 'mtime-based and reset by a fresh clone, so it only fires on long-lived instances' },
]

const STALE_DAYS = 90
const DAY_MS = 86_400_000

// Template files that live at the root and are never archive candidates.
const TEMPLATE_ROOT_FILES = new Set([
  'AGENTS.md', 'README.md', 'VISION.md', 'HUMAN-TODOS.md',
  'CLAUDE.md', 'GEMINI.md', '.cursorrules', 'package.json', '.gitignore',
])

/**
 * @param {import('../lib/workspace.mjs').WorkspaceContext} ctx
 * @returns {Promise<Array>}
 */
export async function run(ctx) {
  const findings = []
  const now = Date.now()

  for (const rel of ctx.diskPaths) {
    if (rel.endsWith('/')) continue          // directories
    if (rel.includes('/')) continue          // domains live flat in the root (§13.4); docs/ is whitelisted by this too
    if (rel.startsWith('.')) continue         // dotfiles / adapter stubs
    if (!rel.endsWith('.md')) continue        // domains are markdown
    if (TEMPLATE_ROOT_FILES.has(rel)) continue

    let stat
    try { stat = await fs.stat(path.join(ctx.root, rel)) }
    catch { continue }

    const days = (now - stat.mtimeMs) / DAY_MS
    if (days > STALE_DAYS) {
      findings.push({
        id: 'HY-01', severity: 'I',
        file: rel,
        message: `${rel} untouched for ${Math.floor(days)} days (> ${STALE_DAYS}) — archive candidate`,
        fix: `If ${rel} is superseded, move it to archive/ with a one-line invalidation note; otherwise touch it or confirm it is still current.`,
      })
    }
  }

  return findings
}
