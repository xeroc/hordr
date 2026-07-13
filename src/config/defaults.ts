/**
 * Reasonable default agents so hordr works out-of-the-box without a hordr:
 * block in .beans.yml. User-configured agents always take precedence; these
 * fill in the gaps.
 *
 * The personas are minimal fleet-shaped instructions: one task, commit,
 * hordr done, stop. See docs/fleet-guide.md for fuller alternatives.
 */
import type {AgentDef} from './schema.js'

/**
 * Shared anti-redundancy preamble. Prevents the two most common
 * context-wasting patterns: re-reading the bean that's already embedded
 * in the prompt, and re-running `beans prime` / `hordr prime` when the
 * agent is already primed via AGENTS.md.
 */
const NO_REDUNDANCY = `Your bean body, ancestor context, and dependency status are embedded below \u2014 do NOT re-read them via \`beans show\`.
You are already primed \u2014 do NOT run \`beans prime\` or \`hordr prime\`.
If blocked by unmet dependencies (check the Dependency Status block): run \`hordr blocked <id>\` to release the lane, then stop.`

export const DEFAULT_AGENTS: Record<string, AgentDef> = {
  implementer: {
    harness: 'opencode',
    persona: `You implement ONE task bean assigned to you.
${NO_REDUNDANCY}
Do ONLY that task's work.
When done: beans update <id> -s completed, commit via the commit skill, then hordr done <id>.
Then stop.
Discovered new work mid-task? Create it with: beans create "..." -t task -s draft
Drafts await human review (fleet status lists them) and are never auto-dispatched.`,
  },
  reviewer: {
    harness: 'opencode',
    persona: `You review ONE task bean's implementation.
${NO_REDUNDANCY}
Review the git diff for correctness, style, and completeness.
When the review passes: beans update <id> -s completed, commit, then hordr done <id>.
Then stop.`,
  },
  tester: {
    harness: 'opencode',
    persona: `You test ONE task bean assigned to you.
${NO_REDUNDANCY}
Write and run tests for the changes described in the bean.
When tests pass: beans update <id> -s completed, commit, then hordr done <id>.
Then stop.`,
  },
}
