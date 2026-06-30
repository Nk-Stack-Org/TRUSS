// lib/workspace.mjs — workspace context loader
// Reads the truss workspace and returns a context object used by all checks.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseBlocks, parseAllLinks,
  parseHeadings, parseIdDefinitions, parseIdReferences, parsePhases,
} from './md.mjs'
import { mapMdFilesFromDiskPaths } from './commands/map.mjs'

/**
 * OS / editor junk files that are never part of a Truss workspace and must not
 * surface as ST-02 "untracked file" hints. The walk (and therefore diskPaths)
 * skips these entirely, so doctor stays quiet about them regardless of whether
 * the user's .gitignore lists them — checks never shell out to git (SY-05).
 * `._*` is the AppleDouble sidecar macOS writes onto non-HFS volumes.
 */
const OS_JUNK_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini'])
export function isOsJunk(name) {
  return OS_JUNK_NAMES.has(name) || name.startsWith('._')
}

/**
 * Determine the workspace root from the script's location.
 * truss.mjs lives at <root>/.truss/bin/truss.mjs
 * → root = <root>
 * Callers may pass an explicit root for testing.
 */
export function resolveRoot(scriptUrl) {
  // scriptUrl: file:///path/to/root/.truss/bin/truss.mjs
  // go up 3 levels: bin → .truss → root
  // fileURLToPath (not new URL().pathname) so paths containing spaces or other
  // percent-encoded characters decode correctly — "My Projects" must not become
  // "My%20Projects" (B1).
  return path.resolve(fileURLToPath(scriptUrl), '../../..');
}

/**
 * Safely read a file. Returns { lines, content, stat } or null if missing.
 */
async function readFile(absPath) {
  try {
    const stat = await fs.stat(absPath);
    const content = await fs.readFile(absPath, 'utf8');
    const lines = content.split('\n');
    // Remove trailing empty line if file ends with newline
    if (lines.at(-1) === '') lines.pop();
    return { lines, content, stat };
  } catch {
    return null;
  }
}

/**
 * Parse the §2 structure table from AGENTS.md lines.
 * Finds the table under "## 2 Structure" and returns structured rows.
 *
 * Each row: { rawPath, paths: string[], onDemand: boolean, summary: boolean, owner, purpose }
 *   - paths: one or more resolved paths (split from "pm/ · skills/" etc.)
 *   - onDemand: true if "(on demand)" in rawPath or explicitly on-demand
 *   - summary: true if this is a summary row (contents not individually table-managed)
 */
export function parseStructureTable(lines) {
  // Find the §2 heading
  const sectionStart = lines.findIndex(l => /^## 2\s/.test(l));
  if (sectionStart === -1) return [];

  // Find next ## heading
  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { sectionEnd = i; break; }
  }

  const tableRows = [];
  let tableStarted = false;
  let headerSkipped = false;

  for (let i = sectionStart; i < sectionEnd; i++) {
    const line = lines[i];

    // Separator rows (|---|...|) are part of the table — skip but don't break
    if (/^\|[-: |]+\|$/.test(line.trim())) {
      tableStarted = true;
      continue;
    }

    if (!line.startsWith('|')) {
      if (tableStarted) break; // table ended (non-pipe line after table)
      continue;
    }

    // Parse cells
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    tableStarted = true;

    // Skip the header row (first cell is "Path")
    if (!headerSkipped) {
      headerSkipped = true;
      if (cells[0]?.toLowerCase() === 'path') continue;
    }

    const rawPath = cells[0] || '';
    const owner   = cells[1] || '';
    const purpose = cells[2] || '';

    // Skip template/wildcard rows like `<domain>.md` → `<domain>/`
    if (rawPath.startsWith('`<') || rawPath.includes('<domain>')) {
      tableRows.push({ rawPath, paths: [], onDemand: true, summary: true, owner, purpose, template: true });
      continue;
    }

    const onDemand = rawPath.includes('(on demand)') || purpose.toLowerCase().includes('summary row');

    // Split multi-path rows: "pm/ · skills/ (on demand)"
    const cleanPath = rawPath.replace(/\s*\(on demand\)\s*/g, '').trim();
    const rawPaths = cleanPath
      .split('·')
      .map(p => p.trim())
      // Strip surrounding backticks from inline-code paths
      .map(p => p.replace(/^`|`$/g, ''))
      .filter(Boolean);

    // Summary rows: dirs whose contents are not individually table-managed.
    // rawPaths keep their trailing slash (e.g. "archive/"); SUMMARY_DIRS is the
    // bare-name canonical set, so strip the slash before comparing (C2).
    const summary = onDemand || rawPaths.some(p => SUMMARY_DIRS.has(p.replace(/\/$/, '')));

    tableRows.push({ rawPath, paths: rawPaths, onDemand, summary, owner, purpose });
  }

  return tableRows;
}

// Summary-row directories (§3): their contents are not individually table-managed,
// so doctor only checks existence/non-emptiness, not each child path.
// Canonical form = bare directory names (no trailing slash). Single source of
// truth — consumers that compare slash-suffixed paths strip the slash first (C2).
export const SUMMARY_DIRS = new Set(['archive', 'repo', 'pm', 'skills', 'context', '.truss']);

// Known adapter stubs — part of template, ST-04 checks these.
// Paths are POSIX literals ('/'): they are compared against walk-generated
// rel paths (also '/'), so they must not go through path.join (Windows '\').
export const ADAPTER_STUBS = [
  'CLAUDE.md',
  'GEMINI.md',
  '.cursorrules',
  '.github/copilot-instructions.md',
];

// Expected stub content pattern (single meaningful line pointing to AGENTS.md)
export const STUB_PATTERNS = {
  'CLAUDE.md':   /AGENTS\.md/,
  'GEMINI.md':   /AGENTS\.md/,
  '.cursorrules': /AGENTS\.md/,
  '.github/copilot-instructions.md': /AGENTS\.md/,
};

/**
 * Load the full workspace context.
 *
 * @param {string} root  Absolute path to workspace root
 * @returns {Promise<WorkspaceContext>}
 */
export async function loadWorkspace(root) {
  const resolve = (...p) => path.join(root, ...p);

  // ── Load AGENTS.md ────────────────────────────────────────────────────────
  const agentsRaw = await readFile(resolve('AGENTS.md'));

  let structureTable = [];
  let blocks = new Map();
  let agentsLinks = [];
  let agentsHeadings = [];

  if (agentsRaw) {
    structureTable = parseStructureTable(agentsRaw.lines);
    blocks = parseBlocks(agentsRaw.lines);
    agentsLinks = parseAllLinks(agentsRaw.lines);
    agentsHeadings = parseHeadings(agentsRaw.lines);
  }

  // ── Load state/phases.md ─────────────────────────────────────────────────
  const phasesRaw = await readFile(resolve('state', 'phases.md'));
  let phases = { frontmatter: {}, ordered: [], defs: new Map() };
  if (phasesRaw) {
    phases = { ...parsePhases(phasesRaw.lines), stat: phasesRaw.stat };
  }

  // ── Load all table-managed files ─────────────────────────────────────────
  // Build the set of managed paths from structure table
  const managedRelPaths = new Set();
  for (const row of structureTable) {
    for (const p of row.paths) managedRelPaths.add(p);
  }
  // Always include AGENTS.md
  managedRelPaths.add('AGENTS.md');

  // Also add adapter stubs and .gitignore (always part of template)
  for (const stub of ADAPTER_STUBS) managedRelPaths.add(stub);
  managedRelPaths.add('.gitignore');
  managedRelPaths.add('.prettierrc');
  managedRelPaths.add('.env.example');

  const files = new Map();

  // Load each managed file (skip dirs for content loading)
  for (const rel of managedRelPaths) {
    if (rel.endsWith('/')) continue; // directory entry
    const raw = await readFile(resolve(rel));
    if (raw) {
      files.set(rel, {
        ...raw,
        relPath: rel,
        links: parseAllLinks(raw.lines),
        headings: parseHeadings(raw.lines),
        idDefs: parseIdDefinitions(raw.lines),
        idRefs: parseIdReferences(raw.lines),
      });
    }
  }

  // Add AGENTS.md with extra parsed data
  if (agentsRaw) {
    files.set('AGENTS.md', {
      ...agentsRaw,
      relPath: 'AGENTS.md',
      links: agentsLinks,
      headings: agentsHeadings,
      idDefs: parseIdDefinitions(agentsRaw.lines),
      idRefs: parseIdReferences(agentsRaw.lines),
    });
  }

  // Add phases.md
  if (phasesRaw) {
    files.set('state/phases.md', {
      ...phasesRaw,
      relPath: 'state/phases.md',
      links: parseAllLinks(phasesRaw.lines),
      headings: parseHeadings(phasesRaw.lines),
      idDefs: parseIdDefinitions(phasesRaw.lines),
      idRefs: parseIdReferences(phasesRaw.lines),
    });
  }

  // ── Build global ID maps ──────────────────────────────────────────────────
  const idDefs = new Map();   // id → Array<{ file, line }>
  const idRefs = new Map();   // id → Array<{ file, line }>

  for (const [relPath, fileCtx] of files) {
    for (const { id, line } of fileCtx.idDefs) {
      if (!idDefs.has(id)) idDefs.set(id, []);
      idDefs.get(id).push({ file: relPath, line });
    }
    for (const { id, line } of fileCtx.idRefs) {
      if (!idRefs.has(id)) idRefs.set(id, []);
      idRefs.get(id).push({ file: relPath, line });
    }
  }

  // ── Collect all prompt IDs from prompt library ────────────────────────────
  const promptIds = new Set();
  const promptDirs = [
    resolve('.truss', 'prompts', 'base'),
    resolve('.truss', 'prompts', 'custom'),
  ];
  for (const dir of promptDirs) {
    try {
      const entries = await fs.readdir(dir);
      for (const entry of entries) {
        if (entry.endsWith('.md')) promptIds.add(entry.slice(0, -3));
      }
    } catch { /* dir may not exist */ }
  }

  // ── Walk disk for ST-02 ───────────────────────────────────────────────────
  const diskPaths = await walkWorkspace(root);

  // Markdown-file subset the map covers (ST-07) — derived from the single walk
  // above so doctor does not walk the whole tree a second time.
  const mdFiles = mapMdFilesFromDiskPaths(diskPaths);

  return {
    root,
    structureTable,
    blocks,          // Map<id, BlockInfo> from AGENTS.md
    phases,          // { frontmatter, ordered, defs, stat }
    files,           // Map<relPath, FileContext>
    idDefs,          // Map<id, Array<{file, line}>>
    idRefs,          // Map<id, Array<{file, line}>>
    promptIds,       // Set<string>
    diskPaths,       // Array<string> — all rel paths found on disk (for ST-02)
    mdFiles,         // Array<string> — md files the map covers (for ST-07)
    agentsMissing: !agentsRaw,
  };
}

/**
 * Walk the workspace directory shallowly (matching table depth from §3).
 * Returns relative paths of all files and directories found, excluding:
 *   - .git and its contents
 *   - .truss/out/ contents
 *   - node_modules
 */
async function walkWorkspace(root) {
  const results = [];

  const walkDir = async (dirRel, depth) => {
    const abs = path.join(root, dirRel);
    let entries;
    try { entries = await fs.readdir(abs, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const rel = dirRel ? `${dirRel}/${entry.name}` : entry.name;

      // Always skip
      if (entry.name === 'node_modules') continue;
      if (isOsJunk(entry.name)) continue;   // OS/editor junk (.DS_Store, ._*, …) — never a workspace path
      if (rel === '.git' || rel.startsWith('.git/')) continue;
      if (rel === '.truss/out' || rel.startsWith('.truss/out/')) continue;

      if (entry.isDirectory()) {
        results.push(rel + '/');
        // Recurse fully (node_modules, .git, and out/ are already skipped)
        await walkDir(rel, depth + 1);
      } else if (entry.isFile()) {
        // Only real files — symlinks and other special entries are skipped so this
        // walk's file set matches map's walkMdFiles (isFile()), keeping the bundled
        // ctx.mdFiles byte-identical to the standalone map walk for ST-07.
        results.push(rel);
      }
    }
  };

  await walkDir('', 0);
  return results;
}
