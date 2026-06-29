import { html, Component } from '../../vendor/preact-htm.mjs';
import { Card, CardHead, Badge, Button, Icons, copyText } from '../components.js';

const GITHUB_URL = 'https://github.com/Nk-Stack-Org/truss';
const DOCS_URL = `${GITHUB_URL}/tree/main/.truss/docs`;
const ISSUES_URL = `${GITHUB_URL}/issues`;
const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`;

// A fill-in-the-blanks prompt the human hands to their agent right after init to
// bootstrap the workspace (VISION, profile, phase) from their own context. It
// orients the human — the engine's own phase prompts take over from there.
const SETUP_PROMPT =
`I'm starting a project managed with Truss — a file-based workspace for AI agents.
Read AGENTS.md fully first and follow its §1 load order.

Project: <what it is and the problem it solves>
My role & how we work: <your role, decision style, language>
Vision / goal: <what success looks like>
Current phase: <discover · validate · plan · build   (or: ingest, for an existing codebase)>

Please:
1. Fill VISION.md (#Problem first) and state/profile.md from the above — ask me wherever it's thin instead of guessing.
2. Confirm we're in the right phase (run: truss phase) and set state/current.md with the focus and the first concrete next steps.
3. Then start the current phase.
`;

const bugTemplate = (version) =>
`## Bug Report

**Truss version:** ${version || '(unknown)'}
**Node version:** (run \`node -v\`)
**OS:** (e.g. macOS 15.x / Ubuntu 24.04 / Windows 11)

### Steps to reproduce
1. …
2. …
3. …

### Expected behavior
…

### Actual behavior
…

### Additional context
(logs, screenshots, config snippets)
`;

const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return iso; }
};

const code = (t) => html`<code class="mono" style="font-size:12px;padding:2px 6px;background:var(--surface-2);border-radius:5px">${t}</code>`;

// One principle line: bold lead + short gloss.
const principle = (lead, rest) => html`<li style="margin-bottom:7px"><strong>${lead}</strong> ${rest}</li>`;

export class AboutView extends Component {
  render({ state, go }) {
    const version = state?.meta?.version || '—';
    const root = state?.meta?.root || '—';
    const generatedAt = state?.meta?.generatedAt;

    return html`
      <!-- ── Hero ──────────────────────────────────────────────── -->
      <${Card}>
        <div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:28px 12px 20px">
          <div style="font-size:42px;color:var(--accent);margin-bottom:10px;line-height:1">${Icons.Logo()}</div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <h2 style="margin:0;font-size:22px;font-weight:700;letter-spacing:-0.02em">Truss</h2>
            <${Badge} variant="accent">${version}<//>
          </div>
          <p class="muted" style="font-size:13.5px;line-height:1.5;max-width:460px;margin:0 0 20px">
            A light, file-based frame that carries a project's context, decisions, and current focus —
            so an AI agent can boot-strap from it every session instead of starting from zero.
          </p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
            <${Button} variant="primary" icon=${Icons.Star} onClick=${() => window.open(GITHUB_URL, '_blank')}>View on GitHub<//>
            <${Button} icon=${Icons.Doc} onClick=${() => window.open(DOCS_URL, '_blank')}>Documentation<//>
          </div>
        </div>
      <//>

      <!-- ── What is Truss ─────────────────────────────────────── -->
      <${Card}>
        <${CardHead} icon=${Icons.Help} title="What is Truss" />
        <div class="measure" style="font-size:13px;line-height:1.65;color:var(--text)">
          <p style="margin:0 0 12px">
            A truss is a light framework of struts that carries the load and holds a structure's shape —
            without being the building. Truss does the same for a project worked on with AI agents: a thin
            frame of Markdown files your work rests on, plus a tiny zero-dependency CLI that <em>checks</em>
            the structure but never decides for you.
          </p>
          <ul style="margin:0;padding-left:18px">
            ${principle('Files are the source of truth.', 'Everything the agent needs is plain Markdown you can read, edit, and diff.')}
            ${principle('Scripts check and report — never decide.', 'The CLI surfaces drift; humans and agents make the calls.')}
            ${principle('Zero dependencies.', 'Node ≥ 20 is the only requirement. Nothing to install.')}
            ${principle('Tool-agnostic.', 'Built on the open AGENTS.md convention; one boot file for any agent.')}
          </ul>
        </div>
      <//>

      <!-- ── Setup & first steps (the focus) ───────────────────── -->
      <${Card}>
        <${CardHead} icon=${Icons.Play} title="Setup & first steps" />

        <div style="font-size:13px;line-height:1.6;color:var(--text)">
          <p class="measure" style="margin:0 0 16px">Two ways to start — pick by what you already have:</p>

          <div class="grid cols-auto-lg" style="margin-bottom:18px">
            <div style="border:1px solid var(--border);border-radius:10px;padding:14px 16px">
              <div style="font-weight:600;margin-bottom:4px">New project</div>
              <div style="margin-bottom:8px">${code('truss init')}</div>
              <p class="muted" style="margin:0;font-size:12.5px;line-height:1.55">
                Installs the core lifecycle <strong>discover → validate → plan → build</strong>. Use it when
                you're starting something fresh and want to think before you build.
              </p>
            </div>
            <div style="border:1px solid var(--border);border-radius:10px;padding:14px 16px">
              <div style="font-weight:600;margin-bottom:4px">Existing codebase</div>
              <div style="margin-bottom:8px">${code('truss init --overlay --repo <path|url>')}</div>
              <p class="muted" style="margin:0;font-size:12.5px;line-height:1.55">
                Installs the <strong>ingest → operate</strong> flow and nests your code under ${code('repo/')}
                (symlinked or cloned, kept on its own git history). Use it to adopt Truss for code that already exists.
              </p>
            </div>
          </div>

          <div class="measure">
            <div style="font-weight:600;margin:0 0 6px">After init — define the goal with your agent</div>
            <ol style="margin:0 0 16px;padding-left:18px;line-height:1.7">
              <li>Clarify the <strong>vision</strong>: fill ${code('VISION.md')} (the #Problem first).</li>
              <li>Set the <strong>phase</strong> you're actually in — run ${code('truss phase')} to see and switch.</li>
              <li>Hand your agent the <strong>setup prompt</strong> below: describe the project, your role, the
                  vision, and the phase, and let it populate the workspace and propose first steps.</li>
            </ol>
          </div>

          <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
            <div class="row" style="justify-content:space-between;align-items:center;padding:9px 12px;background:var(--surface-2);border-bottom:1px solid var(--border)">
              <span class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em">Setup prompt — fill the &lt;…&gt; and paste to your agent</span>
              <${Button} className="sm" icon=${Icons.Copy} onClick=${() => copyText(SETUP_PROMPT, 'Setup prompt copied')}>Copy<//>
            </div>
            <pre class="mono" style="margin:0;padding:14px 16px;font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word;color:var(--text)">${SETUP_PROMPT}</pre>
          </div>
        </div>
      <//>

      <div class="grid cols-auto-lg">
        <!-- ── Using this dashboard ────────────────────────────── -->
        <${Card} className="card-fill">
          <${CardHead} icon=${Icons.Panel} title="Using this dashboard" />
          <ul class="measure" style="margin:0;padding-left:18px;font-size:12.5px;line-height:1.7;color:var(--text)">
            <li>It's a <strong>read view + control center</strong> over your workspace files — the files stay the source of truth.</li>
            <li>The sidebar switches sections; the header shows phase, doctor health, and a reload control.</li>
            <li>Writes go through the CLI (doctor, render, set, map). With ${code('--read-only')} those actions are disabled.</li>
            <li>Press <strong>Esc</strong> to close any dialog. Data refreshes on reload — it never auto-writes.</li>
          </ul>
        <//>

        <!-- ── Support & feedback ──────────────────────────────── -->
        <${Card} className="card-fill">
          <${CardHead} icon=${Icons.Flag} title="Support & feedback" />
          <p class="muted" style="font-size:12.5px;line-height:1.5;margin:0 0 14px">
            A star helps others find Truss; an issue helps it improve.
          </p>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <${Button} variant="primary" icon=${Icons.Star} onClick=${() => window.open(GITHUB_URL, '_blank')}>Star on GitHub<//>
            <${Button} icon=${Icons.Alert} onClick=${() => window.open(ISSUES_URL, '_blank')}>Open an issue<//>
            <${Button} icon=${Icons.Copy} onClick=${() => copyText(bugTemplate(version), 'Bug template copied')}>Copy bug template<//>
            <${Button} icon=${Icons.Copy} onClick=${() => copyText(GITHUB_URL, 'Share link copied')}>Copy share link<//>
          </div>
        <//>

        <!-- ── System / diagnostics ────────────────────────────── -->
        <${Card} className="card-fill">
          <${CardHead} icon=${Icons.Laptop} title="System">
            <a href=${LICENSE_URL} target="_blank" rel="noopener" style="font-size:12px;color:var(--text-2);text-decoration:none">MIT License ↗</a>
          <//>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px">
            <div>
              <div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px">Version</div>
              <div style="font-size:14px;font-weight:600">${version}</div>
            </div>
            <div>
              <div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px">Generated at</div>
              <div style="font-size:13px">${fmtDate(generatedAt)}</div>
            </div>
            <div style="grid-column:1 / -1">
              <div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px">Workspace root</div>
              <div class="mono" style="font-size:12.5px;word-break:break-all">${root}</div>
            </div>
          </div>
        <//>
      </div>
    `;
  }
}
