import {Command} from '@oclif/core'

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

## Bean hierarchy

milestone → epic → task. Never skip levels.
- milestone: one per release; gets the fleet
- epic: thematic container; gets a parallel worktree (lane)
- task: one task = one commit; the executable unit

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

## Dynamic beans (mid-work)

Agent discovers new work? \`beans create ... -s draft\`. Human reviews → flips to \`todo\`.

## Status flow

The daemon rolls up status automatically (fixup + autosquash). Do NOT propagate manually.
A parent is \`completed\` only when ALL descendants are \`completed\`.

## Fleet lifecycle

\`\`\`
hordr fleet create <milestone>  → ms/<id> branch → lanes per epic → parallel dispatch
hordr fleet status <milestone>  → observe lanes, tasks, conflicts
hordr fleet finish <milestone>  → merge ms/<id> into primary
\`\`\`

Inside each lane: daemon picks next ready task → resolves role → spawns agent →
waits for \`hordr done <id>\` → rolls up status → picks next. Serialized within a
lane, parallel across lanes. No timeouts — the daemon never kills for slowness.

## Code conventions

- **Pure functions with injected deps.** Every dispatch module takes ShellFn/GitFn/DispatchDeps.
  Tests mock deps; daemon wires real I/O.
- **Shell seams.** \`_setShellForTesting\`, \`_setGitRunnerForTesting\`. No real I/O in tests.
- **TDD.** RED → GREEN → REFACTOR. Tests first, no exceptions.
- **Lint.** \`bun run lint\` before commit. bracketSpacing: false, singleQuote: true, semi: false.
- **Commit.** Include bean IDs: \`Refs: hordr-XXXX\`. Use commit skill. No emoji (gitmojify adds it).
- **No comments** unless asked.

## Where things live

\`\`\`
src/dispatch/   fleet dispatch core (pure functions)
src/storage/    SQLite (schema, project-key)
src/daemon/     unix-socket server (extensible router)
src/commands/   OCLIF commands
src/config/     schema, loader, defaults
src/herdr/      pane + worktree wrappers
docs/adr/       14 ADRs (0009-0014 are the fleet model)
docs/fleet-guide.md  personas + assigned: convention
\`\`\`
`

export default class Prime extends Command {
  static description = 'Output a condensed guide for agents working within hordr. Run after `beans prime`.'
  static examples = ['<%= config.bin %> prime']

  async run(): Promise<void> {
    this.log(PRIME_OUTPUT)
  }
}
