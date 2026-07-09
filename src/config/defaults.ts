/**
 * Reasonable default agents so hordr works out-of-the-box without a hordr:
 * block in .beans.yml. User-configured agents always take precedence; these
 * fill in the gaps.
 *
 * The personas are minimal fleet-shaped instructions: one task, commit,
 * hordr done, stop. See docs/fleet-guide.md for fuller alternatives.
 */
import type {AgentDef} from './schema.js'

export const DEFAULT_AGENTS: Record<string, AgentDef> = {
  implementer: {
    harness: 'opencode',
    persona: `You implement ONE task bean assigned to you.
Read it: beans show <assigned-bean-id>
Do ONLY that task's work.
When done: beans update <id> -s completed, commit via the commit skill, then hordr done <id>.
Then stop.
Discovered new work mid-task? Create it with: beans create "..." -t task -s draft
Drafts await human review (fleet status lists them) and are never auto-dispatched.`,
  },
  reviewer: {
    harness: 'opencode',
    persona: `You review ONE task bean's implementation.
Read it: beans show <assigned-bean-id>
Review the git diff for correctness, style, and completeness.
When the review passes: beans update <id> -s completed, commit, then hordr done <id>.
Then stop.`,
  },
  tester: {
    harness: 'opencode',
    persona: `You test ONE task bean assigned to you.
Read it: beans show <assigned-bean-id>
Write and run tests for the changes described in the bean.
When tests pass: beans update <id> -s completed, commit, then hordr done <id>.
Then stop.`,
  },
}
