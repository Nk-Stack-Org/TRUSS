import fs from 'node:fs';
import path from 'node:path';
import { parseCurrent } from './parsers/current.mjs';
import { parsePhases } from './parsers/phases.mjs';
import { parsePhase } from './parsers/phase.mjs';
import { parseDecisions } from './parsers/decisions.mjs';
import { parseOpenDecisions } from './parsers/open-decisions.mjs';
import { parseHumanTodos } from './parsers/human-todos.mjs';
import { parseProfile } from './parsers/profile.mjs';
import { parseMap } from './parsers/map.mjs';
import { parsePreferences } from './parsers/preferences.mjs';
import { parseSession } from './parsers/sessions.mjs';

// assembleState is async: it reads workspace files via fs.promises so the 30s
// /api/state poll never blocks the Node event loop (matters as the project grows).
export async function assembleState(root) {
  const state = {
    meta: {
      version: '?',
      root,
      generatedAt: new Date().toISOString()
    },
    project: { name: null, language: null, pmMethod: null, tools: [], style: null },
    phase: { current: null, label: null, position: 0, total: 0, purpose: '', behavior: '', allowed: '', forbidden: '', forbiddenGlobs: [], exit: [], prompts: [] },
    phases: [],
    current: { focus: null, next: [], blockers: 'none', recentlyDone: [], updated: null, staleDays: null },
    humanTodos: { open: [], openCount: 0, closedCount: 0, total: 0 },
    decisions: { recent: [], totalCount: 0 },
    openDecisions: [],
    sessions: [],
    map: { categories: [] },
    preferences: [],
    errors: []
  };

  async function tryReadLines(relPath) {
    const fullPath = path.join(root, relPath);
    try {
      const txt = await fs.promises.readFile(fullPath, 'utf8');
      return txt.split(/\r?\n/);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        state.errors.push({ file: relPath, message: err.message });
      }
      return null;
    }
  }

  // Version
  try {
    state.meta.version = (await fs.promises.readFile(path.join(root, '.truss/VERSION'), 'utf8')).trim();
  } catch (e) {
    state.meta.version = '?';
  }

  // Profile (also sets project)
  const profileLines = await tryReadLines('state/profile.md');
  if (profileLines) {
    try {
      state.project = parseProfile(profileLines);
    } catch (err) {
      state.errors.push({ file: 'state/profile.md', message: err.message });
    }
  } else {
    state.project.name = path.basename(root);
  }

  // Phases
  const phasesLines = await tryReadLines('state/phases.md');
  if (phasesLines) {
    try {
      state.phases = parsePhases(phasesLines);
      const phaseParsed = parsePhase(phasesLines);
      if (phaseParsed) {
        state.phase = Object.assign(state.phase, phaseParsed);
      }
    } catch (err) {
      state.errors.push({ file: 'state/phases.md', message: err.message });
    }
  }

  // Current
  const currentLines = await tryReadLines('state/current.md');
  if (currentLines) {
    try {
      state.current = parseCurrent(currentLines);
    } catch (err) {
      state.errors.push({ file: 'state/current.md', message: err.message });
    }
  }

  // Human Todos
  const htLines = await tryReadLines('HUMAN-TODOS.md');
  if (htLines) {
    try {
      state.humanTodos = parseHumanTodos(htLines);
    } catch (err) {
      state.errors.push({ file: 'HUMAN-TODOS.md', message: err.message });
    }
  }

  // Decisions
  const decLines = await tryReadLines('state/decisions.md');
  if (decLines) {
    try {
      state.decisions = parseDecisions(decLines);
    } catch (err) {
      state.errors.push({ file: 'state/decisions.md', message: err.message });
    }
  }

  // Open Decisions
  const odLines = await tryReadLines('state/open-decisions.md');
  if (odLines) {
    try {
      state.openDecisions = parseOpenDecisions(odLines);
    } catch (err) {
      state.errors.push({ file: 'state/open-decisions.md', message: err.message });
    }
  }

  // Map
  const mapLines = await tryReadLines('state/map.md');
  if (mapLines) {
    try {
      state.map = parseMap(mapLines);
    } catch (err) {
      state.errors.push({ file: 'state/map.md', message: err.message });
    }
  }

  // Preferences
  const agentsLines = await tryReadLines('AGENTS.md');
  if (agentsLines) {
    try {
      state.preferences = parsePreferences(agentsLines);
    } catch (err) {
      state.errors.push({ file: 'AGENTS.md', message: err.message });
    }
  }

  // Workspace initialization status — true when AGENTS.md exists (the primary
  // init artifact). The dashboard uses this to show an init-banner and disable
  // views that require an initialized workspace, independent of doctor.json.
  state.initialized = agentsLines !== null;

  // Sessions
  try {
    const sessionsDir = path.join(root, 'sessions');
    let files = [];
    try {
      files = await fs.promises.readdir(sessionsDir);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    const recentFiles = files
      .filter(f => f.match(/^\d{4}-\d{2}-\d{2}/) && f.endsWith('.md'))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 7);
    for (const f of recentFiles) {
      const sLines = await tryReadLines('sessions/' + f);
      if (sLines) {
        try {
          state.sessions.push(parseSession(sLines, f));
        } catch (err) {
          state.errors.push({ file: 'sessions/' + f, message: err.message });
        }
      }
    }
  } catch (err) {
    state.errors.push({ file: 'sessions', message: err.message });
  }

  return state;
}
