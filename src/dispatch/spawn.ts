import {buildHarnessCommand} from '../harness/launcher.js'
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
  role: string
}): string {
  const ancestors = opts.ancestors ?? []
  // Surface the milestone separately: its body carries the planning HANDOFF
  // that every descendant task must honour. Other ancestors (epic/feature)
  // stay in a generic context block.
  const milestones = ancestors.filter((a) => a.type === 'milestone')
  const others = ancestors.filter((a) => a.type !== 'milestone')

  const milestoneSection =
    milestones.length > 0
      ? `\n---\n\n# Context \u2014 Milestone (read only: for context only, do not act on this)\n\n${milestones
          .map((a) => `## ${a.type}: ${a.title} (${a.id})\n\n${a.body}`)
          .join('\n\n')}\n`
      : ''

  const ancestorSection =
    others.length > 0
      ? `\n---\n\n# Context \u2014 Ancestors (read only: for context only, do not act on these)\n\n${others
          .map((a) => `## ${a.type}: ${a.title} (${a.id})\n\n${a.body}`)
          .join('\n\n')}\n`
      : ''

  const depSection = opts.dependencies ? renderDependencyStatus(opts.dependencies) : ''

  return `${opts.persona}
${milestoneSection}${ancestorSection}
${depSection}
---

# Bean ${opts.beanId} \u2014 assigned role: ${opts.role}

${opts.beanBody}

---

## Completion (commit-then-signal-done — status flip rides INSIDE the commit)

The daemon reads bean status from the working tree. If you flip \`status: completed\`
BEFORE committing, the daemon can tear the lane down before your code exists in git
(the phantom-completion race, see hordr-7zxr / hordr-wd46). The daemon now also
requires a clean worktree to proceed past completion. Honour both layers:

1. Make the code edits.
2. Verify (lint / typecheck / tests per the bean).
3. **Commit code + bean status flip TOGETHER in ONE commit** via the commit skill:
   - Edit the bean file (set \`status: completed\` and add a \`## Summary of Changes\` section).
   - Stage the code changes AND the bean file in the SAME commit.
   - Do NOT run \`beans update ${opts.beanId} -s completed\` as a separate step \u2014 the
     status flip is part of the commit, not a precondition for it.
4. Only AFTER the commit lands, signal done: \`hordr done ${opts.beanId}\`.
5. Never leave the bean marked \`completed\` in the working tree uncommitted. If you
   must stop mid-work, the bean stays \`in-progress\`.

If you cannot proceed (blocked by unmet dependencies): \`hordr blocked ${opts.beanId}\` then stop.

\`hordr done\` returns JSON with a \`next\` field. If \`next\` is present, it contains
the id, role, and prompt for the next bean in this lane. Adopt the new persona
and work the next bean immediately — same session, same context. If \`next\` is
null, stop. Do not work on any other bean.`
}

export function spawnInvocation(opts: {harness: string; paneId: string; prompt: string}): void {
  runInPane(opts.paneId, buildHarnessCommand(opts.harness, opts.prompt))
}
