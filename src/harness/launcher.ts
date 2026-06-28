/**
 * Harness resolution and agent launching.
 *
 * Uses tabs for agent panes. Prompt is passed directly to the harness via
 * `opencode run "<prompt>"` (or equivalent for other harnesses) — no
 * send-text/send-keys dance, no sleep.
 */
import {execFileSync} from 'node:child_process'

import {getBean} from '../beans/client.js'
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

// --- helpers ---

/** Shell-safe single-quote a string (handles embedded single quotes + newlines). */
export function shellQuote(s: string): string {
  return `'${s.replaceAll('\'', String.raw`'\''`)}'`
}

export function resolveHarness(role: string, config: HordrConfig): string {
  const agent = config.agents[role]
  if (!agent) throw new HarnessError(`no agent configured for role '${role}'`)
  if (!_which(agent.harness)) throw new HarnessError(`harness '${agent.harness}' not on PATH`)
  return agent.harness
}

/**
 * Build the prompt: persona text + bean body (raw, no section extraction).
 * The agent is smart enough to read and interpret the bean content.
 */
export function buildPrompt(role: string, config: HordrConfig, beanId: string): string {
  const persona = config.agents[role]?.persona
  if (!persona) throw new HarnessError(`no agent configured for role '${role}'`)
  const bean = getBean(beanId)
  return `${persona}

---

Bean: ${beanId}
Title: ${bean.title}

${bean.body}`
}

/**
 * Launch an agent in a new tab. Single pane run call with the prompt
 * passed directly to the harness (e.g. `opencode run '<prompt>'`).
 */
export function launchAgent(opts: {beanId: string; cwd: string; role: string; workspaceId: string}): {
  paneLabel: string
} {
  const config = loadConfig()
  const harness = resolveHarness(opts.role, config)
  const prompt = buildPrompt(opts.role, config, opts.beanId)
  const label = makePaneLabel(opts.beanId, opts.role)

  const pane = createTab({cwd: opts.cwd, label, workspaceId: opts.workspaceId})

  runInPane(pane.pane_id, `${harness} run ${shellQuote(prompt)}`)

  return {paneLabel: pane.pane_id}
}
