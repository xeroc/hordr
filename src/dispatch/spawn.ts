import {shellQuote} from '../harness/launcher.js'
/**
 * Ephemeral invocation spawn (ADR-0009).
 *
 * Builds the fleet-shaped prompt (persona + ancestor context + dependency
 * status + bean body + hordr-done completion instructions) and runs the
 * harness in the fleet's pane. One invocation = one task = one commit.
 * The pane is reused across sequential invocations (ADR-0009 pane reuse).
 */
import {runInPane} from '../herdr/pane.js'

/** A single ancestor bean rendered as context in the prompt. */
export interface AncestorContext {
  body: string
  id: string
  title: string
  type: string
}

/** Machine-verified dependency state at dispatch time. */
export interface DependencyStatus {
  blockers: Array<{id: string; status: string; title: string}>
  parentBlockers: Array<{id: string; status: string; title: string}>
  siblings: Array<{id: string; status: string; title: string; type: string}>
}

const RESOLVED_STATUSES = new Set(['completed', 'scrapped'])

function isUnresolved(status: string): boolean {
  return !RESOLVED_STATUSES.has(status)
}

function renderDependencyStatus(deps: DependencyStatus): string {
  const unresolvedBlockers = deps.blockers.filter((b) => isUnresolved(b.status))
  const unresolvedParentBlockers = deps.parentBlockers.filter((b) => isUnresolved(b.status))
  const hasUnresolved = unresolvedBlockers.length > 0 || unresolvedParentBlockers.length > 0
  if (!hasUnresolved && deps.siblings.length === 0) return ''

  const lines: string[] = ['## Dependency Status (verified at dispatch time)', '']

  if (unresolvedBlockers.length > 0) {
    lines.push('### Unresolved blockers on THIS task')
    for (const b of unresolvedBlockers) {
      lines.push(`- ${b.id} (${b.title}): ${b.status}`)
    }

    lines.push('')
  }

  if (unresolvedParentBlockers.length > 0) {
    lines.push('### Unresolved blockers on PARENT')
    for (const b of unresolvedParentBlockers) {
      lines.push(`- ${b.id} (${b.title}): ${b.status}`)
    }

    lines.push('')
  }

  if (deps.siblings.length > 0) {
    lines.push('### Sibling tasks (same parent)')
    for (const s of deps.siblings) {
      lines.push(`- ${s.id} (${s.title}): ${s.status}`)
    }

    lines.push('')
  }

  return `\n---\n\n${lines.join('\n')}`
}

export function buildInvocationPrompt(opts: {
  ancestors?: AncestorContext[]
  beanBody: string
  beanId: string
  dependencies?: DependencyStatus
  persona: string
}): string {
  const contextSection =
    (opts.ancestors ?? []).length > 0
      ? `\n---\n\n# Context \u2014 Ancestor Beans (READ ONLY: for context only, do NOT implement these)\n\n${opts
          .ancestors!.map((a) => `## ${a.type}: ${a.title} (${a.id})\n\n${a.body}`)
          .join('\n\n')}\n`
      : ''

  const depSection = opts.dependencies ? renderDependencyStatus(opts.dependencies) : ''

  return `${opts.persona}
${contextSection}
${depSection}
---

# IMPLEMENT THIS \u2014 Bean ${opts.beanId}

${opts.beanBody}

---

## Completion

When you have implemented the changes described in this bean:
1. Update the bean status: \`beans update ${opts.beanId} -s completed\`
2. Commit all your changes (code + bean) using the commit skill
3. Notify the fleet: \`hordr done ${opts.beanId}\`

If you cannot proceed (blocked by unmet dependencies): \`hordr blocked ${opts.beanId}\` then stop.
Then stop. Do not work on any other bean.`
}

export function spawnInvocation(opts: {harness: string; paneId: string; prompt: string}): void {
  const command = `${opts.harness} run --interactive ${shellQuote(opts.prompt)}`
  runInPane(opts.paneId, command)
}
