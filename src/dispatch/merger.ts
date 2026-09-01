/**
 * Merger agent — spawned when an epic→ms / ms→lane / ms→primary integration
 * hits conflicts. The merger agent runs in the working copy where the
 * conflicted merge lives (git: in-progress merge state; jj: conflicted head
 * commit with markers materialized in the tree). It resolves conflicts,
 * commits, and stops. The engine detects completion via pane-death + adapter
 * state probes (no bean, no /done).
 */
import type {HordrConfig} from '../config/schema.js'

import {buildHarnessCommand} from '../harness/launcher.js'
import {createTab, runInPane} from '../herdr/pane.js'
import {createHerdrWorkspace, openWorktree} from '../herdr/worktree.js'
import {getVcsOrMock} from '../vcs/resolve.js'


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
export function spawnMerger(opts: {config: HordrConfig; ctx: MergeContext; cwd: string; mainRepoCwd: string}): string {
  const agent = opts.config.agents.merger
  if (!agent) throw new Error(`no agent configured for role 'merger'`)
  if (!agent.persona) throw new Error(`role 'merger' has no persona`)

  const prompt = buildMergerPrompt(agent.persona, opts.ctx)
  // git: the merger works in a herdr-managed worktree — reopen it by path.
  // jj: the working copy is a jj workspace herdr doesn't track — adopt it.
  const vcs = getVcsOrMock(opts.config)
  const workspaceId =
    vcs.kind === 'jj'
      ? createHerdrWorkspace({cwd: opts.cwd, label: 'hordr:merger'}).workspaceId
      : openWorktree({cwd: opts.mainRepoCwd, path: opts.cwd}).workspace_id
  const pane = createTab({cwd: opts.cwd, label: 'hordr:merger', workspaceId})
  runInPane(pane.pane_id, buildHarnessCommand(agent.harness, prompt))
  return pane.pane_id
}
