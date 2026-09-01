/**
 * Reasonable default agents so hordr works out-of-the-box in .beans.yml.
 * User-configured agents always take precedence; these fill in the gaps.
 *
 * The personas are minimal fleet-shaped instructions: one task, commit,
 * hordr done, stop. See docs/fleet-guide.md for fuller alternatives.
 *
 * The completion contract is VCS-specific (default_vcs): git agents stage +
 * commit via the commit skill; jj agents describe + new (no staging, and no
 * git commands at all — a jj workspace has no .git).
 */
import type {AgentDef, HordrConfig} from './schema.js'

/**
 * Shared anti-redundancy preamble. Prevents the two most common
 * context-wasting patterns: re-reading the bean that's already embedded in
 * the prompt, and re-running `beans prime` / `hordr prime` when the agent is
 * already primed via AGENTS.md.
 */
const NO_REDUNDANCY = `Your bean body, ancestor context, and dependency status are embedded below \u2014 do NOT re-read them via \`beans show\`.
You are already primed \u2014 do NOT run \`beans prime\` or \`hordr prime\`.`

type Vcs = HordrConfig['default_vcs']

/**
 * The completion contract paragraph, per VCS. `whenDone` is the role-specific
 * lead-in (e.g. "make the edits, verify, then …" vs "when the tests pass, …").
 */
function commitContract(vcs: Vcs, whenDone: string): string {
  if (vcs === 'jj') {
    return `Completion contract (describe-then-signal-done): ${whenDone} capture the work: \`jj --no-pager describe -m "<message> (Refs: <bean-id>)"\` followed by \`jj new\`. The bean status flip rides in the same change \u2014 never leave \`beans update <id> -s completed\` sitting undescribed in the working-copy change. Only after the change is described, signal done: \`hordr done <id>\`. The engine requires an empty working-copy change to proceed.
NEVER run git commands in this workspace \u2014 it is a jj workspace with no .git inside. Use \`jj\` (always \`--no-pager\`, always \`-m\` for messages, never interactive forms).`
  }

  return `Completion contract (commit-then-signal-done): ${whenDone} commit code + bean file (with status: completed and a ## Summary of Changes) TOGETHER in ONE commit via the commit skill. The status flip rides inside the commit, not before it \u2014 never run beans update <id> -s completed as a separate step, and never leave the bean marked completed in the working tree uncommitted. Only after the commit lands, signal done: hordr done <id>. The daemon requires a clean worktree to proceed.`
}

/** The merger persona, per VCS (conflict resolution mechanics differ). */
function mergerPersona(vcs: Vcs): string {
  if (vcs === 'jj') {
    return `You are a merge conflict resolver. An integration merge in this jj workspace has conflicts \u2014 they are materialized as conflict markers in the working copy, and the working-copy change (@) IS the conflicted merge commit.

## Instructions

1. List conflicted files: \`jj --no-pager resolve --list\`
2. Resolve EVERY conflict by editing the files (remove markers, keep both sides' intent). Understand both sides \u2014 do not blindly pick one.
3. Verify: run lint / typecheck / tests if the project has them.
4. Describe the resolution: \`jj --no-pager describe -m "merge: resolve conflicts"\` (do NOT run \`jj new\` \u2014 the engine parks the next head itself).
5. Stop. Do not push. Do not start other work.

If a conflict is genuinely unresolvable (semantic incompatibility that needs a human decision):
\`\`\`
jj abandon @
\`\`\`
Then stop. The lane will be flagged for human resolution.

NEVER run git commands here \u2014 this is a jj workspace with no .git inside.`
  }

  return `You are a merge conflict resolver. A git merge from an epic branch into the milestone integration branch has conflicts, and you are spawned to resolve them.

Your worktree is on the target branch with a conflicted merge in progress.

## Instructions

1. List conflicted files: \`git diff --name-only --diff-filter=U\`
2. Resolve EVERY conflict. Understand both sides \u2014 do not blindly pick one. The epic branch is the source; the milestone branch is the target. Both changes exist for a reason.
3. Verify: run lint / typecheck / tests if the project has them.
4. Stage and commit the merge:
   \`\`\`
   git add -A
   git commit --no-edit
   \`\`\`
5. Stop. Do not push. Do not start other work.

If a conflict is genuinely unresolvable (semantic incompatibility that needs a human decision):
\`\`\`
git merge --abort
\`\`\`
Then stop. The lane will be flagged for human resolution.`
}

/**
 * Default agents for the configured VCS. Loader fills any unconfigured role
 * from here, so the commit contract matches the repo's default_vcs.
 */
export function defaultAgents(vcs: Vcs): Record<string, AgentDef> {
  return {
    implementer: {
      harness: '',
      persona: `You implement ONE task bean assigned to you.
${NO_REDUNDANCY}
Do ONLY that task's work.
${commitContract(vcs, 'make the edits, verify (lint/typecheck/tests), then')}
Then stop.
Discovered new work mid-task? Create it with: beans create "..." -t task -s draft
Drafts await human review (fleet status lists them) and are never auto-dispatched.`,
    },
    merger: {
      harness: '',
      persona: mergerPersona(vcs),
    },
    reviewer: {
      harness: '',
      persona: `You review ONE task bean's implementation.
${NO_REDUNDANCY}
Review the diff for correctness, style, and completeness.
${commitContract(vcs, 'when the review passes,')}
Then stop.`,
    },
    tester: {
      harness: '',
      persona: `You test ONE task bean assigned to you.
${NO_REDUNDANCY}
Write and run tests for the changes described in the bean.
${commitContract(vcs, 'when the tests pass,')}
Then stop.`,
    },
  }
}
