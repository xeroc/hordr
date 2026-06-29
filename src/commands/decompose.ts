import {Args, Command, Flags} from '@oclif/core'
import process from 'node:process'

import {getBean, getBody} from '../beans/client.js'
import {loadConfig} from '../config/loader.js'
import {buildPrompt, resolveHarness, shellQuote} from '../harness/launcher.js'
import {createTab, findAnyPane, paneLabel, runInPane} from '../herdr/pane.js'

/**
 * `hordr decompose <epic>` — stateless, fire-and-forget (ADR-0009).
 *
 * Spawns a planner tab with the prompt and exits. The planner handles
 * everything: creates children, fills Decomposition, marks epic completed.
 * The human watches the tab.
 */
export default class Decompose extends Command {
  static args = {epic: Args.string({description: 'Epic bean id to decompose', required: true})}
  static description = 'Spawn planner to decompose epic into child task beans. Fire-and-forget.'
  static examples = ['<%= config.bin %> <%= command.id %> hordr-1t2j']
  static flags = {
    force: Flags.boolean({description: 'Re-run even if Decomposition section non-empty'}),
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Decompose)
    const epicId = args.epic

    const epic = getBean(epicId)
    if (epic.type !== 'epic') {
      this.error(`${epicId} is type '${epic.type}', expected 'epic'`, {exit: 2})
    }

    if (epic.status !== 'todo') {
      this.error(`${epicId} status is '${epic.status}', expected 'todo'`, {exit: 2})
    }

    // Idempotency: check if Decomposition already has children.
    const body = getBody(epicId)
    const decompHeader = '## Decomposition'
    const decompIdx = body.indexOf(decompHeader)
    if (decompIdx !== -1 && !flags.force) {
      const after = body.slice(decompIdx + decompHeader.length)
      const nextSection = after.indexOf('\n## ')
      const decompBody = nextSection === -1 ? after : after.slice(0, nextSection)
      if (/^-\s+\[[^\]]+\]\s+\S/m.test(decompBody)) {
        this.error(`${epicId} already decomposed; re-run with --force to override`, {exit: 2})
      }
    }

    // Spawn planner tab.
    const config = loadConfig()
    const role = 'planner'
    const harness = resolveHarness(role, config)
    const prompt = buildPrompt(role, config, epicId)
    const label = paneLabel(epicId, role)
    const cwd = process.cwd()

    const currentPane = process.env.HERDR_PANE_ID
    let workspaceId: string
    if (currentPane && currentPane.includes(':')) {
      workspaceId = currentPane.split(':')[0]!
    } else {
      const anyPane = findAnyPane()
      if (!anyPane) {
        this.error('run `hordr decompose` inside a herdr session', {exit: 2})
      }

      workspaceId = anyPane.split(':')[0]!
    }

    const tab = createTab({cwd, label, workspaceId})
    runInPane(tab.pane_id, `${harness} run ${shellQuote(prompt)}`)

    if (flags.json) {
      this.log(JSON.stringify({epic: epicId, plannerPane: tab.pane_id, tab: label}))
    } else {
      this.log(`decompose ${epicId}: planner started in tab ${label}`)
      this.log(`watch the tab — the planner will create children and mark the epic completed`)
    }
  }
}
