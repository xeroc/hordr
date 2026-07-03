/**
 * Harness resolution and agent launching.
 *
 * buildPrompt composes persona + bean body. The agent gets the full bean
 * content to interpret; no section extraction. Fire-and-forget: the agent
 * works in its pane, hordr does not wait.
 */
import {execFileSync} from 'node:child_process'

import {getBody} from '../beans/client.js'
import {loadConfig} from '../config/loader.js'
import {type HordrConfig} from '../config/schema.js'
import {createTab, paneLabel as makePaneLabel, runInPane} from '../herdr/pane.js'

export class HarnessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HarnessError'
  }
}

// --- test seam ---
export type WhichFn = (binary: string) => boolean

const defaultWhich: WhichFn = (binary) => {
  try {
    execFileSync('sh', ['-c', `command -v ${binary}`], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']})
    return true
  } catch {
    return false
  }
}

let _which: WhichFn = defaultWhich

export function _setWhichForTesting(fn: WhichFn): void {
  _which = fn
}

export function _resetWhich(): void {
  _which = defaultWhich
}

/** Shell-safe single-quote a string (handles embedded single quotes + newlines). */
export function shellQuote(s: string): string {
  return `'${s.replaceAll("'", String.raw`'\''`)}'`
}

export function resolveHarness(role: string, config: HordrConfig): string {
  const agent = config.agents[role]
  if (!agent) throw new HarnessError(`no agent configured for role '${role}'`)
  if (!_which(agent.harness)) throw new HarnessError(`harness '${agent.harness}' not on PATH`)
  return agent.harness
}

/**
 * Build the prompt: persona text + bean body (raw). The agent reads the
 * bean content directly and interprets it.
 */
export function buildPrompt(role: string, config: HordrConfig, beanId: string, beanBody: string): string {
  const persona = config.agents[role]?.persona
  if (!persona) throw new HarnessError(`no agent configured for role '${role}'`)
  return `${persona}

---

# Bean ${beanId}

${beanBody}
`
}

/**
 * Launch an agent into a FRESH pane: create tab, fetch bean body, build
 * prompt, run harness. Returns the new pane id.
 */
export function launchAgent(opts: {beanId: string; cwd: string; role: string; workspaceId: string}): {
  paneLabel: string
} {
  const config = loadConfig()
  const harness = resolveHarness(opts.role, config)
  const body = getBody(opts.beanId)
  const prompt = buildPrompt(opts.role, config, opts.beanId, body)

  const label = makePaneLabel(opts.beanId, opts.role)
  const pane = createTab({cwd: opts.cwd, label, workspaceId: opts.workspaceId})

  runInPane(pane.pane_id, `${harness} run -i ${shellQuote(prompt)}`)

  return {paneLabel: pane.pane_id}
}
