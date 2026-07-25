/**
 * Merger agent — spawned when a 3-tier epic→ms merge hits conflicts (tier 3).
 *
 * The merger agent runs in the milestone worktree where the conflicted merge
 * is left in-progress. It resolves conflicts, commits, and stops. The engine
 * detects completion via pane-death + git-state checks (no bean, no /done).
 */
import {execFileSync} from 'node:child_process'

import type {HordrConfig} from '../config/schema.js'

import {buildHarnessCommand} from '../harness/launcher.js'
import {createTab, runInPane} from '../herdr/pane.js'
import {openWorktree} from '../herdr/worktree.js'

export interface MergeContext {
  conflictedFiles: string[]
  sourceBranch: string
  targetBranch: string
}

/** Build the prompt for the merger agent. Pure function. */
export function buildMergerPrompt(persona: string, ctx: MergeContext): string {
  const fileList =
    ctx.conflictedFiles.length > 0
      ? ctx.conflictedFiles.map((f) => `- \`${f}\``).join('\n')
      : '- (no files reported — run `git diff --name-only --diff-filter=U` to list them)'

  return `${persona}

---

# Merge Conflict Resolution

You are in a git worktree on branch \`${ctx.targetBranch}\`.
A \`git merge --no-ff ${ctx.sourceBranch}\` was attempted and produced conflicts in:

${fileList}

Resolve all conflicts, verify (lint/typecheck/tests), then:
\`\`\`
git add -A
git commit --no-edit
\`\`\`

If a conflict is genuinely unresolvable (semantic incompatibility):
\`\`\`
git merge --abort
\`\`\`

Do not switch branches. Do not push. Commit or abort, then stop.`
}

/**
 * Spawn the merger agent in a new pane within the milestone worktree.
 * Returns the pane ID for liveness tracking.
 */
export function spawnMerger(opts: {config: HordrConfig; ctx: MergeContext; cwd: string}): string {
  const agent = opts.config.agents.merger
  if (!agent) throw new Error(`no agent configured for role 'merger'`)
  if (!agent.persona) throw new Error(`role 'merger' has no persona`)

  const prompt = buildMergerPrompt(agent.persona, opts.ctx)
  const wt = openWorktree({path: opts.cwd})
  const pane = createTab({cwd: opts.cwd, label: 'hordr:merger', workspaceId: wt.workspace_id})
  runInPane(pane.pane_id, buildHarnessCommand(agent.harness, prompt))
  return pane.pane_id
}

/** List files with unresolved merge conflicts in the worktree. */
export function getConflictedFiles(worktreePath: string): string[] {
  try {
    const raw = execFileSync('git', ['-C', worktreePath, 'diff', '--name-only', '--diff-filter=U'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return raw.split('\n').filter((l) => l.trim().length > 0)
  } catch {
    return []
  }
}

/**
 * Check if the merge succeeded: the source branch's tip is now an ancestor
 * of HEAD (meaning the merge commit landed). Run in the milestone worktree.
 */
export function isMergeComplete(worktreePath: string, sourceBranch: string): boolean {
  try {
    execFileSync('git', ['-C', worktreePath, 'merge-base', '--is-ancestor', sourceBranch, 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return true
  } catch {
    return false
  }
}
