import { Command } from '@oclif/core'

/**
 * `hordr prime` — outputs a condensed, token-optimized guide for agents
 * working within hordr's fleet model. Complements `beans prime` (which covers
 * the beans CLI); this covers hordr-specific concepts: the assigned: convention,
 * the role system, planning patterns, code conventions, and the fleet lifecycle.
 *
 * Run after `beans prime` for full context.
 */
const PRIME_OUTPUT = `# Hordr — Agent Guide

Complements \`beans prime\` (beans CLI). This covers hordr-specific concepts only.

## Bean hierarchy (mandatory)

Every body of work large enough to warrant a release ships as a **milestone**
bean with a fixed type hierarchy. The bean \`type\` MUST match its level:

\`\`\`
milestone            ← one per release / main topic
├─ epic              ← thematic container, NEVER worked on directly
│  ├─ feature        ← user-facing capability or distinct deliverable
│  │  └─ task        ← concrete, grabbable unit of work
│  └─ ...
└─ ...
\`\`\`

Wire parents: \`--parent <id>\`. Wire dependencies: \`--blocked-by <id>\`.

## Roles and the assigned: convention

Every task carries \`assigned: <role>\` in its YAML frontmatter. Default roles:

- **implementer**: writes code, commits. Default when assigned: is missing.
- **tester**: writes tests, runs them, reports failures.
- **reviewer**: reviews the diff, approves or blocks.

\`\`\`yaml
---
title: Implement the frobnicator
type: task
status: todo
assigned: implementer
---
\`\`\`

## Planning a milestone

1. Decompose into epics (parallel) and tasks (serialized within each epic).
2. Assign each task to a role via \`assigned:\`.
3. Chain implement → test → review via \`--blocked-by\`:

\`\`\`bash
beans create "Implement X" -t task --parent EPIC
beans create "Test X" -t task --parent EPIC --blocked-by <implement-id>
beans create "Review X" -t task --parent EPIC --blocked-by <test-id>
\`\`\`

4. Cross-epic deps: \`beans create "Profile" -t epic --parent MS --blocked-by <auth-epic>\`
   Blocked epics get no worktree until their blocker merges (lazy creation).
`

export default class Prime extends Command {
  static description = 'Output a condensed guide for agents working within hordr. Run after `beans prime`.'
  static examples = ['<%= config.bin %> prime']

  async run(): Promise<void> {
    this.log(PRIME_OUTPUT)
  }
}
