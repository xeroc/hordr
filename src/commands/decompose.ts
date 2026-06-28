import {Args, Command, Flags} from '@oclif/core'
import process from 'node:process'

import {getBean, getBody, setStatus} from '../beans/client.js'
import {loadConfig} from '../config/loader.js'
import {buildPrompt, resolveHarness, shellQuote} from '../harness/launcher.js'
import {createTab, findAnyPane, paneLabel, runInPane} from '../herdr/pane.js'
import {waitAgentStatus} from '../herdr/wait.js'

/**
 * `hordr decompose <epic>` — stateless (ADR-0009).
 *
 * Spawns a planner pane on develop (no worktree) that reads the epic body +
 * ADRs, creates child task beans via `beans create --parent`, and fills the
 * epic's `## Decomposition` section. After the planner signals done:
 * - epic → completed
 * - children exist with parent=<epic>
 *
 * Idempotent: refuse if Decomposition section already has children listed,
 * unless --force. The planner itself also reads existing children before
 * creating new ones (defensive).
 *
 * No Run state is created. Epics never have a Run (ADR-0009).
 */
export default class Decompose extends Command {
  static args = {epic: Args.string({description: 'Epic bean id to decompose', required: true})}
  static description = 'Stateless: spawn planner on develop to decompose epic into child task beans. Epic → completed.'
  static examples = ['<%= config.bin %> <%= command.id %> hordr-1t2j']
  static flags = {
    force: Flags.boolean({description: 'Re-run even if Decomposition section non-empty'}),
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
    timeoutMs: Flags.integer({default: 600_000, description: 'Max wait for planner (ms)'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Decompose)
    const epicId = args.epic

    // 1. Preconditions: must be an epic in 'todo' status.
    const epic = getBean(epicId)
    if (epic.type !== 'epic') {
      this.error(`${epicId} is type '${epic.type}', expected 'epic'`, {exit: 2})
    }

    if (epic.status !== 'todo') {
      this.error(`${epicId} status is '${epic.status}', expected 'todo'`, {exit: 2})
    }

    // 2. Idempotency: check Decomposition section. If non-empty, refuse (unless --force).
    const body = getBody(epicId)
    const decompHeader = '## Decomposition'
    const decompIdx = body.indexOf(decompHeader)
    if (decompIdx !== -1) {
      const after = body.slice(decompIdx + decompHeader.length)
      // Stop at the next ## section. Pull out the body of Decomposition.
      const nextSection = after.indexOf('\n## ')
      const decompBody = nextSection === -1 ? after : after.slice(0, nextSection)
      const hasChildren = /^-\s+\[[^\]]+\]\s+\S/m.test(decompBody) // any "- [x] id" line
      if (hasChildren && !flags.force) {
        this.error(`${epicId} Decomposition section already has children; re-run with --force to override`, {exit: 2})
      }
    }

    // 4. Spawn planner pane on develop (no worktree). cwd = current dir.
    const config = loadConfig()
    const role = 'planner'
    const harness = resolveHarness(role, config)
    const prompt = buildPrompt(role, config, epicId)
    const label = paneLabel(epicId, role)
    const cwd = process.cwd()

    // Determine the current workspace from HERDR_PANE_ID env (set by herdr).
    const currentPane = process.env.HERDR_PANE_ID
    let workspaceId: string
    if (currentPane && currentPane.includes(':')) {
      workspaceId = currentPane.split(':')[0]!
    } else {
      const anyPane = findAnyPane()
      if (!anyPane) {
        this.error('no herdr panes found — run `hordr decompose` inside a herdr session', {exit: 2})
      }

      workspaceId = anyPane.split(':')[0]!
    }

    // Create a new tab and start the harness with the prompt in one shot.
    const tab = createTab({cwd, label, workspaceId})
    runInPane(tab.pane_id, `${harness} run ${shellQuote(prompt)}`)

    // 5. Wait for the planner to signal done.
    try {
      waitAgentStatus({paneId: tab.pane_id, status: 'done', timeoutMs: flags.timeoutMs})
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.error(`planner did not finish within ${flags.timeoutMs}ms: ${msg}`, {exit: 1})
    }

    // 6. Verify children exist. (We trust the planner wrote the Decomposition
    //    section; this is a sanity check.)
    const refreshedBody = getBody(epicId)
    const refreshedDecompIdx = refreshedBody.indexOf(decompHeader)
    const childCount =
      refreshedDecompIdx === -1
        ? 0
        : (refreshedBody.slice(refreshedDecompIdx).match(/^-\s+\[[ x]\]\s+\S+/gm) ?? []).length

    // 7. Epic → completed.
    setStatus(epicId, 'completed')

    if (flags.json) {
      this.log(JSON.stringify({childCount, epic: epicId, plannerPane: tab.pane_id, status: 'completed'}))
    } else {
      this.log(`decomposed ${epicId}: ${childCount} child task(s) created; epic → completed`)
      this.log(`planner pane: ${tab.pane_id} (label: ${label})`)
    }
  }
}
