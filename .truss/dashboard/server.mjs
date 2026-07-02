import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assembleState } from './lib/state.mjs';
import { branchReport, repoBranchList } from '../lib/git.mjs';
import { checkExistingLock, writeLock, removeLock } from './lib/lock.mjs';

const execFileAsync = promisify(execFile);

let handleAction;
try {
  ({ handleAction } = await import('./lib/actions.mjs'));
} catch {
  handleAction = async () => ({ status: 501, body: { ok: false, error: 'Actions not implemented' } });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

// Files every agent must read each session (AGENTS.md §1 load order).
const MANDATORY = ['AGENTS.md', 'state/current.md', 'VISION.md', 'state/decisions.md', 'state/profile.md'];

// Fixed allowlist for the read-only file viewer (GET /api/file?name=<key>).
const FILE_ALLOWLIST = {
  'human-todos': 'HUMAN-TODOS.md',
  'open-decisions': 'state/open-decisions.md',
  'decisions': 'state/decisions.md',
  'phases': 'state/phases.md',
  'current': 'state/current.md',
};

const TAG_RULES = [
  [/research/, 'research'], [/orchestrat|large-task|multi-agent/, 'orchestration'],
  [/refactor/, 'refactor'], [/migrat|legacy/, 'migration'], [/audit|red-team|review/, 'review'],
  [/recap/, 'recap'], [/kickoff/, 'kickoff'], [/\bplan/, 'planning'], [/build/, 'build'],
  [/discover/, 'discovery'], [/validate/, 'validation'], [/maintenance/, 'maintenance'],
  [/brainstorm|idea/, 'ideation'], [/pre-mortem|impact|gap-analysis/, 'analysis'],
  [/handover|recovery/, 'handover'], [/fix-and-learn/, 'learning'], [/human-todo/, 'human'],
  [/founders|strategy/, 'strategy'], [/ux/, 'ux'], [/gate/, 'gate'], [/custom-prompt|template/, 'template'],
];

function frontmatter(content) {
  const fm = {};
  const m = content.match(/^\uFEFF?---\n([\s\S]*?)\n---/);
  if (m) for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z-]+):\s*(.*)$/i);
    if (kv) fm[kv[1].toLowerCase()] = kv[2].trim();
  }
  return fm;
}

function stripFrontmatter(content) {
  // Remove a leading YAML frontmatter block so copied prompt bodies stay clean.
  return content.replace(/^\uFEFF?---\n[\s\S]*?\n---\n?/, '').replace(/^\s+/, '');
}

function deriveTags(id, fm) {
  const tags = new Set();
  if (fm.tags) fm.tags.replace(/[\[\]"']/g, '').split(/[,\s]+/).filter(Boolean).forEach(t => tags.add(t.toLowerCase()));
  if (fm.phase) tags.add(fm.phase.toLowerCase());
  const hay = `${id}`.toLowerCase();
  for (const [re, tag] of TAG_RULES) if (re.test(hay)) tags.add(tag);
  return [...tags];
}

function send(res, status, obj, type = MIME['.json']) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof obj === 'string' ? obj : JSON.stringify(obj));
}

// Highest port we'll scan up to before giving up when auto-porting.
const MAX_PORT_SCAN = 20;

export async function startDashboard({ root, port = 3741, openBrowser = false, readOnly = false,
                                       autoPort = false, singleInstance = false } = {}) {
  // One dashboard per project: if a live instance is already serving this root,
  // don't start a second — hand the caller the existing url so it can just open it.
  if (singleInstance) {
    const existing = checkExistingLock(root);
    if (existing) return { alreadyRunning: true, url: existing.url, port: existing.port, pid: existing.pid };
  }

  const sessionToken = crypto.randomBytes(32).toString('hex');
  const dir = path.join(root, '.truss', 'dashboard');

  const server = http.createServer(async (req, res) => {
    const host = req.headers.host || '';
    if (!host.startsWith('127.0.0.1:') && !host.startsWith('localhost:') && host !== '127.0.0.1' && host !== 'localhost') {
      return send(res, 403, { error: 'Forbidden host' });
    }
    const url = req.url.split('?')[0];

    try {
      if (req.method === 'GET' && url === '/') {
        let html = await fs.promises.readFile(path.join(dir, 'index.html'), 'utf-8');
        html = html.replace('<head>', `<head>\n  <script>window.__TRUSS_TOKEN__ = ${JSON.stringify(sessionToken)};</script>`);
        return send(res, 200, html, MIME['.html']);
      }

      if (req.method === 'GET' && url === '/api/state') {
        try { return send(res, 200, await assembleState(root)); }
        catch (e) { return send(res, 200, { ok: false, error: e.message }); }
      }

      if (req.method === 'GET' && url === '/api/doctor') {
        try {
          const j = JSON.parse(await fs.promises.readFile(path.join(root, '.truss', 'out', 'doctor.json'), 'utf-8'));
          return send(res, 200, { available: true, ...j });
        } catch { return send(res, 200, { available: false, error: 'Doctor report not found' }); }
      }

      if (req.method === 'POST' && url === '/api/action') {
        const token = req.headers['x-truss-token'];
        if (token !== sessionToken) return send(res, 403, { ok: false, error: 'Invalid or missing token' });
        if (readOnly) return send(res, 403, { ok: false, error: 'Dashboard is in read-only mode' });
        const result = await handleAction(req, { root, token: sessionToken, readOnly });
        return send(res, result.status, result.body);
      }

      if (req.method === 'GET' && url === '/api/git/status') {
        try {
          const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: root, timeout: 8000, maxBuffer: 2 * 1024 * 1024 });
          return send(res, 200, { status: stdout });
        } catch (e) { return send(res, 200, { error: e.message, status: '' }); }
      }

      if (req.method === 'GET' && url === '/api/git/tree') {
        try {
          const { stdout } = await execFileAsync('git', ['log', '--graph', '--oneline', '-n', '25'], { cwd: root, timeout: 8000, maxBuffer: 2 * 1024 * 1024 });
          return send(res, 200, { tree: stdout });
        } catch (e) { return send(res, 200, { error: e.message, tree: '' }); }
      }

      // Overlay repo/ branch awareness: actual checkout vs the declared branch:
      // in state/current.md, plus the local branch list. Read-only; degrades to
      // present:false when there is no overlay checkout. Reuses lib/git.mjs.
      if (req.method === 'GET' && url === '/api/git/branches') {
        try {
          const report = await branchReport(root);
          const list = report.present ? await repoBranchList(path.join(root, 'repo')) : [];
          return send(res, 200, { ...report, list });
        } catch (e) { return send(res, 200, { error: e.message, present: false, list: [] }); }
      }

      if (req.method === 'GET' && url === '/api/prompts') {
        try {
          const baseDir = path.join(root, '.truss', 'prompts', 'base');
          const baseDeDir = path.join(root, '.truss', 'prompts', 'base-de');
          const customDir = path.join(root, '.truss', 'prompts', 'custom');

          // Curated base prompts are driven by the manifest (bilingual). Legacy files not in
          // the manifest are ignored. Body = file content with frontmatter stripped.
          let manifest = { prompts: [], chains: {} };
          try { manifest = JSON.parse(await fs.promises.readFile(path.join(root, '.truss', 'prompts', 'library.json'), 'utf-8')); } catch {}

          const readBody = async (dir, id) => {
            try { return stripFrontmatter(await fs.promises.readFile(path.join(dir, `${id}.md`), 'utf-8')); }
            catch { return null; }
          };

          const base = await Promise.all((manifest.prompts || []).map(async m => {
            const en = await readBody(baseDir, m.id);
            const de = await readBody(baseDeDir, m.id);
            return {
              id: m.id, type: 'base', tags: m.tags || [],
              // V3 schema: two shelves + a generic orchestration wrapper.
              shelf: m.shelf || 'task',
              orchestratable: m.orchestratable || false,
              orchestrationHint: m.orchestrationHint || '',
              wrapper: m.wrapper || false,
              // Legacy V2 fields (chains) kept for backward compatibility; null in V3.
              chain: m.chain || null, step: m.step || null, role: m.role || null,
              recommended: m.recommended || false,
              title: m.title || { en: m.id, de: m.id },
              body: { en: en || '', de: de || en || '' },
            };
          }));

          // Custom prompts: single language (shown in both), tags derived.
          const customFiles = await fs.promises.readdir(customDir).catch(() => []);
          const custom = await Promise.all(
            customFiles.filter(f => f.endsWith('.md') && f !== 'PROMPT-TEMPLATE.md' && f !== 'library.md').map(async f => {
              const raw = await fs.promises.readFile(path.join(customDir, f), 'utf-8');
              const id = f.replace(/\.md$/, '');
              const fm = frontmatter(raw);
              const bodyText = stripFrontmatter(raw);
              const title = fm.title || id;
              return { id, type: 'custom', tags: deriveTags(id, fm), shelf: 'custom',
                orchestratable: false, orchestrationHint: '', wrapper: false,
                chain: null, step: null, role: null,
                title: { en: title, de: title }, body: { en: bodyText, de: bodyText } };
            })
          );

          return send(res, 200, {
            prompts: [...base, ...custom],
            shelves: manifest.shelves || {},
            input: manifest.input || {},
            chains: manifest.chains || {},
          });
        } catch (e) { return send(res, 500, { error: e.message }); }
      }

      // Read-only viewer for a fixed allowlist of workspace markdown files (modals).
      if (req.method === 'GET' && url === '/api/file') {
        const key = (req.url.split('?')[1] || '').match(/(?:^|&)name=([\w-]+)/)?.[1];
        if (!key || !FILE_ALLOWLIST[key]) return send(res, 400, { error: 'Unknown file' });
        try {
          const content = await fs.promises.readFile(path.join(root, FILE_ALLOWLIST[key]), 'utf-8');
          return send(res, 200, { name: FILE_ALLOWLIST[key], content });
        } catch (e) { return send(res, 200, { name: FILE_ALLOWLIST[key], content: '', error: 'Not found' }); }
      }

      if (req.method === 'GET' && url === '/api/context-budget') {
        try {
          let totalChars = 0; const stats = {};
          for (const file of MANDATORY) {
            try {
              const content = await fs.promises.readFile(path.join(root, file), 'utf-8');
              totalChars += content.length;
              stats[file] = { chars: content.length, tokens: Math.round(content.length / 4) };
            } catch { stats[file] = { chars: 0, tokens: 0 }; }
          }
          return send(res, 200, { totalTokens: Math.round(totalChars / 4), totalChars, stats });
        } catch (e) { return send(res, 500, { error: e.message }); }
      }

      if (req.method === 'GET' && url === '/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
        const keepAlive = setInterval(() => res.write(':\n\n'), 25000);
        let t = null;
        const ping = () => { if (t) return; t = setTimeout(() => { t = null; res.write(`data: ${JSON.stringify({ type: 'update' })}\n\n`); }, 300); };
        const watchers = [];
        for (const p of [path.join(root, 'state'), path.join(root, 'HUMAN-TODOS.md'), path.join(root, 'AGENTS.md'), path.join(root, '.truss', 'out', 'doctor.json'), path.join(root, '.truss', 'prompts', 'custom')]) {
          try { if (fs.existsSync(p)) watchers.push(fs.watch(p, { recursive: false }, ping)); } catch {}
        }
        req.on('close', () => { clearInterval(keepAlive); watchers.forEach(w => { try { w.close(); } catch {} }); });
        return;
      }

      // Static assets (under dashboard dir), with traversal guard.
      if (req.method === 'GET') {
        const ext = path.extname(url);
        if (MIME[ext]) {
          const safe = path.normalize(url).replace(/^(\.\.[/\\])+/, '');
          const filePath = path.join(dir, safe);
          if (filePath === dir || filePath.startsWith(dir + path.sep)) {
            try {
              const stat = await fs.promises.stat(filePath);
              if (stat.isFile()) return send(res, 200, await fs.promises.readFile(filePath, 'utf-8'), MIME[ext]);
            } catch {}
          }
        }
      }

      send(res, 404, { error: 'Not Found' });
    } catch (err) {
      console.error(err);
      send(res, 500, { error: 'Internal Server Error' });
    }
  });

  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tryListen = (p) => {
      const onError = (err) => {
        // Auto-port: another project's dashboard (or anything) holds this port —
        // step to the next one. Only when the caller didn't pin an explicit port
        // (autoPort) and we asked for a real port (not 0 = OS-assigned).
        if (err.code === 'EADDRINUSE' && autoPort && p !== 0 && attempt < MAX_PORT_SCAN) {
          attempt++;
          return tryListen(p + 1);
        }
        reject(err);
      };
      server.once('error', onError);
      server.listen(p, '127.0.0.1', () => {
        server.removeListener('error', onError);
        const actualPort = server.address().port;
        const url = `http://127.0.0.1:${actualPort}`;

        if (singleInstance) {
          writeLock(root, { port: actualPort, url });
          const cleanup = () => removeLock(root);
          server.once('close', cleanup);
          process.once('exit', cleanup);
          for (const sig of ['SIGINT', 'SIGTERM']) {
            process.once(sig, () => { cleanup(); process.exit(0); });
          }
        }
        resolve({ server, port: actualPort, url });
      });
    };
    tryListen(port);
  });
}
