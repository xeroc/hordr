/**
 * Harness resolution, persona injection, and agent-pane lifecycle.
 *
 * Uses TABS (not splits) for agent panes — each agent gets its own tab.
 * This is cleaner when many agents run in parallel.
 *
 * Prompt delivery: start the harness via `pane run` (shell command + Enter),
 * wait briefly for TUI initialization, then type the prompt via `pane
 * send-text` (raw text, no shell interpretation) and press Enter via `pane
 * send-keys Enter`.
 */
import {execFileSync} from 'node:child_process'

import {getBean} from '../beans/client.js'
import {loadConfig} from '../config/loader.js'
import {type HordrConfig} from '../config/schema.js'
import {createTab, paneLabel as makePaneLabel, runInPane, sendEnter, sendText} from '../herdr/pane.js'

export class HarnessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HarnessError'
  }
}

// --- test seams ---

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

// --- section extraction ---

function extractSection(body: string, header: string): string {
  const lines = body.split('\n')
  const idx = lines.findIndex((line) => line.trim() === header)
  if (idx === -1) return '(missing)'
  let end = idx + 1
  while (end < lines.length && !lines[end].startsWith('## ')) end++
  return lines
    .slice(idx + 1, end)
    .join('\n')
    .trim()
}

// --- resolution + persona injection ---

export function resolveHarness(role: string, config: HordrConfig): string {
  const agent = config.agents[role]
  if (!agent) throw new HarnessError(`no agent configured for role '${role}'`)
  const {harness} = agent
  if (!_which(harness)) throw new HarnessError(`harness '${harness}' not on PATH`)
  return harness
}

export function buildOpeningPrompt(role: string, config: HordrConfig, beanId: string): string {
  const persona = config.agents[role]?.persona
  if (!persona) throw new HarnessError(`no agent configured for role '${role}'`)
  const bean = getBean(beanId)
  const requirement = extractSection(bean.body, '## Requirement')
  const acceptance = extractSection(bean.body, '## Acceptance Criteria')
  return `${persona}
---

Bean: ${beanId}
Title: ${bean.title}

## Requirement
${requirement}

## Acceptance Criteria
${acceptance}
`
}

/**
 * Full launch sequence:
 * 1. Create a new tab in the target workspace (NOT a pane split).
 * 2. Start the harness binary via `pane run` (shell command + Enter).
 * 3. Wait 1s for the harness TUI to initialize.
 * 4. Type the prompt via `pane send-text` (raw text, no shell interpretation).
 * 5. Press Enter via `pane send-keys Enter` to submit the prompt.
 *
 * Returns `{paneLabel: paneId}` — the value is a herdr pane_id.
 */
export function launchAgent(opts: {beanId: string; cwd: string; role: string; workspaceId: string}): {
  paneLabel: string
} {
  const config = loadConfig()
  const harness = resolveHarness(opts.role, config)
  const prompt = buildOpeningPrompt(opts.role, config, opts.beanId)
  const label = makePaneLabel(opts.beanId, opts.role)

  // Create a new tab in the target workspace.
  const pane = createTab({cwd: opts.cwd, label, workspaceId: opts.workspaceId})

  // Start the harness binary (this is a shell command, so pane run is correct).
  runInPane(pane.pane_id, harness)

  // Wait for the harness TUI to initialize before sending the prompt.
  // ponytail: 1s sleep — TUI startup is typically <500ms.
  try {
    execFileSync('sleep', ['1'], {stdio: 'ignore'})
  } catch {
    // ignore — sleep is best-effort
  }

  // Type the prompt as raw text (not a shell command — pane send-text, not run).
  // Then press Enter to submit it.
  sendText(pane.pane_id, prompt)
  sendEnter(pane.pane_id)

  return {paneLabel: pane.pane_id}
}
