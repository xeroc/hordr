import {execFileSync} from 'node:child_process'

import type {StepHandler} from './index.js'

import {commitTrailer} from '../../beans/trailer.js'
import {StepError} from './shared.js'

// ponytail: inline git helper — only commit needs git directly (no separate
// git client module). workspace_id used as cwd (see shared.ts note).
function git(args: string[], cwd: string): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }) as unknown as string
  } catch (error) {
    const e = error as {message?: string; stderr?: string}
    throw new StepError(`git ${args.join(' ')} failed in ${cwd}: ${(e.stderr ?? e.message ?? '').slice(0, 200)}`)
  }
}

export const commit: StepHandler = (run) => {
  if (!run.worktree) throw new StepError('commit: no worktree in run state')

  const cwd = run.worktree.workspace_id
  const trailer = commitTrailer(run.bean)

  // Idempotency: skip if a commit with this trailer already exists.
  // git log fails (exit 128) on a repo with no commits yet — treat as empty.
  let existing = ''
  try {
    existing = git(['log', `--grep=${trailer}`, '--format=%H'], cwd)
  } catch {
    // No commits or unreadable log → proceed to create.
  }

  if (existing.trim().length > 0) {
    return {done: true}
  }

  git(['add', '-A'], cwd)

  // Try signed commit first; if gpg signing fails (e.g. agent locked,
  // pinentry timeout), retry without signing. The commit is still valid
  // unsigned — the trailer is the audit hook, not the signature.
  const commitArgs = ['commit', `--trailer=${trailer}`, '-m', `${run.bean}: automated commit`]
  try {
    git(commitArgs, cwd)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (/gpg|sign|GnuPG/i.test(msg)) {
      // Retry without signing. ponytail: log to stderr so the user sees it
      // but it doesn't pollute captured stdout.
      process.stderr.write(`warning: gpg signing failed for ${run.bean}; committing unsigned\n`)
      git(['-c', 'commit.gpgsign=false', ...commitArgs], cwd)
    } else {
      throw error
    }
  }

  return {done: true}
}
