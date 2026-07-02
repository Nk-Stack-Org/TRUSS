// lib/commands/status.mjs — truss status (CLI-Summary)

import path from 'node:path'
import fs from 'node:fs/promises'
import { loadWorkspace } from '../workspace.mjs'
import { branchReport } from '../git.mjs'

export async function runStatus(root, argv) {
  let ctx
  try {
    ctx = await loadWorkspace(root)
  } catch (err) {
    console.error(`truss status: failed to load workspace — ${err.message}`)
    process.exit(2)
  }

  // ── Init guard ──────────────────────────────────────────────────────────
  // Mirror doctor's behaviour: a clear message instead of confusing output.
  if (ctx.agentsMissing) {
    console.log(
      '\nThis folder is not a Truss workspace yet. Start with:\n\n' +
      '  node .truss/bin/truss.mjs init\n\n' +
      '  For an existing project, use:  node .truss/bin/truss.mjs init --overlay\n'
    )
    process.exit(0)
  }

  const projectName = path.basename(root)
  const currentPhaseId = ctx.phases?.frontmatter?.current || 'unknown'
  const ordered = ctx.phases?.ordered || []
  const position = ordered.indexOf(currentPhaseId) + 1
  const total = ordered.length
  
  let doctorSummary = 'unknown (run `truss doctor` to generate)'
  try {
    const docPath = path.join(root, '.truss', 'out', 'doctor.json')
    const docStr = await fs.readFile(docPath, 'utf8')
    const doc = JSON.parse(docStr)
    const s = doc.summary
    const useColor = !!process.stdout.isTTY
    if (s) {
       if ((s.errors || 0) > 0) doctorSummary = useColor ? `\x1b[31m${s.errors} errors\x1b[0m, ${s.warnings} warnings` : `${s.errors} errors, ${s.warnings} warnings`
       else if ((s.warnings || 0) > 0) doctorSummary = useColor ? `\x1b[33m${s.warnings} warnings\x1b[0m, ${s.infos} infos` : `${s.warnings} warnings, ${s.infos} infos`
       else doctorSummary = useColor ? '\x1b[32mAll checks passed\x1b[0m' : 'All checks passed'
    }
  } catch (e) {}

  const useColorGlobal = !!process.stdout.isTTY
  const boldPrefix = useColorGlobal ? '\x1b[1m' : ''
  const boldSuffix = useColorGlobal ? '\x1b[0m' : ''

  console.log(`\n${boldPrefix}${projectName}${boldSuffix} — truss status\n`)
  console.log(`  Phase:   ${currentPhaseId} (${total > 0 ? (position > 0 ? position : '?') : '?'} / ${total})`)
  console.log(`  Health:  ${doctorSummary}`)

  // Branch line — only for an overlay with a readable repo/ checkout. The live
  // git read lives here (and in the dashboard), keeping the doctor checks pure.
  const br = await branchReport(root)
  if (br.present) {
    const red = useColorGlobal ? '\x1b[31m' : '', grn = useColorGlobal ? '\x1b[32m' : '', rst = useColorGlobal ? '\x1b[0m' : ''
    let line
    if (br.info.detached) {
      line = `(detached at ${br.info.sha || '?'})` + (br.declared ? ` ${red}✗ declared '${br.declared}'${rst}` : '')
    } else if (!br.info.ok) {
      line = `repo/ branch unreadable (${br.info.reason})`
    } else if (br.mismatch) {
      line = `${br.info.branch} ${red}✗ MISMATCH — declared '${br.declared}'${rst}; switch with: git -C repo switch ${br.declared}`
    } else if (br.match) {
      line = `${br.info.branch} ${grn}✓${rst} (declared)`
    } else {
      line = `${br.info.branch} (no 'branch:' declared in current.md)`
    }
    console.log(`  Branch:  ${line}`)
  }
  console.log('')
}
