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
/** Build the prompt for the merger agent. Pure function; vcs-specific steps. */
export function buildMergerPrompt(persona: string, ctx: MergeContext & {vcs?: 'git' | 'jj'}): string {
  const vcs = ctx.vcs ?? 'git'
  const fileList =
    ctx.conflictedFiles.length > 0
      ? ctx.conflictedFiles.map((f) => `- \`${f}\``).join('\n')
      : vcs === 'jj'
        ? '- (no files reported — run `jj --no-pager resolve --list` to list them)'
        : '- (no files reported — run `git diff --name-only --diff-filter=U` to list them)'

  const steps =
    vcs === 'jj'
      ? `You are in a jj workspace. The working-copy change (@) is a conflicted merge of \`${ctx.sourceBranch}\` into \`${ctx.targetBranch}\` — conflicts are materialized as markers in:

${fileList}

Resolve all conflicts (edit the files, remove markers, keep both sides' intent), verify (lint/typecheck/tests), then:
\`\`\`
jj --no-pager describe -m "merge: resolve ${ctx.sourceBranch} into ${ctx.targetBranch}"
\`\`\`
Do NOT run \`jj new\` — the engine parks the next head itself.

If a conflict is genuinely unresolvable (semantic incompatibility):
\`\`\`
jj abandon @
\`\`\`

Do not switch changes. Do not push. Describe or abandon, then stop.`
      : `You are in a git worktree on branch \`${ctx.targetBranch}\`.
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

  return `${persona}

---

# Merge Conflict Resolution

${steps}`
}

/**
 * Spawn the merger agent in a new pane within the milestone worktree.
 * Returns the pane ID for liveness tracking.
 */
export function spawnMerger(opts: {config: HordrConfig; ctx: MergeContext; cwd: string; mainRepoCwd: string}): string {
  const agent = opts.config.agents.merger
  if (!agent) throw new Error(`no agent configured for role 'merger'`)
  if (!agent.persona) throw new Error(`role 'merger' has no persona`)

  const vcs = getVcsOrMock(opts.config)
  const prompt = buildMergerPrompt(agent.persona, {...opts.ctx, vcs: vcs.kind})
  // jj: the working copy is a jj workspace herdr doesn't track — adopt it.
  const workspaceId =
    vcs.kind === 'jj'
      ? createHerdrWorkspace({cwd: opts.cwd, label: 'hordr:merger'}).workspaceId
      : openWorktree({cwd: opts.mainRepoCwd, path: opts.cwd}).workspace_id
  const pane = createTab({cwd: opts.cwd, label: 'hordr:merger', workspaceId})
  runInPane(pane.pane_id, buildHarnessCommand(agent.harness, prompt))
  return pane.pane_id
}
