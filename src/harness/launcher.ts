/**
 * Harness resolution, persona injection, and agent-pane lifecycle.
 *
 * Contract: implements the four harness methods of `EngineDeps`
 * (src/engine/types.ts). All methods are SYNCHRONOUS — hordr is a CLI tool,
 * blocking shell-outs are fine, and the engine contract is sync.
 *
 * Refactored in hordr-1006 to delegate herdr I/O to src/herdr/pane.ts and
 * src/herdr/wait.ts (the real CLI wrapper built in hordr-1003). The earlier
 * best-guess `_herdr` seam has been removed; tests now mock at the herdr
 * primitive level via each module's own `_setShellForTesting` seam.
 *
 * IMPORTANT: the `paneLabel` field name throughout EngineDeps is a misnomer
 * carried over from SPEC.md — at runtime it holds a herdr `pane_id` (e.g.
 * `wJ:p2`), NOT a label. Labels are set via `pane rename` for human UX in
 * herdr's TUI, but herdr CLI v0.7.0 cannot query them back. hordr tracks
 * pane_ids in `run.panes` so they survive sibling compaction.
 */
import {execFileSync} from 'node:child_process'

import {getBean} from '../beans/client.js'
import {loadConfig} from '../config/loader.js'
import {type HordrConfig} from '../config/schema.js'
import {listPanes, paneLabel as makePaneLabel, runInPane, sendText,splitPane} from '../herdr/pane.js'

export class HarnessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HarnessError'
  }
}

// --- test seams ---

// harness-PATH check: `binary => true if on PATH`. Mocked in tests.
export type WhichFn = (binary: string) => boolean

const defaultWhich: WhichFn = (binary) => {
  try {
    execFileSync('sh', ['-c', `command -v ${binary}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
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

/** Body of a `## Header` section until the next `## ` line; `(missing)` if absent. */
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

// --- hordr-1501: resolution + persona injection ---

/** Resolve the harness binary for a role; throws HarnessError if absent from PATH. */
export function resolveHarness(role: string, config: HordrConfig): string {
  const agent = config.agents[role]
  if (!agent) throw new HarnessError(`no agent configured for role '${role}'`)
  const {harness} = agent
  if (!_which(harness)) throw new HarnessError(`harness '${harness}' not on PATH`)
  return harness
}

/** Persona text + bean context (id, title, requirement, acceptance criteria). */
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
 * Full launch sequence: resolve harness, build prompt, split + label a pane
 * in the worktree cwd, then feed the harness binary and the prompt.
 *
 * Returns `{paneLabel: paneId}` — the value is a herdr pane_id (e.g. `wJ:p3`),
 * despite the field name. hordr tracks this in `run.panes[role]`.
 */
export function launchAgent(opts: {beanId: string; cwd: string; role: string; workspaceId: string}): {
  paneLabel: string
} {
  const config = loadConfig()
  const harness = resolveHarness(opts.role, config)
  const prompt = buildOpeningPrompt(opts.role, config, opts.beanId)
  const label = makePaneLabel(opts.beanId, opts.role)

  // Find the workspace's root pane to split from. The worktree-create call
  // ensures the workspace has at least one pane (the root pane from JSON output).
  const panes = listPanes(opts.workspaceId)
  if (panes.length === 0) {
    throw new HarnessError(`workspace ${opts.workspaceId} has no panes to split from`)
  }

  const parentPaneId = panes[0].pane_id

  // Split + rename in one call. Direction 'right' is the conventional default.
  const pane = splitPane({
    cwd: opts.cwd,
    direction: 'right',
    label,
    parentPaneId,
  })

  // Send the harness binary as a runnable command (pane run = text + Enter).
  runInPane(pane.pane_id, harness)
  // Send the prompt as raw text (no Enter — harness reads stdin).
  sendText(pane.pane_id, prompt)

  return {paneLabel: pane.pane_id}
}
